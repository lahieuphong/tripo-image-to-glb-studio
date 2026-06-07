import {
  BackSide,
  Color,
  DataTexture,
  DoubleSide,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
} from 'three';
import { $scene } from '@google/model-viewer/lib/model-viewer-base.js';
import { ensureMaterialSnapshots, restoreMaterial } from './materialState.js';

const OUTLINE_VERTEX_LIMIT = 1500000;
const EDGE_VERTEX_LIMIT = 1200000;
const SKETCH_GRADIENT_MAP = new DataTexture(
  new Uint8Array([
    174, 174, 168, 255,
    210, 210, 204, 255,
    232, 232, 226, 255,
    250, 250, 246, 255,
  ]),
  4,
  1,
  RGBAFormat
);
SKETCH_GRADIENT_MAP.minFilter = NearestFilter;
SKETCH_GRADIENT_MAP.magFilter = NearestFilter;
SKETCH_GRADIENT_MAP.needsUpdate = true;

const ICON_SKETCH_STYLE = (
  <img
    className="s-vtb-icon-img"
    src="/viewers/sketch.svg"
    width="16"
    height="16"
    alt=""
    aria-hidden="true"
    draggable="false"
  />
);

export const SKETCH_STYLE_MODE = {
  key: 'sketch',
  label: 'Sketch Style',
  icon: ICON_SKETCH_STYLE,
};

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}

function materialUsesCutout(mat) {
  if (!mat) return false;
  return Boolean(mat.transparent || mat.alphaTest > 0 || mat.alphaMap || mat.side === DoubleSide);
}

function isLikelyAlphaCard(node, materials) {
  const label = `${node.name || ''} ${materials.map((mat) => mat?.name || '').join(' ')}`.toLowerCase();
  return materialUsesCutout(materials[0])
    || materials.some(materialUsesCutout)
    || /\b(hair|lash|eyelash|brow|eyebrow|bang|strand|card|alpha|fur)\b/.test(label);
}

function lumaFromColor(color) {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}

function averageColorFromTexture(texture, fallbackColor) {
  const image = texture?.image;
  if (!image) return fallbackColor.clone();

  try {
    if (image.data && image.width && image.height) {
      const data = image.data;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      const stride = data.length / (image.width * image.height);
      const step = Math.max(1, Math.floor((image.width * image.height) / 2048));

      for (let i = 0; i < image.width * image.height; i += step) {
        const offset = Math.floor(i * stride);
        r += data[offset] ?? 255;
        g += data[offset + 1] ?? 255;
        b += data[offset + 2] ?? 255;
        count += 1;
      }

      return new Color(r / count / 255, g / count / 255, b / count / 255).convertSRGBToLinear();
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return new Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
  } catch {
    return fallbackColor.clone();
  }
}

function getSketchAverageLuma(mat) {
  const fallbackColor = mat.color?.clone?.() ?? new Color(1, 1, 1);
  return lumaFromColor(averageColorFromTexture(mat.map, fallbackColor));
}

function applySketchShader(material, averageLuma) {
  material.extensions = { ...(material.extensions || {}), derivatives: true };
  const averageLumaValue = Number.isFinite(averageLuma) ? averageLuma : 0.82;
  const averageLumaLiteral = averageLumaValue.toFixed(6);
  const averageLumaBucket = Math.round(averageLumaValue * 1000);
  material.customProgramCacheKey = () => `sketch-style-tripo-v17-${averageLumaBucket}`;
  material.onBeforeCompile = (shader) => {
    if (shader.fragmentShader.includes('#include <color_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      vec3 skSourceColor = clamp(diffuseColor.rgb, 0.0, 1.0);
      float skSourceLuma = max(dot(skSourceColor, vec3(0.299, 0.587, 0.114)), 0.001);
      float skSourceMax = max(max(skSourceColor.r, skSourceColor.g), skSourceColor.b);
      float skSourceMin = min(min(skSourceColor.r, skSourceColor.g), skSourceColor.b);
      float skAvgLuma = clamp(${averageLumaLiteral}, 0.025, 0.975);
      float skSourceRange = skSourceMax - skSourceMin;
      float skSourceDelta = abs(skSourceLuma - skAvgLuma);
      float skDarkDetail = smoothstep(0.026, 0.230, max(skAvgLuma - skSourceLuma, 0.0));
      float skColorDetail = smoothstep(0.060, 0.260, skSourceRange) * smoothstep(0.012, 0.180, skSourceDelta);
      vec3 skPaper = vec3(0.955, 0.955, 0.925);
      float skMaterialTone = mix(skAvgLuma, skSourceLuma, 0.66);
      vec3 skClay = skPaper * mix(0.92, 1.070, smoothstep(0.035, 0.985, skMaterialTone));
      skClay = mix(skClay, vec3(0.080, 0.076, 0.066), skDarkDetail * 0.460);
      skClay *= 1.0 - skColorDetail * 0.115;
      diffuseColor.rgb = skClay;
      `
      );
    }

    if (shader.fragmentShader.includes('#include <opaque_fragment>') && shader.fragmentShader.includes('outgoingLight')) {
      const hasViewNormal = shader.fragmentShader.includes('vViewPosition') && shader.fragmentShader.includes('normal');
      const normalCode = hasViewNormal
        ? `
      vec3 skN = normalize(normal);
      vec3 skV = normalize(vViewPosition);
      float skFacing = clamp(abs(dot(skN, skV)), 0.0, 1.0);
      float skSilhouette = pow(1.0 - skFacing, 2.10);
      float skNormalDelta = fwidth(skN.x) + fwidth(skN.y) + fwidth(skN.z);
      float skCrease = smoothstep(0.022, 0.108, skNormalDelta);
      vec3 skKeyDir = normalize(vec3(-0.42, 0.74, 0.52));
      float skNormalShadow = 1.0 - smoothstep(-0.18, 0.74, dot(skN, skKeyDir));
      `
        : `
      float skNormalShadow = 0.42;
      float skSilhouette = 0.0;
      float skCrease = 0.0;
      `;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      ${normalCode}

      float skHash = fract(sin(dot(floor(gl_FragCoord.xy * 0.72), vec2(12.9898, 78.233))) * 43758.5453);
      vec2 skPx = gl_FragCoord.xy;

      vec3 skLit = clamp(outgoingLight, vec3(0.0), vec3(1.45));
      float skLitLuma = dot(skLit, vec3(0.299, 0.587, 0.114));
      float skBaseLuma = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.055);
      float skLightTone = smoothstep(0.34, 1.18, clamp(skLitLuma / skBaseLuma, 0.0, 1.55));
      float skValueShadow = 1.0 - smoothstep(0.34, 1.02, skLitLuma);
      float skShadow = clamp(skNormalShadow * 0.58 + skValueShadow * 0.25 + (1.0 - skLightTone) * 0.18, 0.0, 1.0);

      float skH1V = dot(skPx, normalize(vec2(0.74, 1.0))) / 10.5;
      float skH1Dist = abs(fract(skH1V) - 0.5);
      float skLine1 = 1.0 - smoothstep(0.048, 0.048 + fwidth(skH1V) * 1.8, skH1Dist);

      float skH2V = dot(skPx, normalize(vec2(-0.82, 1.0))) / 13.5;
      float skH2Dist = abs(fract(skH2V) - 0.5);
      float skLine2 = 1.0 - smoothstep(0.042, 0.042 + fwidth(skH2V) * 1.8, skH2Dist);

      float skH3V = dot(skPx, normalize(vec2(1.0, 0.08))) / 22.0;
      float skH3Dist = abs(fract(skH3V) - 0.5);
      float skLine3 = 1.0 - smoothstep(0.018, 0.018 + fwidth(skH3V) * 1.5, skH3Dist);

      float skMild = smoothstep(0.30, 0.70, skShadow);
      float skMid = smoothstep(0.55, 0.88, skShadow);
      float skDeep = smoothstep(0.76, 0.99, skShadow);
      float skLineBreak = smoothstep(0.10, 0.92, skHash);
      float skHatch = (
        skLine1 * skMild * 0.220 +
        skLine2 * skMid * 0.125 +
        skLine3 * skDeep * 0.040
      ) * mix(0.55, 1.0, skLineBreak);

      float skTextureDelta = fwidth(skBaseLuma);
      float skTextureEdge = smoothstep(0.004, 0.028, skTextureDelta) * (1.0 - smoothstep(0.078, 0.160, skTextureDelta)) * 0.245;
      float skEncodedDarkInk = (1.0 - smoothstep(0.56, 0.86, skBaseLuma)) * 0.285;
      float skCreaseInk = skCrease * 0.680;
      float skSilhouetteInk = skSilhouette * 0.940;
      float skInkAmount = clamp(skHatch + skCreaseInk + skSilhouetteInk + skTextureEdge + skEncodedDarkInk, 0.0, 0.94);

      float skPaperShade = mix(0.52, 1.02, skLightTone);
      vec3 skPaperColor = vec3(skPaperShade * 1.000, skPaperShade * 0.997, skPaperShade * 0.965);
      vec3 skInk = vec3(0.018, 0.016, 0.012);
      outgoingLight = mix(skPaperColor, skInk, skInkAmount);

      #include <opaque_fragment>
      `
      );
    }
  };
  material.needsUpdate = true;
}

function createSketchMaterial(mat) {
  const averageLuma = getSketchAverageLuma(mat);
  const sketch = new MeshToonMaterial({
    color: mat.color?.clone?.() ?? new Color(1, 1, 1),
    map: mat.map ?? null,
    aoMap: mat.aoMap ?? null,
    aoMapIntensity: mat.aoMapIntensity ?? 1,
    bumpMap: mat.bumpMap ?? null,
    bumpScale: mat.bumpScale ?? 1,
    displacementMap: mat.displacementMap ?? null,
    displacementScale: mat.displacementScale ?? 1,
    displacementBias: mat.displacementBias ?? 0,
    alphaMap: mat.alphaMap ?? null,
    normalMap: mat.normalMap ?? null,
    normalScale: mat.normalScale?.clone?.(),
    transparent: mat.transparent,
    opacity: mat.opacity,
    alphaTest: mat.alphaTest,
    side: mat.side,
    vertexColors: mat.vertexColors ?? false,
    gradientMap: SKETCH_GRADIENT_MAP,
  });

  sketch.name = `${mat.name || 'material'} Sketch Style`;
  sketch.toneMapped = mat.toneMapped ?? sketch.toneMapped;
  sketch.roughness = 0.92;
  sketch.metalness = 0;

  applySketchShader(sketch, averageLuma);
  return sketch;
}

function createOutlineMaterial(mat) {
  const cutout = materialUsesCutout(mat);
  return new MeshBasicMaterial({
    color: 0x020202,
    map: mat.map ?? null,
    alphaMap: mat.alphaMap ?? null,
    alphaTest: Math.max(mat.alphaTest ?? 0, cutout || mat.map || mat.alphaMap ? 0.42 : 0),
    transparent: false,
    opacity: 1,
    side: BackSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 2.8,
    polygonOffsetUnits: 2.8,
  });
}

function createSketchEdgeLine(node) {
  const edgeGeometry = new EdgesGeometry(node.geometry, 30);
  const edgeMaterial = new LineBasicMaterial({
    color: 0x070707,
    transparent: true,
    opacity: 0.44,
    depthTest: true,
    depthWrite: false,
  });
  const line = new LineSegments(edgeGeometry, edgeMaterial);
  line.name = `${node.name || 'mesh'} Sketch Edges`;
  line.userData = { ...line.userData, sketchStylePreview: true };
  line.position.copy(node.position);
  line.quaternion.copy(node.quaternion);
  line.scale.copy(node.scale);
  line.renderOrder = (node.renderOrder ?? 0) + 2;
  line.raycast = () => null;
  return { line, edgeGeometry, edgeMaterial };
}

function createSketchStylePreview(mv) {
  const model = mv?.[$scene]?.model;
  if (!model) return null;

  const entries = [];
  const extraNodes = [];
  const createdMaterials = [];
  const createdGeometries = [];
  const meshes = [];

  model.traverse((node) => {
    if (node?.isMesh && node.material && !node.userData?.sketchStylePreview) {
      meshes.push(node);
    }
  });

  meshes.forEach((node) => {
    const original = node.material;
    const sourceMaterials = toArray(original);
    const sketchMaterials = sourceMaterials.map(createSketchMaterial);
    const vertexCount = node.geometry?.attributes?.position?.count ?? 0;
    const likelyAlphaCard = isLikelyAlphaCard(node, sourceMaterials);
    const canUseOutline = vertexCount > 0
      && vertexCount <= OUTLINE_VERTEX_LIMIT
      && !likelyAlphaCard;
    const canUseEdges = vertexCount > 0
      && vertexCount <= EDGE_VERTEX_LIMIT
      && !likelyAlphaCard;
    const outlineMaterials = canUseOutline ? sourceMaterials.map(createOutlineMaterial) : [];

    node.material = Array.isArray(original) ? sketchMaterials : sketchMaterials[0];
    createdMaterials.push(...sketchMaterials, ...outlineMaterials);
    entries.push({ node, original });

    const parent = node.parent;
    if (!parent) return;

    if (canUseOutline) {
      const outline = node.clone(false);
      outline.name = `${node.name || 'mesh'} Sketch Outline`;
      outline.userData = { ...outline.userData, sketchStylePreview: true };
      outline.material = Array.isArray(original) ? outlineMaterials : outlineMaterials[0];
      outline.scale.multiplyScalar(1.0095);
      outline.renderOrder = (node.renderOrder ?? 0) - 1;
      outline.raycast = () => null;
      parent.add(outline);
      extraNodes.push(outline);
    }

    if (canUseEdges) {
      const { line, edgeGeometry, edgeMaterial } = createSketchEdgeLine(node);
      parent.add(line);
      extraNodes.push(line);
      createdGeometries.push(edgeGeometry);
      createdMaterials.push(edgeMaterial);
    }
  });

  if (!entries.length) return null;

  mv[$scene]?.queueRender?.();
  return { entries, extraNodes, createdMaterials, createdGeometries };
}

export function clearSketchStyleMode(mv, sketchStylePreviewRef) {
  const preview = sketchStylePreviewRef.current;
  if (!preview) return;

  preview.entries.forEach(({ node, original }) => {
    node.material = original;
  });
  preview.extraNodes.forEach((node) => {
    node.parent?.remove(node);
  });
  preview.createdMaterials.forEach((mat) => mat.dispose());
  preview.createdGeometries.forEach((geometry) => geometry.dispose());

  sketchStylePreviewRef.current = null;
  mv?.[$scene]?.queueRender?.();
}

export function applySketchStyleMode(mv, materials, savedMaterialsRef, sketchStylePreviewRef) {
  const saved = ensureMaterialSnapshots(materials, savedMaterialsRef);
  materials.forEach((mat, i) => restoreMaterial(mat, saved[i]));
  clearSketchStyleMode(mv, sketchStylePreviewRef);
  sketchStylePreviewRef.current = createSketchStylePreview(mv);
}

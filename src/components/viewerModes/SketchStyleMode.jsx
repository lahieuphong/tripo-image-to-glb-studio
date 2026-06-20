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
const DETAIL_EDGE_VERTEX_LIMIT = 900000;
const DETAIL_EDGE_RATIO_LIMIT = 0.42;
const SKETCH_GRADIENT_MAP = new DataTexture(
  new Uint8Array([
    88,  86,  80,  255,
    168, 165, 158, 255,
    220, 218, 210, 255,
    252, 250, 244, 255,
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
  material.customProgramCacheKey = () => `sketch-style-tripo-v30-${averageLumaBucket}`;
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
      float skDarkDetail = smoothstep(0.055, 0.270, max(skAvgLuma - skSourceLuma, 0.0));
      float skColorDetail = smoothstep(0.060, 0.260, skSourceRange) * smoothstep(0.012, 0.180, skSourceDelta);
      vec3 skPaper = vec3(0.980, 0.978, 0.954);
      float skMaterialTone = mix(skAvgLuma, skSourceLuma, 0.42);
      vec3 skClay = skPaper * mix(0.88, 1.085, smoothstep(0.035, 0.985, skMaterialTone));
      skClay = mix(skClay, vec3(0.065, 0.060, 0.052), skDarkDetail * 0.210);
      skClay *= 1.0 - skColorDetail * 0.040;
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
      float skSilhouette = pow(1.0 - skFacing, 1.85);
      float skNormalDelta = fwidth(skN.x) + fwidth(skN.y) + fwidth(skN.z);
      float skCrease = smoothstep(0.007, 0.052, skNormalDelta);
      vec3 skKeyDir = normalize(vec3(-0.42, 0.74, 0.52));
      float skNormalShadow = 1.0 - smoothstep(-0.18, 0.74, dot(skN, skKeyDir));
      `
        : `
      float skNormalShadow = 0.42;
      float skSilhouette = 0.0;
      float skCrease = 0.0;
      float skFacing = 1.0;
      `;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      ${normalCode}

      vec2 skPx = gl_FragCoord.xy;
      float skHash = fract(sin(dot(floor(skPx * 0.18), vec2(12.9898, 78.233))) * 43758.5453);

      vec3 skLit = clamp(outgoingLight, vec3(0.0), vec3(1.45));
      float skLitLuma = dot(skLit, vec3(0.299, 0.587, 0.114));
      float skBaseLuma = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.055);
      float skLightTone = smoothstep(0.34, 1.18, clamp(skLitLuma / skBaseLuma, 0.0, 1.55));
      float skValueShadow = 1.0 - smoothstep(0.34, 1.02, skLitLuma);
      float skShadow = clamp(skNormalShadow * 0.66 + skValueShadow * 0.30 + (1.0 - skLightTone) * 0.26, 0.0, 1.0);

      float skH1V = (skPx.x - skPx.y) / 8.25;
      float skH1Dist = abs(fract(skH1V) - 0.5);
      float skLine1 = 1.0 - smoothstep(0.095, 0.095 + fwidth(skH1V) * 1.30, skH1Dist);

      float skH2V = (skPx.x - skPx.y + 4.0) / 13.75;
      float skH2Dist = abs(fract(skH2V) - 0.5);
      float skLine2 = 1.0 - smoothstep(0.060, 0.060 + fwidth(skH2V) * 1.15, skH2Dist);

      float skMild = smoothstep(0.44, 0.78, skShadow);
      float skDeep = smoothstep(0.66, 0.96, skShadow);
      float skLitSuppression = 1.0 - smoothstep(0.50, 0.82, skLightTone);
      float skViewEdgeShade = 1.0 - smoothstep(0.36, 0.78, skFacing);
      float skLineBreak = smoothstep(0.02, 0.48, skHash);
      float skHatch = (
        skLine1 * skMild * 0.330 +
        skLine2 * skDeep * 0.150
      ) * mix(0.74, 1.0, skLineBreak) * skLitSuppression * mix(0.52, 1.0, skViewEdgeShade);

      float skSourceColorDelta = fwidth(skSourceColor.r) + fwidth(skSourceColor.g) + fwidth(skSourceColor.b);
      float skSourceLumaDelta = fwidth(skSourceLuma);
      float skSourceEdge = skSourceColorDelta + skSourceLumaDelta * 1.35;
      float skFeatureEdge = smoothstep(0.028, 0.116, skSourceEdge);
      float skDetailSignal = smoothstep(0.038, 0.172, skSourceDelta);
      float skStableFeature = skFeatureEdge
        * skDetailSignal
        * (1.0 - smoothstep(0.245, 0.470, skSourceEdge));
      float skTextureEdge = skStableFeature * 0.520;
      float skEncodedDarkInk = smoothstep(0.070, 0.300, max(skAvgLuma - skSourceLuma, 0.0))
        * mix(0.28, 1.0, skFeatureEdge)
        * skDetailSignal
        * 0.520;
      float skOriginalDetailInk = smoothstep(0.052, 0.205, skSourceDelta)
        * smoothstep(0.025, 0.120, skSourceLumaDelta)
        * mix(0.42, 1.0, skFeatureEdge)
        * 0.380;
      float skGoldNoise = fract(sin(dot(floor(skPx * 0.105), vec2(41.23, 17.97))) * 24634.6345);
      float skGoldBreak = smoothstep(0.12, 0.86, skGoldNoise);
      float skGoldRim = smoothstep(0.54, 0.92, skSilhouette) * mix(0.62, 1.0, skViewEdgeShade);
      float skGoldCrease = skCrease * smoothstep(0.44, 0.98, skShadow) * 0.340;
      float skGoldFeature = skStableFeature
        * (smoothstep(0.54, 0.96, skShadow) * 0.05 + skViewEdgeShade * 0.08);
      float skGoldAccent = clamp((skGoldRim * 0.300 + skGoldCrease + skGoldFeature) * mix(0.68, 1.0, skGoldBreak), 0.0, 0.320);
      float skCreaseInk = skCrease * 1.080;
      float skSilhouetteInk = skSilhouette * 1.060;
      float skInkAmount = clamp(skHatch + skCreaseInk + skSilhouetteInk + skTextureEdge + skEncodedDarkInk + skOriginalDetailInk, 0.0, 0.98);

      float skFormShade = smoothstep(0.30, 0.92, skShadow);
      float skPaperShade = mix(0.965, 0.500, skFormShade);
      skPaperShade = mix(skPaperShade, 0.985, smoothstep(0.70, 0.98, skLightTone) * 0.55);
      vec3 skPaperColor = vec3(skPaperShade * 1.000, skPaperShade * 0.996, skPaperShade * 0.968);
      vec3 skInk = vec3(0.008, 0.006, 0.004);
      vec3 skGold = vec3(1.000, 0.790, 0.025);
      vec3 skGoldPaperColor = mix(skPaperColor, skGold, skGoldAccent);
      outgoingLight = mix(skGoldPaperColor, skInk, skInkAmount);

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

function createOutlineMaterial(mat, color) {
  return new MeshBasicMaterial({
    color,
    alphaMap: mat.alphaMap ?? null,
    alphaTest: mat.alphaTest ?? 0,
    transparent: false,
    opacity: 1,
    side: BackSide,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 3.2,
    polygonOffsetUnits: 3.2,
  });
}

function createSketchDetailLine(node) {
  const vertexCount = node.geometry?.attributes?.position?.count ?? 0;
  if (!vertexCount || vertexCount > DETAIL_EDGE_VERTEX_LIMIT) return null;

  const edgeGeometry = new EdgesGeometry(node.geometry, 42);
  const edgeVertexCount = edgeGeometry.attributes?.position?.count ?? 0;
  if (!edgeVertexCount || edgeVertexCount > vertexCount * DETAIL_EDGE_RATIO_LIMIT) {
    edgeGeometry.dispose();
    return null;
  }

  const edgeMaterial = new LineBasicMaterial({
    color: 0x050403,
    transparent: true,
    opacity: 0.54,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new LineSegments(edgeGeometry, edgeMaterial);
  line.name = `${node.name || 'mesh'} Sketch Detail Edges`;
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
    const blackOutlineMaterials = canUseOutline
      ? sourceMaterials.map((mat) => createOutlineMaterial(mat, 0x050403))
      : [];
    const goldOutlineMaterials = canUseOutline
      ? sourceMaterials.map((mat) => createOutlineMaterial(mat, 0xF2D21B))
      : [];

    node.material = Array.isArray(original) ? sketchMaterials : sketchMaterials[0];
    createdMaterials.push(...sketchMaterials, ...blackOutlineMaterials, ...goldOutlineMaterials);
    entries.push({ node, original });

    const parent = node.parent;
    if (!parent) return;

    if (canUseOutline) {
      const blackOutline = node.clone(false);
      blackOutline.name = `${node.name || 'mesh'} Sketch Black Outline`;
      blackOutline.userData = { ...blackOutline.userData, sketchStylePreview: true };
      blackOutline.material = Array.isArray(original) ? blackOutlineMaterials : blackOutlineMaterials[0];
      blackOutline.scale.multiplyScalar(1.024);
      blackOutline.renderOrder = (node.renderOrder ?? 0) - 3;
      blackOutline.raycast = () => null;
      parent.add(blackOutline);
      extraNodes.push(blackOutline);

      const goldOutline = node.clone(false);
      goldOutline.name = `${node.name || 'mesh'} Sketch Gold Outline`;
      goldOutline.userData = { ...goldOutline.userData, sketchStylePreview: true };
      goldOutline.material = Array.isArray(original) ? goldOutlineMaterials : goldOutlineMaterials[0];
      goldOutline.scale.multiplyScalar(1.012);
      goldOutline.renderOrder = (node.renderOrder ?? 0) - 2;
      goldOutline.raycast = () => null;
      parent.add(goldOutline);
      extraNodes.push(goldOutline);
    }

    if (canUseOutline) {
      const detailEdges = createSketchDetailLine(node);
      if (detailEdges) {
        parent.add(detailEdges.line);
        extraNodes.push(detailEdges.line);
        createdGeometries.push(detailEdges.edgeGeometry);
        createdMaterials.push(detailEdges.edgeMaterial);
      }
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
  preview.createdGeometries?.forEach((geometry) => geometry.dispose());

  sketchStylePreviewRef.current = null;
  mv?.[$scene]?.queueRender?.();
}

export function applySketchStyleMode(mv, materials, savedMaterialsRef, sketchStylePreviewRef) {
  const saved = ensureMaterialSnapshots(materials, savedMaterialsRef);
  materials.forEach((mat, i) => restoreMaterial(mat, saved[i]));
  clearSketchStyleMode(mv, sketchStylePreviewRef);
  sketchStylePreviewRef.current = createSketchStylePreview(mv);
}

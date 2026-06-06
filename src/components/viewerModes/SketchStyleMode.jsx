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
    86, 86, 86, 255,
    146, 146, 146, 255,
    210, 210, 210, 255,
    244, 244, 244, 255,
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

function applySketchShader(material) {
  material.extensions = { ...(material.extensions || {}), derivatives: true };
  material.customProgramCacheKey = () => 'sketch-style-tripo-v12';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vSketchLocalPosition;\n${shader.vertexShader}`;
    if (shader.vertexShader.includes('#include <skinning_vertex>')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <skinning_vertex>',
        `
      #include <skinning_vertex>
      vSketchLocalPosition = transformed;
      `
      );
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      vSketchLocalPosition = transformed;
      `
      );
    }

    shader.fragmentShader = `varying vec3 vSketchLocalPosition;\n${shader.fragmentShader}`;

    if (shader.fragmentShader.includes('#include <color_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      vec3 skSourceColor = clamp(diffuseColor.rgb, vec3(0.0), vec3(1.0));
      float skSourceLuma = dot(skSourceColor, vec3(0.299, 0.587, 0.114));
      vec3 skWarmPaper = vec3(0.93, 0.925, 0.875);
      vec3 skPaperTone = skWarmPaper * mix(0.88, 1.04, smoothstep(0.04, 0.96, skSourceLuma));
      diffuseColor.rgb = mix(skPaperTone, vec3(skSourceLuma), 0.08);
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

      vec3 skViewKey = normalize(vec3(-0.36, 0.78, 0.50));
      float skKey = dot(skN, skViewKey);

      // Direct NdotL → wide contrast range (0.42 dark → 0.94 lit)
      // Old wrap-lighting gave only 0.096 range; this gives 0.52 range → 5× more detail visible
      float skKeyLight = smoothstep(-0.24, 0.88, skKey);
      float skNormalShadow = 1.0 - skKeyLight;
      float skRim = pow(1.0 - skFacing, 2.15) * 0.66;
      float skNormalDelta = fwidth(skN.x) + fwidth(skN.y) + fwidth(skN.z);
      float skCrease = smoothstep(0.018, 0.120, skNormalDelta) * 0.74;
      `
        : `
      float skNormalShadow = 0.42;
      float skRim = 0.0;
      float skCrease = 0.0;
      `;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      ${normalCode}

      vec3 skLit = clamp(outgoingLight, vec3(0.0), vec3(1.35));
      float skLitLuma = dot(skLit, vec3(0.299, 0.587, 0.114));
      float skBaseLuma = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.055);
      float skLightTone = smoothstep(0.36, 1.18, clamp(skLitLuma / skBaseLuma, 0.0, 1.45));
      float skValueShadow = 1.0 - smoothstep(0.24, 0.92, skLitLuma);
      float skShadow = clamp(skNormalShadow * 0.62 + skValueShadow * 0.44 + (1.0 - skLightTone) * 0.30 + skRim * 0.38, 0.0, 1.0);

      vec3 skHatchPos = vSketchLocalPosition * 30.0;

      float skH1Phase = fract(dot(skHatchPos, vec3(0.70, 1.00, -0.20)));
      float skH1Dist = min(skH1Phase, 1.0 - skH1Phase);
      float skLine1 = 1.0 - smoothstep(0.035, 0.095, skH1Dist);

      float skH2Phase = fract(dot(skHatchPos, vec3(-0.58, 0.92, 0.30)));
      float skH2Dist = min(skH2Phase, 1.0 - skH2Phase);
      float skLine2 = 1.0 - smoothstep(0.032, 0.082, skH2Dist);

      // Hatching starts at shadow=0.25 (NdotL≈0.75 — surface 40° from key light)
      float skDetailEdge = smoothstep(0.014, 0.080, fwidth(skLitLuma)) * 0.20;
      float skTextureEdge = smoothstep(0.014, 0.065, fwidth(skBaseLuma)) * 0.12;
      float skMild = smoothstep(0.16, 0.56, skShadow);
      float skMid = smoothstep(0.46, 0.82, skShadow);
      float skDeep = smoothstep(0.72, 0.96, skShadow);

      float skHatch = skLine1 * skMild * 0.44 + skLine2 * skMid * 0.30 + skDeep * 0.14;
      float skInkAmount = clamp(skHatch + skCrease * 0.72 + skRim * 0.20 + skDetailEdge + skTextureEdge, 0.0, 0.86);

      float skPaperShade = mix(0.54, 0.97, skLightTone);
      vec3 skPaperColor = vec3(skPaperShade * 0.99, skPaperShade * 0.985, skPaperShade * 0.94);
      vec3 skInk = vec3(0.020, 0.018, 0.014);
      outgoingLight = mix(skPaperColor, skInk, skInkAmount);

      #include <opaque_fragment>
      `
      );
    }
  };
  material.needsUpdate = true;
}

function createSketchMaterial(mat) {
  const sketch = new MeshToonMaterial({
    color: new Color(0xf2f2ee),
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

  applySketchShader(sketch);
  return sketch;
}

function createOutlineMaterial(mat) {
  const cutout = materialUsesCutout(mat);
  return new MeshBasicMaterial({
    color: 0x060606,
    map: mat.map ?? null,
    alphaMap: mat.alphaMap ?? null,
    alphaTest: Math.max(mat.alphaTest ?? 0, cutout || mat.map || mat.alphaMap ? 0.42 : 0),
    transparent: false,
    opacity: 1,
    side: BackSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 2.0,
    polygonOffsetUnits: 2.0,
  });
}

function createSketchEdgeLine(node) {
  const edgeGeometry = new EdgesGeometry(node.geometry, 35);
  const edgeMaterial = new LineBasicMaterial({
    color: 0x050505,
    transparent: true,
    opacity: 0.72,
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
      outline.scale.multiplyScalar(1.0075);
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

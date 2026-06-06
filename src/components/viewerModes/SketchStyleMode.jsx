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
const EDGE_VERTEX_LIMIT = 500000;
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
  material.customProgramCacheKey = () => 'sketch-style-tripo-v10';
  material.onBeforeCompile = (shader) => {
    if (shader.fragmentShader.includes('#include <color_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      float skLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      float skTone = mix(0.70, 0.92, smoothstep(0.05, 0.90, skLuma));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(skTone, skTone * 0.984, skTone * 0.942), 0.80);
      `
      );
    }

    if (shader.fragmentShader.includes('#include <opaque_fragment>') && shader.fragmentShader.includes('outgoingLight')) {
      const hasViewNormal = shader.fragmentShader.includes('vViewPosition') && shader.fragmentShader.includes('normal');
      const normalCode = hasViewNormal
        ? `
      vec3 skN      = normalize(normal);
      vec3 skV      = normalize(vViewPosition);
      float skNdotV = clamp(dot(skN, skV), 0.0, 1.0);

      // World-space key light: fixed regardless of camera orbit
      vec3 skWorldN   = normalize(transpose(mat3(viewMatrix)) * skN);
      vec3 skWorldKey = normalize(vec3(-0.25, 0.75, 0.60));
      float skNdotL   = dot(skWorldN, skWorldKey);

      // Direct NdotL → wide contrast range (0.42 dark → 0.94 lit)
      // Old wrap-lighting gave only 0.096 range; this gives 0.52 range → 5× more detail visible
      float skFormTone  = mix(0.42, 0.94, clamp(skNdotL, 0.0, 1.0));
      vec3 skFormColor  = vec3(skFormTone * 0.992, skFormTone * 0.982, skFormTone * 0.940);

      float skShadow = clamp(1.0 - clamp(skNdotL, 0.0, 1.0), 0.0, 1.0);
      float skRim    = pow(1.0 - skNdotV, 2.8) * 0.45;
      skShadow = clamp(skShadow + skRim * (1.0 - skShadow), 0.0, 1.0);
      // Lower crease threshold to catch finer surface geometry detail
      float skCrease = smoothstep(0.008, 0.055, length(fwidth(skN))) * 0.88;
      `
        : `
      float skFormTone  = 0.72;
      vec3 skFormColor  = vec3(0.714, 0.707, 0.677);
      float skShadow    = 0.50;
      float skCrease    = 0.0;
      `;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      vec3 skInk = vec3(0.035, 0.031, 0.024);

      ${normalCode}

      vec2 skPx = gl_FragCoord.xy;

      float skH1    = fract((skPx.x - skPx.y) * 0.152);
      float skLine1 = 1.0 - smoothstep(0.22, 0.32, skH1);

      float skH2    = fract((skPx.x + skPx.y) * 0.152);
      float skLine2 = 1.0 - smoothstep(0.22, 0.32, skH2);

      // Hatching starts at shadow=0.25 (NdotL≈0.75 — surface 40° from key light)
      float skMild  = smoothstep(0.25, 0.62, skShadow);
      float skMid   = smoothstep(0.48, 0.80, skShadow);
      float skDeep  = smoothstep(0.68, 0.92, skShadow);

      float skHatch  = skLine1 * skMild * 0.68 + skLine2 * skMid * 0.76;
      skHatch = clamp(skHatch, 0.0, 0.90);
      skHatch = max(skHatch, skDeep * 0.86);
      skHatch = max(skHatch, skCrease);
      skHatch = clamp(skHatch, 0.0, 0.92);

      outgoingLight = mix(skFormColor, skInk, skHatch);

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
  const edgeGeometry = new EdgesGeometry(node.geometry, 12);
  const edgeMaterial = new LineBasicMaterial({
    color: 0x080808,
    transparent: true,
    opacity: 0.78,
    depthTest: true,
    depthWrite: false,
  });
  const line = new LineSegments(edgeGeometry, edgeMaterial);
  line.name = `${node.name || 'mesh'} Sketch Edges`;
  line.userData = { ...line.userData, sketchStylePreview: true };
  line.position.copy(node.position);
  line.quaternion.copy(node.quaternion);
  line.scale.copy(node.scale);
  line.renderOrder = (node.renderOrder ?? 0) + 1;
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
      outline.scale.multiplyScalar(1.010);
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

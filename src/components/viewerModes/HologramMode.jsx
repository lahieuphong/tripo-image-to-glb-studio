import {
  AdditiveBlending,
  BackSide,
  Box3,
  Color,
  DoubleSide,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NormalBlending,
} from 'three';
import { $scene } from '@google/model-viewer/lib/model-viewer-base.js';
import { ensureMaterialSnapshots, restoreMaterial } from './materialState.js';

const OUTLINE_VERTEX_LIMIT = 1500000;
const EDGE_VERTEX_LIMIT = 650000;
const HOLOGRAM_SWEEP_SPEED = 0.34;
const FALLBACK_BOUNDS = { minY: -1.25, height: 2.5 };

const ICON_HOLOGRAM = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <defs>
      <radialGradient id="vtbi-holo" cx="38%" cy="32%" r="65%">
        <stop offset="0%" stopColor="#d7ffff"/>
        <stop offset="45%" stopColor="#78f4f3"/>
        <stop offset="100%" stopColor="#168dc5"/>
      </radialGradient>
    </defs>
    <circle cx="8" cy="8" r="7" fill="url(#vtbi-holo)"/>
    <circle cx="8" cy="8" r="7" fill="none" stroke="rgba(190,255,255,0.7)" strokeWidth="0.6"/>
  </svg>
);

export const HOLOGRAM_MODE = {
  key: 'hologram',
  label: 'Hologram',
  icon: ICON_HOLOGRAM,
};

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}

function getModelHeightBounds(model) {
  model.updateWorldMatrix?.(true, true);
  const box = new Box3().setFromObject(model);
  if (box.isEmpty()) return FALLBACK_BOUNDS;

  const height = box.max.y - box.min.y;
  if (!Number.isFinite(height) || height <= 0.001) return FALLBACK_BOUNDS;
  return { minY: box.min.y, height };
}

function applyHologramSweepShader(material, sweepUniforms, bounds) {
  const timeUniform = { value: 0 };
  const minYUniform = { value: bounds.minY };
  const heightUniform = { value: bounds.height };
  sweepUniforms.push(timeUniform);

  material.customProgramCacheKey = () => 'hologram-glass-sweep-v1';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hologramTime = timeUniform;
    shader.uniforms.hologramMinY = minYUniform;
    shader.uniforms.hologramHeight = heightUniform;
    shader.vertexShader = `varying float vHologramWorldY;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `
      vHologramWorldY = (modelMatrix * vec4(transformed, 1.0)).y;
      #include <project_vertex>
      `
    );
    shader.fragmentShader = `
      varying float vHologramWorldY;
      uniform float hologramTime;
      uniform float hologramMinY;
      uniform float hologramHeight;
    \n${shader.fragmentShader}`.replace(
      '#include <opaque_fragment>',
      `
      float hologramSweepPos = fract(hologramTime * ${HOLOGRAM_SWEEP_SPEED.toFixed(2)});
      float hologramY = clamp((vHologramWorldY - hologramMinY) / hologramHeight, 0.0, 1.0);
      float hologramBeam = exp(-pow((hologramY - hologramSweepPos) / 0.05, 2.0)) * 1.08;
      float hologramTrail = exp(-pow((hologramY - fract(hologramSweepPos - 0.08 + 1.0)) / 0.14, 2.0)) * 0.26;
      float hologramPulse = clamp(hologramBeam + hologramTrail, 0.0, 1.28);

      vec3 hologramBase = vec3(0.2, 0.9, 1.0);
      vec3 hologramSweep = vec3(0.42, 1.0, 1.0);
      float hologramDetail = pow(clamp(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.35), 1.18);
      float hologramRim = pow(1.0 - abs(dot(normalize(normal), normalize(-vViewPosition))), 2.2);
      outgoingLight = hologramBase * (0.34 + hologramDetail * 0.9 + hologramRim * 0.44 + hologramPulse * 0.14);
      outgoingLight = mix(outgoingLight, hologramSweep * (0.7 + hologramDetail * 0.26), clamp(hologramPulse * 0.24, 0.0, 0.46));
      diffuseColor.rgb = hologramBase;
      diffuseColor.a = clamp(0.14 + hologramDetail * 0.06 + hologramRim * 0.08 + hologramPulse * 0.08, 0.0, 0.34);

      #include <opaque_fragment>
      `
    );
  };
}

function createHologramMaterial(sourceName, sweepUniforms, bounds) {
  const holo = new MeshPhysicalMaterial({
    color: new Color(0x6ef5ff),
    emissive: new Color(0x1fd3e5),
    emissiveIntensity: 0.26,
    roughness: 0.08,
    metalness: 0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    ior: 1.12,
    transmission: 0.22,
    thickness: 0.7,
    transparent: true,
    opacity: 0.2,
    side: DoubleSide,
    depthTest: true,
    depthWrite: false,
    blending: NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -0.35,
    polygonOffsetUnits: -0.35,
  });

  holo.name = `${sourceName || 'material'} Hologram`;
  holo.toneMapped = false;
  applyHologramSweepShader(holo, sweepUniforms, bounds);
  return holo;
}

function createHologramShellMaterial() {
  return new MeshBasicMaterial({
    color: 0x7bf8ff,
    transparent: true,
    opacity: 0.13,
    side: BackSide,
    depthTest: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

function createHologramEdgeLine(node) {
  const edgeGeometry = new EdgesGeometry(node.geometry, 7);
  const edgeMaterial = new LineBasicMaterial({
    color: 0x8dfbff,
    transparent: true,
    opacity: 0.62,
    depthTest: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const line = new LineSegments(edgeGeometry, edgeMaterial);
  line.name = `${node.name || 'mesh'} Hologram Edges`;
  line.userData = { ...line.userData, hologramPreview: true };
  line.position.copy(node.position);
  line.quaternion.copy(node.quaternion);
  line.scale.copy(node.scale);
  line.renderOrder = (node.renderOrder ?? 0) + 2;
  line.raycast = () => null;
  return { line, edgeGeometry, edgeMaterial };
}

function createHologramPreview(mv) {
  const model = mv?.[$scene]?.model;
  if (!model) return null;

  const entries = [];
  const extraNodes = [];
  const createdMaterials = [];
  const createdGeometries = [];
  const sweepUniforms = [];
  const meshes = [];
  const bounds = getModelHeightBounds(model);

  model.traverse((node) => {
    if (node?.isMesh && node.material && !node.userData?.hologramPreview) {
      meshes.push(node);
    }
  });

  meshes.forEach((node) => {
    const original = node.material;
    const sourceMaterials = toArray(original);
    const hologramMaterials = sourceMaterials.map((mat) => createHologramMaterial(mat?.name, sweepUniforms, bounds));
    const vertexCount = node.geometry?.attributes?.position?.count ?? 0;
    const canUseOutline = vertexCount > 0 && vertexCount <= OUTLINE_VERTEX_LIMIT;
    const canUseEdges = vertexCount > 0 && vertexCount <= EDGE_VERTEX_LIMIT;

    const renderOrder = node.renderOrder ?? 0;
    node.material = Array.isArray(original) ? hologramMaterials : hologramMaterials[0];
    node.renderOrder = Math.max(renderOrder, 1);
    createdMaterials.push(...hologramMaterials);
    entries.push({ node, original, renderOrder });

    const parent = node.parent;
    if (!parent) return;

    if (canUseOutline) {
      const shell = node.clone(false);
      shell.name = `${node.name || 'mesh'} Hologram Glow`;
      shell.userData = { ...shell.userData, hologramPreview: true };
      shell.material = createHologramShellMaterial();
      shell.scale.multiplyScalar(1.011);
      shell.renderOrder = (node.renderOrder ?? 0) - 1;
      shell.raycast = () => null;
      parent.add(shell);
      extraNodes.push(shell);
      createdMaterials.push(shell.material);
    }

    if (canUseEdges) {
      const { line, edgeGeometry, edgeMaterial } = createHologramEdgeLine(node);
      parent.add(line);
      extraNodes.push(line);
      createdGeometries.push(edgeGeometry);
      createdMaterials.push(edgeMaterial);
    }
  });

  if (!entries.length) return null;

  let frameId = 0;
  const startTime = performance.now();
  const animateSweep = () => {
    const elapsed = (performance.now() - startTime) / 1000;
    sweepUniforms.forEach((uniform) => {
      uniform.value = elapsed;
    });
    mv[$scene]?.queueRender?.();
    frameId = requestAnimationFrame(animateSweep);
  };
  frameId = requestAnimationFrame(animateSweep);

  mv[$scene]?.queueRender?.();
  return { entries, extraNodes, createdMaterials, createdGeometries, frameId };
}

export function clearHologramMode(mv, hologramPreviewRef) {
  const preview = hologramPreviewRef.current;
  if (!preview) return;

  preview.entries.forEach(({ node, original, renderOrder }) => {
    node.material = original;
    node.renderOrder = renderOrder;
  });
  preview.extraNodes.forEach((node) => {
    node.parent?.remove(node);
  });
  preview.createdMaterials.forEach((mat) => mat.dispose());
  preview.createdGeometries.forEach((geometry) => geometry.dispose());
  if (preview.frameId) cancelAnimationFrame(preview.frameId);

  hologramPreviewRef.current = null;
  mv?.[$scene]?.queueRender?.();
}

export function applyHologramMode(mv, materials, savedMaterialsRef, hologramPreviewRef) {
  const saved = ensureMaterialSnapshots(materials, savedMaterialsRef);
  materials.forEach((mat, i) => restoreMaterial(mat, saved[i]));
  clearHologramMode(mv, hologramPreviewRef);
  hologramPreviewRef.current = createHologramPreview(mv);
}

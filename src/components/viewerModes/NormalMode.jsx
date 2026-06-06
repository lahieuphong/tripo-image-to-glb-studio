import { MeshNormalMaterial } from 'three';
import { $scene } from '@google/model-viewer/lib/model-viewer-base.js';
import { ensureMaterialSnapshots, restoreMaterial } from './materialState.js';

const ICON_NORMAL = (
  <img
    className="s-vtb-icon-img"
    src="/viewers/normal.svg"
    width="16"
    height="16"
    alt=""
    aria-hidden="true"
    draggable="false"
  />
);

export const NORMAL_MODE = {
  key: 'normal',
  label: 'Normal',
  icon: ICON_NORMAL,
};

function createNormalPreview(mv) {
  const model = mv?.[$scene]?.model;
  if (!model) return null;

  const entries = [];
  model.traverse((node) => {
    if (!node?.isMesh || !node.material) return;
    const original = node.material;
    const materials = Array.isArray(original) ? original : [original];
    const normalMaterials = materials.map((mat) => new MeshNormalMaterial({
      side: mat.side,
      transparent: mat.transparent,
      opacity: mat.opacity,
      alphaTest: mat.alphaTest,
    }));

    node.material = Array.isArray(original) ? normalMaterials : normalMaterials[0];
    entries.push({ node, original, normalMaterials });
  });

  mv[$scene]?.queueRender?.();
  return entries.length ? entries : null;
}

export function clearNormalMode(mv, normalPreviewRef) {
  const entries = normalPreviewRef.current;
  if (!entries?.length) {
    normalPreviewRef.current = null;
    return;
  }

  entries.forEach(({ node, original, normalMaterials }) => {
    node.material = original;
    normalMaterials.forEach((mat) => mat.dispose());
  });
  normalPreviewRef.current = null;
  mv?.[$scene]?.queueRender?.();
}

export function applyNormalMode(mv, materials, savedMaterialsRef, normalPreviewRef) {
  const saved = ensureMaterialSnapshots(materials, savedMaterialsRef);
  materials.forEach((mat, i) => restoreMaterial(mat, saved[i]));
  clearNormalMode(mv, normalPreviewRef);
  normalPreviewRef.current = createNormalPreview(mv);
}

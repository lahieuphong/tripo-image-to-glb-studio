import { ensureMaterialSnapshots, setTexture } from './materialState.js';

const SOLID_MATERIAL = {
  baseColorFactor: '#949494',
  metallicFactor: 0,
  roughnessFactor: 0.9,
};

const ICON_SOLID = (
  <img
    className="s-vtb-icon-img"
    src="/viewers/solid.svg"
    width="16"
    height="16"
    alt=""
    aria-hidden="true"
    draggable="false"
  />
);

export const SOLID_VIEW_MODE = {
  key: 'solid',
  label: 'Solid view',
  icon: ICON_SOLID,
};

function applySolidMaterial(mat) {
  const pbr = mat.pbrMetallicRoughness;
  pbr.setBaseColorFactor(SOLID_MATERIAL.baseColorFactor);
  pbr.setMetallicFactor(SOLID_MATERIAL.metallicFactor);
  pbr.setRoughnessFactor(SOLID_MATERIAL.roughnessFactor);

  setTexture(pbr.baseColorTexture, null);
  setTexture(pbr.metallicRoughnessTexture, null);
  setTexture(mat.normalTexture, null);
  setTexture(mat.occlusionTexture, null);
  setTexture(mat.emissiveTexture, null);
}

export function applySolidViewMode(materials, savedMaterialsRef) {
  ensureMaterialSnapshots(materials, savedMaterialsRef);
  materials.forEach(applySolidMaterial);
}

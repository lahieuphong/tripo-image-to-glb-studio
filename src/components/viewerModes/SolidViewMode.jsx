import { ensureMaterialSnapshots, setTexture } from './materialState.js';

const SOLID_MATERIAL = {
  baseColorFactor: '#949494',
  metallicFactor: 0,
  roughnessFactor: 0.9,
};

const ICON_SOLID = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <defs><radialGradient id="vtbi-solid" cx="38%" cy="32%" r="65%"><stop offset="0%" stopColor="#eeeeee"/><stop offset="100%" stopColor="#888888"/></radialGradient></defs>
    <circle cx="8" cy="8" r="7" fill="url(#vtbi-solid)"/>
  </svg>
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

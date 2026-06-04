export function getTexture(textureInfo) {
  return textureInfo?.texture ?? null;
}

export function setTexture(textureInfo, texture) {
  textureInfo?.setTexture?.(texture ?? null);
}

export function snapshotMaterial(mat) {
  const pbr = mat.pbrMetallicRoughness;
  return {
    baseColorFactor: [...(pbr.baseColorFactor ?? [1, 1, 1, 1])],
    baseColorTexture: getTexture(pbr.baseColorTexture),
    metallicFactor: pbr.metallicFactor ?? 1,
    roughnessFactor: pbr.roughnessFactor ?? 1,
    metallicRoughnessTexture: getTexture(pbr.metallicRoughnessTexture),
    normalTexture: getTexture(mat.normalTexture),
    occlusionTexture: getTexture(mat.occlusionTexture),
    emissiveTexture: getTexture(mat.emissiveTexture),
  };
}

export function ensureMaterialSnapshots(materials, savedMaterialsRef) {
  if (!savedMaterialsRef.current) {
    savedMaterialsRef.current = materials.map(snapshotMaterial);
  }
  return savedMaterialsRef.current;
}

export function restoreMaterial(mat, saved) {
  if (!saved) return;
  const pbr = mat.pbrMetallicRoughness;
  pbr.setBaseColorFactor(saved.baseColorFactor);
  pbr.setMetallicFactor(saved.metallicFactor);
  pbr.setRoughnessFactor(saved.roughnessFactor);

  setTexture(pbr.baseColorTexture, saved.baseColorTexture);
  setTexture(pbr.metallicRoughnessTexture, saved.metallicRoughnessTexture);
  setTexture(mat.normalTexture, saved.normalTexture);
  setTexture(mat.occlusionTexture, saved.occlusionTexture);
  setTexture(mat.emissiveTexture, saved.emissiveTexture);
}

export function restoreTexturedViewMaterials(materials, savedMaterialsRef) {
  const saved = savedMaterialsRef.current;
  if (!saved) return;
  materials.forEach((mat, i) => restoreMaterial(mat, saved[i]));
}

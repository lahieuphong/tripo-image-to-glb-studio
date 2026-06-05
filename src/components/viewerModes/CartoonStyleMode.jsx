import {
  BackSide,
  Color,
  DataTexture,
  DoubleSide,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
} from 'three';
import { $scene } from '@google/model-viewer/lib/model-viewer-base.js';
import { ensureMaterialSnapshots, restoreMaterial } from './materialState.js';

const OUTLINE_VERTEX_LIMIT = 1500000;
const CARTOON_GRADIENT_MAP = new DataTexture(
  new Uint8Array([
    82, 82, 82, 255,
    150, 150, 150, 255,
    218, 218, 218, 255,
    255, 255, 255, 255,
  ]),
  4,
  1,
  RGBAFormat
);
CARTOON_GRADIENT_MAP.minFilter = NearestFilter;
CARTOON_GRADIENT_MAP.magFilter = NearestFilter;
CARTOON_GRADIENT_MAP.needsUpdate = true;

const ICON_CARTOON_STYLE = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <defs>
      <radialGradient id="vtbi-cartoon-style" cx="38%" cy="30%" r="68%">
        <stop offset="0%" stopColor="#ffe9a8"/>
        <stop offset="42%" stopColor="#f59e0b"/>
        <stop offset="78%" stopColor="#9a3412"/>
        <stop offset="100%" stopColor="#2a1208"/>
      </radialGradient>
    </defs>
    <circle cx="8" cy="8" r="6.8" fill="url(#vtbi-cartoon-style)" stroke="rgba(20,20,20,0.55)" strokeWidth="0.9"/>
    <path d="M4.4 10.4c2.2 1.3 5.2 1 7.2-.9" fill="none" stroke="rgba(20,20,20,0.55)" strokeWidth="0.8" strokeLinecap="round"/>
  </svg>
);

export const CARTOON_STYLE_MODE = {
  key: 'toon',
  label: 'Cartoon Style',
  icon: ICON_CARTOON_STYLE,
  filter: 'contrast(1.04) saturate(1) brightness(1.04)',
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

function getCartoonAverageColor(mat) {
  return averageColorFromTexture(mat.map, mat.color?.clone?.() ?? new Color(1, 1, 1));
}

function applyCartoonShader(material, averageColor) {
  material.extensions = { ...(material.extensions || {}), derivatives: true };
  material.customProgramCacheKey = () => 'cartoon-style-matte-v3';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cartoonAverageColor = { value: averageColor };
    shader.fragmentShader = `uniform vec3 cartoonAverageColor;\n${shader.fragmentShader}`;

    if (shader.fragmentShader.includes('#include <color_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>

      vec3 cartoonBaseSource = clamp(diffuseColor.rgb, 0.0, 1.0);
      float sourceLuma = max(dot(cartoonBaseSource, vec3(0.299, 0.587, 0.114)), 0.025);
      float averageDistance = distance(cartoonBaseSource, cartoonAverageColor);
      float darkDetailKeep = 1.0 - smoothstep(0.06, 0.18, sourceLuma);
      float contrastDetailKeep = smoothstep(0.24, 0.58, averageDistance);
      float washAmount = 0.18 * (1.0 - darkDetailKeep) * (1.0 - contrastDetailKeep * 0.35);
      vec3 cartoonBase = mix(cartoonBaseSource, cartoonAverageColor, washAmount);
      float cartoonBaseLuma = max(dot(cartoonBase, vec3(0.299, 0.587, 0.114)), 0.025);
      vec3 cartoonChroma = cartoonBase / cartoonBaseLuma;

      float chromaMax = max(max(cartoonBase.r, cartoonBase.g), cartoonBase.b);
      float chromaMin = min(min(cartoonBase.r, cartoonBase.g), cartoonBase.b);
      float lowSaturation = 1.0 - smoothstep(0.05, 0.22, chromaMax - chromaMin);
      vec3 warmCartoonChroma = vec3(1.0, 0.82, 0.68) / dot(vec3(1.0, 0.82, 0.68), vec3(0.299, 0.587, 0.114));
      float warmMask = lowSaturation
        * smoothstep(0.18, 0.66, cartoonBaseLuma)
        * (1.0 - smoothstep(0.78, 0.98, cartoonBaseLuma))
        * 0.22;
      cartoonChroma = mix(vec3(1.0), cartoonChroma, 0.88);
      cartoonChroma = mix(cartoonChroma, warmCartoonChroma, warmMask);

      float cartoonBaseBand = floor(cartoonBaseLuma * 4.0 + 0.5) / 4.0;
      float cartoonFlatLuma = mix(cartoonBaseLuma, cartoonBaseBand, 0.38);
      float darkPreserve = 1.0 - smoothstep(0.08, 0.22, cartoonBaseLuma);
      float liftedLuma = mix(0.68, cartoonFlatLuma, 0.66);
      cartoonFlatLuma = mix(liftedLuma, cartoonFlatLuma, darkPreserve);
      cartoonFlatLuma = clamp(cartoonFlatLuma, cartoonBaseLuma * 0.88, cartoonBaseLuma * 1.42 + 0.02);

      vec3 cartoonAlbedo = clamp(cartoonChroma * cartoonFlatLuma, 0.0, 1.0);
      diffuseColor.rgb = cartoonAlbedo;
      `
      );
    }

    if (shader.fragmentShader.includes('#include <opaque_fragment>') && shader.fragmentShader.includes('outgoingLight')) {
      const hasViewNormal = shader.fragmentShader.includes('vViewPosition') && shader.fragmentShader.includes('normal');
      const inkFromNormals = hasViewNormal
        ? `
      vec3 cartoonViewDir = normalize(vViewPosition);
      vec3 cartoonNormal = normalize(normal);
      float normalDelta = length(fwidth(cartoonNormal));
      float detailFade = 1.0 - smoothstep(0.11, 0.26, max(lumaDelta, normalDelta));
      float rimInk = pow(1.0 - clamp(abs(dot(cartoonNormal, cartoonViewDir)), 0.0, 1.0), 4.2) * 0.56;
      float creaseInk = smoothstep(0.028, 0.105, normalDelta) * detailFade * 0.48;
      `
        : 'float rimInk = 0.0; float creaseInk = 0.0;';

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      vec3 cartoonLit = clamp(outgoingLight, 0.0, 1.0);
      float litLuma = dot(cartoonLit, vec3(0.299, 0.587, 0.114));
      float baseLumaForShade = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.04);
      float shade = clamp(litLuma / baseLumaForShade, 0.48, 1.22);
      float shadeBand = floor(shade * 3.0 + 0.5) / 3.0;
      shade = mix(shade, shadeBand, 0.72);
      shade = mix(0.96, shade, 0.32);

      vec3 cartoonColor = clamp(diffuseColor.rgb * shade, 0.0, 1.0);
      cartoonColor = mix(diffuseColor.rgb, cartoonColor, 0.58);
      cartoonColor = pow(cartoonColor, vec3(0.97));

      float lumaDelta = fwidth(baseLumaForShade);
      float textureInk = smoothstep(0.014, 0.058, lumaDelta) * (1.0 - smoothstep(0.075, 0.17, lumaDelta)) * 0.045;
      ${inkFromNormals}
      float ink = clamp(textureInk + rimInk + creaseInk, 0.0, 0.58);
      outgoingLight = mix(cartoonColor, vec3(0.01), ink);

      #include <opaque_fragment>
      `
      );
    }
  };
  material.needsUpdate = true;
}

function createCartoonMaterial(mat) {
  const averageColor = getCartoonAverageColor(mat);
  const cartoon = new MeshToonMaterial({
    color: mat.color?.clone?.() ?? new Color(1, 1, 1),
    map: mat.map ?? null,
    alphaMap: mat.alphaMap ?? null,
    normalMap: mat.normalMap ?? null,
    normalScale: mat.normalScale?.clone?.(),
    transparent: mat.transparent,
    opacity: mat.opacity,
    alphaTest: mat.alphaTest,
    side: mat.side,
    vertexColors: mat.vertexColors ?? false,
    gradientMap: CARTOON_GRADIENT_MAP,
  });

  cartoon.name = `${mat.name || 'material'} Cartoon Style`;
  cartoon.toneMapped = mat.toneMapped ?? cartoon.toneMapped;

  applyCartoonShader(cartoon, averageColor);
  return cartoon;
}

function createOutlineMaterial(mat) {
  const cutout = materialUsesCutout(mat);
  const outlineMat = new MeshBasicMaterial({
    color: 0x000000,
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
  return outlineMat;
}

function createCartoonStylePreview(mv) {
  const model = mv?.[$scene]?.model;
  if (!model) return null;

  const entries = [];
  const extraNodes = [];
  const createdMaterials = [];
  const meshes = [];

  model.traverse((node) => {
    if (node?.isMesh && node.material && !node.userData?.cartoonStylePreview) {
      meshes.push(node);
    }
  });

  meshes.forEach((node) => {
    const original = node.material;
    const sourceMaterials = toArray(original);
    const toonMaterials = sourceMaterials.map(createCartoonMaterial);
    const vertexCount = node.geometry?.attributes?.position?.count ?? 0;
    const likelyAlphaCard = isLikelyAlphaCard(node, sourceMaterials);
    const canUseOutline = vertexCount > 0
      && vertexCount <= OUTLINE_VERTEX_LIMIT
      && !likelyAlphaCard;
    const outlineMaterials = canUseOutline ? sourceMaterials.map(createOutlineMaterial) : [];

    node.material = Array.isArray(original) ? toonMaterials : toonMaterials[0];
    createdMaterials.push(...toonMaterials, ...outlineMaterials);
    entries.push({ node, original });

    const parent = node.parent;
    if (!parent) return;

    if (canUseOutline) {
      const outline = node.clone(false);
      outline.name = `${node.name || 'mesh'} Cartoon Outline`;
      outline.userData = { ...outline.userData, cartoonStylePreview: true };
      outline.material = Array.isArray(original) ? outlineMaterials : outlineMaterials[0];

      outline.scale.multiplyScalar(1.0065);
      outline.renderOrder = (node.renderOrder ?? 0) - 1;
      outline.raycast = () => null;
      parent.add(outline);
      extraNodes.push(outline);
    }
  });

  if (!entries.length) {
    return null;
  }

  mv[$scene]?.queueRender?.();
  return { entries, extraNodes, createdMaterials };
}

export function clearCartoonStyleMode(mv, cartoonStylePreviewRef) {
  const preview = cartoonStylePreviewRef.current;
  if (!preview) return;

  preview.entries.forEach(({ node, original }) => {
    node.material = original;
  });
  preview.extraNodes.forEach((node) => {
    node.parent?.remove(node);
  });
  preview.createdMaterials.forEach((mat) => mat.dispose());
  preview.createdGeometries?.forEach((geometry) => geometry.dispose());

  cartoonStylePreviewRef.current = null;
  mv?.[$scene]?.queueRender?.();
}

export function applyCartoonStyleMode(mv, materials, savedMaterialsRef, cartoonStylePreviewRef) {
  const saved = ensureMaterialSnapshots(materials, savedMaterialsRef);
  materials.forEach((mat, i) => restoreMaterial(mat, saved[i]));
  clearCartoonStyleMode(mv, cartoonStylePreviewRef);
  cartoonStylePreviewRef.current = createCartoonStylePreview(mv);
}

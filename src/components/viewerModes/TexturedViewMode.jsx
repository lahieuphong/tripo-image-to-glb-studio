import { restoreTexturedViewMaterials } from './materialState.js';

const ICON_TEXTURED_VIEW = (
  <img
    className="s-vtb-icon-img"
    src="/viewers/textured.svg"
    width="16"
    height="16"
    alt=""
    aria-hidden="true"
    draggable="false"
  />
);

export const TEXTURED_VIEW_MODE = {
  key: 'pbr',
  label: 'Textured view',
  icon: ICON_TEXTURED_VIEW,
};

export function applyTexturedViewMode(materials, savedMaterialsRef) {
  restoreTexturedViewMaterials(materials, savedMaterialsRef);
}

import { restoreTexturedViewMaterials } from './materialState.js';

const ICON_TEXTURED_VIEW = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <defs>
      <radialGradient id="vtbi-textured-view" cx="34%" cy="28%" r="72%">
        <stop offset="0%" stopColor="#ffffff"/>
        <stop offset="24%" stopColor="#f7f7f7"/>
        <stop offset="48%" stopColor="#b8b8b8"/>
        <stop offset="72%" stopColor="#6f6f6f"/>
        <stop offset="100%" stopColor="#e4e4e4"/>
      </radialGradient>
    </defs>
    <circle cx="8" cy="8" r="7" fill="url(#vtbi-textured-view)"/>
    <path d="M3.6 9.4c1.6-2.2 5.2-3 8.3-1.8" fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="1.1" strokeLinecap="round"/>
    <path d="M8.6 2.1c2.8.4 4.9 2.8 4.9 5.8" fill="none" stroke="rgba(40,40,40,0.28)" strokeWidth="0.9" strokeLinecap="round"/>
  </svg>
);

export const TEXTURED_VIEW_MODE = {
  key: 'pbr',
  label: 'Textured view',
  icon: ICON_TEXTURED_VIEW,
};

export function applyTexturedViewMode(materials, savedMaterialsRef) {
  restoreTexturedViewMaterials(materials, savedMaterialsRef);
}

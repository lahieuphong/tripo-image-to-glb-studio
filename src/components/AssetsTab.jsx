const CUBE_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

const EYE_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EYE_OFF_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const MOVE_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>
    <polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>
    <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
  </svg>
);

const ROTATE_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const SCALE_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);

const RESET_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 .49-5"/>
  </svg>
);

const AXIS_COLORS = { X: '#f87171', Y: '#4ade80', Z: '#60a5fa' };

function TfRow({ icon, values }) {
  return (
    <div className="s-tf-row">
      <span className="s-tf-row-icon">{icon}</span>
      <div className="s-tf-fields">
        {['X', 'Y', 'Z'].map((axis, i) => (
          <div className="s-tf-field" key={axis}>
            <label style={{ color: AXIS_COLORS[axis] }}>{axis}</label>
            <span>{values[i].toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AssetsTab({ taskId, modelVisible = true, onToggleModelVisible, onResetTransform, transform }) {
  const nodeName = taskId ? `tripo_node_${taskId.slice(0, 13)}…` : null;
  const pos = transform?.pos ?? [0, 0, 0];
  const rot = transform?.rot ?? [0, 0, 0];
  const scl = transform?.scl ?? [1, 1, 1];

  return (
    <div className="s-rp-body s-assets-body">
      <div className="s-asset-section">
        <div className="s-asset-sec-hdr">Thứ bậc</div>
        {nodeName ? (
          <div className="s-asset-node">
            <span className="s-asset-cube-icon">{CUBE_ICON}</span>
            <span className="s-asset-node-name">{nodeName}</span>
            <button
              className={`s-asset-icon-btn${modelVisible ? '' : ' s-asset-icon-btn--off'}`}
              title={modelVisible ? 'Ẩn model' : 'Hiện model'}
              onClick={(e) => { e.stopPropagation(); onToggleModelVisible?.(); }}
            >
              {modelVisible ? EYE_ICON : EYE_OFF_ICON}
            </button>
          </div>
        ) : (
          <p className="s-rp-hint s-rp-hint-pad">Chưa có model.</p>
        )}
      </div>

      <div className="s-asset-section s-asset-section--transform">
        <div className="s-asset-sec-hdr">
          <span>Biến đổi</span>
          <button
            type="button"
            className="s-asset-icon-btn"
            title="Đặt lại"
            onClick={(e) => { e.stopPropagation(); onResetTransform?.(); }}
          >
            {RESET_ICON}
          </button>
        </div>
        <div className="s-tf-rows">
          <TfRow icon={MOVE_ICON}   values={pos} />
          <TfRow icon={ROTATE_ICON} values={rot} />
          <TfRow icon={SCALE_ICON}  values={scl} />
        </div>
      </div>
    </div>
  );
}

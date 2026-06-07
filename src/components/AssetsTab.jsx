import IconMask from './IconMask.jsx';

const CUBE_ICON = <IconMask src="/icons/cube.svg" />;

const EYE_ICON = <IconMask src="/icons/eye.svg" />;

const EYE_OFF_ICON = <IconMask src="/icons/eye-off.svg" />;

const MOVE_ICON = <IconMask src="/icons/move.svg" />;

const ROTATE_ICON = <IconMask src="/icons/rotate.svg" />;

const SCALE_ICON = <IconMask src="/icons/scale.svg" />;

const RESET_ICON = <IconMask src="/icons/reset.svg" />;

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

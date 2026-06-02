import { statusText } from '../utils.js';

export default function CenterViewer({ proxiedModelUrl, normalized, loading, currentStatus, progress }) {
  return (
    <div className="s-center">
      {proxiedModelUrl ? (
        <model-viewer src={proxiedModelUrl}
          camera-controls auto-rotate shadow-intensity="1"
          environment-image="neutral" exposure="1" ar>
          <div slot="poster" className="s-mv-poster">
            <div className="s-mv-spinner" />
            <span className="s-mv-hint">Đang tải model 3D…</span>
          </div>
        </model-viewer>
      ) : (
        <div className="s-center-empty">
          {loading ? (
            <>
              <div className="s-spin-orb" />
              <strong>{statusText(currentStatus)}</strong>
              <span>{Math.round(progress)}%</span>
            </>
          ) : (
            <>
              <div className="s-idle-orb" />
              <strong>Model sẽ xuất hiện ở đây</strong>
              <span>Upload ảnh và bấm Generate GLB để bắt đầu</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

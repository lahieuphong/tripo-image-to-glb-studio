import { statusText } from '../utils.js';

export default function PreviewPanel({
  task,
  normalized,
  taskId,
  progress,
  currentStatus,
  proxiedModelUrl,
  downloadUrl,
  modelUrl,
  logs,
  balance
}) {
  return (
    <section className="panel preview-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Preview</p>
          <h3>3D Viewer</h3>
        </div>
        <span className={`status-chip status-${currentStatus}`}>
          {statusText(currentStatus)}
        </span>
      </div>

      <div className="viewer-shell">
        {proxiedModelUrl ? (
          <model-viewer
            src={proxiedModelUrl}
            poster={normalized.renderedImageUrl || ''}
            camera-controls
            auto-rotate
            shadow-intensity="1"
            environment-image="neutral"
            exposure="1"
            ar
          />
        ) : (
          <div className="empty-viewer">
            <div className="orb" />
            <strong>Model sẽ xuất hiện ở đây</strong>
            <span>Upload ảnh và bấm Generate GLB để bắt đầu.</span>
          </div>
        )}
      </div>

      <div className="progress-card">
        <div className="progress-head">
          <span>{taskId ? `Task: ${taskId.slice(0, 8)}...` : 'Chưa có task'}</span>
          <strong>{Math.round(progress || 0)}%</strong>
        </div>
        <div className="progress-track">
          <div style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }} />
        </div>
        {task?.running_left_time > 0 && (
          <p className="hint">Ước tính còn {task.running_left_time}s</p>
        )}
        {normalized?.renderCredits != null && task?.status === 'success' && (
          <div className="credit-line">
            <span>Lần này tốn</span>
            <strong>{normalized.renderCredits} credits</strong>
            {balance?.balance != null && (
              <span className="credit-remaining">
                · Còn lại {Number(balance.balance).toLocaleString()} credits
              </span>
            )}
          </div>
        )}
      </div>

      <div className="actions-row">
        <a
          className={`secondary-button ${downloadUrl ? '' : 'disabled'}`}
          href={downloadUrl || '#'}
        >
          Download GLB
        </a>
        {modelUrl && (
          <a className="ghost-button" href={modelUrl} target="_blank" rel="noreferrer">
            Mở URL gốc
          </a>
        )}
      </div>

      <div className="logs">
        <div className="logs-title">Activity</div>
        {logs.length === 0 ? (
          <p className="hint">Chưa có log.</p>
        ) : (
          logs.map((log) => (
            <div className="log-line" key={log.id}>
              <span>{log.time}</span>
              <p>{log.message}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

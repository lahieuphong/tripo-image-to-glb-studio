import { useState } from 'react';
import { statusText } from '../utils.js';
import AssetsTab from './AssetsTab.jsx';

export default function RightPanel({
  taskId, task, normalized, progress, currentStatus,
  downloadUrl, modelUrl, logs, balance,
  modelVisible, onToggleModelVisible, onResetTransform, transform,
}) {
  const [tab, setTab] = useState('result');
  return (
    <aside className="s-right-panel">
      <div className="s-rp-tabs">
        <button className={`s-rp-tab${tab==='result'?' active':''}`} onClick={() => setTab('result')}>Kết quả</button>
        <button className={`s-rp-tab${tab==='log'?' active':''}`} onClick={() => setTab('log')}>Hoạt động</button>
        <button className={`s-rp-tab${tab==='assets'?' active':''}`} onClick={() => setTab('assets')}>Tài sản</button>
      </div>

      {tab === 'result' && (
        <div className="s-rp-body">
          <span className={`status-chip status-${currentStatus}`}>{statusText(currentStatus)}</span>

          <div className="s-rp-prog-card">
            <div className="s-rp-prog-head">
              <span className="s-rp-tid">{taskId ? `Task: ${taskId.slice(0,8)}…` : 'Chưa có task'}</span>
              <strong>{Math.round(progress)}%</strong>
            </div>
            <div className="s-rp-track"><div style={{width:`${Math.min(100,Math.max(0,progress))}%`}} /></div>
            {task?.running_left_time > 0 && <p className="s-rp-hint">Ước tính còn {task.running_left_time}s</p>}
            {normalized?.renderCredits != null && task?.status === 'success' && (
              <div className="s-rp-credits">
                <span>Credits:</span><strong>{normalized.renderCredits}</strong>
                {balance?.balance != null && <span className="s-rp-cr-rem">· Còn {Number(balance.balance).toLocaleString()}</span>}
              </div>
            )}
          </div>

          {(normalized?.localRenderSrc || normalized?.renderedImageUrl) && (
            <div className="s-rp-thumb">
              <img
                src={normalized.localRenderSrc || `/api/asset?url=${encodeURIComponent(normalized.renderedImageUrl)}`}
                alt="render"
              />
            </div>
          )}

          <div className="s-rp-actions">
            <a className={`s-rp-primary${downloadUrl?'':' disabled'}`} href={downloadUrl||'#'}>Download GLB</a>
            {modelUrl && <a className="s-rp-ghost" href={modelUrl} target="_blank" rel="noreferrer">Mở URL gốc</a>}
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="s-rp-body s-rp-log">
          {logs.length === 0
            ? <p className="s-rp-hint">Chưa có log.</p>
            : logs.map((l) => (
              <div className="s-log-item" key={l.id}>
                <span>{l.time}</span><p>{l.message}</p>
              </div>
            ))
          }
        </div>
      )}

      {tab === 'assets' && <AssetsTab taskId={taskId} modelVisible={modelVisible} onToggleModelVisible={onToggleModelVisible} onResetTransform={onResetTransform} transform={transform} />}
    </aside>
  );
}

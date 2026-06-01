import { useEffect, useMemo, useRef, useState } from 'react';

const MODELS = [
  {
    value: 'v3.1-20260211',
    label: 'H3 / Tripo v3.1',
    description: 'Độ chi tiết cao, phù hợp hero asset, in 3D, product mockup.'
  },
  {
    value: 'v3.0-20250812',
    label: 'H3 / Tripo v3.0',
    description: 'High detail ổn định, nhiều tuỳ chỉnh geometry.'
  },
  {
    value: 'P1-20260311',
    label: 'P1 Smart Mesh',
    description: 'Tối ưu topology sạch/low-poly, hợp realtime pipeline.'
  },
  {
    value: 'v2.5-20250123',
    label: 'H2 / Tripo v2.5',
    description: 'Baseline ổn định, cân bằng tốc độ và chất lượng.'
  },
  {
    value: 'Turbo-v1.0-20250506',
    label: 'Turbo v1.0',
    description: 'Ưu tiên tốc độ thử ý tưởng nhanh.'
  }
];

const FINAL_STATUSES = new Set(['success', 'failed', 'cancelled', 'banned', 'expired', 'unknown']);


function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function outputFromTaskResponse(taskResponse) {
  const task = taskResponse?.task || null;
  const normalized = taskResponse?.normalized || {};
  return {
    task,
    normalized,
    status: task?.status || 'queued',
    progress: Number.isFinite(task?.progress) ? task.progress : 0
  };
}

function statusText(status) {
  const map = {
    queued: 'Đang xếp hàng',
    running: 'Đang dựng model',
    success: 'Hoàn tất',
    failed: 'Thất bại',
    cancelled: 'Đã huỷ',
    banned: 'Bị chặn bởi policy',
    expired: 'Task hết hạn',
    unknown: 'Không rõ trạng thái'
  };
  return map[status] || status || 'Chưa chạy';
}

function ApiBadge({ configured }) {
  return (
    <div className={`api-badge ${configured ? 'ok' : 'warn'}`}>
      <span className="dot" />
      {configured ? 'API key sẵn sàng' : 'Chưa cấu hình API key'}
    </div>
  );
}

function CreditErrorModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">⚡</div>
        <h3>Tài khoản API chưa có credit</h3>
        <p>
          Bạn cần nạp thêm credit API tại Tripo Platform để tiếp tục generate.
        </p>
        <div className="modal-actions">
          <a
            className="modal-btn-primary"
            href="https://platform.tripo3d.ai/billing"
            target="_blank"
            rel="noreferrer"
          >
            Nạp credit ngay →
          </a>
          <button className="modal-btn-ghost" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [balance, setBalance] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [task, setTask] = useState(null);
  const [normalized, setNormalized] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);
  const activeTaskRef = useRef('');

  const [options, setOptions] = useState({
    modelVersion: 'v3.1-20260211',
    texture: true,
    pbr: true,
    textureQuality: 'standard',
    geometryQuality: 'standard',
    textureAlignment: 'original_image',
    orientation: 'default',
    autoSize: false,
    enableImageAutofix: true,
    compressGeometry: false,
    faceLimit: '',
    modelSeed: '',
    textureSeed: ''
  });

  const selectedModel = useMemo(
    () => MODELS.find((model) => model.value === options.modelVersion) || MODELS[0],
    [options.modelVersion]
  );

  const modelUrl = normalized?.modelUrl || '';
  const proxiedModelUrl = modelUrl ? `/api/asset?url=${encodeURIComponent(modelUrl)}` : '';
  const downloadUrl = modelUrl
    ? `/api/asset?download=1&filename=${encodeURIComponent('tripo-output.glb')}&url=${encodeURIComponent(modelUrl)}`
    : '';

  function refreshBalance() {
    fetch('/api/balance').then((r) => r.json()).then(setBalance).catch(() => {});
  }

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, apiKeyConfigured: false }));
    refreshBalance();
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function addLog(message) {
    setLogs((current) => [
      { id: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString(), message },
      ...current
    ].slice(0, 8));
  }

  function updateOption(key, value) {
    setOptions((current) => {
      const next = { ...current, [key]: value };
      if (key === 'pbr' && value === true) next.texture = true;
      if (key === 'texture' && value === false) next.pbr = false;
      return next;
    });
  }

  function setFile(file) {
    if (!file) return;
    setError('');

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Chỉ hỗ trợ ảnh PNG, JPG/JPEG hoặc WEBP.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('File quá lớn. Giới hạn upload là 50MB.');
      return;
    }

    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setTask(null);
    setNormalized({});
    setTaskId('');
    addLog(`Đã chọn ảnh: ${file.name}`);
  }

  async function generate() {
    if (!imageFile) {
      setError('Hãy chọn một ảnh trước.');
      return;
    }

    setLoading(true);
    setError('');
    setTask(null);
    setNormalized({});
    setTaskId('');
    activeTaskRef.current = '';

    try {
      const form = new FormData();
      form.append('image', imageFile);
      Object.entries(options).forEach(([key, value]) => form.append(key, String(value)));

      addLog('Đang upload ảnh lên Tripo...');
      const createRes = await fetch('/api/generate', { method: 'POST', body: form });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || 'Không tạo được task.');

      setTaskId(created.taskId);
      activeTaskRef.current = created.taskId;
      addLog(`Task đã tạo: ${created.taskId}`);
      await pollTask(created.taskId);
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra.');
      addLog(`Lỗi: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function pollTask(id) {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (activeTaskRef.current !== id) return;

      const res = await fetch(`/api/task/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không đọc được trạng thái task.');

      const parsed = outputFromTaskResponse(data);
      setTask(parsed.task);
      setNormalized(parsed.normalized);

      if (attempt === 0 || attempt % 5 === 0) {
        addLog(`${statusText(parsed.status)} — ${parsed.progress || 0}%`);
      }

      if (FINAL_STATUSES.has(parsed.status)) {
        if (parsed.status === 'success') {
          addLog('Hoàn tất. Bạn có thể preview và download GLB.');
          refreshBalance();
        } else {
          throw new Error(`Task kết thúc với trạng thái: ${parsed.status}`);
        }
        return;
      }

      await wait(2500);
    }

    throw new Error('Polling quá lâu. Bạn có thể copy task_id và kiểm tra lại sau.');
  }

  function onDrop(event) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    setFile(file);
  }

  const progress = task?.progress ?? 0;
  const currentStatus = task?.status || (loading ? 'queued' : 'idle');
  const isCreditError = Boolean(error && (
    error.toLowerCase().includes('enough credit') ||
    error.toLowerCase().includes('not enough') ||
    (error.includes('403') && error.toLowerCase().includes('credit'))
  ));

  return (
    <>
    {isCreditError && <CreditErrorModal onClose={() => setError('')} />}
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">3D</div>
          <div>
            <p className="eyebrow">AI Image to GLB</p>
            <h1>GLB Forge Studio</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Sidebar">
          <button className="nav-item active">Generate</button>
          <button className="nav-item" disabled>Assets</button>
          <button className="nav-item" disabled>History</button>
          <button className="nav-item" disabled>Settings</button>
        </nav>

        <section className="side-card">
          <p className="muted">Powered by</p>
          <strong>Tripo OpenAPI</strong>
          <p className="tiny">Ảnh được gửi qua backend local để API key không lộ ra trình duyệt.</p>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Image → 3D Model</p>
            <h2>Tạo model GLB từ một ảnh</h2>
          </div>
          <div className="topbar-badges">
            <ApiBadge configured={health?.apiKeyConfigured} />
            {balance?.balance != null && (
              <div className="api-badge balance-badge">
                <span className="dot" />
                {Number(balance.balance).toLocaleString()} credits còn lại
              </div>
            )}
          </div>
        </header>

        <div className="grid">
          <section className="panel controls-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Input</p>
                <h3>Upload ảnh</h3>
              </div>
              <span className="pill">PNG/JPG/WEBP · ≤50MB</span>
            </div>

            <label
              className={`dropzone ${dragOver ? 'drag-over' : ''} ${imagePreview ? 'has-preview' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setFile(event.target.files?.[0])}
              />
              {imagePreview ? (
                <img src={imagePreview} alt="Ảnh đầu vào" />
              ) : (
                <div className="empty-upload">
                  <div className="upload-icon">＋</div>
                  <strong>Kéo thả ảnh vào đây</strong>
                  <span>hoặc bấm để chọn file</span>
                </div>
              )}
            </label>

            <div className="section-divider" />

            <div className="form-row">
              <label>Model</label>
              <select
                value={options.modelVersion}
                onChange={(event) => updateOption('modelVersion', event.target.value)}
              >
                {MODELS.map((model) => (
                  <option key={model.value} value={model.value}>{model.label}</option>
                ))}
              </select>
              <p className="hint">{selectedModel.description}</p>
            </div>

            <div className="two-col">
              <label className="toggle-card">
                <input
                  type="checkbox"
                  checked={options.texture}
                  onChange={(event) => updateOption('texture', event.target.checked)}
                />
                <span>
                  <strong>Texture</strong>
                  <small>Tạo màu/texture từ ảnh</small>
                </span>
              </label>

              <label className="toggle-card">
                <input
                  type="checkbox"
                  checked={options.pbr}
                  onChange={(event) => updateOption('pbr', event.target.checked)}
                />
                <span>
                  <strong>PBR</strong>
                  <small>Material maps cho game/3D</small>
                </span>
              </label>
            </div>

            <div className="two-col">
              <div className="form-row">
                <label>Texture quality</label>
                <select
                  value={options.textureQuality}
                  onChange={(event) => updateOption('textureQuality', event.target.value)}
                  disabled={!options.texture && !options.pbr}
                >
                  <option value="standard">Standard</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>
              <div className="form-row">
                <label>Geometry quality</label>
                <select
                  value={options.geometryQuality}
                  onChange={(event) => updateOption('geometryQuality', event.target.value)}
                  disabled={!options.modelVersion.startsWith('v3')}
                >
                  <option value="standard">Standard</option>
                  <option value="detailed">Ultra / Detailed</option>
                </select>
              </div>
            </div>

            <details className="advanced">
              <summary>Tuỳ chỉnh nâng cao</summary>

              <div className="two-col">
                <div className="form-row">
                  <label>Face limit</label>
                  <input
                    type="number"
                    min="48"
                    placeholder="Tự động"
                    value={options.faceLimit}
                    onChange={(event) => updateOption('faceLimit', event.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label>Orientation</label>
                  <select
                    value={options.orientation}
                    onChange={(event) => updateOption('orientation', event.target.value)}
                    disabled={!options.texture && !options.pbr}
                  >
                    <option value="default">Default</option>
                    <option value="align_image">Align image</option>
                  </select>
                </div>
              </div>

              <div className="two-col">
                <div className="form-row">
                  <label>Texture alignment</label>
                  <select
                    value={options.textureAlignment}
                    onChange={(event) => updateOption('textureAlignment', event.target.value)}
                  >
                    <option value="original_image">Original image</option>
                    <option value="geometry">Geometry</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>Model seed</label>
                  <input
                    type="number"
                    placeholder="Random"
                    value={options.modelSeed}
                    onChange={(event) => updateOption('modelSeed', event.target.value)}
                  />
                </div>
              </div>

              <div className="two-col">
                <label className="toggle-card compact">
                  <input
                    type="checkbox"
                    checked={options.enableImageAutofix}
                    onChange={(event) => updateOption('enableImageAutofix', event.target.checked)}
                  />
                  <span>
                    <strong>Image autofix</strong>
                    <small>Tự tối ưu ảnh đầu vào</small>
                  </span>
                </label>

                <label className="toggle-card compact">
                  <input
                    type="checkbox"
                    checked={options.compressGeometry}
                    onChange={(event) => updateOption('compressGeometry', event.target.checked)}
                  />
                  <span>
                    <strong>Compress</strong>
                    <small>Nén geometry output</small>
                  </span>
                </label>
              </div>
            </details>

            {error && <div className="alert">{error}</div>}

            <button className="primary-button" onClick={generate} disabled={loading || !imageFile}>
              {loading ? 'Đang generate...' : 'Generate GLB'}
            </button>
          </section>

          <section className="panel preview-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Preview</p>
                <h3>3D Viewer</h3>
              </div>
              <span className={`status-chip status-${currentStatus}`}>{statusText(currentStatus)}</span>
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
                    <span className="credit-remaining">· Còn lại {Number(balance.balance).toLocaleString()} credits</span>
                  )}
                </div>
              )}
            </div>

            <div className="actions-row">
              <a className={`secondary-button ${downloadUrl ? '' : 'disabled'}`} href={downloadUrl || '#'}>
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
        </div>
      </section>
    </main>
    </>
  );
}

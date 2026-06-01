import { useEffect, useMemo, useRef, useState } from 'react';
import { MODELS, FINAL_STATUSES } from './constants.js';
import { wait, outputFromTaskResponse, isCreditErrorMessage } from './utils.js';
import ApiBadge from './components/ApiBadge.jsx';
import CreditErrorModal from './components/CreditErrorModal.jsx';
import ControlsPanel from './components/ControlsPanel.jsx';
import PreviewPanel from './components/PreviewPanel.jsx';

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
  const generatingRef = useRef(false);

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
    () => MODELS.find((m) => m.value === options.modelVersion) || MODELS[0],
    [options.modelVersion]
  );

  const modelUrl = normalized?.modelUrl || '';
  const proxiedModelUrl = modelUrl ? `/api/asset?url=${encodeURIComponent(modelUrl)}` : '';
  const downloadUrl = modelUrl
    ? `/api/asset?download=1&filename=${encodeURIComponent('tripo-output.glb')}&url=${encodeURIComponent(modelUrl)}`
    : '';
  const progress = task?.progress ?? 0;
  const currentStatus = task?.status || (loading ? 'queued' : 'idle');
  const isCreditError = isCreditErrorMessage(error);

  function refreshBalance({ force = false } = {}) {
    fetch('/api/balance')
      .then((r) => r.json())
      .then((data) => { if (force || !generatingRef.current) setBalance(data); })
      .catch(() => {});
  }

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, apiKeyConfigured: false }));
    refreshBalance();
  }, []);

  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
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
    if (file.size > 200 * 1024 * 1024) {
      setError('File quá lớn. Giới hạn upload là 200MB.');
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
    if (!imageFile) { setError('Hãy chọn một ảnh trước.'); return; }

    generatingRef.current = true;
    setLoading(true);
    setError('');
    setTask(null);
    setNormalized({});
    setTaskId('');
    activeTaskRef.current = '';

    try {
      const form = new FormData();
      form.append('image', imageFile);
      Object.entries(options).forEach(([k, v]) => form.append(k, String(v)));

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
      generatingRef.current = false;
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
        addLog(`${parsed.status === 'running' ? 'Đang dựng model' : parsed.status} — ${parsed.progress || 0}%`);
      }

      if (FINAL_STATUSES.has(parsed.status)) {
        if (parsed.status === 'success') {
          addLog('Hoàn tất. Bạn có thể preview và download GLB.');
          fetch('/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: id,
              modelVersion: options.modelVersion,
              normalized: parsed.normalized,
              renderCredits: parsed.normalized?.renderCredits ?? null,
              inputImageName: imageFile?.name ?? null,
            })
          }).catch(() => {});
          refreshBalance({ force: true });
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
    setFile(event.dataTransfer.files?.[0]);
  }

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
            <a className="nav-item" href="/jobs">Jobs</a>
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
            <ApiBadge configured={health?.apiKeyConfigured} balance={balance} />
          </header>

          <div className="grid">
            <ControlsPanel
              options={options}
              updateOption={updateOption}
              selectedModel={selectedModel}
              imagePreview={imagePreview}
              dragOver={dragOver}
              error={error}
              loading={loading}
              imageFile={imageFile}
              setFile={setFile}
              setDragOver={setDragOver}
              onDrop={onDrop}
              onGenerate={generate}
            />
            <PreviewPanel
              task={task}
              normalized={normalized}
              taskId={taskId}
              progress={progress}
              currentStatus={currentStatus}
              proxiedModelUrl={proxiedModelUrl}
              downloadUrl={downloadUrl}
              modelUrl={modelUrl}
              logs={logs}
              balance={balance}
            />
          </div>
        </section>
      </main>
    </>
  );
}

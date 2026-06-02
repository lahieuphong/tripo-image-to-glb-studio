import { useEffect, useMemo, useRef, useState } from 'react';
import { MODELS, FINAL_STATUSES } from './constants.js';
import { wait, outputFromTaskResponse, isCreditErrorMessage } from './utils.js';
import CreditErrorModal from './components/CreditErrorModal.jsx';
import TopBar from './components/TopBar.jsx';
import IconSidebar from './components/IconSidebar.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import CenterViewer from './components/CenterViewer.jsx';
import RightPanel from './components/RightPanel.jsx';

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

  const [modelVisible, setModelVisible] = useState(true);

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

  // Reset visibility when a new model loads
  useEffect(() => { setModelVisible(true); }, [taskId]);

  const modelUrl = normalized?.modelUrl || '';
  const proxiedModelUrl = normalized?.localModelSrc
    || (modelUrl ? `/api/asset?url=${encodeURIComponent(modelUrl)}` : '');
  const downloadUrl = normalized?.localModelSrc
    ? `${normalized.localModelSrc}?download=1&filename=tripo-output.glb`
    : (modelUrl ? `/api/asset?download=1&filename=${encodeURIComponent('tripo-output.glb')}&url=${encodeURIComponent(modelUrl)}` : '');
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
    const jobId = new URLSearchParams(window.location.search).get('id');
    if (!jobId) return;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}`)
      .then((r) => r.json())
      .then((job) => {
        if (!job?.taskId) return;
        setTaskId(job.taskId);
        setTask({ status: 'success', progress: 100 });
        const norm = { ...(job.normalized || {}) };
        if (job.localModelAvailable) norm.localModelSrc = `/api/jobs/${job.taskId}/model`;
        if (job.localRenderAvailable) norm.localRenderSrc = `/api/jobs/${job.taskId}/render`;
        setNormalized(norm);
        setImagePreview(`/api/jobs/${job.taskId}/input`);
        if (job.options) setOptions((prev) => ({ ...prev, ...job.options }));
        const restoredLog = { id: `r-${Date.now()}`, time: new Date().toLocaleTimeString(), message: `Khôi phục từ lịch sử (${new Date(job.savedAt).toLocaleString('vi-VN')})` };
        setLogs([restoredLog, ...(Array.isArray(job.logs) ? job.logs : [])].slice(0, 8));
      })
      .catch(() => {});
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
          const doneLog = { id: `${Date.now()}-done`, time: new Date().toLocaleTimeString(), message: 'Hoàn tất. Bạn có thể preview và download GLB.' };
          const finalLogs = [doneLog, ...logs].slice(0, 8);
          addLog('Hoàn tất. Bạn có thể preview và download GLB.');
          window.history.pushState({}, '', `/jobs?id=${encodeURIComponent(id)}`);
          fetch('/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: id,
              modelVersion: options.modelVersion,
              normalized: parsed.normalized,
              renderCredits: parsed.normalized?.renderCredits ?? null,
              inputImageName: imageFile?.name ?? null,
              options,
              logs: finalLogs,
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
      <div className="s-root">
        <TopBar health={health} balance={balance} />
        <div className="s-body">
          <IconSidebar />
          <ControlPanel
            options={options} updateOption={updateOption} selectedModel={selectedModel}
            imagePreview={imagePreview} dragOver={dragOver} setDragOver={setDragOver}
            setFile={setFile} onDrop={onDrop} error={error} loading={loading}
            imageFile={imageFile} onGenerate={generate}
          />
          <CenterViewer
            proxiedModelUrl={proxiedModelUrl} normalized={normalized}
            loading={loading} currentStatus={currentStatus} progress={progress}
            modelVisible={modelVisible}
          />
          <RightPanel
            taskId={taskId} task={task} normalized={normalized}
            progress={progress} currentStatus={currentStatus}
            downloadUrl={downloadUrl} modelUrl={modelUrl}
            logs={logs} balance={balance}
            modelVisible={modelVisible} onToggleModelVisible={() => setModelVisible(v => !v)}
          />
        </div>
      </div>
    </>
  );
}

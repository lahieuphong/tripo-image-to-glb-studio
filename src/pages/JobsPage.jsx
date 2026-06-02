import { useEffect, useState } from 'react';

function proxyUrl(url) {
  return url ? `/api/asset?url=${encodeURIComponent(url)}` : '';
}

function JobCard({ job, onSelect }) {
  const [inputFailed, setInputFailed] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const renderThumbSrc = job.localRenderAvailable
    ? `/api/jobs/${job.taskId}/render`
    : (job.normalized?.renderedImageUrl ? proxyUrl(job.normalized.renderedImageUrl) : '');
  return (
    <button className="job-card" onClick={() => onSelect(job.taskId)}>
      <div className="job-thumb">
        {!inputFailed ? (
          <img src={`/api/jobs/${job.taskId}/input`} alt="input" loading="lazy" onError={() => setInputFailed(true)} />
        ) : !renderFailed && renderThumbSrc ? (
          <img src={renderThumbSrc} alt="render" loading="lazy" onError={() => setRenderFailed(true)} />
        ) : (
          <div className="job-thumb-empty">3D</div>
        )}
      </div>
      <div className="job-card-body">
        {job.inputImageName && <p className="job-card-name">{job.inputImageName}</p>}
        <p className="job-card-id">{job.taskId.slice(0, 14)}…</p>
        <p className="job-card-date">{new Date(job.savedAt).toLocaleString('vi-VN')}</p>
        <div className="job-card-meta">
          {job.modelVersion && <span>{job.modelVersion.split('-')[0]}</span>}
          {job.renderCredits != null && <span>{job.renderCredits} cr</span>}
        </div>
      </div>
    </button>
  );
}

function JobDetail({ taskId }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [inputImgFailed, setInputImgFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/${encodeURIComponent(taskId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setJob(data);
      })
      .catch((e) => setErr(e.message || 'Không tải được job.'))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <div className="jobs-loading">Đang tải…</div>;
  if (err || !job) return <div className="jobs-empty"><p>{err || 'Không tìm thấy job.'}</p></div>;

  const remoteModelUrl = job.normalized?.modelUrl || '';
  const modelSrc = job.localModelAvailable
    ? `/api/jobs/${job.taskId}/model`
    : (remoteModelUrl ? proxyUrl(remoteModelUrl) : '');
  const downloadUrl = job.localModelAvailable
    ? `/api/jobs/${job.taskId}/model?download=1&filename=tripo-output.glb`
    : (remoteModelUrl ? `/api/asset?download=1&filename=${encodeURIComponent('tripo-output.glb')}&url=${encodeURIComponent(remoteModelUrl)}` : '');
  const renderedSrc = job.localRenderAvailable
    ? `/api/jobs/${job.taskId}/render`
    : (job.normalized?.renderedImageUrl ? proxyUrl(job.normalized.renderedImageUrl) : '');

  return (
    <div className="job-detail">

      {/* ── 3 phần chính ─────────────────────────────── */}
      <div className="job-detail-top">

        {/* Phần 1: Ảnh gốc */}
        <div className="job-section">
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            {inputImgFailed ? 'Ảnh render Tripo' : 'Ảnh gốc (Input)'}
          </p>
          <div className="job-input-wrap">
            {!inputImgFailed ? (
              <img
                src={`/api/jobs/${taskId}/input`}
                alt={job.inputImageName || 'Input'}
                onError={() => setInputImgFailed(true)}
              />
            ) : renderedSrc ? (
              <img
                src={renderedSrc}
                alt="Render"
                onError={(e) => { e.target.closest('.job-input-wrap').style.display = 'none'; }}
              />
            ) : (
              <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 20 }}>Không có ảnh</div>
            )}
          </div>
          {job.inputImageName && (
            <p className="job-input-name">{job.inputImageName}</p>
          )}
        </div>

        {/* Phần 2: 3D Viewer */}
        <div className="job-section">
          <p className="eyebrow" style={{ marginBottom: 10 }}>3D Viewer (Output)</p>
          <div className="viewer-shell job-viewer-shell">
            {modelSrc ? (
              <model-viewer
                src={modelSrc}
                camera-controls
                auto-rotate
                shadow-intensity="1"
                environment-image="neutral"
                exposure="1"
                ar
              >
                <div slot="poster" className="s-mv-poster">
                  <div className="s-mv-spinner" />
                  <span className="s-mv-hint">Đang tải model 3D…</span>
                </div>
              </model-viewer>
            ) : (
              <div className="empty-viewer">
                <div className="orb" />
                <strong>Không có model URL</strong>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Phần 3: Metadata + Download */}
      <div className="job-detail-meta">
        <div className="job-meta-row">
          <span>Task ID</span>
          <code>{job.taskId}</code>
        </div>
        <div className="job-meta-row">
          <span>Thời gian</span>
          <span>{new Date(job.savedAt).toLocaleString('vi-VN')}</span>
        </div>
        {job.modelVersion && (
          <div className="job-meta-row">
            <span>Model</span>
            <span>{job.modelVersion}</span>
          </div>
        )}
        {job.inputImageName && (
          <div className="job-meta-row">
            <span>Ảnh gốc</span>
            <span>{job.inputImageName}</span>
          </div>
        )}
        {job.renderCredits != null && (
          <div className="job-meta-row">
            <span>Credits sử dụng</span>
            <strong>{job.renderCredits}</strong>
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
        {remoteModelUrl && (
          <a className="ghost-button" href={remoteModelUrl} target="_blank" rel="noreferrer">
            Mở URL gốc
          </a>
        )}
      </div>

    </div>
  );
}

export default function JobsPage() {
  const taskId = new URLSearchParams(window.location.search).get('id');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(!taskId);

  useEffect(() => {
    if (taskId) return;
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((data) => setJobs(data.jobs || []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [taskId]);

  return (
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
          <a className="nav-item" href="/">Generate</a>
          <button className="nav-item" disabled>Assets</button>
          <a className="nav-item active" href="/jobs">Jobs</a>
          <button className="nav-item" disabled>Settings</button>
        </nav>

        <section className="side-card">
          <p className="muted">Powered by</p>
          <strong>Tripo OpenAPI</strong>
          <p className="tiny">Lịch sử các model đã generate.</p>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{taskId ? 'Chi tiết' : 'Lịch sử'}</p>
            <h2>{taskId ? taskId.slice(0, 18) + '…' : 'Jobs History'}</h2>
          </div>
          {taskId && (
            <a className="ghost-button" href="/jobs">← Danh sách</a>
          )}
        </header>

        {taskId ? (
          <JobDetail taskId={taskId} />
        ) : loading ? (
          <div className="jobs-loading">Đang tải…</div>
        ) : jobs.length === 0 ? (
          <div className="jobs-empty">
            <div className="orb" />
            <strong>Chưa có job nào</strong>
            <p>Generate một model để bắt đầu lưu lịch sử.</p>
            <a className="primary-button" href="/">Tạo model mới →</a>
          </div>
        ) : (
          <div className="jobs-grid">
            {jobs.map((j) => (
              <JobCard
                key={j.taskId}
                job={j}
                onSelect={(id) => { window.location.href = `/jobs?id=${id}`; }}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

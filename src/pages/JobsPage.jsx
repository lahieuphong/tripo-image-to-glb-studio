import { useEffect, useState } from 'react';

function proxyUrl(url) {
  return url ? `/api/asset?url=${encodeURIComponent(url)}` : '';
}

function isMultiviewJob(job) {
  const mode = String(job?.mode || '').toLowerCase();
  if (mode === 'multiview' || mode === 'multi') return true;

  const inputImages = job?.inputImages;
  if (!inputImages || typeof inputImages !== 'object') return false;
  return Object.values(inputImages).filter(Boolean).length > 1;
}

function inputModeInfo(job) {
  return isMultiviewJob(job)
    ? { label: '4 ảnh', detail: 'Multiview to model' }
    : { label: '1 ảnh', detail: 'Image to model' };
}

function hasOption(job, key) {
  return Object.prototype.hasOwnProperty.call(job?.options || {}, key);
}

function textureEnabled(job) {
  if (hasOption(job, 'texture') || hasOption(job, 'pbr')) {
    return Boolean(job.options?.texture || job.options?.pbr);
  }
  if (job?.normalized?.pbrModelUrl) return true;
  if (job?.normalized?.baseModelUrl && !job?.normalized?.pbrModelUrl) return false;
  return null;
}

function estimatedCredits(job) {
  const modelVersion = String(job?.options?.modelVersion || job?.modelVersion || '');
  const withTexture = textureEnabled(job);

  if (!modelVersion || modelVersion.startsWith('Turbo') || withTexture == null) return null;
  if (modelVersion.startsWith('P1')) return withTexture ? 50 : 40;

  let credits = withTexture ? 30 : 20;
  if (withTexture && job?.options?.textureQuality === 'detailed') credits += 10;
  if (modelVersion.startsWith('v3') && job?.options?.geometryQuality === 'detailed') credits += 20;
  return credits;
}

function creditInfo(job) {
  const actual = job?.renderCredits
    ?? job?.normalized?.renderCredits
    ?? job?.normalized?.consumed_credit
    ?? job?.normalized?.consumedCredit
    ?? null;
  if (actual != null) {
    return {
      chip: `${actual} cr`,
      rowLabel: 'Credits sử dụng',
      rowValue: `${actual} credits`,
      kind: 'actual'
    };
  }

  const estimate = estimatedCredits(job);
  if (estimate != null) {
    return {
      chip: `~${estimate} cr`,
      rowLabel: 'Credits ước tính',
      rowValue: `${estimate} credits`,
      kind: 'estimated'
    };
  }

  return {
    chip: 'credit chưa rõ',
    rowLabel: 'Credits',
    rowValue: 'Chưa rõ',
    kind: 'unknown'
  };
}

function inputImagesLabel(job) {
  const inputImages = job?.inputImages;
  if (!inputImages || typeof inputImages !== 'object') return '';

  const labels = {
    front: 'Trước',
    left: 'Trái',
    right: 'Phải',
    back: 'Sau'
  };

  return ['front', 'left', 'right', 'back']
    .filter((view) => inputImages[view])
    .map((view) => `${labels[view]}: ${inputImages[view]}`)
    .join(' · ');
}

function JobCard({ job, onSelect }) {
  const [inputFailed, setInputFailed] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const modeInfo = inputModeInfo(job);
  const credits = creditInfo(job);
  const renderThumbSrc = job.localRenderAvailable
    ? `/api/jobs/${job.taskId}/render`
    : (job.normalized?.renderedImageUrl ? proxyUrl(job.normalized.renderedImageUrl) : '');
  return (
    <button className="job-card" onClick={() => onSelect(job.taskId)}>
      <div className="job-thumb">
        {isMultiviewJob(job) ? (
          <div className="job-thumb-mv">
            {['front', 'right', 'left', 'back'].map(view => (
              <img key={view} src={`/api/jobs/${job.taskId}/input/${view}`} alt={view} loading="lazy"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
            ))}
          </div>
        ) : !inputFailed ? (
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
          <span className="job-card-input-mode">{modeInfo.label}</span>
          <span
            className={`job-card-credit ${credits.kind}`}
            title={credits.kind === 'estimated' ? 'Ước tính theo model và option đã lưu' : undefined}
          >
            {credits.chip}
          </span>
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
  const modeInfo = inputModeInfo(job);
  const credits = creditInfo(job);
  const multiImages = inputImagesLabel(job);

  return (
    <div className="job-detail">

      {/* ── 3 phần chính ─────────────────────────────── */}
      <div className="job-detail-top">

        {/* Phần 1: Ảnh gốc */}
        <div className="job-section">
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            {isMultiviewJob(job) ? 'Ảnh gốc (4 góc)' : inputImgFailed ? 'Ảnh render Tripo' : 'Ảnh gốc (Input)'}
          </p>
          {isMultiviewJob(job) ? (
            <div className="job-input-mv-grid">
              {[
                { view: 'front', label: 'Trước' },
                { view: 'left',  label: 'Trái'  },
                { view: 'right', label: 'Phải'  },
                { view: 'back',  label: 'Sau'   },
              ].map(({ view, label }) => (
                <div key={view} className="job-input-mv-cell">
                  <div className="job-input-mv-img-wrap">
                    <img
                      src={`/api/jobs/${taskId}/input/${view}`}
                      alt={label}
                      onError={(e) => {
                        const cell = e.currentTarget.closest('.job-input-mv-cell');
                        if (cell) cell.style.opacity = '0.25';
                      }}
                    />
                  </div>
                  <span className="job-input-mv-label">{label}</span>
                </div>
              ))}
            </div>
          ) : (
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
          )}
          {!isMultiviewJob(job) && job.inputImageName && (
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
                shadow-intensity="0"
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
        <div className="job-meta-row">
          <span>Loại input</span>
          <span className="job-meta-value">{modeInfo.label} · {modeInfo.detail}</span>
        </div>
        {job.inputImageName && (
          <div className="job-meta-row">
            <span>Ảnh gốc</span>
            <span>{job.inputImageName}</span>
          </div>
        )}
        {multiImages && (
          <div className="job-meta-row">
            <span>Ảnh 4 góc</span>
            <span className="job-meta-value">{multiImages}</span>
          </div>
        )}
        <div className="job-meta-row">
          <span>{credits.rowLabel}</span>
          <strong className={`job-meta-credit ${credits.kind}`}>{credits.rowValue}</strong>
        </div>
        {credits.kind === 'estimated' && (
          <div className="job-meta-row">
            <span>Ghi chú</span>
            <span className="job-meta-value">Tripo chưa trả credit thực tế cho job này, UI đang hiển thị theo pricing đã lưu.</span>
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
          <a className="nav-item" href="/pricing">Pricing</a>
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

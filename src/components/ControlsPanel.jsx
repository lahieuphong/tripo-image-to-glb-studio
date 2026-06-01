import { MODELS } from '../constants.js';

export default function ControlsPanel({
  options,
  updateOption,
  selectedModel,
  imagePreview,
  dragOver,
  error,
  loading,
  imageFile,
  setFile,
  setDragOver,
  onDrop,
  onGenerate
}) {
  return (
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
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0])}
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
          onChange={(e) => updateOption('modelVersion', e.target.value)}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <p className="hint">{selectedModel.description}</p>
      </div>

      <div className="two-col">
        <label className="toggle-card">
          <input
            type="checkbox"
            checked={options.texture}
            onChange={(e) => updateOption('texture', e.target.checked)}
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
            onChange={(e) => updateOption('pbr', e.target.checked)}
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
            onChange={(e) => updateOption('textureQuality', e.target.value)}
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
            onChange={(e) => updateOption('geometryQuality', e.target.value)}
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
              onChange={(e) => updateOption('faceLimit', e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>Orientation</label>
            <select
              value={options.orientation}
              onChange={(e) => updateOption('orientation', e.target.value)}
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
              onChange={(e) => updateOption('textureAlignment', e.target.value)}
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
              onChange={(e) => updateOption('modelSeed', e.target.value)}
            />
          </div>
        </div>

        <div className="two-col">
          <label className="toggle-card compact">
            <input
              type="checkbox"
              checked={options.enableImageAutofix}
              onChange={(e) => updateOption('enableImageAutofix', e.target.checked)}
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
              onChange={(e) => updateOption('compressGeometry', e.target.checked)}
            />
            <span>
              <strong>Compress</strong>
              <small>Nén geometry output</small>
            </span>
          </label>
        </div>
      </details>

      {error && <div className="alert">{error}</div>}

      <button
        className="primary-button"
        onClick={onGenerate}
        disabled={loading || !imageFile}
      >
        {loading ? 'Đang generate...' : 'Generate GLB'}
      </button>
    </section>
  );
}

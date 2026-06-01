import { useEffect, useRef, useState } from 'react';
import { MODELS } from '../constants.js';

const MODEL_OPTIONS = MODELS.map((model) => ({
  value: model.value,
  label: model.label
}));

const TEXTURE_QUALITY_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' }
];

const GEOMETRY_QUALITY_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Ultra / Detailed' }
];

const ORIENTATION_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'align_image', label: 'Align image' }
];

const TEXTURE_ALIGNMENT_OPTIONS = [
  { value: 'original_image', label: 'Original image' },
  { value: 'geometry', label: 'Geometry' }
];

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
        <SelectField
          value={options.modelVersion}
          onChange={(value) => updateOption('modelVersion', value)}
          options={MODEL_OPTIONS}
          ariaLabel="Model"
        />
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
          <SelectField
            value={options.textureQuality}
            onChange={(value) => updateOption('textureQuality', value)}
            options={TEXTURE_QUALITY_OPTIONS}
            disabled={!options.texture && !options.pbr}
            ariaLabel="Texture quality"
          />
        </div>
        <div className="form-row">
          <label>Geometry quality</label>
          <SelectField
            value={options.geometryQuality}
            onChange={(value) => updateOption('geometryQuality', value)}
            options={GEOMETRY_QUALITY_OPTIONS}
            disabled={!options.modelVersion.startsWith('v3')}
            ariaLabel="Geometry quality"
          />
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
            <SelectField
              value={options.orientation}
              onChange={(value) => updateOption('orientation', value)}
              options={ORIENTATION_OPTIONS}
              disabled={!options.texture && !options.pbr}
              ariaLabel="Orientation"
            />
          </div>
        </div>

        <div className="two-col">
          <div className="form-row">
            <label>Texture alignment</label>
            <SelectField
              value={options.textureAlignment}
              onChange={(value) => updateOption('textureAlignment', value)}
              options={TEXTURE_ALIGNMENT_OPTIONS}
              ariaLabel="Texture alignment"
            />
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

function SelectField({ value, onChange, options, disabled = false, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function chooseOption(nextValue) {
    onChange(nextValue);
    setOpen(false);
  }

  function handleButtonKeyDown(event) {
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      setOpen(true);
      return;
    }

    setOpen((current) => !current);
  }

  return (
    <div className={`select-field ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="select-button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected?.label}</span>
        <span className="select-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`select-option ${option.value === value ? 'selected' : ''}`}
              onClick={() => chooseOption(option.value)}
              role="option"
              aria-selected={option.value === value}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

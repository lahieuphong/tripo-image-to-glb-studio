import { useEffect, useRef, useState } from 'react';
import { MODELS } from '../constants.js';

function NumberField({ value, onChange, min, max, step = 1, placeholder, ariaLabel }) {
  const inputRef = useRef(null);
  const minValue = min === undefined ? undefined : Number(min);
  const maxValue = max === undefined ? undefined : Number(max);
  const stepValue = Number(step) || 1;

  function clamp(nextValue) {
    if (Number.isFinite(minValue) && nextValue < minValue) return minValue;
    if (Number.isFinite(maxValue) && nextValue > maxValue) return maxValue;
    return nextValue;
  }

  function stepBy(direction) {
    const hasValue = value !== '' && value !== null && value !== undefined;
    const current = hasValue ? Number(value) : Number.NaN;
    const emptyBase = Number.isFinite(minValue) ? minValue - direction * stepValue : 0;
    const base = Number.isFinite(current) ? current : emptyBase;
    const nextValue = clamp(base + direction * stepValue);
    onChange(String(nextValue));
    inputRef.current?.focus();
  }

  return (
    <div className="number-field">
      <input
        ref={inputRef}
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
      />
      <div className="number-stepper">
        <button type="button" className="number-stepper-button up" onClick={() => stepBy(1)}  aria-label={`Increase ${ariaLabel}`} tabIndex={-1} />
        <button type="button" className="number-stepper-button down" onClick={() => stepBy(-1)} aria-label={`Decrease ${ariaLabel}`} tabIndex={-1} />
      </div>
    </div>
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
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { setOpen(true); return; }
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

// ─── Multiview icons ───────────────────────────────────────────────

const PERSON_ICON = (
  <svg width="26" height="30" viewBox="0 0 26 30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="13" cy="8" r="6"/>
    <path d="M1 29c0-6.6 5.4-12 12-12s12 5.4 12 12"/>
  </svg>
);

const MV_VIEWS = [
  { key: 'front', label: 'Trước',    required: true  },
  { key: 'left',  label: 'Bên trái', required: false },
  { key: 'right', label: 'Phải',     required: false },
  { key: 'back',  label: 'Mặt sau',  required: false },
];

function estimateGenerationCredits(options) {
  const modelVersion = String(options?.modelVersion || '');
  const withTexture = Boolean(options?.texture || options?.pbr);

  if (modelVersion.startsWith('Turbo')) return null;

  if (modelVersion.startsWith('P1')) {
    return withTexture ? 50 : 40;
  }

  let credits = withTexture ? 30 : 20;
  if (withTexture && options?.textureQuality === 'detailed') credits += 10;
  if (modelVersion.startsWith('v3') && options?.geometryQuality === 'detailed') credits += 20;
  return credits;
}

function creditLabel(credits) {
  return credits == null ? 'credit chưa rõ' : `${credits} credits`;
}

function MultiviewSlot({ viewKey, label, required, preview, onFile }) {
  const [drag, setDrag] = useState(false);

  function handleFile(file) {
    if (!file) return;
    onFile(viewKey, file);
  }

  return (
    <label
      className={[
        's-mv4-slot',
        required ? 's-mv4-front' : 's-mv4-side',
        preview  ? 's-mv4-filled' : '',
        drag     ? 's-mv4-drag'   : '',
      ].join(' ')}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
    >
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {preview
        ? <img className="s-mv4-preview" src={preview} alt={label} />
        : (
          <div className="s-mv4-body">
            <span className="s-mv4-icon">{PERSON_ICON}</span>
            <span className="s-mv4-label">{label}</span>
            {required && <small className="s-mv4-hint">JPG, PNG, WEBP, ≤ 200MB</small>}
          </div>
        )
      }

      {preview && (
        <button
          type="button"
          className="s-mv4-clear"
          title="Xóa ảnh"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFile(viewKey, null); }}
        >
          <img className="s-mv4-clear-icon" src="/icons/close.svg" alt="" aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

function MultiviewGrid({ multiPreviews, onFile }) {
  const [front, ...sides] = MV_VIEWS;
  return (
    <div className="s-mv4-grid">
      <MultiviewSlot
        viewKey={front.key}
        label={front.label}
        required={front.required}
        preview={multiPreviews[front.key]}
        onFile={onFile}
      />
      <div className="s-mv4-sides">
        {sides.map(v => (
          <MultiviewSlot
            key={v.key}
            viewKey={v.key}
            label={v.label}
            required={v.required}
            preview={multiPreviews[v.key]}
            onFile={onFile}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Shared settings block (used by both modes) ────────────────────

function SharedSettings({ options, updateOption, selectedModel }) {
  return (
    <>
      <div className="s-field">
        <div className="s-fl">AI Model</div>
        <SelectField value={options.modelVersion} onChange={(v) => updateOption('modelVersion', v)}
          options={MODELS.map((m) => ({ value: m.value, label: m.label }))} ariaLabel="Model" />
        <p className="s-fhint">{selectedModel.description}</p>
      </div>

      <div className="s-toggle-group">
        <label className="s-tc">
          <input type="checkbox" checked={options.texture} onChange={(e) => updateOption('texture', e.target.checked)} />
          <span><strong>Texture</strong><small>Tạo màu/texture từ ảnh</small></span>
        </label>
        <label className="s-tc">
          <input type="checkbox" checked={options.pbr} onChange={(e) => updateOption('pbr', e.target.checked)} />
          <span><strong>PBR</strong><small>Material maps cho game/3D</small></span>
        </label>
      </div>

      <div className="s-2col">
        <div className="s-field">
          <div className="s-fl">Texture quality</div>
          <SelectField value={options.textureQuality} onChange={(v) => updateOption('textureQuality', v)}
            options={[{value:'standard',label:'Standard'},{value:'detailed',label:'Detailed'}]}
            disabled={!options.texture && !options.pbr} ariaLabel="Texture quality" />
        </div>
        <div className="s-field">
          <div className="s-fl">Geometry quality</div>
          <SelectField value={options.geometryQuality} onChange={(v) => updateOption('geometryQuality', v)}
            options={[{value:'standard',label:'Standard'},{value:'detailed',label:'Ultra'}]}
            disabled={!options.modelVersion.startsWith('v3')} ariaLabel="Geometry quality" />
        </div>
      </div>

      <details className="s-adv">
        <summary>Tuỳ chỉnh nâng cao</summary>
        <div className="s-adv-body">
          <div className="s-2col">
            <div className="s-field"><div className="s-fl">Face limit</div>
              <NumberField min="48" placeholder="Tự động" value={options.faceLimit} onChange={(v) => updateOption('faceLimit', v)} ariaLabel="Face limit" /></div>
            <div className="s-field"><div className="s-fl">Orientation</div>
              <SelectField value={options.orientation} onChange={(v) => updateOption('orientation', v)}
                options={[{value:'default',label:'Default'},{value:'align_image',label:'Align image'}]}
                disabled={!options.texture && !options.pbr} ariaLabel="Orientation" /></div>
          </div>
          <div className="s-2col">
            <div className="s-field"><div className="s-fl">Texture align</div>
              <SelectField value={options.textureAlignment} onChange={(v) => updateOption('textureAlignment', v)}
                options={[{value:'original_image',label:'Original image'},{value:'geometry',label:'Geometry'}]} ariaLabel="Texture alignment" /></div>
            <div className="s-field"><div className="s-fl">Model seed</div>
              <NumberField placeholder="Random" value={options.modelSeed} onChange={(v) => updateOption('modelSeed', v)} ariaLabel="Model seed" /></div>
          </div>
          <div className="s-2col">
            <label className="s-tc compact">
              <input type="checkbox" checked={options.enableImageAutofix} onChange={(e) => updateOption('enableImageAutofix', e.target.checked)} />
              <span><strong>Image autofix</strong><small>Tự tối ưu ảnh đầu vào</small></span>
            </label>
            <label className="s-tc compact">
              <input type="checkbox" checked={options.compressGeometry} onChange={(e) => updateOption('compressGeometry', e.target.checked)} />
              <span><strong>Compress</strong><small>Nén geometry output</small></span>
            </label>
          </div>
        </div>
      </details>
    </>
  );
}

// ─── Main ControlPanel ─────────────────────────────────────────────

export default function ControlPanel({
  options, updateOption, selectedModel,
  imagePreview, dragOver, setDragOver, setFile, clearFile, onDrop,
  error, loading, imageFile, onGenerate,
  multiImages, multiPreviews, setMultiFile, onGenerateMulti,
}) {
  const [mode, setMode] = useState('single');

  const isSingleReady = Boolean(imageFile);
  const isMultiReady  = Boolean(multiImages?.front);
  const estimatedCredits = estimateGenerationCredits(options);
  const currentCreditLabel = creditLabel(estimatedCredits);

  return (
    <aside className="s-left-panel">
      <div className="s-lp-head">Tạo model từ ảnh</div>
      <div className="s-lp-body">

        {/* ── mode tabs ── */}
        <div className="s-mode-tabs">
          <button
            type="button"
            className={`s-mode-tab${mode === 'single' ? ' active' : ''}`}
            onClick={() => setMode('single')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
            1 ảnh
          </button>
          <button
            type="button"
            className={`s-mode-tab${mode === 'multi' ? ' active' : ''}`}
            onClick={() => setMode('multi')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="2" y="2" width="9" height="9" rx="1.5"/><rect x="13" y="2" width="9" height="9" rx="1.5"/><rect x="2" y="13" width="9" height="9" rx="1.5"/><rect x="13" y="13" width="9" height="9" rx="1.5"/></svg>
            4 ảnh
          </button>
        </div>

        {/* ── single image dropzone ── */}
        {mode === 'single' && (
          <label
            className={`s-dz${dragOver ? ' over' : ''}${imagePreview ? ' filled' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0])} />
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="preview" />
                <button
                  type="button"
                  className="s-dz-clear"
                  title="Xóa ảnh"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearFile?.(); }}
                >
                  <img className="s-dz-clear-icon" src="/icons/close.svg" alt="" aria-hidden="true" />
                </button>
              </>
            ) : (
              <div className="s-dz-empty">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
                <span>Kéo thả hoặc bấm để chọn</span>
                <small>PNG · JPG · WEBP · ≤200MB</small>
              </div>
            )}
          </label>
        )}

        {/* ── 4-image multiview grid ── */}
        {mode === 'multi' && (
          <MultiviewGrid multiPreviews={multiPreviews || {}} onFile={setMultiFile} />
        )}

        {/* ── shared settings (AI model, quality, advanced) ── */}
        <SharedSettings options={options} updateOption={updateOption} selectedModel={selectedModel} />

        {error && <div className="s-alert">{error}</div>}
      </div>

      <div className="s-lp-foot">
        {mode === 'single' ? (
          <button className="s-gen-btn" onClick={onGenerate} disabled={loading || !isSingleReady}>
            {loading ? `Đang generate… • ${currentCreditLabel}` : `Generate GLB • ${currentCreditLabel}`}
          </button>
        ) : (
          <button className="s-gen-btn s-gen-btn--multi" onClick={onGenerateMulti} disabled={loading || !isMultiReady}>
            {loading ? `Đang generate… • ${currentCreditLabel}` : `Generate GLB • 4 ảnh • ${currentCreditLabel}`}
          </button>
        )}
      </div>
    </aside>
  );
}

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
        <button
          type="button"
          className="number-stepper-button up"
          onClick={() => stepBy(1)}
          aria-label={`Increase ${ariaLabel}`}
          tabIndex={-1}
        />
        <button
          type="button"
          className="number-stepper-button down"
          onClick={() => stepBy(-1)}
          aria-label={`Decrease ${ariaLabel}`}
          tabIndex={-1}
        />
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

export default function ControlPanel({
  options, updateOption, selectedModel,
  imagePreview, dragOver, setDragOver, setFile, onDrop,
  error, loading, imageFile, onGenerate,
}) {
  return (
    <aside className="s-left-panel">
      <div className="s-lp-head">Tạo model từ ảnh</div>
      <div className="s-lp-body">
        {/* dropzone */}
        <label
          className={`s-dz${dragOver ? ' over' : ''}${imagePreview ? ' filled' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0])} />
          {imagePreview ? (
            <img src={imagePreview} alt="preview" />
          ) : (
            <div className="s-dz-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
              <span>Kéo thả hoặc bấm để chọn</span>
              <small>PNG · JPG · WEBP · ≤200MB</small>
            </div>
          )}
        </label>

        {/* model selector */}
        <div className="s-field">
          <div className="s-fl">AI Model</div>
          <SelectField value={options.modelVersion} onChange={(v) => updateOption('modelVersion', v)}
            options={MODELS.map((m) => ({ value: m.value, label: m.label }))} ariaLabel="Model" />
          <p className="s-fhint">{selectedModel.description}</p>
        </div>

        {/* texture/pbr */}
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

        {/* quality */}
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

        {/* advanced */}
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

        {error && <div className="s-alert">{error}</div>}
      </div>

      <div className="s-lp-foot">
        <button className="s-gen-btn" onClick={onGenerate} disabled={loading || !imageFile}>
          {loading ? 'Đang generate…' : 'Generate GLB'}
        </button>
      </div>
    </aside>
  );
}

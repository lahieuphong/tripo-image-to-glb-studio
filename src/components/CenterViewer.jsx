import { useEffect, useRef, useState } from 'react';
import { statusText } from '../utils.js';

export default function CenterViewer({ proxiedModelUrl, normalized, loading, currentStatus, progress }) {
  const [selected, setSelected] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => { setSelected(false); }, [proxiedModelUrl]);

  useEffect(() => {
    if (!selected) return;
    function onOutside(e) {
      if (!containerRef.current?.contains(e.target)) setSelected(false);
    }
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [selected]);

  return (
    <div
      ref={containerRef}
      className={`s-center${proxiedModelUrl && selected ? ' s-center-active' : ''}`}
      onClick={() => { if (proxiedModelUrl) setSelected((s) => !s); }}
    >
      {proxiedModelUrl ? (
        <model-viewer src={proxiedModelUrl}
          camera-controls auto-rotate shadow-intensity="0"
          environment-image="neutral" exposure="1" ar>
          <div slot="poster" className="s-mv-poster">
            <div className="s-mv-spinner" />
            <span className="s-mv-hint">Đang tải model 3D…</span>
          </div>
        </model-viewer>
      ) : (
        <div className="s-center-empty">
          {loading ? (
            <>
              <div className="s-spin-orb" />
              <strong>{statusText(currentStatus)}</strong>
              <span>{Math.round(progress)}%</span>
            </>
          ) : (
            <>
              <div className="s-idle-orb" />
              <strong>Model sẽ xuất hiện ở đây</strong>
              <span>Upload ảnh và bấm Generate GLB để bắt đầu</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

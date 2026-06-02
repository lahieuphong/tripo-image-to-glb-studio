import { useEffect, useRef, useState } from 'react';
import { statusText } from '../utils.js';

export default function CenterViewer({ proxiedModelUrl, normalized, loading, currentStatus, progress }) {
  const [selected, setSelected] = useState(false);
  const containerRef = useRef(null);
  const mvRef = useRef(null);
  const pointerDownPos = useRef(null);

  useEffect(() => { setSelected(false); }, [proxiedModelUrl]);

  useEffect(() => {
    if (!selected) return;
    function onOutside(e) {
      if (!containerRef.current?.contains(e.target)) setSelected(false);
    }
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [selected]);

  function handlePointerDown(e) {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  }

  function handleClick(e) {
    if (!proxiedModelUrl) return;
    // Ignore if this click was the end of a drag (model-viewer fires click even after pointer capture)
    const start = pointerDownPos.current;
    pointerDownPos.current = null;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;

    const mv = mvRef.current;
    if (mv) {
      // Save camera state that model-viewer's pointer handling may have shifted
      const o = mv.getCameraOrbit?.();
      const t = mv.getCameraTarget?.();
      const f = mv.getFieldOfView?.();
      setSelected(s => !s);
      // Synchronously restore before next rAF so model-viewer renders at the same position
      if (o && t && f != null) {
        mv.cameraOrbit = `${o.theta}rad ${o.phi}rad ${o.radius}m`;
        mv.cameraTarget = `${t.x}m ${t.y}m ${t.z}m`;
        mv.fieldOfView = `${f}deg`;
        mv.jumpCameraToGoal?.();
      }
    } else {
      setSelected(s => !s);
    }
  }

  return (
    <div
      ref={containerRef}
      className={`s-center${proxiedModelUrl && selected ? ' s-center-active' : ''}`}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      {proxiedModelUrl ? (
        <div className="s-mv-wrapper">
          <model-viewer ref={mvRef} src={proxiedModelUrl}
            camera-controls auto-rotate shadow-intensity="0"
            environment-image="neutral" exposure="1" ar>
            <div slot="poster" className="s-mv-poster">
              <div className="s-mv-spinner" />
              <span className="s-mv-hint">Đang tải model 3D…</span>
            </div>
          </model-viewer>
        </div>
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

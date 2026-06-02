import { useEffect, useRef, useState } from 'react';
import { statusText } from '../utils.js';

// Projects the model's 3D world-space center to screen coordinates and positions
// the gizmo there, so it tracks the model as the camera orbits, pans, or zooms.
// Falls back to the model-viewer element center when projection data is unavailable.
function syncGizmoToModelCenter(mv, el, container, modelCenter) {
  if (!mv || !el || !container) return;
  const mvRect = mv.getBoundingClientRect();
  const cRect  = container.getBoundingClientRect();
  const w = mvRect.width, h = mvRect.height;

  const fallback = () => {
    el.style.left = `${mvRect.left - cRect.left + w / 2}px`;
    el.style.top  = `${mvRect.top  - cRect.top  + h / 2}px`;
  };

  if (!modelCenter) return fallback();

  const orbit  = mv.getCameraOrbit?.();
  const camTgt = mv.getCameraTarget?.();
  const fovDeg = mv.getFieldOfView?.();
  if (!orbit || !camTgt || fovDeg == null) return fallback();

  const { theta, phi, radius } = orbit;

  // Camera world position from spherical coords around camera target
  const camX = camTgt.x + radius * Math.sin(phi) * Math.sin(theta);
  const camY = camTgt.y + radius * Math.cos(phi);
  const camZ = camTgt.z + radius * Math.sin(phi) * Math.cos(theta);

  // Forward unit vector (camera → target)
  const fdx = camTgt.x - camX, fdy = camTgt.y - camY, fdz = camTgt.z - camZ;
  const fdLen = Math.sqrt(fdx*fdx + fdy*fdy + fdz*fdz) || 1;
  const fx = fdx/fdLen, fy = fdy/fdLen, fz = fdz/fdLen;

  // Right = cross(forward, worldUp=(0,1,0)) = (-fz, 0, fx)
  const rLen = Math.sqrt(fz*fz + fx*fx) || 1;
  const rx = -fz/rLen, ry = 0, rz = fx/rLen;

  // Up = cross(right, forward)
  const upx = ry*fz - rz*fy;
  const upy = rz*fx - rx*fz;
  const upz = rx*fy - ry*fx;

  // Vector from camera to model center
  const dx = modelCenter.x - camX;
  const dy = modelCenter.y - camY;
  const dz = modelCenter.z - camZ;

  // View-space coordinates
  const vx    = dx*rx  + dy*ry  + dz*rz;
  const vy    = dx*upx + dy*upy + dz*upz;
  const depth = dx*fx  + dy*fy  + dz*fz;
  if (depth <= 0) return; // model center behind camera

  // Perspective projection → NDC
  const tanHalf = Math.tan((fovDeg * Math.PI / 180) / 2);
  const aspect  = w / h;
  const ndcX = vx / (depth * tanHalf * aspect);
  const ndcY = vy / (depth * tanHalf);

  // NDC [-1,1] → pixel coordinates within model-viewer viewport
  const sx = (ndcX + 1) / 2 * w;
  const sy = (1 - ndcY) / 2 * h;

  el.style.left = `${mvRect.left - cRect.left + sx}px`;
  el.style.top  = `${mvRect.top  - cRect.top  + sy}px`;
}

export default function CenterViewer({ proxiedModelUrl, normalized, loading, currentStatus, progress, modelVisible = true }) {
  const [selected, setSelected] = useState(false);
  const [axisLine, setAxisLine] = useState(null);
  const mvRef          = useRef(null);
  const pointerDownPos = useRef(null);
  const gizmoCenterRef = useRef(null);
  const containerRef   = useRef(null);
  const lastHitRef     = useRef(null);
  const modelCenterRef = useRef(null);

  useEffect(() => { setSelected(false); }, [proxiedModelUrl]);

  // Capture the model's world-space center right after each model loads.
  // The initial getCameraTarget() equals the model's bounding-box center
  // before any panning has occurred.
  useEffect(() => {
    modelCenterRef.current = null;
    const mv = mvRef.current;
    if (!mv || !proxiedModelUrl) return;
    function onLoad() {
      requestAnimationFrame(() => {
        const t = mv.getCameraTarget?.();
        if (t) modelCenterRef.current = { x: t.x, y: t.y, z: t.z };
      });
    }
    mv.addEventListener('load', onLoad);
    return () => mv.removeEventListener('load', onLoad);
  }, [proxiedModelUrl]);

  // Keep gizmo projected to model center: update on mount, resize, and camera-change
  useEffect(() => {
    if (!selected) return;
    const mv        = mvRef.current;
    const el        = gizmoCenterRef.current;
    const container = containerRef.current;
    if (!mv || !el || !container) return;

    function update() { syncGizmoToModelCenter(mv, el, container, modelCenterRef.current); }

    update();
    // rAF catches any late layout pass after React commits
    const raf = requestAnimationFrame(update);

    mv.addEventListener('camera-change', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      mv.removeEventListener('camera-change', update);
      window.removeEventListener('resize', update);
    };
  }, [selected]);

  // Axis hover: detect proximity via mousemove on container → render full-screen line
  useEffect(() => {
    if (!selected) { setAxisLine(null); lastHitRef.current = null; return; }
    const container = containerRef.current;
    if (!container) return;

    const AXES = [
      { name: 'y', x2: 100, y2: 25,  color: '#4ade80', dx: 0,      dy: -1    },
      { name: 'x', x2: 164, y2: 137, color: '#f87171', dx: 0.864,  dy: 0.504 },
      { name: 'z', x2: 36,  y2: 137, color: '#60a5fa', dx: -0.864, dy: 0.504 },
    ];
    const HIT = 14;

    function onMouseMove(e) {
      const gEl = gizmoCenterRef.current;
      if (!gEl) { if (lastHitRef.current) { lastHitRef.current = null; setAxisLine(null); } return; }
      const gR = gEl.getBoundingClientRect();
      const cR = container.getBoundingClientRect();
      const scale = gR.width / 200;
      const gcx = gR.left + gR.width / 2;
      const gcy = gR.top  + gR.height / 2;
      const sx = 100 + (e.clientX - gcx) / scale;
      const sy = 100 + (e.clientY - gcy) / scale;

      let hit = null;
      for (const ax of AXES) {
        const px = sx - 100, py = sy - 100;
        const ex = ax.x2 - 100, ey = ax.y2 - 100;
        const len2 = ex*ex + ey*ey;
        const t = Math.max(0, Math.min(1, (px*ex + py*ey) / len2));
        const dist = Math.sqrt((sx - 100 - t*ex)**2 + (sy - 100 - t*ey)**2);
        if (dist < HIT) { hit = ax; break; }
      }

      if (!hit) {
        if (lastHitRef.current !== null) { lastHitRef.current = null; setAxisLine(null); }
        return;
      }
      if (lastHitRef.current === hit.name) return;
      lastHitRef.current = hit.name;

      const W = cR.width, H = cR.height;
      const ccx = gcx - cR.left, ccy = gcy - cR.top;
      const { dx, dy, color } = hit;
      function edge(ddx, ddy) {
        const ts = [];
        if (ddx > 0) ts.push((W - ccx) / ddx); else if (ddx < 0) ts.push(-ccx / ddx);
        if (ddy > 0) ts.push((H - ccy) / ddy); else if (ddy < 0) ts.push(-ccy / ddy);
        const t = Math.min(...ts.filter(v => v > 0));
        return { x: ccx + t*ddx, y: ccy + t*ddy };
      }
      setAxisLine({ p1: edge(dx, dy), p2: edge(-dx, -dy), color });
    }

    function onMouseLeave() { lastHitRef.current = null; setAxisLine(null); }

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);
    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [selected]);

  function handlePointerDown(e) {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  }

  function handleClick(e) {
    if (!proxiedModelUrl) return;
    const start = pointerDownPos.current;
    pointerDownPos.current = null;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;

    const mv = mvRef.current;
    if (mv) {
      const o = mv.getCameraOrbit?.();
      const t = mv.getCameraTarget?.();
      const f = mv.getFieldOfView?.();
      setSelected(s => !s);
      if (o && t && f != null) {
        mv.cameraOrbit  = `${o.theta}rad ${o.phi}rad ${o.radius}m`;
        mv.cameraTarget = `${t.x}m ${t.y}m ${t.z}m`;
        mv.fieldOfView  = `${f}deg`;
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
        <>
          <div className="s-mv-wrapper" style={modelVisible ? undefined : { visibility: 'hidden' }}>
            <model-viewer ref={mvRef} src={proxiedModelUrl}
              camera-controls shadow-intensity="0"
              environment-image="neutral" exposure="1" ar
              min-camera-orbit="auto auto 50%">
              <div slot="poster" className="s-mv-poster">
                <div className="s-mv-spinner" />
                <span className="s-mv-hint">Đang tải model 3D…</span>
              </div>
            </model-viewer>
          </div>

          {/* Corner orientation gizmo — always visible */}
          <div className="s-gizmo" aria-hidden="true">
            <svg viewBox="0 0 80 80" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
              <circle cx="40" cy="40" r="36" fill="rgba(0,0,0,0.38)"/>
              <line x1="40" y1="40" x2="40" y2="60"  stroke="#4ade80" strokeWidth="1" strokeOpacity="0.28" strokeDasharray="2 3"/>
              <line x1="40" y1="40" x2="24" y2="31"  stroke="#f87171" strokeWidth="1" strokeOpacity="0.28" strokeDasharray="2 3"/>
              <line x1="40" y1="40" x2="56" y2="31"  stroke="#60a5fa" strokeWidth="1" strokeOpacity="0.28" strokeDasharray="2 3"/>
              <line x1="40" y1="40" x2="40" y2="19"  stroke="#4ade80" strokeWidth="2.5"/>
              <line x1="40" y1="40" x2="60" y2="51"  stroke="#f87171" strokeWidth="2.5"/>
              <line x1="40" y1="40" x2="20" y2="51"  stroke="#60a5fa" strokeWidth="2.5"/>
              <polygon points="40,13 36,21 44,21"   fill="#4ade80"/>
              <polygon points="64,53 55,52 59,46"   fill="#f87171"/>
              <polygon points="16,53 25,52 21,46"   fill="#60a5fa"/>
              <text x="44" y="14" fontSize="9" fill="#4ade80" fontFamily="monospace" fontWeight="800">Y</text>
              <text x="66" y="57" fontSize="9" fill="#f87171" fontFamily="monospace" fontWeight="800">X</text>
              <text x="2"  y="57" fontSize="9" fill="#60a5fa" fontFamily="monospace" fontWeight="800">Z</text>
              <circle cx="40" cy="40" r="2.5" fill="rgba(255,255,255,0.75)"/>
            </svg>
          </div>

          {/* Center transform gizmo — tracks model center, visible only when selected */}
          {selected && (
            <div ref={gizmoCenterRef} className="s-gizmo-center" aria-hidden="true">
              <svg viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">
                {/* Negative axes */}
                <line x1="100" y1="100" x2="100" y2="125" stroke="#4ade80" strokeWidth="1.2" strokeOpacity="0.32" strokeDasharray="3 4"/>
                <line x1="100" y1="100" x2="78"  y2="88"  stroke="#f87171" strokeWidth="1.2" strokeOpacity="0.32" strokeDasharray="3 4"/>
                <line x1="100" y1="100" x2="122" y2="88"  stroke="#60a5fa" strokeWidth="1.2" strokeOpacity="0.32" strokeDasharray="3 4"/>
                {/* Positive axes */}
                <line x1="100" y1="100" x2="100" y2="25"  stroke="#4ade80" strokeWidth="10"/>
                <line x1="100" y1="100" x2="164" y2="137" stroke="#f87171" strokeWidth="10"/>
                <line x1="100" y1="100" x2="36"  y2="137" stroke="#60a5fa" strokeWidth="10"/>
                {/* Arrowheads */}
                <polygon points="100,5 86,29 114,29"      fill="#4ade80"/>
                <polygon points="184,150 158,146 170,126" fill="#f87171"/>
                <polygon points="16,150  42,146  30,126"  fill="#60a5fa"/>
                {/* Center dot */}
                <circle cx="100" cy="100" r="4" fill="rgba(255,255,255,0.85)"/>
              </svg>
            </div>
          )}

          {/* Full-screen axis constraint line on hover */}
          {selected && axisLine && (
            <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:9 }}>
              <defs>
                <marker id="s-ax-fwd" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                  <polygon points="0,0 7,3.5 0,7" fill={axisLine.color} fillOpacity="0.8"/>
                </marker>
                <marker id="s-ax-bwd" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse">
                  <polygon points="0,0 7,3.5 0,7" fill={axisLine.color} fillOpacity="0.8"/>
                </marker>
              </defs>
              <line
                x1={axisLine.p1.x} y1={axisLine.p1.y}
                x2={axisLine.p2.x} y2={axisLine.p2.y}
                stroke={axisLine.color} strokeWidth="1.5" strokeOpacity="0.65"
                markerEnd="url(#s-ax-fwd)"
                markerStart="url(#s-ax-bwd)"
              />
            </svg>
          )}
        </>
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

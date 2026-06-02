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

export default function CenterViewer({ proxiedModelUrl, normalized, loading, currentStatus, progress, modelVisible = true, onCameraChange }) {
  const [selected, setSelected] = useState(false);
  const [axisLine, setAxisLine] = useState(null);
  const mvRef             = useRef(null);
  const pointerDownPos    = useRef(null);
  const gizmoCenterRef    = useRef(null);
  const containerRef      = useRef(null);
  const lastHitRef        = useRef(null);
  const modelCenterRef    = useRef(null);
  const initialCamRef     = useRef(null);
  const projRef           = useRef({ y:[0,-1], x:[0.866,0.501], z:[-0.866,0.501] });
  const [proj,        setProj       ] = useState(projRef.current);
  const [hoveredAxis, setHoveredAxis] = useState(null);

  useEffect(() => { setSelected(false); }, [proxiedModelUrl]);

  // Capture initial camera state + model center on load; seed transform at [0,0,0]/[1,1,1]
  useEffect(() => {
    modelCenterRef.current = null;
    initialCamRef.current  = null;
    onCameraChange?.(null);
    const mv = mvRef.current;
    if (!mv || !proxiedModelUrl) return;
    function onLoad() {
      requestAnimationFrame(() => {
        const t = mv.getCameraTarget?.();
        const o = mv.getCameraOrbit?.();
        if (t) modelCenterRef.current = { x: t.x, y: t.y, z: t.z };
        if (t && o) {
          initialCamRef.current = { t, o };
          onCameraChange?.({ pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1] });
        }
      });
    }
    mv.addEventListener('load', onLoad);
    return () => mv.removeEventListener('load', onLoad);
  }, [proxiedModelUrl]);

  // Emit live transform deltas on every camera-change
  useEffect(() => {
    const mv = mvRef.current;
    if (!mv || !proxiedModelUrl) return;
    const r2 = v => Math.round(v * 100) / 100;
    function onCamChange() {
      const init = initialCamRef.current;
      if (!init) return;
      const t = mv.getCameraTarget?.();
      const o = mv.getCameraOrbit?.();
      if (!t || !o) return;
      onCameraChange?.({
        pos: [r2(t.x - init.t.x), r2(t.y - init.t.y), r2(t.z - init.t.z)],
        rot: [
          r2((o.phi   - init.o.phi)   * 180 / Math.PI),
          r2((o.theta - init.o.theta) * 180 / Math.PI),
          0,
        ],
        scl: [1, 1, 1],
      });
    }
    mv.addEventListener('camera-change', onCamChange);
    return () => mv.removeEventListener('camera-change', onCamChange);
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

  // Axis projection: recompute 2-D screen directions of world axes when camera orbits
  useEffect(() => {
    if (!selected) return;
    const mv = mvRef.current;
    if (!mv) return;
    function updateProj() {
      const orbit = mv.getCameraOrbit?.();
      if (!orbit) return;
      const { theta, phi } = orbit;
      const ct = Math.cos(theta), st = Math.sin(theta), cp = Math.cos(phi);
      function sn(a, b) { const l = Math.hypot(a, b); return l > 0.01 ? [a/l, b/l] : [a, b]; }
      const p = { y: [0, -1], x: sn(ct, st * cp), z: sn(-st, ct * cp) };
      projRef.current = p;
      setProj({ ...p });
    }
    updateProj();
    mv.addEventListener('camera-change', updateProj);
    return () => mv.removeEventListener('camera-change', updateProj);
  }, [selected]);

  // Axis hover: detect proximity via mousemove on container → render full-screen line
  useEffect(() => {
    if (!selected) { setAxisLine(null); lastHitRef.current = null; return; }
    const container = containerRef.current;
    if (!container) return;

    const HIT = 28;
    const CENTER_RADIUS = 30;
    const ARM = 75;

    function getAxes() {
      const { y, x, z } = projRef.current;
      return [
        { name:'y', x2:100+y[0]*ARM, y2:100+y[1]*ARM, dx:y[0], dy:y[1], color:'#4ade80' },
        { name:'x', x2:100+x[0]*ARM, y2:100+x[1]*ARM, dx:x[0], dy:x[1], color:'#f87171' },
        { name:'z', x2:100+z[0]*ARM, y2:100+z[1]*ARM, dx:z[0], dy:z[1], color:'#60a5fa' },
        { name:'y', x2:100-y[0]*ARM, y2:100-y[1]*ARM, dx:y[0], dy:y[1], color:'#4ade80' },
        { name:'x', x2:100-x[0]*ARM, y2:100-x[1]*ARM, dx:x[0], dy:x[1], color:'#f87171' },
        { name:'z', x2:100-z[0]*ARM, y2:100-z[1]*ARM, dx:z[0], dy:z[1], color:'#60a5fa' },
      ];
    }

    function makeEdge(ccx, ccy, W, H) {
      return function edge(ddx, ddy) {
        const ts = [];
        if (ddx > 0) ts.push((W - ccx) / ddx); else if (ddx < 0) ts.push(-ccx / ddx);
        if (ddy > 0) ts.push((H - ccy) / ddy); else if (ddy < 0) ts.push(-ccy / ddy);
        const t = Math.min(...ts.filter(v => v > 0));
        return { x: ccx + t*ddx, y: ccy + t*ddy };
      };
    }

    function getGizmoCenterCoords(gEl) {
      const gR = gEl.getBoundingClientRect();
      const cR = container.getBoundingClientRect();
      return {
        W: cR.width, H: cR.height,
        ccx: gR.left + gR.width / 2 - cR.left,
        ccy: gR.top  + gR.height / 2 - cR.top,
      };
    }

    function calcLine(hitName, gEl) {
      const ax = getAxes().find(a => a.name === hitName);
      if (!ax || !gEl) return;
      const { W, H, ccx, ccy } = getGizmoCenterCoords(gEl);
      const edge = makeEdge(ccx, ccy, W, H);
      const { dx, dy, color } = ax;
      setAxisLine({ p1: edge(dx, dy), p2: edge(-dx, -dy), color });
    }

    function calcAllLines(gEl) {
      if (!gEl) return;
      const { W, H, ccx, ccy } = getGizmoCenterCoords(gEl);
      const edge = makeEdge(ccx, ccy, W, H);
      const { y, x, z } = projRef.current;
      setAxisLine([
        { p1: edge( y[0],  y[1]), p2: edge(-y[0], -y[1]), color: '#4ade80' },
        { p1: edge( x[0],  x[1]), p2: edge(-x[0], -x[1]), color: '#f87171' },
        { p1: edge( z[0],  z[1]), p2: edge(-z[0], -z[1]), color: '#60a5fa' },
      ]);
    }

    function onMouseMove(e) {
      const gEl = gizmoCenterRef.current;
      if (!gEl) { if (lastHitRef.current) { lastHitRef.current = null; setAxisLine(null); } return; }
      const gR = gEl.getBoundingClientRect();
      const scale = gR.width / 200;
      const gcx = gR.left + gR.width / 2;
      const gcy = gR.top  + gR.height / 2;
      const sx = 100 + (e.clientX - gcx) / scale;
      const sy = 100 + (e.clientY - gcy) / scale;

      // Center zone → show all 3 axis lines simultaneously
      if (Math.hypot(sx - 100, sy - 100) < CENTER_RADIUS) {
        if (lastHitRef.current === 'center') return;
        lastHitRef.current = 'center';
        setHoveredAxis('center');
        calcAllLines(gEl);
        return;
      }

      const AXES = getAxes();
      let hit = null;
      for (const ax of AXES) {
        const px = sx - 100, py = sy - 100;
        const ex = ax.x2 - 100, ey = ax.y2 - 100;
        const len2 = ex*ex + ey*ey;
        if (len2 < 0.001) continue;
        const t = Math.max(0, Math.min(1, (px*ex + py*ey) / len2));
        const dist = Math.hypot(sx - 100 - t*ex, sy - 100 - t*ey);
        if (dist < HIT) { hit = ax; break; }
      }

      if (!hit) {
        if (lastHitRef.current !== null) { lastHitRef.current = null; setHoveredAxis(null); setAxisLine(null); }
        return;
      }
      if (lastHitRef.current === hit.name) return;
      lastHitRef.current = hit.name;
      setHoveredAxis(hit.name);
      calcLine(hit.name, gEl);
    }

    function onMouseLeave() { lastHitRef.current = null; setHoveredAxis(null); setAxisLine(null); }

    function recalcAxisLine() {
      if (!lastHitRef.current) return;
      if (lastHitRef.current === 'center') {
        calcAllLines(gizmoCenterRef.current);
      } else {
        calcLine(lastHitRef.current, gizmoCenterRef.current);
      }
    }

    const mv = mvRef.current;
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);
    if (mv) mv.addEventListener('camera-change', recalcAxisLine);
    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      if (mv) mv.removeEventListener('camera-change', recalcAxisLine);
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
          <div className="s-mv-wrapper">
            <model-viewer ref={mvRef} src={proxiedModelUrl}
              camera-controls shadow-intensity="0"
              environment-image="neutral" exposure="1" ar
              min-camera-orbit="auto auto 50%"
              max-camera-orbit="auto auto 500%">
              <div slot="poster" className="s-mv-poster">
                <div className="s-mv-spinner" />
                <span className="s-mv-hint">Đang tải model 3D…</span>
              </div>
            </model-viewer>
          </div>

          {/* Overlay hides model visually while keeping camera-controls active */}
          {!modelVisible && (
            <div style={{ position:'absolute', inset:0, background:'#080910', pointerEvents:'none', zIndex:5 }} />
          )}

          {/* Corner orientation gizmo — always visible */}
          <div className="s-gizmo" aria-hidden="true">
            <svg viewBox="0 0 80 80" width="96" height="96" xmlns="http://www.w3.org/2000/svg">
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

          {/* Center transform gizmo — tracks model center, rotates with camera */}
          {selected && (() => {
            const ARM=75, TIPD=95, BASED=71, BASEW=9;
            const r = v => Math.round(v * 100) / 100;
            const axes = [
              { key: 'y', d: proj.y, c: '#4ade80' },
              { key: 'x', d: proj.x, c: '#f87171' },
              { key: 'z', d: proj.z, c: '#60a5fa' },
            ];
            return (
              <div ref={gizmoCenterRef} className="s-gizmo-center" aria-hidden="true">
                <svg viewBox="0 0 200 200" width="230" height="230" xmlns="http://www.w3.org/2000/svg">
                  {axes.map(({ key, d: [dx, dy], c }) => {
                    const dc = (hoveredAxis === 'center' || hoveredAxis === key) ? '#facc15' : c;
                    const px = -dy, py = dx;
                    const ex   = r(100+dx*ARM),        ey   = r(100+dy*ARM);
                    const tx   = r(100+dx*TIPD),       ty   = r(100+dy*TIPD);
                    const b1x  = r(100+dx*BASED+px*BASEW), b1y = r(100+dy*BASED+py*BASEW);
                    const b2x  = r(100+dx*BASED-px*BASEW), b2y = r(100+dy*BASED-py*BASEW);
                    const nex  = r(100-dx*ARM),        ney  = r(100-dy*ARM);
                    const ntx  = r(100-dx*TIPD),       nty  = r(100-dy*TIPD);
                    const nb1x = r(100-dx*BASED+px*BASEW), nb1y = r(100-dy*BASED+py*BASEW);
                    const nb2x = r(100-dx*BASED-px*BASEW), nb2y = r(100-dy*BASED-py*BASEW);
                    return (
                      <g key={c}>
                        <line x1="100" y1="100" x2={nex} y2={ney} stroke={dc} strokeWidth="1.2" strokeOpacity="0.32" strokeDasharray="3 4"/>
                        <polygon points={`${ntx},${nty} ${nb1x},${nb1y} ${nb2x},${nb2y}`} fill={dc} fillOpacity="0.32"/>
                        <line x1="100" y1="100" x2={ex} y2={ey} stroke={dc} strokeWidth="6"/>
                        <polygon points={`${tx},${ty} ${b1x},${b1y} ${b2x},${b2y}`} fill={dc}/>
                      </g>
                    );
                  })}
                  <circle cx="100" cy="100" r="4" fill="rgba(255,255,255,0.85)"/>
                </svg>
              </div>
            );
          })()}

          {/* Full-screen axis constraint line(s) on hover */}
          {selected && axisLine && (
            <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:9 }}>
              {(Array.isArray(axisLine) ? axisLine : [axisLine]).map((ln, i) => (
                <line key={i}
                  x1={ln.p1.x} y1={ln.p1.y}
                  x2={ln.p2.x} y2={ln.p2.y}
                  stroke="#facc15" strokeWidth="1.5" strokeOpacity="0.65"
                />
              ))}
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

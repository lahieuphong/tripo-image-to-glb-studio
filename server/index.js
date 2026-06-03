import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 8787);
const TRIPO_API_BASE = 'https://api.tripo3d.ai/v2/openapi';
const MAX_UPLOAD_SIZE = 200 * 1024 * 1024;
const JOBS_DIR = path.join(__dirname, '..', 'storage', 'jobs');
fs.mkdirSync(JOBS_DIR, { recursive: true });

const imageFileFilter = (_req, file, cb) => {
  const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
  if (!ok) return cb(new Error('Chỉ hỗ trợ PNG, JPEG/JPG hoặc WEBP.'));
  cb(null, true);
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_SIZE }, fileFilter: imageFileFilter });

const uploadMultiview = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: imageFileFilter
});

app.use(express.json({ limit: '1mb' }));

function getApiKey() {
  return process.env.TRIPO_API_KEY?.trim();
}

function requireApiKey() {
  const key = getApiKey();
  if (!key || key === 'tsk_your_tripo_api_key_here') {
    const error = new Error('Thiếu TRIPO_API_KEY. Hãy tạo file .env từ .env.example và điền API key của Tripo.');
    error.statusCode = 500;
    throw error;
  }
  return key;
}

function tripoAuthHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${requireApiKey()}`,
    ...extra
  };
}

function asBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function asOptionalInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function imageTypeFromMime(mime) {
  if (mime === 'image/jpeg') return 'jpeg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

function getTripoData(json) {
  if (!json || typeof json !== 'object') return undefined;
  return json.data ?? json;
}

async function readJsonResponse(response) {
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    const error = new Error(`Tripo trả về response không phải JSON: ${text.slice(0, 300)}`);
    error.statusCode = response.status;
    throw error;
  }

  if (!response.ok) {
    const message = json?.message || json?.error || json?.msg || response.statusText;
    const error = new Error(`Tripo API lỗi HTTP ${response.status}: ${message}`);
    error.statusCode = response.status;
    error.details = json;
    throw error;
  }

  if (typeof json.code === 'number' && json.code !== 0) {
    const message = json?.message || json?.msg || json?.error || `code=${json.code}`;
    const error = new Error(`Tripo API báo lỗi: ${message}`);
    error.statusCode = 502;
    error.details = json;
    throw error;
  }

  return json;
}

async function uploadImageToTripo(file) {
  const form = new FormData();
  const blob = new Blob([file.buffer], { type: file.mimetype });
  form.append('file', blob, file.originalname || `image.${imageTypeFromMime(file.mimetype)}`);

  const response = await fetch(`${TRIPO_API_BASE}/upload`, {
    method: 'POST',
    headers: tripoAuthHeaders(),
    body: form
  });

  const json = await readJsonResponse(response);
  const data = getTripoData(json);
  const token = data?.image_token || data?.file_token || data?.token;

  if (!token) {
    const error = new Error('Không tìm thấy image_token/file_token trong response upload của Tripo.');
    error.statusCode = 502;
    error.details = json;
    throw error;
  }

  return { token, raw: json };
}

function buildImageToModelPayload(file, token, body) {
  const modelVersion = String(body.modelVersion || 'v3.1-20260211');
  const texture = asBool(body.texture, true);
  const pbr = asBool(body.pbr, true);
  const faceLimit = asOptionalInt(body.faceLimit);
  const modelSeed = asOptionalInt(body.modelSeed);
  const textureSeed = asOptionalInt(body.textureSeed);

  const payload = {
    type: 'image_to_model',
    model_version: modelVersion,
    file: {
      type: imageTypeFromMime(file.mimetype),
      file_token: token
    },
    texture,
    pbr,
    enable_image_autofix: asBool(body.enableImageAutofix, false)
  };

  if (faceLimit) payload.face_limit = faceLimit;
  if (modelSeed) payload.model_seed = modelSeed;
  if (textureSeed) payload.texture_seed = textureSeed;

  const textureAlignment = body.textureAlignment || 'original_image';
  if (['original_image', 'geometry'].includes(textureAlignment)) {
    payload.texture_alignment = textureAlignment;
  }

  if (texture || pbr) {
    const textureQuality = body.textureQuality || 'standard';
    if (['standard', 'detailed'].includes(textureQuality)) {
      payload.texture_quality = textureQuality;
    }

    const orientation = body.orientation || 'default';
    if (['default', 'align_image'].includes(orientation)) {
      payload.orientation = orientation;
    }

    payload.auto_size = asBool(body.autoSize, false);
  }

  // geometry_quality chỉ áp dụng cho dòng H3 hiện tại.
  if (['v3.1-20260211', 'v3.0-20250812'].includes(modelVersion)) {
    const geometryQuality = body.geometryQuality || 'standard';
    if (['standard', 'detailed'].includes(geometryQuality)) {
      payload.geometry_quality = geometryQuality;
    }
  }

  if (asBool(body.compressGeometry, false)) {
    payload.compress = 'geometry';
  }

  return payload;
}

function buildMultiviewPayload(tokens, body) {
  const modelVersion = String(body.modelVersion || 'v3.1-20260211');
  const texture = asBool(body.texture, true);
  const pbr = asBool(body.pbr, true);
  const faceLimit = asOptionalInt(body.faceLimit);
  const modelSeed = asOptionalInt(body.modelSeed);
  const textureSeed = asOptionalInt(body.textureSeed);

  const filesArray = ['front', 'left', 'right', 'back']
    .filter(view => tokens[view])
    .map(view => ({ type: view, file_token: tokens[view] }));

  const payload = {
    type: 'multiview_to_model',
    model_version: modelVersion,
    files: filesArray,
    texture,
    pbr,
    enable_image_autofix: asBool(body.enableImageAutofix, false)
  };

  if (faceLimit) payload.face_limit = faceLimit;
  if (modelSeed) payload.model_seed = modelSeed;
  if (textureSeed) payload.texture_seed = textureSeed;

  if (texture || pbr) {
    const textureQuality = body.textureQuality || 'standard';
    if (['standard', 'detailed'].includes(textureQuality)) payload.texture_quality = textureQuality;
    payload.auto_size = asBool(body.autoSize, false);
  }

  if (['v3.1-20260211', 'v3.0-20250812'].includes(modelVersion)) {
    const geometryQuality = body.geometryQuality || 'standard';
    if (['standard', 'detailed'].includes(geometryQuality)) payload.geometry_quality = geometryQuality;
  }

  if (asBool(body.compressGeometry, false)) payload.compress = 'geometry';

  return payload;
}

async function createTripoTask(payload) {
  const response = await fetch(`${TRIPO_API_BASE}/task`, {
    method: 'POST',
    headers: tripoAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });

  const json = await readJsonResponse(response);
  const data = getTripoData(json);
  const taskId = data?.task_id || data?.taskId || json?.task_id;

  if (!taskId) {
    const error = new Error('Không tìm thấy task_id trong response tạo task của Tripo.');
    error.statusCode = 502;
    error.details = json;
    throw error;
  }

  return { taskId, raw: json };
}

async function getTask(taskId) {
  const safeTaskId = encodeURIComponent(taskId);
  const response = await fetch(`${TRIPO_API_BASE}/task/${safeTaskId}`, {
    method: 'GET',
    headers: tripoAuthHeaders({ 'Content-Type': 'application/json' })
  });
  const json = await readJsonResponse(response);
  return getTripoData(json);
}

function normalizeOutput(task) {
  const output = task?.output || {};
  const modelUrl = output.pbr_model || output.model || output.base_model || null;
  return {
    modelUrl,
    pbrModelUrl: output.pbr_model || null,
    baseModelUrl: output.base_model || null,
    renderedImageUrl: output.rendered_image || null,
    generatedImageUrl: output.generated_image || null,
    renderCredits: task?.render_credits ?? task?.credits ?? null
  };
}

function sanitizeFilename(name) {
  return String(name || 'tripo-model.glb').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

function jobDir(taskId) {
  return path.join(JOBS_DIR, sanitizeFilename(taskId));
}

// Migrate flat-file jobs (old format) to per-job folder structure
function migrateOldJobFiles() {
  try {
    for (const item of fs.readdirSync(JOBS_DIR)) {
      if (!item.endsWith('.json')) continue;
      const taskId = item.slice(0, -5);
      const oldJson = path.join(JOBS_DIR, item);
      const newDir = jobDir(taskId);
      const newJson = path.join(newDir, 'job.json');
      if (fs.existsSync(newJson)) { try { fs.unlinkSync(oldJson); } catch {} continue; }
      try {
        fs.mkdirSync(newDir, { recursive: true });
        fs.renameSync(oldJson, newJson);
        for (const ext of ['jpg', 'png', 'webp']) {
          const oldIn = path.join(JOBS_DIR, `${taskId}_input.${ext}`);
          if (fs.existsSync(oldIn)) fs.renameSync(oldIn, path.join(newDir, `input.${ext}`));
          const oldRnd = path.join(JOBS_DIR, `${taskId}_render.${ext}`);
          if (fs.existsSync(oldRnd)) fs.renameSync(oldRnd, path.join(newDir, `render.${ext}`));
        }
        const oldGlb = path.join(JOBS_DIR, `${taskId}_model.glb`);
        if (fs.existsSync(oldGlb)) fs.renameSync(oldGlb, path.join(newDir, 'model.glb'));
      } catch { /* non-critical */ }
    }
  } catch { /* non-critical */ }
}
migrateOldJobFiles();

// Add mode:'single' to job.json files saved before mode field was introduced
function patchJobModeField() {
  try {
    for (const item of fs.readdirSync(JOBS_DIR, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      const jsonPath = path.join(JOBS_DIR, item.name, 'job.json');
      if (!fs.existsSync(jsonPath)) continue;
      try {
        const job = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (job.mode) continue;
        job.mode = 'single';
        fs.writeFileSync(jsonPath, JSON.stringify(job, null, 2));
      } catch { /* non-critical */ }
    }
  } catch { /* non-critical */ }
}
patchJobModeField();

// Pad and flatten render image onto white background at the same proportions as the
// input image so the subject appears at the same apparent scale.
async function padRenderForSave(renderBuf, jd) {
  try {
    const renderMeta = await sharp(renderBuf).metadata();
    const rW = renderMeta.width || 512;
    const rH = renderMeta.height || 512;

    // Use input image dimensions as canvas reference (fall back to render dims)
    let targetW = rW, targetH = rH;
    for (const name of ['input.jpg','input.png','input.webp','input_front.jpg','input_front.png','input_front.webp']) {
      const fp = path.join(jd, name);
      if (!fs.existsSync(fp)) continue;
      try {
        const m = await sharp(fs.readFileSync(fp)).metadata();
        if (m.width && m.height) { targetW = m.width; targetH = m.height; }
      } catch {}
      break;
    }

    // Scale render to 72% of canvas so the object has ~14% breathing room on each side
    const scale  = Math.min(targetW / rW, targetH / rH) * 0.72;
    const scaledW = Math.max(1, Math.round(rW * scale));
    const scaledH = Math.max(1, Math.round(rH * scale));
    const padL = Math.round((targetW - scaledW) / 2);
    const padR = targetW  - scaledW - padL;
    const padT = Math.round((targetH - scaledH) / 2);
    const padB = targetH  - scaledH - padT;

    return await sharp(renderBuf)
      .resize(scaledW, scaledH, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .extend({ top: padT, bottom: padB, left: padL, right: padR, background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    // Fallback: just flatten transparency and convert to JPEG
    try {
      return await sharp(renderBuf).flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg({ quality: 90 }).toBuffer();
    } catch {
      return renderBuf;
    }
  }
}

// Re-process existing render files that were saved in wrong format (e.g. WEBP saved as .jpg)
async function patchExistingRenders() {
  try {
    for (const item of fs.readdirSync(JOBS_DIR, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      const jd = path.join(JOBS_DIR, item.name);
      const renderJpg = path.join(jd, 'render.jpg');
      if (!fs.existsSync(renderJpg)) continue;
      try {
        const buf = fs.readFileSync(renderJpg);
        const meta = await sharp(buf).metadata();
        if (meta.format === 'jpeg') continue; // already correct JPEG, skip
        const padded = await padRenderForSave(buf, jd);
        fs.writeFileSync(renderJpg, padded);
      } catch { /* non-critical */ }
    }
  } catch { /* non-critical */ }
}
patchExistingRenders().catch(() => {});

async function downloadJobAssets(modelUrl, renderedImageUrl, taskId) {
  const jd = jobDir(taskId);
  fs.mkdirSync(jd, { recursive: true });
  if (modelUrl) {
    try {
      const r = await fetch(modelUrl);
      if (r.ok) fs.writeFileSync(path.join(jd, 'model.glb'), Buffer.from(await r.arrayBuffer()));
    } catch { /* non-critical */ }
  }
  if (renderedImageUrl) {
    try {
      const r = await fetch(renderedImageUrl);
      if (r.ok) {
        const rawBuf = Buffer.from(await r.arrayBuffer());
        const paddedBuf = await padRenderForSave(rawBuf, jd);
        // Always save as .jpg — padRenderForSave outputs JPEG regardless of source format
        fs.writeFileSync(path.join(jd, 'render.jpg'), paddedBuf);
      }
    } catch { /* non-critical */ }
  }
}

function isAllowedAssetUrl(rawUrl) {
  if (process.env.ALLOW_ANY_ASSET_PROXY === 'true') return true;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return (
      host.endsWith('.tripo3d.ai') ||
      host === 'tripo3d.ai' ||
      host.endsWith('.tripo3d.com') ||
      host === 'tripo3d.com' ||
      host.endsWith('.amazonaws.com') ||
      host === 's3.us-west-2.amazonaws.com' ||
      host.endsWith('.cloudfront.net')
    );
  } catch {
    return false;
  }
}

app.get('/api/health', (_req, res) => {
  const configured = Boolean(getApiKey() && getApiKey() !== 'tsk_your_tripo_api_key_here');
  res.json({
    ok: true,
    apiKeyConfigured: configured,
    uploadLimitMb: MAX_UPLOAD_SIZE / 1024 / 1024,
    defaultModelVersion: 'v3.1-20260211'
  });
});

app.get('/api/balance', async (_req, res, next) => {
  try {
    requireApiKey();
    const response = await fetch(`${TRIPO_API_BASE}/user/balance`, {
      headers: tripoAuthHeaders({ 'Content-Type': 'application/json' })
    });
    const json = await readJsonResponse(response);
    const data = getTripoData(json);
    res.json({ balance: data?.balance ?? null, frozen: data?.frozen ?? null });
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Bạn cần upload một ảnh PNG/JPEG/WEBP.' });
    }

    const uploaded = await uploadImageToTripo(req.file);
    const payload = buildImageToModelPayload(req.file, uploaded.token, req.body || {});
    const created = await createTripoTask(payload);

    // Save input image inside per-job folder (non-critical)
    try {
      const ext = req.file.mimetype === 'image/webp' ? 'webp'
        : req.file.mimetype === 'image/png' ? 'png' : 'jpg';
      const jd = jobDir(created.taskId);
      fs.mkdirSync(jd, { recursive: true });
      fs.writeFileSync(path.join(jd, `input.${ext}`), req.file.buffer);
    } catch { /* non-critical */ }

    res.json({
      taskId: created.taskId,
      uploadToken: uploaded.token,
      submittedPayload: {
        ...payload,
        file: { ...payload.file, file_token: '[hidden]' }
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate-multiview', uploadMultiview.fields([
  { name: 'front', maxCount: 1 },
  { name: 'left',  maxCount: 1 },
  { name: 'right', maxCount: 1 },
  { name: 'back',  maxCount: 1 },
]), async (req, res, next) => {
  try {
    const files = req.files || {};
    if (!files.front?.[0]) {
      return res.status(400).json({ error: 'Cần ít nhất ảnh mặt trước (front).' });
    }

    const views = ['front', 'left', 'right', 'back'];
    const uploadResults = await Promise.all(
      views.map(view => files[view]?.[0] ? uploadImageToTripo(files[view][0]) : null)
    );
    const tokens = {};
    views.forEach((view, i) => { if (uploadResults[i]) tokens[view] = uploadResults[i].token; });

    const payload = buildMultiviewPayload(tokens, req.body || {});
    const created = await createTripoTask(payload);

    try {
      const jd = jobDir(created.taskId);
      fs.mkdirSync(jd, { recursive: true });
      for (const view of views) {
        const file = files[view]?.[0];
        if (!file) continue;
        const ext = file.mimetype === 'image/webp' ? 'webp' : file.mimetype === 'image/png' ? 'png' : 'jpg';
        fs.writeFileSync(path.join(jd, `input_${view}.${ext}`), file.buffer);
      }
    } catch { /* non-critical */ }

    res.json({
      taskId: created.taskId,
      tokens,
      submittedPayload: {
        ...payload,
        files: payload.files.map(f => ({ ...f, file_token: '[hidden]' }))
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/task/:taskId', async (req, res, next) => {
  try {
    const task = await getTask(req.params.taskId);
    res.json({
      task,
      normalized: normalizeOutput(task)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/asset', async (req, res, next) => {
  try {
    const rawUrl = String(req.query.url || '');
    if (!rawUrl || !isAllowedAssetUrl(rawUrl)) {
      return res.status(400).json({
        error: 'URL asset không hợp lệ hoặc bị chặn. Có thể bật ALLOW_ANY_ASSET_PROXY=true trong .env khi chạy local.'
      });
    }

    const upstream = await fetch(rawUrl);
    if (!upstream.ok || !upstream.body) {
      return res.status(upstream.status || 502).json({ error: `Không tải được asset: HTTP ${upstream.status}` });
    }

    const contentType = upstream.headers.get('content-type') || 'model/gltf-binary';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.query.download === '1') {
      const filename = sanitizeFilename(req.query.filename || 'tripo-model.glb');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    next(error);
  }
});

app.post('/api/jobs', (req, res, next) => {
  try {
    const { taskId, mode, modelVersion, normalized, renderCredits, inputImageName, inputImages, options, logs } = req.body || {};
    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ error: 'Thiếu taskId hợp lệ.' });
    }
    const job = {
      taskId,
      mode: mode || 'single',
      modelVersion: modelVersion || null,
      normalized: normalized || {},
      renderCredits: renderCredits ?? null,
      inputImageName: inputImageName || null,
      inputImages: inputImages || null,
      options: options || null,
      logs: Array.isArray(logs) ? logs.slice(0, 50) : [],
      savedAt: new Date().toISOString()
    };
    const jd = jobDir(taskId);
    fs.mkdirSync(jd, { recursive: true });
    fs.writeFileSync(path.join(jd, 'job.json'), JSON.stringify(job, null, 2));
    res.json({ ok: true, taskId });
    downloadJobAssets(normalized?.modelUrl, normalized?.renderedImageUrl, taskId).catch(() => {});
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs', (_req, res, next) => {
  try {
    const jobs = fs.readdirSync(JOBS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        try {
          const jd = path.join(JOBS_DIR, d.name);
          const jsonPath = path.join(jd, 'job.json');
          if (!fs.existsSync(jsonPath)) return null;
          const job = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          job.localModelAvailable = fs.existsSync(path.join(jd, 'model.glb'));
          job.localRenderAvailable = ['jpg', 'png', 'webp'].some(
            (ext) => fs.existsSync(path.join(jd, `render.${ext}`))
          );
          return job;
        }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    res.json({ jobs });
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:taskId', (req, res, next) => {
  try {
    const jd = jobDir(req.params.taskId);
    const filepath = path.join(jd, 'job.json');
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Job không tồn tại.' });
    }
    const job = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    job.localModelAvailable = fs.existsSync(path.join(jd, 'model.glb'));
    job.localRenderAvailable = ['jpg', 'png', 'webp'].some(
      (ext) => fs.existsSync(path.join(jd, `render.${ext}`))
    );
    res.json(job);
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:taskId/input', (req, res, next) => {
  try {
    const jd = jobDir(req.params.taskId);
    // Single-image jobs first, then fall back to multiview front view
    const candidates = [
      ['input.jpg', 'image/jpeg'], ['input.png', 'image/png'], ['input.webp', 'image/webp'],
      ['input_front.jpg', 'image/jpeg'], ['input_front.png', 'image/png'], ['input_front.webp', 'image/webp'],
    ];
    for (const [name, mime] of candidates) {
      const fp = path.join(jd, name);
      if (fs.existsSync(fp)) {
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(fs.readFileSync(fp));
      }
    }
    res.status(404).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:taskId/input/:view', (req, res, next) => {
  try {
    const { taskId, view } = req.params;
    if (!['front', 'left', 'right', 'back'].includes(view)) {
      return res.status(400).json({ error: 'View không hợp lệ. Dùng: front, left, right, back.' });
    }
    const jd = jobDir(taskId);
    for (const [ext, mime] of [['jpg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]) {
      const fp = path.join(jd, `input_${view}.${ext}`);
      if (fs.existsSync(fp)) {
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(fs.readFileSync(fp));
      }
    }
    res.status(404).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:taskId/model', (req, res, next) => {
  try {
    const fp = path.join(jobDir(req.params.taskId), 'model.glb');
    if (!fs.existsSync(fp)) return res.status(404).end();
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.query.download === '1') {
      const filename = sanitizeFilename(req.query.filename || 'tripo-output.glb');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    return res.send(fs.readFileSync(fp));
  } catch (error) {
    next(error);
  }
});

app.post('/api/jobs/:taskId/fetch-assets', async (req, res, next) => {
  try {
    const jd = jobDir(req.params.taskId);
    const filepath = path.join(jd, 'job.json');
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Job không tồn tại.' });
    }
    const job = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    await downloadJobAssets(job.normalized?.modelUrl, job.normalized?.renderedImageUrl, job.taskId);
    const localModelAvailable = fs.existsSync(path.join(jd, 'model.glb'));
    const localRenderAvailable = ['jpg', 'png', 'webp'].some(
      (ext) => fs.existsSync(path.join(jd, `render.${ext}`))
    );
    res.json({ ok: true, localModelAvailable, localRenderAvailable });
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:taskId/render', (req, res, next) => {
  try {
    const jd = jobDir(req.params.taskId);
    for (const [ext, mime] of [['jpg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]) {
      const fp = path.join(jd, `render.${ext}`);
      if (fs.existsSync(fp)) {
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(fs.readFileSync(fp));
      }
    }
    res.status(404).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'File quá lớn. Giới hạn upload là 200MB (Tripo API có thể từ chối file > 20MB).'
      : error.message;
    return res.status(400).json({ error: message });
  }

  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    error: error.message || 'Server error',
    details: process.env.NODE_ENV === 'production' ? undefined : error.details
  });
});

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Backend API đang chạy tại http://localhost:${PORT}`);
  console.log(`Tripo API key: ${getApiKey() ? 'đã cấu hình' : 'chưa cấu hình'}`);
});

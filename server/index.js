import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
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
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new Error('Chỉ hỗ trợ PNG, JPEG/JPG hoặc WEBP.'));
    cb(null, true);
  }
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

function isAllowedAssetUrl(rawUrl) {
  if (process.env.ALLOW_ANY_ASSET_PROXY === 'true') return true;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return (
      host.endsWith('.tripo3d.ai') ||
      host === 'tripo3d.ai' ||
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

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'File quá lớn. Giới hạn upload là 50MB (Tripo API có thể từ chối file > 20MB).'
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

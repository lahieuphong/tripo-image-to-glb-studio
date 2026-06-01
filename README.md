# Image → GLB Studio dùng Tripo OpenAPI

Project này là một web app mẫu mô phỏng workflow kiểu Tripo Studio: upload ảnh, tạo task `image_to_model`, poll trạng thái, preview và download file `.glb`. UI được thiết kế lại theo phong cách dark studio, không copy logo/tài sản giao diện của Tripo.

## Tính năng

- Upload ảnh PNG/JPG/WEBP tối đa 20MB.
- Backend Express giữ `TRIPO_API_KEY`, không lộ key ra frontend.
- Gọi Tripo OpenAPI: `/upload`, `/task`, `/task/{task_id}`.
- Chọn model: H3 v3.1, H3 v3.0, P1 Smart Mesh, H2 v2.5, Turbo.
- Tuỳ chọn texture, PBR, texture quality, geometry quality, face limit, seed, orientation, autofix.
- Preview GLB bằng `<model-viewer>` và download qua proxy local.

## Yêu cầu

- Node.js >= 18.17
- Một Tripo API key dạng `tsk_...`
- Internet để gọi Tripo API và tải npm package

## Cài đặt nhanh

```bash
unzip tripo-image-to-glb-studio.zip
cd tripo-image-to-glb-studio
cp .env.example .env
```

Mở file `.env` rồi sửa:

```env
TRIPO_API_KEY=tsk_your_real_key_here
PORT=8787
```

Cài package:

```bash
npm install
```

Chạy chế độ dev:

```bash
npm run dev
```

Mở trình duyệt tại:

```txt
http://localhost:5173
```

## Chạy production local

```bash
npm install
npm run build
npm start
```

Sau đó mở:

```txt
http://localhost:8787
```

## Cách hoạt động

1. Frontend gửi ảnh và options tới backend `/api/generate`.
2. Backend upload ảnh lên Tripo bằng `POST https://api.tripo3d.ai/v2/openapi/upload`.
3. Backend lấy `image_token`, tạo task bằng `POST https://api.tripo3d.ai/v2/openapi/task` với payload `type: "image_to_model"`.
4. Frontend poll `/api/task/:taskId`, backend gọi `GET https://api.tripo3d.ai/v2/openapi/task/{task_id}`.
5. Khi status là `success`, app dùng `output.pbr_model`, `output.model` hoặc `output.base_model` để preview/download GLB.

## Lưu ý quan trọng

- Link output của Tripo thường có hạn, hãy download ngay sau khi task thành công.
- Mỗi lần generate có thể tốn credit Tripo tuỳ model và tuỳ chọn.
- Không commit file `.env` lên GitHub.
- Nếu preview/download bị chặn do host asset lạ, thử thêm trong `.env`:

```env
ALLOW_ANY_ASSET_PROXY=true
```

Chỉ dùng tuỳ chọn này khi chạy local/dev.

## Payload mẫu gửi lên Tripo

```json
{
  "type": "image_to_model",
  "model_version": "v3.1-20260211",
  "file": {
    "type": "png",
    "file_token": "IMAGE_TOKEN_FROM_UPLOAD"
  },
  "texture": true,
  "pbr": true,
  "texture_quality": "standard",
  "texture_alignment": "original_image",
  "orientation": "default",
  "geometry_quality": "standard",
  "enable_image_autofix": true
}
```

## Tuỳ biến tiếp theo

- Thêm đăng nhập user và lưu lịch sử task trong database.
- Thêm multiview-to-model để upload front/side/back/right.
- Thêm convert sang FBX/OBJ/USDZ bằng endpoint post-process/conversion.
- Thêm queue riêng nếu nhiều người dùng cùng lúc.

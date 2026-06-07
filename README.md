# GLB Forge Studio

Ứng dụng web chuyển ảnh thành model 3D định dạng GLB, sử dụng [Tripo OpenAPI](https://platform.tripo3d.ai). Giao diện kiểu studio chuyên nghiệp — API key được giữ an toàn trên backend, không bao giờ lộ ra trình duyệt.

---

## Tính năng

- Upload ảnh **PNG / JPG / WEBP** tối đa **200 MB** và tạo model GLB
- Xem preview 3D trực tiếp trong trình duyệt (`<model-viewer>`, hỗ trợ AR)
- Chọn AI model: **Tripo v3.1, v3.0, P1 Smart Mesh, v2.5, Turbo v1.0**
- Tuỳ chỉnh: Texture, PBR, Texture quality, Geometry quality, Face limit, Seed, Orientation, Image autofix, Compress geometry
- Hiển thị số **credits còn lại** và credits tiêu thụ sau mỗi lần generate
- **Lịch sử job** (`/jobs`): lưu ảnh gốc + metadata vào `storage/jobs/`, xem lại và download bất cứ lúc nào
- URL tự cập nhật thành `/jobs?id={taskId}` sau khi generate thành công — dễ chia sẻ và bookmark

---

## Yêu cầu

| Phần mềm | Phiên bản tối thiểu |
|----------|---------------------|
| Node.js  | 18.17               |
| yarn | bất kỳ        |

---

## Cài đặt và chạy

### 1. Clone và cài dependencies

```bash
git clone https://github.com/lahieuphong/tripo-image-to-glb-studio.git
cd tripo-image-to-glb-studio
yarn install
```

### 2. Tạo file `.env`

```bash
cp .env.example .env
```

Mở `.env` và điền API key (lấy tại [platform.tripo3d.ai/billing](https://platform.tripo3d.ai/billing)):

```env
TRIPO_API_KEY=tsk_your_real_key_here
PORT=8787
ALLOW_ANY_ASSET_PROXY=false
```

### 3. Chạy development

```bash
yarn dev
```

Mở trình duyệt tại `http://localhost:5173`

> Backend Express chạy ở port `8787`, Vite dev server chạy ở `5173` và tự động proxy `/api` sang backend.

### 4. Build production

```bash
yarn build   # build frontend vào dist/
yarn start       # chạy server phục vụ cả frontend + API
```

Truy cập tại `http://localhost:8787`

---

## Cấu trúc thư mục

```
tripo-image-to-glb-studio/
├── server/
│   └── index.js              # Express backend — gọi Tripo API, lưu job, proxy asset
├── src/
│   ├── components/
│   │   ├── TopBar.jsx        # Thanh điều hướng trên cùng (logo, nav, badges)
│   │   ├── IconSidebar.jsx   # Sidebar icon dọc bên trái (Image / Jobs)
│   │   ├── ControlPanel.jsx  # Panel điều khiển (upload, options, Generate)
│   │   ├── CenterViewer.jsx  # Viewer 3D ở giữa (model-viewer full height)
│   │   ├── RightPanel.jsx    # Panel phải (Kết quả / Activity log)
│   │   └── CreditErrorModal.jsx
│   ├── pages/
│   │   ├── GeneratePage.jsx  # Trang Generate — state và logic chính
│   │   ├── JobsPage.jsx      # Trang /jobs — danh sách và chi tiết job
│   │   └── PricingPage.jsx   # Trang /pricing — bảng credits
│   ├── main.jsx              # Entry point, routing đơn giản theo pathname
│   ├── constants.js          # Danh sách model, FINAL_STATUSES
│   ├── utils.js              # Hàm tiện ích (wait, outputFromTaskResponse…)
│   └── styles.css            # Toàn bộ CSS
├── storage/
│   └── jobs/                 # JSON metadata + ảnh gốc của từng job (tự tạo khi chạy)
├── .env.example
├── vite.config.js
└── package.json
```

---

## API Backend

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/api/health` | Kiểm tra trạng thái server và API key |
| `GET`  | `/api/balance` | Lấy số credits còn lại |
| `POST` | `/api/generate` | Upload ảnh, tạo task generate model |
| `GET`  | `/api/task/:taskId` | Lấy trạng thái và output của task |
| `GET`  | `/api/asset` | Proxy tải asset từ Tripo CDN |
| `POST` | `/api/jobs` | Lưu thông tin job sau khi generate thành công |
| `GET`  | `/api/jobs` | Lấy danh sách tất cả jobs |
| `GET`  | `/api/jobs/:taskId` | Lấy chi tiết một job |
| `GET`  | `/api/jobs/:taskId/input` | Lấy ảnh gốc đã lưu của job |

---

## Luồng hoạt động

```
Người dùng upload ảnh + chọn options
            │
            ▼
  POST /api/generate
  └─► Server upload ảnh lên Tripo
  └─► Tạo task image_to_model
  └─► Lưu ảnh gốc vào storage/jobs/
            │
            ▼
  Frontend polling GET /api/task/:taskId  (mỗi 2.5 giây)
            │
            ▼  status = success
  Lưu job JSON vào storage/jobs/
  URL cập nhật → /jobs?id={taskId}
  Model hiển thị trong 3D Viewer
  Download GLB
```

---

## Biến môi trường

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `TRIPO_API_KEY` | *(bắt buộc)* | API key từ Tripo Platform |
| `PORT` | `8787` | Port cho Express backend |
| `ALLOW_ANY_ASSET_PROXY` | `false` | Cho phép proxy mọi URL asset (chỉ bật khi debug) |

---

## Lưu ý bảo mật

- File `.env` đã có trong `.gitignore` — **không bao giờ commit file này**
- API key chỉ tồn tại trên server, frontend chỉ gọi qua `/api/…`
- `storage/jobs/*.json` và ảnh gốc cũng được gitignore — không lộ dữ liệu người dùng lên repository
- Link model từ Tripo có thể hết hạn sau một thời gian — nên download ngay sau khi generate xong

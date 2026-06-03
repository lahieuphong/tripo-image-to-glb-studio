import IconSidebar from '../components/IconSidebar.jsx';
import TopBar from '../components/TopBar.jsx';

const MODEL_ROWS = [
  {
    model: 'H2 / H3',
    inApp: 'H3 v3.1, H3 v3.0, H2 v2.5',
    singleNoTexture: '20',
    singleTexture: '30',
    multiNoTexture: '20',
    multiTexture: '30',
    note: 'Phụ phí có thể áp dụng: +10 texture detailed, +20 geometry detailed (Ultra). Tối đa 60 credits.'
  },
  {
    model: 'P1',
    inApp: 'P1 Smart Mesh',
    singleNoTexture: '40',
    singleTexture: '50',
    multiNoTexture: '40',
    multiTexture: '50',
    note: 'Giá all-in theo task; phụ phí H2/H3 không áp dụng cho P1.'
  },
  {
    model: 'Turbo v1.0',
    inApp: 'Turbo v1.0',
    singleNoTexture: 'Chưa nêu',
    singleTexture: 'Chưa nêu',
    multiNoTexture: 'Chưa nêu',
    multiTexture: 'Chưa nêu',
    note: 'Trang pricing hiện tại không có dòng riêng cho Turbo; xem consumed_credit sau task.'
  }
];

const OPTION_ROWS = [
  {
    ui: 'Tab 1 ảnh',
    api: 'image_to_model',
    credit: 'Theo cot Image to model',
    meaning: 'H2/H3: 20 không texture, 30 có texture. P1: 40 không texture, 50 có texture.'
  },
  {
    ui: 'Tab 4 ảnh',
    api: 'multiview_to_model',
    credit: 'Theo cot Multiview to model',
    meaning: 'Bảng pricing cho Multiview to model giống Image to model: H2/H3 20/30, P1 40/50.'
  },
  {
    ui: 'Texture',
    api: 'texture=true',
    credit: '+10 so với No texture',
    meaning: 'H2/H3 từ 20 lên 30; P1 từ 40 lên 50.'
  },
  {
    ui: 'PBR',
    api: 'pbr=true',
    credit: 'Không có phụ phí riêng trong docs',
    meaning: 'Trong code, bật PBR sẽ bật Texture. Vì vậy chỉ tính theo nhóm + texture.'
  },
  {
    ui: 'Texture quality: Detailed',
    api: 'texture_quality=detailed',
    credit: '+10 với H2/H3',
    meaning: 'Docs ghi phụ phí này cho H2/H3. P1 là all-in nên không áp dụng phụ phí H2/H3.'
  },
  {
    ui: 'Texture quality: Standard',
    api: 'texture_quality=standard',
    credit: '+0',
    meaning: 'Mặc định UI hiện tại đang là Standard.'
  },
  {
    ui: 'Geometry quality: Standard',
    api: 'geometry_quality=standard',
    credit: '+0',
    meaning: 'Mặc định, không có phụ phí thêm.'
  },
  {
    ui: 'Geometry quality: Ultra',
    api: 'geometry_quality=detailed',
    credit: '+20 với H2/H3',
    meaning: 'Geometry Ultra (gửi detailed lên API) tốn thêm ~20 credits với H3 v3.x. Chỉ áp dụng cho H3 v3.1 / v3.0.'
  },
  {
    ui: 'Face limit',
    api: 'face_limit',
    credit: 'Không nêu cho generate model',
    meaning: 'Docs chỉ nêu face_limit làm tăng 5 credits trong Export Conversion, không phải task generate hiện tại.'
  },
  {
    ui: 'Orientation',
    api: 'orientation',
    credit: 'Không nêu phụ phí',
    meaning: 'Tham số canh hướng ảnh, pricing page không ghi surcharge.'
  },
  {
    ui: 'Texture align',
    api: 'texture_alignment',
    credit: 'Không nêu phụ phí',
    meaning: 'Original image / Geometry không có dòng phí riêng trong pricing page.'
  },
  {
    ui: 'Model seed',
    api: 'model_seed',
    credit: 'Không nêu phụ phí',
    meaning: 'Dùng để tái lập kết quả, pricing page không ghi surcharge.'
  },
  {
    ui: 'Image autofix',
    api: 'enable_image_autofix',
    credit: 'Không nêu phụ phí',
    meaning: 'Pricing page không ghi surcharge cho tham số này.'
  },
  {
    ui: 'Compress',
    api: 'compress=geometry',
    credit: 'Không nêu trực tiếp',
    meaning: 'Docs có smart_low_poly=true +10 cho H2/H3, nhưng code hiện tại không gửi smart_low_poly.'
  }
];

const QUICK_EXAMPLES = [
  {
    title: 'Mặc định app (H3 + Texture/PBR)',
    text: 'H3 v3.1 + Texture/PBR bật + Standard texture + Standard geometry = 30 credits.'
  },
  {
    title: 'Texture quality Detailed',
    text: 'H3 + Texture/PBR + Detailed texture + Standard geometry = 30 + 10 = 40 credits.'
  },
  {
    title: 'Geometry quality Ultra (Detailed)',
    text: 'H3 + Texture/PBR + Standard texture + Ultra geometry = 30 + 20 = 50 credits.'
  },
  {
    title: 'Tất cả max (Detailed texture + Ultra geometry)',
    text: 'H3 + Texture/PBR + Detailed texture + Ultra geometry = 30 + 10 + 20 = 60 credits.'
  },
  {
    title: 'Tắt Texture/PBR',
    text: 'H3/H2 Image to model hoặc Multiview to model, no texture = 20 credits.'
  },
  {
    title: 'Đổi sang P1',
    text: 'P1 là 40 credits không texture, 50 credits có texture; phụ phí H2/H3 không áp dụng cho P1.'
  }
];

function PricingTable({ children, columns }) {
  return (
    <div className="pricing-table-wrap">
      <table className={`pricing-table pricing-table--${columns}`}>
        {children}
      </table>
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="s-root">
      <TopBar />
      <div className="s-body">
        <IconSidebar />
        <main className="pricing-page">
          <section className="pricing-hero">
            <div>
              <p className="pricing-kicker">Tripo credits</p>
              <h1>Pricing</h1>
              <p>
                Bảng này gồm thông tin từ Tripo pricing docs và đối chiếu với các tuỳ chọn đang có trong UI hiện tại.
                Đây là ước tính theo bảng công khai; credit thật sự nên đối chiếu bằng trường <code>consumed_credit</code> sau mỗi task.
              </p>
            </div>
            <a className="pricing-source" href="https://docs.tripo3d.ai/get-started/pricing.html" target="_blank" rel="noreferrer">
              Nguồn Tripo docs
            </a>
          </section>

          <section className="pricing-summary-grid" aria-label="Tom tat pricing">
            <div className="pricing-stat">
              <span>Tỷ giá credit</span>
              <strong>$1 = 100 credits</strong>
            </div>
            <div className="pricing-stat">
              <span>Free credits</span>
              <strong>300 credits / 2 tuần</strong>
            </div>
            <div className="pricing-stat">
              <span>Task mặc định</span>
              <strong>30 credits</strong>
            </div>
          </section>

          <section className="pricing-section">
            <div className="pricing-section-head">
              <div>
                <p className="pricing-kicker">Base credit</p>
                <h2>Theo model và tab đang dùng</h2>
              </div>
              <p>Tab 1 ảnh là Image to model. Tab 4 ảnh của app gửi trực tiếp Multiview to model.</p>
            </div>
            <PricingTable columns="model">
              <thead>
                <tr>
                  <th>Model group</th>
                  <th>Đang có trong app</th>
                  <th>1 ảnh, no texture</th>
                  <th>1 ảnh, + texture</th>
                  <th>4 ảnh, no texture</th>
                  <th>4 ảnh, + texture</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {MODEL_ROWS.map((row) => (
                  <tr key={row.model}>
                    <td><strong>{row.model}</strong></td>
                    <td>{row.inApp}</td>
                    <td>{row.singleNoTexture}</td>
                    <td>{row.singleTexture}</td>
                    <td>{row.multiNoTexture}</td>
                    <td>{row.multiTexture}</td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </PricingTable>
          </section>

          <section className="pricing-section">
            <div className="pricing-section-head">
              <div>
                <p className="pricing-kicker">UI options</p>
                <h2>Tick vào mục nào thì tính sao?</h2>
              </div>
              <p>Các dòng "không nêu" nghĩa là pricing page không ghi surcharge riêng, không nên tự quy đổi thành credit.</p>
            </div>
            <PricingTable columns="options">
              <thead>
                <tr>
                  <th>Mục trong UI</th>
                  <th>Payload gửi API</th>
                  <th>Credit theo docs</th>
                  <th>Giải thích dễ hiểu</th>
                </tr>
              </thead>
              <tbody>
                {OPTION_ROWS.map((row) => (
                  <tr key={`${row.ui}-${row.api}`}>
                    <td><strong>{row.ui}</strong></td>
                    <td><code>{row.api}</code></td>
                    <td>{row.credit}</td>
                    <td>{row.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </PricingTable>
          </section>

          <section className="pricing-section">
            <div className="pricing-section-head">
              <div>
                <p className="pricing-kicker">Examples</p>
                <h2>Ví dụ nhanh theo UI hiện tại</h2>
              </div>
            </div>
            <div className="pricing-example-grid">
              {QUICK_EXAMPLES.map((item) => (
                <article className="pricing-example" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="pricing-note">
            <strong>Lưu ý quan trọng</strong>
            <p>
              Tripo docs ghi credit thực tế nằm trong field <code>consumed_credit</code> khi gọi
              <code> GET /v2/openapi/task/{'{task_id}'}</code>. Nếu billing thay đổi hoặc model Turbo có cách tính riêng,
              field này là nguồn đối soát chính xác nhất sau khi task hoàn tất.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

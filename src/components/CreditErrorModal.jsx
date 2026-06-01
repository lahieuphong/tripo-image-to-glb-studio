export default function CreditErrorModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">⚡</div>
        <h3>Tài khoản API chưa có credit</h3>
        <p>Bạn cần nạp thêm credit API tại Tripo Platform để tiếp tục generate.</p>
        <div className="modal-actions">
          <a
            className="modal-btn-primary"
            href="https://platform.tripo3d.ai/billing"
            target="_blank"
            rel="noreferrer"
          >
            Nạp credit ngay →
          </a>
          <button className="modal-btn-ghost" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

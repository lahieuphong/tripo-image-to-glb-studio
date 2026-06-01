export default function ApiBadge({ configured, balance }) {
  return (
    <div className="topbar-badges">
      <div className={`api-badge ${configured ? 'ok' : 'warn'}`}>
        <span className="dot" />
        {configured ? 'API key sẵn sàng' : 'Chưa cấu hình API key'}
      </div>
      {balance?.balance != null && (
        <div className="api-badge balance-badge">
          <span className="dot" />
          {Number(balance.balance).toLocaleString()} credits còn lại
        </div>
      )}
    </div>
  );
}

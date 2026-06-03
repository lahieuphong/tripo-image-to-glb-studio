export default function TopBar({ health, balance }) {
  const path = window.location.pathname;
  const onJobs = path === '/jobs';
  const onPricing = path === '/pricing';
  return (
    <header className="s-topbar">
      <div className="s-topbar-l">
        <div className="s-t-logo">3D</div>
        <span className="s-t-brand">GLB Forge Studio</span>
        <div className="s-t-sep" />
        <nav className="s-t-nav">
          <a className={`s-t-link${!onJobs && !onPricing ? ' active' : ''}`} href="/">Generate</a>
          <a className={`s-t-link${onJobs ? ' active' : ''}`} href="/jobs">Jobs</a>
          <a className={`s-t-link${onPricing ? ' active' : ''}`} href="/pricing">Pricing</a>
        </nav>
      </div>
      <div className="s-topbar-r">
        {health != null && (
          <span className={`s-t-badge ${health.apiKeyConfigured ? 'ok' : 'warn'}`}>
            <i className="s-t-dot" />
            {health.apiKeyConfigured ? 'API sẵn sàng' : 'Chưa cấu hình API'}
          </span>
        )}
        {balance?.balance != null && (
          <span className="s-t-badge credit">
            <i className="s-t-dot" />
            {Number(balance.balance).toLocaleString()} credits còn lại
          </span>
        )}
      </div>
    </header>
  );
}

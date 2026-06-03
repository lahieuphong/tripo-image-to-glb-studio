function IcBtn({ href, label, active, children }) {
  return (
    <a className={`s-ic-btn${active ? ' active' : ''}`} href={href} title={label}>
      {children}
      <span>{label}</span>
    </a>
  );
}

export default function IconSidebar() {
  const p = window.location.pathname;
  const isJobs = p === '/jobs';
  const isPricing = p === '/pricing';
  return (
    <aside className="s-icon-bar">
      <nav className="s-ic-nav">
        <IcBtn href="/" label="Image" active={!isJobs && !isPricing}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/>
          </svg>
        </IcBtn>
        <IcBtn href="/jobs" label="Jobs" active={isJobs}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/><polyline points="12,7 12,12 15,15"/>
          </svg>
        </IcBtn>
        <IcBtn href="/pricing" label="Pricing" active={isPricing}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </IcBtn>
      </nav>
    </aside>
  );
}

import IconMask from './IconMask.jsx';

function IcBtn({ href, label, active, icon }) {
  return (
    <a className={`s-ic-btn${active ? ' active' : ''}`} href={href} title={label}>
      <IconMask src={icon} />
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
        <IcBtn href="/" label="Image" active={!isJobs && !isPricing} icon="/icons/image.svg" />
        <IcBtn href="/jobs" label="Jobs" active={isJobs} icon="/icons/jobs.svg" />
        <IcBtn href="/pricing" label="Pricing" active={isPricing} icon="/icons/pricing.svg" />
      </nav>
    </aside>
  );
}

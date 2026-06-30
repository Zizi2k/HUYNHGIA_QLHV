export default function PageHeader({ title, subtitle, actions, icon = 'bi-grid-1x2' }) {
  return (
    <header className="module-hero">
      <div className="module-hero-content">
        <div className="module-hero-text">
          <h1 className="module-hero-title">
            <span className="module-hero-title-icon">
              <i className={`bi ${icon}`} />
            </span>
            {title}
          </h1>
          {subtitle && <p className="module-hero-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="module-hero-actions">{actions}</div>}
      </div>
    </header>
  );
}

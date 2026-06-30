export default function PageHeader({ title, subtitle, actions, icon = 'bi-grid-1x2' }) {
  return (
    <header className="module-hero">
      <div className="module-hero-decor" aria-hidden="true">
        <span className="module-hero-decor-item module-hero-decor-item--1">
          <i className="bi bi-mortarboard-fill" />
        </span>
        <span className="module-hero-decor-item module-hero-decor-item--2">
          <i className="bi bi-calculator-fill" />
        </span>
        <span className="module-hero-decor-item module-hero-decor-item--3">
          <i className="bi bi-clipboard2-check-fill" />
        </span>
        <span className="module-hero-decor-item module-hero-decor-item--4">
          <i className="bi bi-coin" />
        </span>
      </div>
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

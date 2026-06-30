export default function ModuleSection({
  title,
  icon,
  count,
  actions,
  children,
  className = '',
  flush = false,
  style,
}) {
  return (
    <section className={`module-section ${className}`.trim()} style={style}>
      {(title || actions) && (
        <div className="module-section-header">
          <div className="module-section-title-wrap">
            {icon && <i className={`bi ${icon} module-section-icon`} />}
            {title && <h2 className="module-section-title">{title}</h2>}
            {count != null && <span className="pro-count-badge">{count}</span>}
          </div>
          {actions && <div className="module-section-actions">{actions}</div>}
        </div>
      )}
      <div className={`module-section-body${flush ? ' module-section-body--flush' : ''}`}>
        {children}
      </div>
    </section>
  );
}

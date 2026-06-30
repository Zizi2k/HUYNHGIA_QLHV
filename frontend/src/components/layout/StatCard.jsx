export function StatCard({ icon, tone = 'blue', label, value, hint }) {
  return (
    <div className="module-stat-card">
      <div className={`module-stat-icon tone-${tone}`}>
        <i className={`bi bi-${icon}`} />
      </div>
      <div className="module-stat-body">
        <div className="module-stat-label">{label}</div>
        <div className="module-stat-value">{value}</div>
        {hint && <div className="module-stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function StatCardGrid({ children, className = '' }) {
  return (
    <div className={`module-stat-grid ${className}`.trim()}>
      {children}
    </div>
  );
}

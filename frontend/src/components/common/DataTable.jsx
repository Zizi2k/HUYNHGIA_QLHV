export default function DataTable({ children, className = '', style }) {
  return (
    <div className={`pro-table-card ${className}`.trim()} style={style}>
      <div className="pro-table-wrap">
        <table className="pro-table">
          {children}
        </table>
      </div>
    </div>
  );
}

export function DataTableEmpty({ icon = 'bi-inbox', message, hint }) {
  return (
    <div className="pro-table-empty">
      <i className={`bi ${icon} pro-table-empty-icon`} />
      <p className="mb-0 fw-medium">{message}</p>
      {hint && <p className="mb-0 text-muted small mt-1">{hint}</p>}
    </div>
  );
}

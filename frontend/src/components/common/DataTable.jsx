import { Spinner } from 'react-bootstrap';
import ModuleSection from '../layout/ModuleSection';

export default function DataTable({
  children,
  className = '',
  style,
  title,
  icon,
  count,
  actions,
  loading = false,
}) {
  const tableContent = loading ? (
    <div className="text-center py-5">
      <Spinner animation="border" variant="primary" />
    </div>
  ) : (
    <div className="pro-table-wrap">
      <table className="pro-table">
        {children}
      </table>
    </div>
  );

  if (title) {
    return (
      <ModuleSection
        title={title}
        icon={icon}
        count={count}
        actions={actions}
        className={className}
        flush
        style={style}
      >
        {tableContent}
      </ModuleSection>
    );
  }

  return (
    <div className={`pro-table-card ${className}`.trim()} style={style}>
      {tableContent}
    </div>
  );
}

export function DataTableEmpty({ icon = 'bi-inbox', message, hint }) {
  return (
    <tr>
      <td colSpan={100}>
        <div className="pro-table-empty">
          <i className={`bi ${icon} pro-table-empty-icon`} />
          <p className="mb-0 fw-medium">{message}</p>
          {hint && <p className="mb-0 text-muted small mt-1">{hint}</p>}
        </div>
      </td>
    </tr>
  );
}

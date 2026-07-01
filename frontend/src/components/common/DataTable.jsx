import { Spinner } from 'react-bootstrap';
import ModuleSection from '../layout/ModuleSection';
import LoadingOverlay from './LoadingOverlay';
import { useSoftLoading } from '../../hooks/useSoftLoading';

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
  const { showInitialSpinner, showOverlay } = useSoftLoading(loading);

  const tableBody = showInitialSpinner ? (
    <div className="text-center py-5">
      <Spinner animation="border" variant="primary" />
    </div>
  ) : (
    <LoadingOverlay loading={showOverlay}>
      <div className="pro-table-wrap">
        <table className="pro-table">
          {children}
        </table>
      </div>
    </LoadingOverlay>
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
        {tableBody}
      </ModuleSection>
    );
  }

  return (
    <div className={`pro-table-card ${className}`.trim()} style={style}>
      {tableBody}
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

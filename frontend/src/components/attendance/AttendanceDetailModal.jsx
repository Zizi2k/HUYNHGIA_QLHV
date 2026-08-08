import { Modal, Button } from 'react-bootstrap';
import { getAttendanceStatusLabel } from '../../constants/attendanceStatus';

function formatSessionDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('vi-VN');
}

const STATUS_ICON = {
  present: 'bi-check-lg',
  absent: 'bi-x-lg',
  late: 'bi-clock',
  excused: 'bi-info-lg',
  dropped: 'bi-dash-lg',
};

function exportDetailList(detail) {
  if (!detail?.records?.length) {
    alert('Chưa có dữ liệu để xuất');
    return;
  }

  const header = ['STT', 'Học viên', 'Mã học viên', 'Trạng thái'];
  const rows = detail.records.map((record, index) => [
    String(index + 1),
    record.fullname || '',
    record.code || '',
    getAttendanceStatusLabel(record.status),
  ]);

  const escapeCell = (value) => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const csv = [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const classPart = (detail.class_name || 'lop').replace(/[^\w\-]+/g, '_');
  const datePart = formatSessionDate(detail.session_date).replace(/\//g, '-');
  link.href = url;
  link.download = `diem-danh-${classPart}-${datePart}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AttendanceDetailModal({ show, onHide, detail }) {
  return (
    <Modal
      show={show}
      onHide={onHide}
      size="lg"
      centered
      className="attendance-detail-modal"
    >
      <Modal.Header closeButton className="attendance-detail-header">
        <Modal.Title>
          <span className="attendance-detail-title-icon" aria-hidden="true">
            <i className="bi bi-file-earmark-text-fill" />
          </span>
          Chi tiết điểm danh
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="attendance-detail-body">
        {detail && (
          <>
            <div className="attendance-detail-meta">
              <div className="attendance-detail-meta-card">
                <span className="attendance-detail-meta-icon">
                  <i className="bi bi-mortarboard-fill" />
                </span>
                <div>
                  <span className="attendance-detail-meta-label">Lớp học</span>
                  <strong className="attendance-detail-meta-value">{detail.class_name || '—'}</strong>
                </div>
              </div>
              <div className="attendance-detail-meta-card">
                <span className="attendance-detail-meta-icon">
                  <i className="bi bi-calendar3" />
                </span>
                <div>
                  <span className="attendance-detail-meta-label">Ngày điểm danh</span>
                  <strong className="attendance-detail-meta-value">
                    {formatSessionDate(detail.session_date) || '—'}
                  </strong>
                </div>
              </div>
              <div className="attendance-detail-meta-card">
                <span className="attendance-detail-meta-icon">
                  <i className="bi bi-person-fill" />
                </span>
                <div>
                  <span className="attendance-detail-meta-label">Giáo viên</span>
                  <strong className="attendance-detail-meta-value">{detail.teacher_name || '—'}</strong>
                </div>
              </div>
            </div>

            {detail.note && (
              <div className="attendance-detail-note">{detail.note}</div>
            )}

            <div className="attendance-detail-table-wrap">
              <table className="attendance-detail-table">
                <thead>
                  <tr>
                    <th className="col-stt">STT</th>
                    <th>Học viên</th>
                    <th>Mã học viên</th>
                    <th className="col-status">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.records?.length ? (
                    detail.records.map((record, index) => (
                      <tr key={record.id || `${record.code}-${index}`}>
                        <td className="col-stt">
                          <span className="attendance-detail-stt">{index + 1}</span>
                        </td>
                        <td className="attendance-detail-name">{record.fullname}</td>
                        <td className="attendance-detail-code">{record.code || '—'}</td>
                        <td className="col-status">
                          <span className={`attendance-detail-badge status-${record.status}`}>
                            <span className="attendance-detail-badge-icon">
                              <i className={`bi ${STATUS_ICON[record.status] || 'bi-circle'}`} />
                            </span>
                            {getAttendanceStatusLabel(record.status)}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="attendance-detail-empty">
                        Chưa có dữ liệu học viên
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal.Body>

      {detail && (
        <Modal.Footer className="attendance-detail-footer">
          <Button
            variant="outline-primary"
            className="attendance-detail-export-btn"
            onClick={() => exportDetailList(detail)}
            disabled={!detail.records?.length}
          >
            <i className="bi bi-download" />
            Xuất danh sách
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

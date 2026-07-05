import { Modal } from 'react-bootstrap';
import { getAttendanceStatusLabel } from '../../constants/attendanceStatus';

function formatSessionDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('vi-VN');
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
        <Modal.Title>Chi tiết điểm danh</Modal.Title>
      </Modal.Header>
      <Modal.Body className="attendance-detail-body">
        {detail && (
          <>
            <div className="attendance-detail-meta">
              <div className="attendance-detail-meta-row">
                <strong>Lớp:</strong> {detail.class_name}
              </div>
              <div className="attendance-detail-meta-row">
                <strong>Ngày:</strong> {formatSessionDate(detail.session_date)}
              </div>
              <div className="attendance-detail-meta-row">
                <strong>Giáo viên:</strong> {detail.teacher_name}
              </div>
            </div>

            {detail.note && (
              <div className="attendance-detail-note">{detail.note}</div>
            )}

            <div className="attendance-detail-table-wrap">
              <table className="attendance-detail-table">
                <thead>
                  <tr>
                    <th>Học viên</th>
                    <th>Mã</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.records?.length ? (
                    detail.records.map((record) => (
                      <tr key={record.id}>
                        <td className="attendance-detail-name">{record.fullname}</td>
                        <td className="attendance-detail-code">{record.code || '—'}</td>
                        <td className={`attendance-detail-status status-${record.status}`}>
                          {getAttendanceStatusLabel(record.status)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="attendance-detail-empty">
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
    </Modal>
  );
}

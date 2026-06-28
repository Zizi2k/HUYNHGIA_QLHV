import { Link } from 'react-router-dom';
import { Badge, Button } from 'react-bootstrap';
import DataTable, { DataTableEmpty } from '../common/DataTable';
import {
  ENROLLMENT_STATUS_LABELS, STATUS_LABELS, formatMoney, formatDateVi, subjectLabel,
} from './studentConstants';

export default function EnrollmentOverviewTable({ students, onEdit }) {
  if (!students.length) {
    return (
      <DataTable>
        <tbody>
          <tr>
            <td className="p-0">
              <DataTableEmpty
                icon="bi-people"
                message="Chưa có học viên nào"
                hint="Thêm học viên mới hoặc điều chỉnh bộ lọc"
              />
            </td>
          </tr>
        </tbody>
      </DataTable>
    );
  }

  return (
    <DataTable>
      <thead>
        <tr>
          <th style={{ width: 48 }}>#</th>
          <th>Mã HV</th>
          <th>Họ tên</th>
          <th>Môn</th>
          <th>Khóa học</th>
          <th>Lớp</th>
          <th>Bắt đầu</th>
          <th>Kết thúc</th>
          <th>TT khóa</th>
          <th className="text-end">Còn nợ</th>
          <th>TT HP</th>
          <th style={{ width: 90 }} className="text-center">Thao tác</th>
        </tr>
      </thead>
      <tbody>
        {students.map((s, idx) => {
          const enrollSt = ENROLLMENT_STATUS_LABELS[s.enrollment_status] || ENROLLMENT_STATUS_LABELS.unknown;
          const paySt = STATUS_LABELS[s.status] || STATUS_LABELS.unpaid;
          return (
            <tr key={s.id}>
              <td><span className="pro-row-num">{idx + 1}</span></td>
              <td><span className="pro-badge-code">{s.student_code}</span></td>
              <td className="fw-semibold">{s.fullname}</td>
              <td>{s.subject_label || subjectLabel(s.subject)}</td>
              <td>
                {s.course_name ? (
                  <span>{s.course_name} <small className="text-muted">({s.course_duration_months} tháng)</small></span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td>
                {s.class_id ? (
                  <Link to={`/classes/${s.class_id}`} className="text-decoration-none">
                    {s.linked_class_name || s.class_label || `Lớp #${s.class_id}`}
                  </Link>
                ) : (
                  <span className="text-muted">{s.class_label || '—'}</span>
                )}
              </td>
              <td>{formatDateVi(s.start_date)}</td>
              <td>{formatDateVi(s.end_date)}</td>
              <td><Badge bg={enrollSt.bg}>{s.enrollment_status_label || enrollSt.label}</Badge></td>
              <td className="text-end">
                {s.total_debt > 0 ? (
                  <span className="text-danger fw-semibold">{formatMoney(s.total_debt)}</span>
                ) : (
                  <span className="text-success">0</span>
                )}
              </td>
              <td><Badge bg={paySt.bg}>{paySt.label}</Badge></td>
              <td className="text-center">
                <div className="pro-action-group">
                  <Button
                    variant="light"
                    size="sm"
                    title="Sửa"
                    onClick={() => onEdit(s)}
                  >
                    <i className="bi bi-pencil text-primary" />
                  </Button>
                  <Link
                    to="/tuition"
                    className="btn btn-light btn-sm"
                    title="Xem học phí"
                  >
                    <i className="bi bi-cash-coin text-success" />
                  </Link>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

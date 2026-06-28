import { Table, Badge, Button } from 'react-bootstrap';
import { formatMoney, STATUS_LABELS, subjectLabel } from './tuitionConstants';

export default function TuitionProfileTable({ profiles, onEdit, onPay, onDelete }) {
  if (profiles.length === 0) {
    return <p className="text-center text-muted py-4">Không có dữ liệu học phí</p>;
  }

  return (
    <div className="table-responsive">
      <Table hover className="bg-white shadow-sm rounded align-middle" size="sm">
        <thead className="table-light">
          <tr>
            <th>Mã HV</th>
            <th>Họ tên</th>
            <th>Môn</th>
            <th>Lớp học</th>
            <th>Lớp TC</th>
            <th>Đang học</th>
            <th>SĐT</th>
            <th>HP ban đầu</th>
            <th>HP sau giảm</th>
            <th>Phí sách</th>
            <th>Đã đóng HP</th>
            <th>Đã đóng sách</th>
            <th>Công nợ</th>
            <th>TT</th>
            <th style={{ minWidth: 140 }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => {
            const st = STATUS_LABELS[p.status] || STATUS_LABELS.unpaid;
            return (
              <tr key={p.id}>
                <td>{p.student_code}</td>
                <td>{p.fullname}</td>
                <td><Badge bg="info" className="bg-opacity-10 text-info">{subjectLabel(p.subject)}</Badge></td>
                <td>{p.class_label || p.linked_class_name || '—'}</td>
                <td>{p.enrichment_class || '—'}</td>
                <td>{p.current_class || '—'}</td>
                <td>{p.phone || '—'}</td>
                <td className="text-end">{formatMoney(p.base_fee)}</td>
                <td className="text-end">{formatMoney(p.fee_after_discount)}</td>
                <td className="text-end">{formatMoney(p.book_fee)}</td>
                <td className="text-end">{formatMoney(p.tuition_paid)}</td>
                <td className="text-end">{formatMoney(p.book_paid)}</td>
                <td className="text-end fw-semibold text-danger">{formatMoney(p.total_debt)}</td>
                <td><Badge bg={st.bg}>{st.label}</Badge></td>
                <td>
                  <Button variant="outline-success" size="sm" className="me-1" title="Thu phí" onClick={() => onPay(p)}>
                    <i className="bi bi-cash" />
                  </Button>
                  <Button variant="outline-primary" size="sm" className="me-1" onClick={() => onEdit(p)}>
                    <i className="bi bi-pencil" />
                  </Button>
                  <Button variant="outline-danger" size="sm" onClick={() => onDelete(p.id)}>
                    <i className="bi bi-trash" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

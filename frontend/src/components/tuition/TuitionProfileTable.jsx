import { Badge, Button } from 'react-bootstrap';
import DataTable, { DataTableEmpty } from '../common/DataTable';
import { formatMoney, STATUS_LABELS, subjectLabel } from './tuitionConstants';

export default function TuitionProfileTable({ profiles, onEdit, onPay, onDelete }) {
  if (profiles.length === 0) {
    return (
      <DataTable title="Danh sách học phí" icon="bi-list-ul">
        <tbody>
          <DataTableEmpty message="Không có dữ liệu học phí" />
        </tbody>
      </DataTable>
    );
  }

  return (
    <DataTable
      title="Danh sách học phí"
      icon="bi-list-ul"
      count={profiles.length}
    >
      <thead>
        <tr>
          <th>Mã HV</th>
          <th>Họ tên</th>
          <th>Môn</th>
          <th>Lớp học</th>
          <th>Lớp TC</th>
          <th>Đang học</th>
          <th>SĐT</th>
          <th className="text-end">HP ban đầu</th>
          <th className="text-end">HP sau giảm</th>
          <th className="text-end">Phí sách</th>
          <th className="text-end">Đã đóng HP</th>
          <th className="text-end">Đã đóng sách</th>
          <th className="text-end">Công nợ</th>
          <th>TT</th>
          <th style={{ minWidth: 140 }}>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        {profiles.map((p) => {
          const st = STATUS_LABELS[p.status] || STATUS_LABELS.unpaid;
          return (
            <tr key={p.id}>
              <td><span className="pro-badge-code">{p.student_code}</span></td>
              <td className="fw-semibold">{p.fullname}</td>
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
                <Button variant="outline-primary" size="sm" className="me-1" onClick={() => onEdit(p)}>
                  Sửa
                </Button>
                <Button variant="outline-success" size="sm" className="me-1" onClick={() => onPay(p)}>
                  Thu
                </Button>
                <Button variant="outline-danger" size="sm" onClick={() => onDelete(p.id)}>
                  Xóa
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

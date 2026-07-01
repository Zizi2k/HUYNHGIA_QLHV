import { Modal, Table, Button, Badge } from 'react-bootstrap';
import { formatMoney, PAYMENT_TYPE_LABELS, displayBookNo, displayReceiptNo } from './tuitionConstants';

export default function ReceiptListModal({
  show, onHide, payments, onViewReceipt, onEditPayment, onDeletePayment,
}) {
  if (!payments?.length) return null;

  return (
    <Modal show={show} onHide={onHide} size="xl" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Phiếu thu</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
        <Table responsive hover className="mb-0">
          <thead className="table-light">
            <tr>
              <th>Quyển số</th>
              <th>Số</th>
              <th>Ngày thu</th>
              <th>Tháng</th>
              <th>Loại</th>
              <th className="text-end">Số tiền</th>
              <th style={{ minWidth: 180 }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{displayBookNo(p)}</td>
                <td>{displayReceiptNo(p)}</td>
                <td>{new Date(p.payment_date).toLocaleDateString('vi-VN')}</td>
                <td>{String(p.period_month || '').slice(0, 7)}</td>
                <td>
                  <Badge bg="light" text="dark">
                    {PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type}
                  </Badge>
                </td>
                <td className="text-end">{formatMoney(p.amount)} đ</td>
                <td className="text-nowrap">
                  <Button size="sm" variant="outline-primary" className="me-1" onClick={() => onViewReceipt(p.id)}>
                    <i className="bi bi-file-earmark-pdf me-1" />
                    Xem
                  </Button>
                  <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => onEditPayment(p)}>
                    Sửa
                  </Button>
                  <Button size="sm" variant="outline-danger" onClick={() => onDeletePayment(p)}>
                    Xóa
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Modal.Body>
    </Modal>
  );
}

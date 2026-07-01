import { Modal, Table, Button, Badge } from 'react-bootstrap';
import { formatMoney, PAYMENT_TYPE_LABELS } from './tuitionConstants';

export default function ReceiptListModal({ show, onHide, payments, onViewReceipt }) {
  if (!payments?.length) return null;

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Phiếu thu</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
        <Table responsive hover className="mb-0">
          <thead className="table-light">
            <tr>
              <th>Số PT</th>
              <th>Ngày thu</th>
              <th>Loại</th>
              <th className="text-end">Số tiền</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{String(p.id).padStart(6, '0')}</td>
                <td>{new Date(p.payment_date).toLocaleDateString('vi-VN')}</td>
                <td>
                  <Badge bg="light" text="dark">
                    {PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type}
                  </Badge>
                </td>
                <td className="text-end">{formatMoney(p.amount)} đ</td>
                <td>
                  <Button size="sm" variant="outline-primary" onClick={() => onViewReceipt(p.id)}>
                    <i className="bi bi-file-earmark-pdf me-1" />
                    Xem
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

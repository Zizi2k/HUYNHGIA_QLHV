import { useEffect, useState } from 'react';
import { Button, Badge, Spinner } from 'react-bootstrap';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tuitionService } from '../services';
import { formatMoney, PAYMENT_TYPE_LABELS } from '../components/tuition/tuitionConstants';
import PageHeader from '../components/layout/PageHeader';
import ModuleSection from '../components/layout/ModuleSection';
import { openPaymentReceipt } from '../utils/tuitionReceipt';

export default function MyReceiptsPage() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'student') return;
    tuitionService.getMyReceipts()
      .then((res) => setReceipts(res.data))
      .catch(() => setReceipts([]))
      .finally(() => setLoading(false));
  }, [user?.role]);

  if (user?.role !== 'student') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-container module-page">
      <PageHeader
        icon="bi-receipt"
        title="Phiếu thu học phí"
        subtitle="Các phiếu thu được gửi về tài khoản của bạn sau khi đóng học phí / phí sách."
      />

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : receipts.length === 0 ? (
        <ModuleSection title="Chưa có phiếu thu" icon="bi-inbox">
          <p className="text-muted mb-0">Khi bạn đóng học phí, phiếu thu sẽ hiển thị tại đây.</p>
        </ModuleSection>
      ) : (
        <ModuleSection title="Danh sách phiếu thu" icon="bi-list-ul" flush>
          <div className="pro-table-wrap">
            <table className="pro-table">
              <thead>
                <tr>
                  <th>Số PT</th>
                  <th>Mã HV</th>
                  <th>Ngày thu</th>
                  <th>Loại thu</th>
                  <th className="text-end">Số tiền</th>
                  <th>Người thu</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td>{String(r.id).padStart(6, '0')}</td>
                    <td><span className="pro-badge-code">{r.student_code}</span></td>
                    <td>{new Date(r.payment_date).toLocaleDateString('vi-VN')}</td>
                    <td>
                      <Badge bg="light" text="dark">
                        {PAYMENT_TYPE_LABELS[r.payment_type] || r.payment_type}
                      </Badge>
                    </td>
                    <td className="text-end fw-semibold">{formatMoney(r.amount)} đ</td>
                    <td>{r.recorder_name || '—'}</td>
                    <td>
                      <Button size="sm" variant="outline-primary" onClick={() => openPaymentReceipt(r.id)}>
                        <i className="bi bi-file-earmark-pdf me-1" />
                        Xem phiếu thu
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ModuleSection>
      )}
    </div>
  );
}

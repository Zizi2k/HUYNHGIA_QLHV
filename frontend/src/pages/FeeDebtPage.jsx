import { useEffect, useState } from 'react';
import { Button, Badge, Spinner, Alert } from 'react-bootstrap';
import { feeDebtService } from '../services';
import PageHeader from '../components/layout/PageHeader';
import DataTable, { DataTableEmpty } from '../components/common/DataTable';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

export default function FeeDebtPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    feeDebtService.getAll()
      .then((res) => setRecords(res.data || []))
      .catch((err) => {
        setError(err.response?.data?.message || 'Không thể tải danh sách nợ phí');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (record) => {
    const msg = `Xóa hồ sơ nợ phí của "${record.fullname}"?\n\nToàn bộ dữ liệu học viên (tài khoản, học phí, thanh toán) sẽ bị xóa vĩnh viễn.`;
    if (!window.confirm(msg)) return;

    setDeletingId(record.id);
    try {
      await feeDebtService.delete(record.id, { confirm_purge: true });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa hồ sơ nợ phí');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Nợ phí"
        subtitle="Học viên nghỉ luôn hoặc bị xóa tài khoản nhưng còn nợ học phí / sách"
      />

      {error && <Alert variant="danger">{error}</Alert>}

      <Alert variant="light" className="small">
        Hồ sơ được tạo tự động khi điểm danh <strong>Nghỉ luôn</strong> và còn nợ, hoặc khi admin xóa học viên còn nợ.
        Xóa tại đây sẽ xóa toàn bộ dữ liệu học viên liên quan.
      </Alert>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <DataTable className="flat">
          <thead>
            <tr>
              <th>Học viên</th>
              <th>Mã HV</th>
              <th>Lớp</th>
              <th>Môn</th>
              <th>Nợ học phí</th>
              <th>Nợ sách</th>
              <th>Tổng nợ</th>
              <th>Nguồn</th>
              <th>Tài khoản</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <DataTableEmpty colSpan={10} message="Chưa có hồ sơ nợ phí." />
            ) : records.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="fw-semibold">{r.fullname}</div>
                  {(r.phone || r.zalo) && (
                    <div className="text-muted small">
                      {r.phone && <span className="me-2">{r.phone}</span>}
                      {r.zalo && <span>Zalo: {r.zalo}</span>}
                    </div>
                  )}
                </td>
                <td><span className="pro-badge-code">{r.student_code}</span></td>
                <td>{r.class_name || '—'}</td>
                <td>{r.subject_label || '—'}</td>
                <td className="text-danger">{formatMoney(r.tuition_debt)}</td>
                <td className="text-danger">{formatMoney(r.book_debt)}</td>
                <td className="fw-bold text-danger">{formatMoney(r.total_debt)}</td>
                <td>
                  <Badge bg={r.source === 'attendance_dropped' ? 'warning' : 'secondary'} text="dark">
                    {r.source === 'attendance_dropped' ? 'Nghỉ luôn' : 'Xóa tài khoản'}
                  </Badge>
                </td>
                <td>
                  {r.user_id
                    ? <Badge bg="success">Còn tài khoản</Badge>
                    : <Badge bg="secondary">Đã xóa TK</Badge>}
                </td>
                <td>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    disabled={deletingId === r.id}
                    onClick={() => handleDelete(r)}
                  >
                    {deletingId === r.id ? <Spinner size="sm" /> : 'Xóa hồ sơ'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}

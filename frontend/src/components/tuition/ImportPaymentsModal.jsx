import { useState } from 'react';
import { Modal, Form, Button, Alert } from 'react-bootstrap';
import { tuitionService } from '../../services';

export default function ImportPaymentsModal({ show, onHide, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleDownloadTemplate = async () => {
    const res = await tuitionService.downloadPaymentImportTemplate();
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mau-import-thu-tien.xlsx';
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Vui lòng chọn file Excel');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await tuitionService.importPayments(formData);
      setResult(res.data);
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Import thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setError('');
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Import thu tiền hàng loạt</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleImport}>
        <Modal.Body>
          <p className="text-muted small mb-2">
            Ghi nhận thanh toán cho nhiều học viên cùng lúc. Hệ thống tự cập nhật công nợ
            và tạo phiếu thu gửi về tài khoản học viên (nếu đã liên kết).
          </p>
          <ul className="text-muted small">
            <li>Cột bắt buộc: <strong>Mã học viên</strong>, <strong>Số tiền</strong></li>
            <li>Loại thu: Học phí / Sách / Học phí + Sách</li>
            <li>Phương thức: Tiền mặt / Chuyển khoản</li>
            <li>Ngày thu: dd/mm/yyyy — Tháng áp dụng: yyyy-mm</li>
            <li>Quyển số / Số: hiển thị trên phiếu thu (để trống Số → tự sinh)</li>
          </ul>
          <Button variant="outline-secondary" size="sm" className="mb-3" type="button" onClick={handleDownloadTemplate}>
            <i className="bi bi-download me-1" />
            Tải file mẫu
          </Button>
          {error && <Alert variant="danger">{error}</Alert>}
          {result && (
            <Alert variant={result.imported > 0 ? 'success' : 'warning'}>
              {result.message || 'Import hoàn tất'}
              {result.imported > 0 && (
                <div className="mt-1">
                  Đã ghi nhận <strong>{result.imported}</strong> phiếu thu
                  {result.receipts_available > 0 && (
                    <span> — học viên xem tại menu <strong>Phiếu thu</strong></span>
                  )}
                </div>
              )}
              {result.errors?.length > 0 && (
                <ul className="mb-0 mt-2 small">
                  {result.errors.slice(0, 8).map((err, i) => (
                    <li key={i}>Dòng {err.row}: {err.message}</li>
                  ))}
                  {result.errors.length > 8 && (
                    <li>... và {result.errors.length - 8} lỗi khác</li>
                  )}
                </ul>
              )}
            </Alert>
          )}
          <Form.Group>
            <Form.Label>Chọn file Excel</Form.Label>
            <Form.Control
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>Đóng</Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Đang import...' : 'Import thu tiền'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

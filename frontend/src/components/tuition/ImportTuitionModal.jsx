import { useState } from 'react';
import { Modal, Form, Button, Alert } from 'react-bootstrap';
import { tuitionService } from '../../services';

export default function ImportTuitionModal({ show, onHide, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleDownloadTemplate = async () => {
    const res = await tuitionService.downloadImportTemplate();
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mau-import-hoc-phi.xlsx';
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
      const res = await tuitionService.importProfiles(formData);
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
        <Modal.Title>Import danh sách học phí</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleImport}>
        <Modal.Body>
          <p className="text-muted small">
            File Excel cần có cột: Mã học viên, Họ tên, Môn học (Tiếng Anh/Tiếng Trung/Tin học/Tiếng Việt), và các cột học phí.
          </p>
          <Button variant="outline-secondary" size="sm" className="mb-3" type="button" onClick={handleDownloadTemplate}>
            <i className="bi bi-download me-1" />Tải file mẫu
          </Button>
          {error && <Alert variant="danger">{error}</Alert>}
          {result && (
            <Alert variant="success">
              Import xong: {result.imported} mới, {result.updated} cập nhật, {result.skipped} bỏ qua.
              {result.errors?.length > 0 && (
                <ul className="mb-0 mt-2 small">
                  {result.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>Dòng {err.row}: {err.message}</li>
                  ))}
                  {result.errors.length > 5 && <li>... và {result.errors.length - 5} lỗi khác</li>}
                </ul>
              )}
            </Alert>
          )}
          <Form.Group>
            <Form.Label>Chọn file Excel</Form.Label>
            <Form.Control type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>Đóng</Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Đang import...' : 'Import'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

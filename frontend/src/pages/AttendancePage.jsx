import { useEffect, useState } from 'react';
import {
  Table, Badge, Spinner, Form, Modal, Button, Alert, Row, Col,
} from 'react-bootstrap';
import { attendanceService, classService } from '../services';
import { useAuth } from '../context/AuthContext';
import { useCenter } from '../context/CenterContext';
import PageHeader from '../components/layout/PageHeader';

const STATUS_LABELS = {
  present: 'Có mặt',
  absent: 'Vắng',
  late: 'Đi muộn',
  excused: 'Có phép',
};

function currentMonthValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const { centerKey } = useCenter() || {};
  const [reports, setReports] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classFilter, setClassFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState(currentMonthValue());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  const loadReports = () => {
    setLoading(true);
    const params = {};
    if (classFilter) params.class_id = classFilter;
    if (monthFilter) params.month = monthFilter;
    attendanceService.getAll(params)
      .then((res) => setReports(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    classService.getAll().then((res) => {
      const list = res.data || [];
      setClasses(list);
      if (list.length === 1) {
        setClassFilter(String(list[0].id));
      } else {
        setClassFilter('');
      }
    });
  }, [centerKey]);

  useEffect(() => { loadReports(); }, [classFilter, monthFilter]);

  const openDetail = async (sessionId) => {
    const res = await attendanceService.getDetail(sessionId);
    setDetail(res.data);
    setShowDetail(true);
  };

  const handleExportPdf = async () => {
    if (!classFilter) {
      alert('Vui lòng chọn lớp học trước khi xuất PDF');
      return;
    }
    if (!monthFilter) {
      alert('Vui lòng chọn tháng');
      return;
    }
    setExporting(true);
    try {
      const res = await attendanceService.exportMonthlyPdf(classFilter, monthFilter);
      const cls = classes.find((c) => String(c.id) === classFilter);
      const safeName = (cls?.code || cls?.name || 'lop').replace(/[^\w\-]+/g, '_');
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `diem-danh-${safeName}-${monthFilter}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xuất file PDF');
    } finally {
      setExporting(false);
    }
  };

  const canExport = user?.role === 'admin' || user?.role === 'teacher';

  if (loading && reports.length === 0) {
    return <div className="page-container text-center py-5"><Spinner animation="border" /></div>;
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Báo cáo điểm danh"
        subtitle={
          user?.role === 'admin'
            ? 'Tổng hợp kết quả điểm danh do giáo viên gửi từ các lớp học.'
            : 'Theo dõi và xuất báo cáo điểm danh theo lớp và tháng.'
        }
        actions={
          canExport ? (
            <Button
              variant="danger"
              size="sm"
              className="page-header-btn"
              onClick={handleExportPdf}
              disabled={exporting || !classFilter}
            >
              {exporting ? (
                <><Spinner size="sm" className="me-2" />Đang xuất...</>
              ) : (
                <><i className="bi bi-file-earmark-pdf me-1" />Xuất PDF theo tháng</>
              )}
            </Button>
          ) : null
        }
      />

      <Row className="mb-4 g-3">
        <Col md={4}>
          <Form.Label>Lọc theo lớp</Form.Label>
          <Form.Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">Tất cả lớp</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Form.Select>
        </Col>
        <Col md={4}>
          <Form.Label>Lọc theo tháng</Form.Label>
          <Form.Control
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          />
        </Col>
      </Row>

      {canExport && !classFilter && (
        <Alert variant="info" className="py-2 small">
          Chọn lớp học để xuất báo cáo PDF theo tháng.
        </Alert>
      )}

      {reports.length === 0 ? (
        <Alert variant="light">
          Chưa có báo cáo điểm danh nào trong tháng đã chọn.
        </Alert>
      ) : (
        <Table responsive hover className="bg-white shadow-sm rounded">
          <thead className="table-light">
            <tr>
              <th>Ngày học</th>
              <th>Lớp</th>
              <th>Có mặt</th>
              <th>Vắng</th>
              <th>Muộn</th>
              <th>Có phép</th>
              <th>Giáo viên</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.session_date).toLocaleDateString('vi-VN')}</td>
                <td>{r.class_name}</td>
                <td><Badge bg="success">{r.present_count || 0}</Badge></td>
                <td><Badge bg="danger">{r.absent_count || 0}</Badge></td>
                <td><Badge bg="warning" text="dark">{r.late_count || 0}</Badge></td>
                <td><Badge bg="info">{r.excused_count || 0}</Badge></td>
                <td className="small">{r.teacher_name}</td>
                <td>
                  <Button variant="outline-primary" size="sm" onClick={() => openDetail(r.id)}>
                    Chi tiết
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal show={showDetail} onHide={() => setShowDetail(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Chi tiết điểm danh</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detail && (
            <>
              <p className="mb-1">
                <strong>Lớp:</strong> {detail.class_name}
              </p>
              <p className="mb-1">
                <strong>Ngày:</strong>{' '}
                {new Date(detail.session_date).toLocaleDateString('vi-VN')}
              </p>
              <p className="mb-3">
                <strong>Giáo viên:</strong> {detail.teacher_name}
              </p>
              {detail.note && (
                <Alert variant="info" className="py-2">{detail.note}</Alert>
              )}
              <Table responsive size="sm">
                <thead>
                  <tr>
                    <th>Học viên</th>
                    <th>Mã</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.records?.map((r) => (
                    <tr key={r.id}>
                      <td>{r.fullname}</td>
                      <td>{r.code}</td>
                      <td>{STATUS_LABELS[r.status] || r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}

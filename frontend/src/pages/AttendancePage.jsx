import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Spinner, Form, Button, Alert, Row, Col,
} from 'react-bootstrap';
import { attendanceService, classService } from '../services';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/layout/PageHeader';
import FilterPanel from '../components/layout/FilterPanel';
import DataTable from '../components/common/DataTable';
import AttendanceDetailModal from '../components/attendance/AttendanceDetailModal';
import { isSuperAdmin } from '../utils/adminScope';
import LoadingOverlay from '../components/common/LoadingOverlay';
import { preserveScrollDuring } from '../utils/scrollPreserve';

function teacherAccountPath(report) {
  if (report.teacher_role === 'admin') {
    return `/admin-staff?user_id=${report.created_by}`;
  }
  return `/users?class_id=${report.class_id}&user_id=${report.created_by}`;
}

function currentMonthValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classFilter, setClassFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState(currentMonthValue());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  const loadReports = () => {
    const run = async () => {
      setLoading(true);
      const params = {};
      if (classFilter) params.class_id = classFilter;
      if (monthFilter) params.month = monthFilter;
      try {
        const res = await attendanceService.getAll(params);
        setReports(res.data);
      } finally {
        setLoading(false);
      }
    };

    if (reports.length > 0) {
      preserveScrollDuring(run);
    } else {
      run();
    }
  };

  useEffect(() => {
    classService.getAll().then((res) => {
      const list = res.data || [];
      setClasses(list);
      if (list.length === 1) {
        setClassFilter(String(list[0].id));
      }
    });
  }, []);

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
  const superAdmin = isSuperAdmin(user);

  return (
    <div className="page-container module-page">
      <PageHeader
        icon="bi-calendar-check"
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

      <FilterPanel title="Bộ lọc báo cáo">
        <Row className="g-3">
          <Col md={4}>
            <Form.Label className="small fw-semibold">Lọc theo lớp</Form.Label>
            <Form.Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">Tất cả lớp</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Form.Select>
          </Col>
          <Col md={4}>
            <Form.Label className="small fw-semibold">Lọc theo tháng</Form.Label>
            <Form.Control
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
            />
          </Col>
        </Row>
      </FilterPanel>

      {canExport && !classFilter && (
        <Alert variant="info" className="py-2 small mb-0">
          Chọn lớp học để xuất báo cáo PDF theo tháng.
        </Alert>
      )}

      {reports.length === 0 && !loading ? (
        <Alert variant="light" className="mb-0">
          Chưa có báo cáo điểm danh nào trong tháng đã chọn.
        </Alert>
      ) : (
        <LoadingOverlay loading={loading && reports.length === 0} minHeight={280}>
          <DataTable
          className="attendance-history-table"
          title="Danh sách buổi điểm danh"
          icon="bi-list-check"
          count={reports.length}
          loading={loading}
        >
          <thead>
            <tr>
              <th>Ngày học</th>
              <th>Lớp</th>
              <th className="text-center att-stat-col">Có mặt</th>
              <th className="text-center att-stat-col">Vắng</th>
              <th className="text-center att-stat-col">Muộn</th>
              <th className="text-center att-stat-col">Có phép</th>
              <th className="text-center att-stat-col">Nghỉ luôn</th>
              <th>Giáo viên</th>
              <th className="text-end att-actions-col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const counts = [
                { key: 'present', value: r.present_count || 0, tone: 'success' },
                { key: 'absent', value: r.absent_count || 0, tone: 'danger' },
                { key: 'late', value: r.late_count || 0, tone: 'warning' },
                { key: 'excused', value: r.excused_count || 0, tone: 'info' },
                { key: 'dropped', value: r.dropped_count || 0, tone: 'secondary' },
              ];
              return (
                <tr key={r.id}>
                  <td>
                    <span className="att-history-date-main">
                      {new Date(r.session_date).toLocaleDateString('vi-VN')}
                    </span>
                  </td>
                  <td>
                    {superAdmin && r.class_id ? (
                      <Link to={`/classes/${r.class_id}`} className="dash-class-link">
                        {r.class_name}
                      </Link>
                    ) : (
                      r.class_name
                    )}
                  </td>
                  {counts.map((c) => (
                    <td key={c.key} className="text-center att-stat-col">
                      <span
                        className={`pro-history-badge ${c.tone}${c.value === 0 ? ' is-zero' : ''}`}
                      >
                        {c.value}
                      </span>
                    </td>
                  ))}
                  <td>
                    <div className="att-history-teacher">
                      <span className="att-history-teacher-icon" aria-hidden="true">
                        <i className="bi bi-person" />
                      </span>
                      <span className="att-history-teacher-name">
                        {superAdmin && r.created_by ? (
                          <Link to={teacherAccountPath(r)} className="dash-class-link">
                            {r.teacher_name}
                          </Link>
                        ) : (
                          r.teacher_name || '—'
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="text-end att-actions-col">
                    <div className="pro-action-group att-history-actions">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => openDetail(r.id)}
                      >
                        Chi tiết
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        </LoadingOverlay>
      )}

      <AttendanceDetailModal
        show={showDetail}
        onHide={() => setShowDetail(false)}
        detail={detail}
      />
    </div>
  );
}

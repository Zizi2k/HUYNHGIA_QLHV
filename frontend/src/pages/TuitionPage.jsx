import { useEffect, useState } from 'react';
import {
  Nav, Tab, Row, Col, Form, Button, Spinner, Alert, Table, Badge,
} from 'react-bootstrap';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/layout/PageHeader';
import { tuitionService, classService } from '../services';
import TuitionProfileTable from '../components/tuition/TuitionProfileTable';
import DiscountManager from '../components/tuition/DiscountManager';
import PaymentModal from '../components/tuition/PaymentModal';
import ProfileEditModal from '../components/tuition/ProfileEditModal';
import ImportTuitionModal from '../components/tuition/ImportTuitionModal';
import {
  SUBJECT_OPTIONS, STATUS_LABELS, currentMonthValue, formatMoney, subjectLabel,
} from '../components/tuition/tuitionConstants';

export default function TuitionPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('list');

  const [profiles, setProfiles] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [subjectFilter, setSubjectFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showEdit, setShowEdit] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);

  const [reportSubject, setReportSubject] = useState('english');
  const [reportMonth, setReportMonth] = useState(currentMonthValue());
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [periodNote, setPeriodNote] = useState('');
  const [creatingPeriod, setCreatingPeriod] = useState(false);

  const loadProfiles = () => {
    setLoading(true);
    const params = {};
    if (subjectFilter) params.subject = subjectFilter;
    if (classFilter) params.class_id = classFilter;
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;
    tuitionService.getProfiles(params)
      .then((res) => setProfiles(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    tuitionService.getDiscounts().then((res) => setDiscounts(res.data));
    classService.getAll().then((res) => setClasses(res.data));
  }, []);

  useEffect(() => { loadProfiles(); }, [subjectFilter, classFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(loadProfiles, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadReport = () => {
    if (!reportSubject || !reportMonth) return;
    setReportLoading(true);
    tuitionService.getMonthlyReport(reportSubject, reportMonth)
      .then((res) => setReport(res.data))
      .finally(() => setReportLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'report') loadReport();
  }, [activeTab, reportSubject, reportMonth]);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const res = await tuitionService.exportMonthlyPdf(reportSubject, reportMonth);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `hoc-phi-${reportSubject}-${reportMonth}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xuất PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleCreatePeriod = async () => {
    setCreatingPeriod(true);
    try {
      await tuitionService.createPeriod({
        period_month: reportMonth,
        subject: reportSubject,
        title: `Báo cáo ${subjectLabel(reportSubject)} ${reportMonth}`,
        note: periodNote,
      });
      alert('Tạo kỳ báo cáo thành công');
      setPeriodNote('');
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể tạo kỳ báo cáo');
    } finally {
      setCreatingPeriod(false);
    }
  };

  const handleDeleteProfile = async (id) => {
    if (!window.confirm('Xóa hồ sơ học phí này?')) return;
    await tuitionService.deleteProfile(id);
    loadProfiles();
  };

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Quản lý học phí"
        subtitle="Theo dõi học phí, mức giảm giá và báo cáo thu theo tháng."
      />

      <Tab.Container activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'list')}>
        <Nav variant="tabs" className="mb-4 app-nav-tabs-scroll flex-nowrap">
          <Nav.Item><Nav.Link eventKey="list">Danh sách học phí</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="discounts">Mức giảm giá</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="report">Báo cáo tháng</Nav.Link></Nav.Item>
        </Nav>

        <Tab.Content>
          <Tab.Pane eventKey="list">
            <Row className="g-2 mb-3">
              <Col md={2}>
                <Form.Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
                  <option value="">Tất cả môn</option>
                  {SUBJECT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                  <option value="">Tất cả lớp</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Tất cả TT</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={3}>
                <Form.Control
                  type="search"
                  placeholder="Tìm mã HV, tên, SĐT..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Col>
              <Col md={5} className="d-flex gap-2 justify-content-md-end flex-wrap">
                <Button variant="outline-secondary" size="sm" onClick={() => setShowImport(true)}>
                  <i className="bi bi-file-earmark-excel me-1" />Import Excel
                </Button>
                <Button variant="primary" size="sm" onClick={() => { setSelectedProfile(null); setShowEdit(true); }}>
                  <i className="bi bi-plus-lg me-1" />Thêm hồ sơ
                </Button>
              </Col>
            </Row>

            {loading ? (
              <div className="text-center py-5"><Spinner animation="border" /></div>
            ) : (
              <TuitionProfileTable
                profiles={profiles}
                onEdit={(p) => { setSelectedProfile(p); setShowEdit(true); }}
                onPay={(p) => { setSelectedProfile(p); setShowPay(true); }}
                onDelete={handleDeleteProfile}
              />
            )}
          </Tab.Pane>

          <Tab.Pane eventKey="discounts">
            <DiscountManager />
          </Tab.Pane>

          <Tab.Pane eventKey="report">
            <Row className="g-3 mb-4">
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Môn học</Form.Label>
                  <Form.Select value={reportSubject} onChange={(e) => setReportSubject(e.target.value)}>
                    {SUBJECT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Tháng</Form.Label>
                  <Form.Control type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={6} className="d-flex align-items-end gap-2 flex-wrap">
                <Button variant="outline-primary" onClick={loadReport} disabled={reportLoading}>
                  {reportLoading ? 'Đang tải...' : 'Xem báo cáo'}
                </Button>
                <Button variant="success" onClick={handleExportPdf} disabled={exporting}>
                  {exporting ? 'Đang xuất...' : 'Xuất PDF'}
                </Button>
              </Col>
            </Row>

            <Row className="g-3 mb-4">
              <Col md={8}>
                <Form.Control
                  placeholder="Ghi chú kỳ báo cáo (tùy chọn)"
                  value={periodNote}
                  onChange={(e) => setPeriodNote(e.target.value)}
                />
              </Col>
              <Col md={4}>
                <Button variant="outline-secondary" onClick={handleCreatePeriod} disabled={creatingPeriod}>
                  {creatingPeriod ? 'Đang tạo...' : 'Tạo kỳ báo cáo tháng'}
                </Button>
              </Col>
            </Row>

            {report && (
              <>
                <Alert variant="light" className="border">
                  <strong>{report.subject_label}</strong> — {report.month}
                  <span className="ms-3">Tổng HV: {report.summary.total_students}</span>
                  <span className="ms-3">Đóng trong tháng: {report.summary.paid_in_month}</span>
                  <span className="ms-3">Còn nợ: {report.summary.still_in_debt}</span>
                  <span className="ms-3">Thu tháng: {formatMoney(report.summary.month_total)} đ</span>
                </Alert>

                <h6 className="mb-2">Đã đóng trong tháng</h6>
                <Table responsive hover size="sm" className="bg-white shadow-sm rounded mb-4">
                  <thead className="table-light">
                    <tr>
                      <th>Mã HV</th><th>Họ tên</th><th>Lớp</th>
                      <th className="text-end">Đóng tháng</th><th className="text-end">Còn nợ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.students.filter((s) => s.month_paid.total > 0).map((s) => (
                      <tr key={s.id}>
                        <td>{s.student_code}</td>
                        <td>{s.fullname}</td>
                        <td>{s.class_label || '—'}</td>
                        <td className="text-end text-success">{formatMoney(s.month_paid.total)}</td>
                        <td className="text-end">{formatMoney(s.total_debt)}</td>
                      </tr>
                    ))}
                    {report.students.filter((s) => s.month_paid.total > 0).length === 0 && (
                      <tr><td colSpan={5} className="text-center text-muted">Chưa có học viên đóng trong tháng</td></tr>
                    )}
                  </tbody>
                </Table>

                <h6 className="mb-2">Còn công nợ</h6>
                <Table responsive hover size="sm" className="bg-white shadow-sm rounded">
                  <thead className="table-light">
                    <tr>
                      <th>Mã HV</th><th>Họ tên</th><th>Lớp</th>
                      <th className="text-end">HP sau giảm</th><th className="text-end">Phí sách</th>
                      <th className="text-end">Còn nợ</th><th>TT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.students.filter((s) => s.total_debt > 0).map((s) => {
                      const st = STATUS_LABELS[s.status] || STATUS_LABELS.unpaid;
                      return (
                        <tr key={s.id}>
                          <td>{s.student_code}</td>
                          <td>{s.fullname}</td>
                          <td>{s.class_label || '—'}</td>
                          <td className="text-end">{formatMoney(s.fee_after_discount)}</td>
                          <td className="text-end">{formatMoney(s.book_fee)}</td>
                          <td className="text-end text-danger fw-semibold">{formatMoney(s.total_debt)}</td>
                          <td><Badge bg={st.bg}>{st.label}</Badge></td>
                        </tr>
                      );
                    })}
                    {report.students.filter((s) => s.total_debt > 0).length === 0 && (
                      <tr><td colSpan={7} className="text-center text-muted">Không còn công nợ</td></tr>
                    )}
                  </tbody>
                </Table>
              </>
            )}
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>

      <ProfileEditModal
        show={showEdit}
        onHide={() => setShowEdit(false)}
        profile={selectedProfile}
        discounts={discounts}
        onSuccess={loadProfiles}
      />
      <PaymentModal
        show={showPay}
        onHide={() => setShowPay(false)}
        profile={selectedProfile}
        onSuccess={loadProfiles}
      />
      <ImportTuitionModal
        show={showImport}
        onHide={() => setShowImport(false)}
        onSuccess={loadProfiles}
      />
    </div>
  );
}

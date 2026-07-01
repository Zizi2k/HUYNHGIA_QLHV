import { useEffect, useMemo, useState } from 'react';
import {
  Tab, Row, Col, Form, Button, Spinner, Alert, Badge,
} from 'react-bootstrap';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/layout/PageHeader';
import ModuleTabs from '../components/layout/ModuleTabs';
import FilterPanel from '../components/layout/FilterPanel';
import ModuleSection from '../components/layout/ModuleSection';
import { StatCard, StatCardGrid } from '../components/layout/StatCard';
import { tuitionService, classService } from '../services';
import TuitionProfileTable from '../components/tuition/TuitionProfileTable';
import DiscountManager from '../components/tuition/DiscountManager';
import PaymentModal from '../components/tuition/PaymentModal';
import ProfileEditModal from '../components/tuition/ProfileEditModal';
import ImportTuitionModal from '../components/tuition/ImportTuitionModal';
import ReceiptListModal from '../components/tuition/ReceiptListModal';
import { openPaymentReceipt } from '../utils/tuitionReceipt';
import {
  SUBJECT_OPTIONS, STATUS_LABELS, currentMonthValue, formatMoney, subjectLabel,
} from '../components/tuition/tuitionConstants';
import { CODE_PREFIX_OPTIONS } from '../components/students/studentConstants';
import { isScopedUser, lockedCodePrefix, scopeLabel } from '../utils/adminScope';

export default function TuitionPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('list');

  const [profiles, setProfiles] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [subjectFilter, setSubjectFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [codePrefixFilter, setCodePrefixFilter] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const scopedPrefix = lockedCodePrefix(user);
  const scopeLocked = isScopedUser(user);

  const [showEdit, setShowEdit] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [receiptPayments, setReceiptPayments] = useState([]);
  const [showReceipts, setShowReceipts] = useState(false);

  const [reportSubject, setReportSubject] = useState('english');
  const [reportMonth, setReportMonth] = useState(currentMonthValue());
  const [reportClassIds, setReportClassIds] = useState([]);
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
    if (codePrefixFilter) params.code_prefix = codePrefixFilter;
    else if (scopedPrefix) params.code_prefix = scopedPrefix;
    tuitionService.getProfiles(params)
      .then((res) => setProfiles(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    tuitionService.getDiscounts().then((res) => setDiscounts(res.data));
    classService.getAll().then((res) => setClasses(res.data));
  }, []);

  useEffect(() => {
    if (scopedPrefix) setCodePrefixFilter(scopedPrefix);
  }, [scopedPrefix]);

  useEffect(() => { loadProfiles(); }, [subjectFilter, classFilter, statusFilter, codePrefixFilter]);

  useEffect(() => {
    const timer = setTimeout(loadProfiles, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const reportClasses = useMemo(
    () => classes.filter((c) => !c.subject || c.subject === reportSubject),
    [classes, reportSubject]
  );

  const toggleReportClass = (classId) => {
    const id = String(classId);
    setReportClassIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const loadReport = () => {
    if (!reportSubject || !reportMonth) return;
    setReportLoading(true);
    tuitionService.getMonthlyReport(reportSubject, reportMonth, reportClassIds)
      .then((res) => setReport(res.data))
      .finally(() => setReportLoading(false));
  };

  useEffect(() => {
    setReportClassIds((prev) => prev.filter((id) => reportClasses.some((c) => String(c.id) === id)));
  }, [reportSubject, reportClasses]);

  useEffect(() => {
    if (activeTab === 'report') loadReport();
  }, [activeTab, reportSubject, reportMonth, reportClassIds]);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const res = await tuitionService.exportMonthlyPdf(reportSubject, reportMonth, reportClassIds);
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

  const handleViewReceipts = (profile) => {
    setReceiptPayments(profile.payments || []);
    setShowReceipts(true);
  };

  const handleViewReceipt = async (paymentId) => {
    try {
      await openPaymentReceipt(paymentId);
    } catch (err) {
      alert(err.message || 'Không thể mở phiếu thu');
    }
  };

  const tuitionStats = useMemo(() => {
    const totalStudents = profiles.length;
    const totalCollected = profiles.reduce(
      (sum, p) => sum + Number(p.tuition_paid || 0) + Number(p.book_paid || 0),
      0
    );
    const totalDiscount = profiles.reduce(
      (sum, p) => sum + Math.max(0, Number(p.base_fee || 0) - Number(p.fee_after_discount || 0)),
      0
    );
    const totalDue = profiles.reduce(
      (sum, p) => sum + Number(p.fee_after_discount || 0) + Number(p.book_fee || 0),
      0
    );
    const collectionRate = totalDue > 0
      ? `${((totalCollected / totalDue) * 100).toFixed(1)}%`
      : '—';

    return { totalStudents, totalCollected, totalDiscount, collectionRate };
  }, [profiles]);

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-container module-page">
      <PageHeader
        icon="bi-cash-coin"
        title="Quản lý học phí"
        subtitle="Theo dõi học phí, mức giảm giá và báo cáo thu theo tháng."
      />

      <ModuleTabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k || 'list')}
        tabs={[
          { key: 'list', label: 'Danh sách học phí', icon: 'bi-list-ul' },
          { key: 'discounts', label: 'Mức giảm giá', icon: 'bi-percent' },
          { key: 'report', label: 'Báo cáo tháng', icon: 'bi-bar-chart-line' },
        ]}
      >
        <Tab.Pane eventKey="list">
          <FilterPanel
            actions={(
              <>
                <Button variant="outline-primary" onClick={() => setShowImport(true)}>
                  <i className="bi bi-file-earmark-excel me-1" />Import Excel
                </Button>
                <Button variant="primary" onClick={() => { setSelectedProfile(null); setShowEdit(true); }}>
                  <i className="bi bi-plus-lg me-1" />Thêm hồ sơ
                </Button>
              </>
            )}
          >
            <Row className="g-2">
              <Col md={3} lg={2}>
                <Form.Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
                  <option value="">Tất cả môn</option>
                  {SUBJECT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Form.Select>
              </Col>
              <Col md={3} lg={2}>
                <Form.Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                  <option value="">Tất cả lớp</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Form.Select>
              </Col>
              <Col md={3} lg={2}>
                <Form.Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Tất cả TT</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={3} lg={2}>
                {scopeLocked ? (
                  <Form.Control
                    value={scopeLabel(scopedPrefix)}
                    readOnly
                    className="bg-light"
                    title="Phạm vi quản lý của tài khoản"
                  />
                ) : (
                  <Form.Select
                    value={codePrefixFilter}
                    onChange={(e) => setCodePrefixFilter(e.target.value)}
                    title="Lọc theo tiền tố mã học viên"
                  >
                    {CODE_PREFIX_OPTIONS.map((p) => (
                      <option key={p.value || 'all'} value={p.value}>{p.label}</option>
                    ))}
                  </Form.Select>
                )}
              </Col>
              <Col md={6} lg={4}>
                <Form.Control
                  type="search"
                  placeholder="Tìm mã HV, tên, SĐT..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Col>
            </Row>
          </FilterPanel>

          <StatCardGrid>
            <StatCard
              icon="people"
              tone="blue"
              label="Tổng số học sinh"
              value={tuitionStats.totalStudents}
              hint="Theo bộ lọc hiện tại"
            />
            <StatCard
              icon="wallet2"
              tone="green"
              label="Tổng thu học phí"
              value={`${formatMoney(tuitionStats.totalCollected)}đ`}
              hint="HP + sách đã đóng"
            />
            <StatCard
              icon="percent"
              tone="orange"
              label="Tổng giảm giá"
              value={`${formatMoney(tuitionStats.totalDiscount)}đ`}
              hint="Chênh lệch HP ban đầu"
            />
            <StatCard
              icon="graph-up-arrow"
              tone="purple"
              label="Tỉ lệ thu"
              value={tuitionStats.collectionRate}
              hint="So với tổng phí"
            />
          </StatCardGrid>

          {loading ? (
            <div className="text-center py-5"><Spinner animation="border" /></div>
          ) : (
            <TuitionProfileTable
              profiles={profiles}
              onEdit={(p) => { setSelectedProfile(p); setShowEdit(true); }}
              onPay={(p) => { setSelectedProfile(p); setShowPay(true); }}
              onDelete={handleDeleteProfile}
              onViewReceipts={handleViewReceipts}
            />
          )}
        </Tab.Pane>

          <Tab.Pane eventKey="discounts">
            <DiscountManager />
          </Tab.Pane>

          <Tab.Pane eventKey="report">
            <FilterPanel title="Bộ lọc báo cáo">
              <Row className="g-3">
                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Môn học</Form.Label>
                    <Form.Select value={reportSubject} onChange={(e) => setReportSubject(e.target.value)}>
                      {SUBJECT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Tháng</Form.Label>
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
            </FilterPanel>

            <Row className="g-3 mb-4">
              <Col md={8}>
                <Form.Group>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <Form.Label className="mb-0">Lớp báo cáo</Form.Label>
                    <div className="d-flex gap-2">
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0"
                        onClick={() => setReportClassIds(reportClasses.map((c) => String(c.id)))}
                      >
                        Chọn tất cả
                      </Button>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-muted"
                        onClick={() => setReportClassIds([])}
                      >
                        Bỏ chọn
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded p-2 bg-white report-class-picker">
                    {reportClasses.length === 0 ? (
                      <div className="text-muted small py-2">Không có lớp cho môn này</div>
                    ) : (
                      reportClasses.map((c) => (
                        <Form.Check
                          key={c.id}
                          type="checkbox"
                          id={`report-class-${c.id}`}
                          label={c.name}
                          checked={reportClassIds.includes(String(c.id))}
                          onChange={() => toggleReportClass(c.id)}
                          className="mb-1"
                        />
                      ))
                    )}
                  </div>
                  <Form.Text className="text-muted">
                    Không chọn lớp nào = báo cáo tất cả lớp của môn. Chọn một hoặc nhiều lớp để lọc.
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Control
                  placeholder="Ghi chú kỳ báo cáo (tùy chọn)"
                  value={periodNote}
                  onChange={(e) => setPeriodNote(e.target.value)}
                />
                <Button
                  variant="outline-secondary"
                  className="mt-2"
                  onClick={handleCreatePeriod}
                  disabled={creatingPeriod}
                >
                  {creatingPeriod ? 'Đang tạo...' : 'Tạo kỳ báo cáo tháng'}
                </Button>
              </Col>
            </Row>

            {report && (
              <>
                <ModuleSection title="Tổng hợp" icon="bi-clipboard-data" className="mb-3">
                  <Alert variant="light" className="border mb-0">
                    <strong>{report.subject_label}</strong> — {report.month}
                    {report.class_labels?.length > 0 && (
                      <span className="ms-2 text-primary">
                        | Lớp: {report.class_labels.join(', ')}
                      </span>
                    )}
                    {(!report.class_labels || report.class_labels.length === 0) && (
                      <span className="ms-2 text-muted">| Tất cả lớp</span>
                    )}
                    <span className="ms-3">Tổng HV: {report.summary.total_students}</span>
                    <span className="ms-3">Đóng trong tháng: {report.summary.paid_in_month}</span>
                    <span className="ms-3">Còn nợ: {report.summary.still_in_debt}</span>
                    <span className="ms-3">Thu tháng: {formatMoney(report.summary.month_total)} đ</span>
                  </Alert>
                </ModuleSection>

                <ModuleSection title="Đã đóng trong tháng" icon="bi-check-circle" flush className="mb-3">
                  <div className="pro-table-wrap">
                    <table className="pro-table">
                      <thead>
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
                    </table>
                  </div>
                </ModuleSection>

                <ModuleSection title="Còn công nợ" icon="bi-exclamation-triangle" flush>
                  <div className="pro-table-wrap">
                    <table className="pro-table">
                      <thead>
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
                    </table>
                  </div>
                </ModuleSection>
              </>
            )}
          </Tab.Pane>
      </ModuleTabs>

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
      <ReceiptListModal
        show={showReceipts}
        onHide={() => setShowReceipts(false)}
        payments={receiptPayments}
        onViewReceipt={handleViewReceipt}
      />
    </div>
  );
}

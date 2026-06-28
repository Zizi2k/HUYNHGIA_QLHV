import { useEffect, useState } from 'react';
import {
  Row, Col, Form, Button, Spinner, Card, Badge,
} from 'react-bootstrap';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/layout/PageHeader';
import { studentService, classService } from '../services';
import EnrollmentOverviewTable from '../components/students/EnrollmentOverviewTable';
import AddEnrollmentModal from '../components/students/AddEnrollmentModal';
import TransferClassModal from '../components/students/TransferClassModal';
import CourseManager from '../components/students/CourseManager';
import {
  SUBJECT_OPTIONS, ENROLLMENT_STATUS_LABELS, CODE_PREFIX_OPTIONS, subjectLabel,
} from '../components/students/studentConstants';
import { isScopedAdmin, lockedCodePrefix, scopeLabel } from '../utils/adminScope';

const emptySummary = { total: 0, active: 0, expiring: 0, expired: 0 };

export default function StudentsPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [subjectFilter, setSubjectFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [enrollmentFilter, setEnrollmentFilter] = useState('');
  const [codePrefixFilter, setCodePrefixFilter] = useState('');
  const [search, setSearch] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [showCourses, setShowCourses] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [transferStudent, setTransferStudent] = useState(null);

  const scopedPrefix = lockedCodePrefix(user);
  const scopeLocked = isScopedAdmin(user);

  const loadMeta = () => {
    classService.getAll().then((res) => setClasses(res.data));
    studentService.getCourses({ active_only: '1' }).then((res) => setCourses(res.data));
  };

  const loadOverview = () => {
    setLoading(true);
    const params = {};
    if (subjectFilter) params.subject = subjectFilter;
    if (classFilter) params.class_id = classFilter;
    if (enrollmentFilter) params.enrollment_status = enrollmentFilter;
    if (search.trim()) params.search = search.trim();
    if (codePrefixFilter) params.code_prefix = codePrefixFilter;
    else if (scopedPrefix) params.code_prefix = scopedPrefix;

    studentService.getOverview(params)
      .then((res) => {
        setStudents(res.data.students);
        setSummary(res.data.summary || emptySummary);
      })
      .catch(() => {
        setStudents([]);
        setSummary(emptySummary);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (scopedPrefix) setCodePrefixFilter(scopedPrefix);
  }, [scopedPrefix]);

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadOverview();
  }, [subjectFilter, classFilter, enrollmentFilter, codePrefixFilter]);

  useEffect(() => {
    const timer = setTimeout(loadOverview, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleTransfer = (student) => {
    setTransferStudent(student);
  };

  const handleOpenAdd = () => {
    setEditStudent(null);
    setShowAdd(true);
  };

  const handleEdit = (student) => {
    setEditStudent(student);
    setShowAdd(true);
  };

  const subjectCounts = SUBJECT_OPTIONS.map((s) => ({
    ...s,
    count: students.filter((st) => st.subject === s.value).length,
  }));

  const prefixCounts = CODE_PREFIX_OPTIONS.filter((p) => p.value).map((p) => ({
    ...p,
    count: students.filter((st) => st.student_code?.toUpperCase().startsWith(p.value)).length,
  }));

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Quản lý học viên"
        subtitle="Tổng quan học viên theo môn, khóa học, lớp và học phí."
        actions={(
          <div className="d-flex gap-2 flex-wrap">
            <Button variant="outline-secondary" size="sm" onClick={() => setShowCourses(true)}>
              <i className="bi bi-journal-bookmark me-1" />
              Khóa học
            </Button>
            <Button variant="primary" size="sm" onClick={handleOpenAdd}>
              <i className="bi bi-person-plus me-1" />
              Thêm học viên
            </Button>
          </div>
        )}
      />

      <Row className="g-3 mb-4">
        <Col sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="text-muted small">Tổng học viên</div>
              <div className="fs-3 fw-bold">{summary.total}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="text-muted small">Đang học</div>
              <div className="fs-3 fw-bold text-success">{summary.active}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="text-muted small">Sắp kết thúc</div>
              <div className="fs-3 fw-bold text-warning">{summary.expiring}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body>
              <div className="text-muted small">Đã kết thúc</div>
              <div className="fs-3 fw-bold text-secondary">{summary.expired}</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <div className="d-flex flex-wrap gap-2 mb-4">
        {subjectCounts.map((s) => (
          <Badge
            key={s.value}
            bg={subjectFilter === s.value ? 'primary' : 'light'}
            text={subjectFilter === s.value ? 'white' : 'dark'}
            className="px-3 py-2"
            style={{ cursor: 'pointer' }}
            onClick={() => setSubjectFilter(subjectFilter === s.value ? '' : s.value)}
          >
            {s.label}: {s.count}
          </Badge>
        ))}
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        {!scopeLocked && prefixCounts.map((p) => (
          <Badge
            key={p.value}
            bg={codePrefixFilter === p.value ? 'dark' : 'light'}
            text={codePrefixFilter === p.value ? 'white' : 'dark'}
            className="px-3 py-2"
            style={{ cursor: 'pointer' }}
            onClick={() => setCodePrefixFilter(codePrefixFilter === p.value ? '' : p.value)}
          >
            {p.label}: {p.count}
          </Badge>
        ))}
      </div>

      <Row className="g-2 mb-3">
        <Col md={2}>
          {scopeLocked ? (
            <Form.Control value={scopeLabel(scopedPrefix)} readOnly className="bg-light" />
          ) : (
            <Form.Select value={codePrefixFilter} onChange={(e) => setCodePrefixFilter(e.target.value)}>
              {CODE_PREFIX_OPTIONS.map((p) => (
                <option key={p.value || 'all'} value={p.value}>{p.label}</option>
              ))}
            </Form.Select>
          )}
        </Col>
        <Col md={2}>
          <Form.Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <option value="">Tất cả môn</option>
            {SUBJECT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">Tất cả lớp</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={enrollmentFilter} onChange={(e) => setEnrollmentFilter(e.target.value)}>
            <option value="">Tất cả TT khóa</option>
            {Object.entries(ENROLLMENT_STATUS_LABELS).map(([k, v]) => (
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
        <Col md={1} className="d-flex align-items-center">
          <small className="text-muted">
            {subjectFilter ? subjectLabel(subjectFilter) : '4 môn'} · {students.length} HV
          </small>
        </Col>
      </Row>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <EnrollmentOverviewTable
          students={students}
          onEdit={handleEdit}
          onTransfer={handleTransfer}
        />
      )}

      <AddEnrollmentModal
        show={showAdd}
        onHide={() => { setShowAdd(false); setEditStudent(null); }}
        onSuccess={() => { loadOverview(); loadMeta(); }}
        classes={classes}
        courses={courses}
        editStudent={editStudent}
      />

      <TransferClassModal
        show={!!transferStudent}
        onHide={() => setTransferStudent(null)}
        student={transferStudent}
        classes={classes}
        onSuccess={loadOverview}
      />

      <CourseManager
        show={showCourses}
        onHide={() => setShowCourses(false)}
        onChanged={loadMeta}
      />
    </div>
  );
}

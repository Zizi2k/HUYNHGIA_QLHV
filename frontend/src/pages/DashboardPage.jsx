import { useEffect, useState } from 'react';
import { Row, Col, Spinner, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { dashboardService, classService } from '../services';
import { useAuth } from '../context/AuthContext';
import { useCenter } from '../context/CenterContext';
import PageHeader from '../components/layout/PageHeader';
const metricStyles = [
  { icon: 'collection', tone: 'orange', label: 'Số lớp học' },
  { icon: 'journal-text', tone: 'red', label: 'Số bài tập' },
  { icon: 'patch-question', tone: 'green', label: 'Số bài kiểm tra' },
  { icon: 'star', tone: 'blue', label: 'Điểm trung bình' },
];

function MetricBlock({ icon, tone, label, value, hint }) {
  return (
    <div className="dash-metric">
      <div className={`dash-metric-icon tone-${tone}`}>
        <i className={`bi bi-${icon}`} />
      </div>
      <div className="dash-metric-body">
        <div className="dash-metric-label">{label}</div>
        <div className="dash-metric-value">{value}</div>
        {hint && <div className="dash-metric-hint">{hint}</div>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { centerKey, activeCenter } = useCenter() || {};
  const [stats, setStats] = useState(null);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([dashboardService.getStats(), classService.getAll()])
      .then(([statsRes, classesRes]) => {
        setStats(statsRes.data);
        setClasses(classesRes.data.slice(0, 8));
      })
      .finally(() => setLoading(false));
  }, [centerKey]);

  const metrics = [
    stats?.classCount ?? 0,
    stats?.assignmentCount ?? 0,
    stats?.quizCount ?? 0,
    stats?.avgScore || (user?.role === 'student' ? '0' : '—'),
  ];

  if (loading) {
    return (
      <div className="page-container text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Tổng quan"
        subtitle={`Xin chào, ${user?.fullname}! Đây là bảng điều khiển học tập của bạn.`}
        actions={
          <Button as={Link} to="/classes" variant="success" size="sm" className="page-header-btn">
            <i className="bi bi-plus-lg me-1" />
            Xem lớp học
          </Button>
        }
      />

      <div className="dash-card mb-4">
        <div className="dash-card-header">
          <h2 className="dash-card-title">Tổng quan học tập</h2>
        </div>
        <div className="dash-card-body">
          <Row className="g-0 dash-metrics-row">
            {metricStyles.map((m, i) => (
              <Col key={m.label} md={6} lg={3}>
                <MetricBlock
                  icon={m.icon}
                  tone={m.tone}
                  label={m.label}
                  value={metrics[i]}
                />
              </Col>
            ))}
          </Row>
          {user?.role === 'student' && (
            <Row className="g-0 dash-metrics-row border-top mt-2 pt-2">
              <Col md={6}>
                <MetricBlock
                  icon="check-circle"
                  tone="green"
                  label="Bài đã nộp"
                  value={stats?.submittedCount ?? 0}
                />
              </Col>
              <Col md={6}>
                <MetricBlock
                  icon="exclamation-circle"
                  tone="orange"
                  label="Bài còn thiếu"
                  value={stats?.missingCount ?? 0}
                />
              </Col>
            </Row>
          )}
          <div className="text-center mt-4">
            <Button as={Link} to="/classes" variant="dark" size="sm" className="dash-report-btn">
              Xem tất cả lớp học
            </Button>
          </div>
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-header dash-card-header-split">
          <h2 className="dash-card-title">Lớp học của bạn</h2>
          <span className="pro-count-badge">{classes.length}</span>
        </div>
        <div className="pro-table-wrap">
          {classes.length === 0 ? (
            <div className="pro-table-empty">
              <i className="bi bi-collection pro-table-empty-icon" />
              Chưa có lớp học nào.
            </div>
          ) : (
            <table className="pro-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th>Tên lớp</th>
                  <th>Mô tả</th>
                  <th>Thành viên</th>
                  <th style={{ width: 100 }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((cls, idx) => (
                  <tr key={cls.id}>
                    <td>
                      <span className="pro-row-num">{idx + 1}</span>
                    </td>
                    <td>
                      <Link to={`/classes/${cls.id}`} className="dash-class-link">
                        {cls.name}
                      </Link>
                    </td>
                    <td className="text-muted small">
                      {cls.description || '—'}
                    </td>
                    <td>
                      <span className="dash-member-badge">
                        <i className="bi bi-people" />
                        {cls.member_count} thành viên
                      </span>
                    </td>
                    <td>
                      <Button
                        as={Link}
                        to={`/classes/${cls.id}`}
                        variant="dark"
                        size="sm"
                        className="dash-action-btn"
                      >
                        Xem
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

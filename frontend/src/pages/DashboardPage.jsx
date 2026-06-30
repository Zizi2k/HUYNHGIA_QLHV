import { useEffect, useState } from 'react';
import { Spinner, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { dashboardService, classService } from '../services';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/layout/PageHeader';
import { StatCard, StatCardGrid } from '../components/layout/StatCard';
import ModuleSection from '../components/layout/ModuleSection';

const metricStyles = [
  { icon: 'collection', tone: 'orange', label: 'Số lớp học' },
  { icon: 'journal-text', tone: 'red', label: 'Số bài tập' },
  { icon: 'patch-question', tone: 'green', label: 'Số bài kiểm tra' },
  { icon: 'star', tone: 'blue', label: 'Điểm trung bình' },
];

export default function DashboardPage() {
  const { user } = useAuth();
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
  }, []);

  const metrics = [
    stats?.classCount ?? 0,
    stats?.assignmentCount ?? 0,
    stats?.quizCount ?? 0,
    stats?.avgScore || (user?.role === 'student' ? '0' : '—'),
  ];

  if (loading) {
    return (
      <div className="page-container module-page text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <div className="page-container module-page">
      <PageHeader
        icon="bi-speedometer2"
        title="Tổng quan"
        subtitle={`Xin chào, ${user?.fullname}! Đây là bảng điều khiển học tập của bạn.`}
        actions={(
          <Button as={Link} to="/classes" variant="primary" size="sm">
            <i className="bi bi-plus-lg me-1" />
            Xem lớp học
          </Button>
        )}
      />

      <StatCardGrid>
        {metricStyles.map((m, i) => (
          <StatCard
            key={m.label}
            icon={m.icon}
            tone={m.tone}
            label={m.label}
            value={metrics[i]}
          />
        ))}
      </StatCardGrid>

      {user?.role === 'student' && (
        <StatCardGrid>
          <StatCard
            icon="check-circle"
            tone="green"
            label="Bài đã nộp"
            value={stats?.submittedCount ?? 0}
          />
          <StatCard
            icon="exclamation-circle"
            tone="orange"
            label="Bài còn thiếu"
            value={stats?.missingCount ?? 0}
          />
        </StatCardGrid>
      )}

      <ModuleSection
        title="Lớp học của bạn"
        icon="bi-collection"
        count={classes.length}
        flush
      >
        {classes.length === 0 ? (
          <div className="pro-table-empty">
            <i className="bi bi-collection pro-table-empty-icon" />
            Chưa có lớp học nào.
          </div>
        ) : (
          <div className="pro-table-wrap">
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
                        variant="outline-primary"
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
          </div>
        )}
      </ModuleSection>
    </div>
  );
}

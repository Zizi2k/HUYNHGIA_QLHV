import { useEffect, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { dashboardService, classService } from '../services';
import { useAuth } from '../context/AuthContext';

const roleLabel = {
  admin: 'Quản trị viên',
  teacher: 'Giáo viên',
  student: 'Học viên',
};

const metricStyles = [
  { icon: 'collection', tone: 'primary', label: 'Lớp học', key: 'classCount' },
  { icon: 'journal-check', tone: 'danger', label: 'Bài tập', key: 'assignmentCount' },
  { icon: 'patch-question', tone: 'success', label: 'Bài kiểm tra', key: 'quizCount' },
  { icon: 'graph-up-arrow', tone: 'warning', label: 'Điểm trung bình', key: 'avgScore' },
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
        setClasses(classesRes.data.slice(0, 6));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="ls-dashboard-loading">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  const getMetricValue = (key) => {
    if (key === 'avgScore') return stats?.avgScore || (user?.role === 'student' ? '0' : '—');
    return stats?.[key] ?? 0;
  };

  return (
    <div className="ls-dashboard">
      <section className="ls-dashboard-hero">
        <div className="ls-dashboard-hero-copy">
          <span className="ls-dashboard-eyebrow">
            <i className="bi bi-stars" /> Trung tâm Ngoại ngữ - Tin học Huỳnh Gia
          </span>
          <h1>Xin chào, {user?.fullname || 'bạn'}!</h1>
          <p>
            Theo dõi lớp học, bài tập và tiến độ của bạn trong một không gian quản lý hiện đại, trực quan.
          </p>
          <div className="ls-dashboard-hero-actions">
            <Link to="/classes" className="ls-btn ls-btn-primary">
              <i className="bi bi-collection" /> Xem lớp học
            </Link>
            <Link to="/promo" className="ls-btn ls-btn-light">
              <i className="bi bi-mortarboard" /> Khám phá khóa học
            </Link>
          </div>
        </div>
        <div className="ls-dashboard-hero-profile">
          <div className="ls-dashboard-profile-icon">
            <i className="bi bi-mortarboard-fill" />
          </div>
          <div>
            <span>Vai trò hiện tại</span>
            <strong>{roleLabel[user?.role] || user?.role || 'Người dùng'}</strong>
          </div>
        </div>
      </section>

      <section className="ls-dashboard-metrics">
        {metricStyles.map((metric) => (
          <article className="ls-metric-card" key={metric.key}>
            <div className={`ls-metric-icon ls-tone-${metric.tone}`}>
              <i className={`bi bi-${metric.icon}`} />
            </div>
            <div className="ls-metric-copy">
              <span>{metric.label}</span>
              <strong>{getMetricValue(metric.key)}</strong>
              <small>Dữ liệu cập nhật từ hệ thống</small>
            </div>
          </article>
        ))}
      </section>

      {user?.role === 'student' && (
        <section className="ls-student-progress">
          <article className="ls-progress-card success">
            <span className="ls-progress-icon"><i className="bi bi-check2-circle" /></span>
            <div>
              <small>Đã hoàn thành</small>
              <strong>{stats?.submittedCount ?? 0} bài đã nộp</strong>
            </div>
          </article>
          <article className="ls-progress-card warning">
            <span className="ls-progress-icon"><i className="bi bi-clock-history" /></span>
            <div>
              <small>Cần chú ý</small>
              <strong>{stats?.missingCount ?? 0} bài còn thiếu</strong>
            </div>
          </article>
        </section>
      )}

      <section className="ls-dashboard-grid">
        <div className="ls-dashboard-panel ls-dashboard-classes">
          <header className="ls-panel-header">
            <div>
              <span className="ls-panel-kicker">HỌC TẬP</span>
              <h2>Lớp học của bạn</h2>
              <p>Các lớp gần đây được lấy trực tiếp từ dữ liệu hệ thống.</p>
            </div>
            <Link to="/classes" className="ls-panel-link">
              Xem tất cả <i className="bi bi-arrow-right" />
            </Link>
          </header>

          {classes.length === 0 ? (
            <div className="ls-empty-state">
              <span><i className="bi bi-collection" /></span>
              <h3>Chưa có lớp học</h3>
              <p>Khi được thêm vào lớp, thông tin sẽ xuất hiện tại đây.</p>
            </div>
          ) : (
            <div className="ls-class-list">
              {classes.map((cls, index) => (
                <Link to={`/classes/${cls.id}`} className="ls-class-row" key={cls.id}>
                  <div className="ls-class-number">{String(index + 1).padStart(2, '0')}</div>
                  <div className="ls-class-info">
                    <strong>{cls.name}</strong>
                    <span>{cls.description || 'Chưa có mô tả cho lớp học này.'}</span>
                  </div>
                  <div className="ls-class-members">
                    <i className="bi bi-people" />
                    <span>{cls.member_count ?? 0}</span>
                  </div>
                  <span className="ls-class-arrow"><i className="bi bi-chevron-right" /></span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <aside className="ls-dashboard-side">
          <div className="ls-dashboard-panel ls-quick-panel">
            <header className="ls-panel-header compact">
              <div>
                <span className="ls-panel-kicker">TRUY CẬP NHANH</span>
                <h2>Tiện ích</h2>
              </div>
            </header>
            <div className="ls-quick-grid">
              <Link to="/classes" className="ls-quick-item">
                <span><i className="bi bi-collection" /></span>
                <div><strong>Lớp học</strong><small>Xem nội dung học tập</small></div>
              </Link>
              <Link to="/promo" className="ls-quick-item">
                <span><i className="bi bi-mortarboard" /></span>
                <div><strong>Khóa học</strong><small>Khám phá chương trình</small></div>
              </Link>
              {user?.role === 'student' && (
                <Link to="/my-receipts" className="ls-quick-item">
                  <span><i className="bi bi-receipt" /></span>
                  <div><strong>Phiếu thu</strong><small>Theo dõi thanh toán</small></div>
                </Link>
              )}
              {(user?.role === 'teacher' || user?.role === 'admin') && (
                <Link to="/attendance" className="ls-quick-item">
                  <span><i className="bi bi-calendar-check" /></span>
                  <div><strong>Điểm danh</strong><small>Quản lý buổi học</small></div>
                </Link>
              )}
              {user?.role === 'admin' && (
                <Link to="/students" className="ls-quick-item">
                  <span><i className="bi bi-person-lines-fill" /></span>
                  <div><strong>Học viên</strong><small>Quản lý hồ sơ</small></div>
                </Link>
              )}
            </div>
          </div>

          <div className="ls-dashboard-panel ls-ai-card">
            <div className="ls-ai-card-icon"><i className="bi bi-robot" /></div>
            <span>TRỢ LÝ THÔNG MINH</span>
            <h3>AI Huỳnh Gia luôn sẵn sàng</h3>
            <p>Hỏi về khóa học, bài tập và học phí ngay trên hệ thống.</p>
            <small>Bấm nút AI ở góc phải màn hình để bắt đầu.</small>
          </div>
        </aside>
      </section>
    </div>
  );
}

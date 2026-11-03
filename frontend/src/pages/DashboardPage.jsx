import { useEffect, useMemo, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { dashboardService, classService } from '../services';
import { useAuth } from '../context/AuthContext';
import '../styles/dashboard-analytics.css';

const roleName = { admin: 'Quản trị viên', teacher: 'Giáo viên', student: 'Học viên' };

function KpiCard({ label, value, icon, hint }) {
  return (
    <article className="analytics-kpi">
      <div className="analytics-kpi-head"><span>{label}</span><i className={`bi bi-${icon}`} /></div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function Panel({ title, subtitle, children, className = '' }) {
  return (
    <section className={`analytics-panel ${className}`}>
      <header className="analytics-panel-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      </header>
      <div className="analytics-panel-body">{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([dashboardService.getStats(), classService.getAll()])
      .then(([statsRes, classesRes]) => {
        setStats(statsRes.data || {});
        setClasses((classesRes.data || []).slice(0, 8));
      })
      .finally(() => setLoading(false));
  }, []);

  const maxMembers = useMemo(() => Math.max(1, ...classes.map((item) => Number(item.member_count) || 0)), [classes]);
  const totalMembers = useMemo(() => classes.reduce((sum, item) => sum + (Number(item.member_count) || 0), 0), [classes]);
  const submitted = Number(stats?.submittedCount) || 0;
  const missing = Number(stats?.missingCount) || 0;
  const submissionTotal = submitted + missing;
  const submittedRate = submissionTotal ? Math.round((submitted / submissionTotal) * 100) : 0;

  if (loading) return <div className="analytics-loading"><Spinner animation="border" variant="primary" /></div>;

  const kpis = [
    { label: 'Lớp học', value: stats?.classCount ?? 0, icon: 'collection', hint: 'Đang hiển thị theo quyền tài khoản' },
    { label: 'Bài tập', value: stats?.assignmentCount ?? 0, icon: 'journal-check', hint: 'Tổng bài tập trong hệ thống của bạn' },
    { label: 'Bài kiểm tra', value: stats?.quizCount ?? 0, icon: 'patch-question', hint: 'Quiz thuộc các lớp được truy cập' },
    { label: user?.role === 'student' ? 'Điểm trung bình' : 'Thành viên lớp', value: user?.role === 'student' ? (stats?.avgScore || '0') : totalMembers, icon: 'graph-up-arrow', hint: user?.role === 'student' ? 'Kết quả học tập hiện tại' : 'Tổng lượt thành viên ở các lớp gần đây' },
  ];

  return (
    <div className="analytics-dashboard">
      <header className="analytics-titlebar">
        <div>
          <span className="analytics-eyebrow">HUỲNH GIA • DASHBOARD</span>
          <h1>Tổng quan hoạt động</h1>
          <p>Xin chào <strong>{user?.fullname}</strong> · {roleName[user?.role] || user?.role}</p>
        </div>
        <Link to="/classes" className="analytics-primary-action"><i className="bi bi-grid" /> Xem lớp học</Link>
      </header>

      <div className="analytics-kpi-grid">{kpis.map((item) => <KpiCard key={item.label} {...item} />)}</div>

      <div className="analytics-grid analytics-grid-top">
        <Panel title="Quy mô lớp học" subtitle="Số thành viên của các lớp gần đây" className="analytics-span-2">
          {classes.length === 0 ? <div className="analytics-empty">Chưa có dữ liệu lớp học.</div> : (
            <div className="analytics-bars">
              {classes.slice(0, 6).map((cls) => {
                const count = Number(cls.member_count) || 0;
                return <div className="analytics-bar-row" key={cls.id}>
                  <Link to={`/classes/${cls.id}`} title={cls.name}>{cls.name}</Link>
                  <div className="analytics-bar-track"><span style={{ width: `${Math.max(4, (count / maxMembers) * 100)}%` }} /></div>
                  <strong>{count}</strong>
                </div>;
              })}
            </div>
          )}
        </Panel>

        <Panel title="Cơ cấu nội dung" subtitle="Bài tập và bài kiểm tra">
          <div className="analytics-donut-wrap">
            <div className="analytics-donut" style={{ '--assignment': `${Math.round(((Number(stats?.assignmentCount) || 0) / Math.max(1, (Number(stats?.assignmentCount) || 0) + (Number(stats?.quizCount) || 0))) * 100)}%` }}>
              <div><strong>{(Number(stats?.assignmentCount) || 0) + (Number(stats?.quizCount) || 0)}</strong><span>Nội dung</span></div>
            </div>
            <div className="analytics-legend">
              <span><i className="legend-blue" /> Bài tập <strong>{stats?.assignmentCount ?? 0}</strong></span>
              <span><i className="legend-cyan" /> Kiểm tra <strong>{stats?.quizCount ?? 0}</strong></span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="analytics-grid">
        {user?.role === 'student' ? (
          <Panel title="Tiến độ nộp bài" subtitle="Theo dữ liệu bài tập hiện tại">
            <div className="analytics-progress-summary"><strong>{submittedRate}%</strong><span>đã hoàn thành</span></div>
            <div className="analytics-progress"><span style={{ width: `${submittedRate}%` }} /></div>
            <div className="analytics-mini-stats"><span><b>{submitted}</b> Đã nộp</span><span><b>{missing}</b> Còn thiếu</span></div>
          </Panel>
        ) : (
          <Panel title="Mật độ lớp học" subtitle="So sánh nhanh quy mô các lớp">
            <div className="analytics-column-chart">
              {classes.slice(0, 7).map((cls) => {
                const count = Number(cls.member_count) || 0;
                return <div className="analytics-column-item" key={cls.id} title={`${cls.name}: ${count} thành viên`}>
                  <span className="analytics-column-value">{count}</span>
                  <div className="analytics-column"><i style={{ height: `${Math.max(8, (count / maxMembers) * 100)}%` }} /></div>
                  <small>{cls.name}</small>
                </div>;
              })}
            </div>
          </Panel>
        )}

        <Panel title="Chỉ số nhanh" subtitle="Tổng hợp dữ liệu hiện có">
          <div className="analytics-score-list">
            <div><span>Lớp đang theo dõi</span><strong>{classes.length}</strong></div>
            <div><span>Tổng lượt thành viên</span><strong>{totalMembers}</strong></div>
            <div><span>Bài tập / Kiểm tra</span><strong>{stats?.assignmentCount ?? 0} / {stats?.quizCount ?? 0}</strong></div>
            {user?.role === 'student' && <div><span>Điểm trung bình</span><strong>{stats?.avgScore || '0'}</strong></div>}
          </div>
        </Panel>
      </div>

      <Panel title="Lớp học gần đây" subtitle="Truy cập nhanh các lớp thuộc phạm vi tài khoản" className="analytics-table-panel">
        {classes.length === 0 ? <div className="analytics-empty">Chưa có lớp học nào.</div> : (
          <div className="table-responsive">
            <table className="analytics-table">
              <thead><tr><th>#</th><th>Tên lớp</th><th>Mô tả</th><th>Thành viên</th><th></th></tr></thead>
              <tbody>{classes.map((cls, index) => <tr key={cls.id}>
                <td>{String(index + 1).padStart(2, '0')}</td>
                <td><Link to={`/classes/${cls.id}`}>{cls.name}</Link></td>
                <td>{cls.description || '—'}</td>
                <td><span className="analytics-member"><i className="bi bi-people" /> {cls.member_count ?? 0}</span></td>
                <td><Link className="analytics-view" to={`/classes/${cls.id}`}>Xem <i className="bi bi-arrow-right" /></Link></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

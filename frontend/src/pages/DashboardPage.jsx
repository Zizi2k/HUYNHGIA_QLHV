import { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { dashboardService, classService } from '../services';
import { useAuth } from '../context/AuthContext';

function StatCard({ icon, label, value, color }) {
  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Body className="d-flex align-items-center gap-3">
        <div className={`rounded-circle bg-${color} bg-opacity-10 p-3`}>
          <i className={`bi bi-${icon} text-${color} fs-4`} />
        </div>
        <div>
          <div className="text-muted small">{label}</div>
          <div className="fs-3 fw-bold">{value}</div>
        </div>
      </Card.Body>
    </Card>
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
        setStats(statsRes.data);
        setClasses(classesRes.data.slice(0, 4));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  return (
    <Container>
      <h2 className="mb-4">Xin chào, {user?.fullname}!</h2>

      <Row className="g-3 mb-4">
        <Col md={3}>
          <StatCard icon="collection" label="Số lớp học" value={stats?.classCount || 0} color="primary" />
        </Col>
        <Col md={3}>
          <StatCard icon="journal-text" label="Số bài tập" value={stats?.assignmentCount || 0} color="success" />
        </Col>
        <Col md={3}>
          <StatCard icon="patch-question" label="Số bài kiểm tra" value={stats?.quizCount || 0} color="warning" />
        </Col>
        <Col md={3}>
          <StatCard
            icon="star"
            label="Điểm trung bình"
            value={stats?.avgScore || (user?.role === 'student' ? '0' : '-')}
            color="danger"
          />
        </Col>
      </Row>

      {user?.role === 'student' && (
        <Row className="g-3 mb-4">
          <Col md={6}>
            <StatCard icon="check-circle" label="Bài đã nộp" value={stats?.submittedCount || 0} color="success" />
          </Col>
          <Col md={6}>
            <StatCard icon="exclamation-circle" label="Bài còn thiếu" value={stats?.missingCount || 0} color="warning" />
          </Col>
        </Row>
      )}

      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white fw-bold">Lớp học của bạn</Card.Header>
        <Card.Body>
          {classes.length === 0 ? (
            <p className="text-muted mb-0">Chưa có lớp học nào.</p>
          ) : (
            <Row className="g-3">
              {classes.map((cls) => (
                <Col md={6} key={cls.id}>
                  <Card as={Link} to={`/classes/${cls.id}`} className="text-decoration-none h-100 border">
                    <Card.Body>
                      <h5 className="text-primary">{cls.name}</h5>
                      <p className="text-muted small mb-1">{cls.description}</p>
                      <span className="badge bg-light text-dark">
                        <i className="bi bi-people me-1" />
                        {cls.member_count} thành viên
                      </span>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
}

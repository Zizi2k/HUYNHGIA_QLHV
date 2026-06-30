import { useEffect, useMemo, useState } from 'react';
import { Spinner, Alert, Form, Row, Col } from 'react-bootstrap';
import { dashboardService, classService } from '../services';
import PageHeader from '../components/layout/PageHeader';
import HonorStudentFrame from '../components/honor/HonorStudentFrame';
import UserAvatar from '../components/UserAvatar';

export default function HonorPage() {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [honorList, setHonorList] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingHonor, setLoadingHonor] = useState(false);

  useEffect(() => {
    classService.getAll()
      .then((res) => {
        const list = res.data || [];
        setClasses(list);
        if (list.length === 1) {
          setSelectedClassId(String(list[0].id));
        }
      })
      .finally(() => setLoadingClasses(false));
  }, []);

  useEffect(() => {
    if (!selectedClassId) {
      setHonorList([]);
      return;
    }
    setLoadingHonor(true);
    dashboardService.getHonorBoard(selectedClassId)
      .then((res) => setHonorList(res.data || []))
      .finally(() => setLoadingHonor(false));
  }, [selectedClassId]);

  const selectedClass = classes.find((c) => String(c.id) === selectedClassId);

  const { topThree, rest } = useMemo(() => {
    const top1 = honorList[0] || null;
    const top2 = honorList[1] || null;
    const top3 = honorList[2] || null;
    return {
      topThree: { first: top1, second: top2, third: top3 },
      rest: honorList.slice(3),
    };
  }, [honorList]);

  if (loadingClasses) {
    return <div className="page-container text-center py-5"><Spinner animation="border" /></div>;
  }

  return (
    <div className="page-container honor-page">
      <PageHeader
        title="Bảng vinh danh"
        subtitle="Xếp hạng học viên theo điểm trung bình bài tập và bài kiểm tra."
      />

      <Row className="mb-4">
        <Col md={5} lg={4}>
          <Form.Group>
            <Form.Label className="fw-semibold">Chọn lớp học</Form.Label>
            <Form.Select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="">-- Chọn lớp để xem bảng vinh danh --</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}{cls.code ? ` (${cls.code})` : ''}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      {!selectedClassId ? (
        <Alert variant="light" className="text-center py-4">
          <i className="bi bi-trophy d-block fs-3 text-muted mb-2" />
          Vui lòng chọn lớp học để xem bảng vinh danh.
        </Alert>
      ) : loadingHonor ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : honorList.length === 0 ? (
        <Alert variant="light">
          Lớp <strong>{selectedClass?.name}</strong> chưa có học viên nào được chấm điểm.
        </Alert>
      ) : (
        <div className="honor-board">
          <header className="honor-board-header">
            <div className="honor-board-header-accent honor-board-header-accent--left" />
            <div className="honor-board-header-accent honor-board-header-accent--right" />
            <div className="honor-board-header-inner">
              <img src="/logo-navbar.png" alt="LHG" className="honor-board-logo" />
              <h1 className="honor-board-title">VINH DANH</h1>
              <div className="honor-board-banner">
                <span className="honor-board-banner-main">{selectedClass?.name}</span>
                {selectedClass?.code && (
                  <span className="honor-board-banner-sub">{selectedClass.code}</span>
                )}
              </div>
            </div>
          </header>

          <div className="honor-board-body">
            <section className="honor-podium" aria-label="Top học viên">
              <div className="honor-podium-main">
                <div className="honor-podium-slot honor-podium-slot--second">
                  <HonorStudentFrame student={topThree.second} rank={2} size="lg" />
                </div>
                <div className="honor-podium-slot honor-podium-slot--first">
                  <HonorStudentFrame student={topThree.first} rank={1} size="xl" />
                </div>
                <div className="honor-podium-slot honor-podium-slot--third">
                  <HonorStudentFrame student={topThree.third} rank={3} size="lg" />
                </div>
              </div>
            </section>

            {rest.length > 0 && (
              <section className="honor-rank-list" aria-label="Các thứ hạng tiếp theo">
                <h2 className="honor-rank-list-title">
                  <i className="bi bi-list-ol me-2" />
                  Thứ hạng tiếp theo
                </h2>
                <ul className="honor-rank-list-items">
                  {rest.map((student, idx) => {
                    const rank = idx + 4;
                    return (
                      <li key={student.id} className="honor-rank-list-item">
                        <span className="honor-rank-list-rank">{rank}</span>
                        <UserAvatar user={student} size={44} />
                        <div className="honor-rank-list-info">
                          <span className="honor-rank-list-name">{student.fullname}</span>
                          {student.code && (
                            <span className="honor-rank-list-code">{student.code}</span>
                          )}
                        </div>
                        <div className="honor-rank-list-score">
                          <strong>{student.avg_score}</strong>
                          <small>{student.graded_count} bài</small>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {honorList.length > 0 && honorList.length <= 3 && (
              <p className="honor-board-note text-muted small text-center mb-0 mt-3">
                Hiển thị top {honorList.length} học viên có điểm trong lớp.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

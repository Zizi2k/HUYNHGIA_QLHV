import { useEffect, useState } from 'react';
import { Table, Spinner, Badge, Alert, Form, Row, Col } from 'react-bootstrap';
import { dashboardService, classService } from '../services';
import PageHeader from '../components/layout/PageHeader';

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
      .then((res) => setHonorList(res.data))
      .finally(() => setLoadingHonor(false));
  }, [selectedClassId]);

  if (loadingClasses) {
    return <div className="page-container text-center py-5"><Spinner animation="border" /></div>;
  }

  const selectedClass = classes.find((c) => String(c.id) === selectedClassId);

  return (
    <div className="page-container">
      <PageHeader
        title="Bảng vinh danh"
        subtitle="Xếp hạng học viên trong lớp theo điểm trung bình từ bài tập và bài kiểm tra trắc nghiệm."
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
          Vui lòng chọn lớp học để xem bảng vinh danh học viên trong lớp.
        </Alert>
      ) : loadingHonor ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <>
          <div className="mb-3 text-muted small">
            Lớp: <strong>{selectedClass?.name}</strong>
          </div>

          {honorList.length === 0 ? (
            <Alert variant="light">
              Lớp này chưa có học viên nào được chấm điểm bài tập hoặc bài kiểm tra.
            </Alert>
          ) : (
            <Table responsive hover className="bg-white shadow-sm rounded">
              <thead className="table-light">
                <tr>
                  <th>Thứ hạng</th>
                  <th>Học sinh</th>
                  <th>Điểm TB</th>
                  <th>Số bài đã chấm</th>
                </tr>
              </thead>
              <tbody>
                {honorList.map((item, idx) => (
                  <tr key={item.id}>
                    <td>
                      {idx < 3 ? (
                        <Badge bg={idx === 0 ? 'warning' : idx === 1 ? 'secondary' : 'danger'}>
                          {idx + 1}
                        </Badge>
                      ) : idx + 1}
                    </td>
                    <td className="fw-semibold">{item.fullname}</td>
                    <td className="fw-bold text-primary">{item.avg_score}</td>
                    <td>{item.graded_count}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import {
  Button, Modal, Alert, Spinner, Badge, Table, Form,
} from 'react-bootstrap';
import { classService } from '../../services';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ClassGradeTools({ classId, className }) {
  const [showReminder, setShowReminder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [search, setSearch] = useState('');

  const openReminder = async () => {
    setShowReminder(true);
    setLoading(true);
    setError('');
    setSearch('');
    try {
      const res = await classService.getPendingWork(classId);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách nhắc nhở');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const res = await classService.exportGradesExcel(classId);
      const safeName = (className || 'lop').replace(/[^\w\-]+/g, '_').slice(0, 40);
      downloadBlob(res.data, `bang-diem-${safeName}.xlsx`);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xuất file Excel');
    } finally {
      setExporting(false);
    }
  };

  const copyReminder = async (student) => {
    try {
      await navigator.clipboard.writeText(student.reminder_text);
      setCopiedId(student.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert('Không thể sao chép. Vui lòng chọn và copy thủ công.');
    }
  };

  const copyAllReminders = async () => {
    if (!filteredStudents.length) return;
    const text = filteredStudents.map((s) => s.reminder_text).join('\n\n---\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId('all');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert('Không thể sao chép.');
    }
  };

  const students = data?.students || [];
  const filteredStudents = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.fullname?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="border rounded-3 bg-white shadow-sm p-3 mb-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <div>
            <div className="fw-semibold">
              <i className="bi bi-bar-chart-line me-1 text-primary" />
              Theo dõi bài tập &amp; điểm
            </div>
            <div className="text-muted small">
              Nhắc học sinh chưa làm bài và xuất bảng điểm Excel của lớp
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Button variant="warning" onClick={openReminder}>
              <i className="bi bi-bell me-1" />
              Nhắc học sinh chưa làm
            </Button>
            <Button variant="success" onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <><Spinner size="sm" className="me-1" />Đang xuất...</>
              ) : (
                <><i className="bi bi-file-earmark-excel me-1" />Xuất Excel điểm</>
              )}
            </Button>
          </div>
        </div>
      </div>

      <Modal show={showReminder} onHide={() => setShowReminder(false)} size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Nhắc học sinh chưa hoàn thành bài</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}

          {loading ? (
            <div className="text-center py-4"><Spinner animation="border" /></div>
          ) : data ? (
            <>
              <Alert variant="light" className="py-2">
                <strong>{data.summary?.students_with_pending || 0}</strong> học sinh còn{' '}
                <strong>{data.summary?.total_pending_items || 0}</strong> bài tập/kiểm tra chưa hoàn thành
                {data.class?.subject_label && (
                  <span className="text-muted"> — Môn: {data.class.subject_label}</span>
                )}
              </Alert>

              {students.length === 0 ? (
                <Alert variant="success" className="mb-0">
                  Tất cả học sinh đã hoàn thành các bài được giao trong lớp.
                </Alert>
              ) : (
                <>
                  <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                    <Form.Control
                      type="search"
                      size="sm"
                      placeholder="Tìm học sinh..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{ maxWidth: 240 }}
                    />
                    <Button variant="outline-primary" size="sm" onClick={copyAllReminders}>
                      <i className="bi bi-clipboard me-1" />
                      {copiedId === 'all' ? 'Đã copy!' : 'Copy tất cả'}
                    </Button>
                  </div>

                  <Table responsive hover className="mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Học sinh</th>
                        <th>Chưa hoàn thành</th>
                        <th style={{ width: 120 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student) => (
                        <tr key={student.id}>
                          <td>
                            <div className="fw-semibold">{student.fullname}</div>
                            <div className="text-muted small">{student.code}</div>
                            {(student.phone || student.zalo) && (
                              <div className="text-muted small">
                                {student.phone && <span className="me-2">SĐT: {student.phone}</span>}
                                {student.zalo && <span>Zalo: {student.zalo}</span>}
                              </div>
                            )}
                          </td>
                          <td>
                            {student.pending.map((item) => (
                              <Badge
                                key={`${item.type}-${item.id}`}
                                bg={item.type === 'assignment' ? 'warning' : 'info'}
                                text={item.type === 'assignment' ? 'dark' : undefined}
                                className="me-1 mb-1"
                              >
                                {item.type === 'assignment' ? 'BT' : 'KT'}: {item.title}
                              </Badge>
                            ))}
                          </td>
                          <td>
                            <Button
                              variant="outline-secondary"
                              size="sm"
                              onClick={() => copyReminder(student)}
                            >
                              <i className="bi bi-clipboard me-1" />
                              {copiedId === student.id ? 'Đã copy' : 'Copy'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
            </>
          ) : null}
        </Modal.Body>
      </Modal>
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, Form, Alert, Card, Spinner, Badge,
} from 'react-bootstrap';
import { attendanceService } from '../../services';
import DataTable, { DataTableEmpty } from '../common/DataTable';
import LoadingOverlay from '../common/LoadingOverlay';
import { useSoftLoading } from '../../hooks/useSoftLoading';
import TeacherSchedulePanel from './TeacherSchedulePanel';

const STATUS_OPTIONS = [
  { value: 'present', label: 'Có mặt', icon: 'bi-check-circle-fill' },
  { value: 'absent', label: 'Vắng', icon: 'bi-x-circle-fill' },
  { value: 'late', label: 'Đi muộn', icon: 'bi-clock-fill' },
  { value: 'excused', label: 'Có phép', icon: 'bi-info-circle-fill' },
  { value: 'dropped', label: 'Nghỉ luôn', icon: 'bi-person-x-fill' },
];

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

function avatarColor(id) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

export default function ClassAttendanceTab({
  classId, students, isTeacher, isStudent, currentUserId,
}) {
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [records, setRecords] = useState({});
  const [history, setHistory] = useState([]);
  const [editingExisting, setEditingExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showInitialSpinner, showOverlay } = useSoftLoading(loading);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const formRef = useRef(null);

  const stats = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0, dropped: 0 };
    students.forEach((s) => {
      const status = records[s.id] || 'present';
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [students, records]);

  const loadHistory = () => {
    attendanceService.getByClass(classId)
      .then((res) => setHistory(res.data))
      .finally(() => setLoading(false));
  };

  const loadDateRecords = async (date) => {
    if (!isTeacher) return;
    try {
      const res = await attendanceService.getByDate(classId, date);
      if (res.data?.records) {
        const map = {};
        res.data.records.forEach((r) => { map[r.student_id] = r.status; });
        setRecords(map);
        setNote(res.data.note || '');
        setEditingExisting(true);
      } else {
        const map = {};
        students.forEach((s) => { map[s.id] = 'present'; });
        setRecords(map);
        setNote('');
        setEditingExisting(false);
      }
    } catch {
      const map = {};
      students.forEach((s) => { map[s.id] = 'present'; });
      setRecords(map);
      setEditingExisting(false);
    }
  };

  useEffect(() => { loadHistory(); }, [classId]);

  useEffect(() => {
    if (students.length > 0 && isTeacher) loadDateRecords(sessionDate);
  }, [sessionDate, students, isTeacher]);

  const setAllStatus = (status) => {
    const map = {};
    students.forEach((s) => { map[s.id] = status; });
    setRecords(map);
  };

  const openHistoryDate = (dateStr) => {
    const normalized = String(dateStr).slice(0, 10);
    setSessionDate(normalized);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (students.length === 0) {
      setError('Lớp chưa có học viên. Hãy thêm học viên trước khi điểm danh.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        class_id: parseInt(classId, 10),
        session_date: sessionDate,
        note,
        records: students.map((s) => ({
          student_id: s.id,
          status: records[s.id] || 'present',
        })),
      };
      const res = await attendanceService.submit(payload);
      setMessage(res.data.message);
      setEditingExisting(true);
      loadHistory();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Không thể lưu điểm danh');
    } finally {
      setSaving(false);
    }
  };

  if (showInitialSpinner) {
    return <div className="text-center py-4"><Spinner animation="border" /></div>;
  }

  return (
    <LoadingOverlay loading={showOverlay}>
    <div>
      <TeacherSchedulePanel
        classId={classId}
        isTeacher={isTeacher}
        isStudent={isStudent}
        currentUserId={currentUserId}
      />

      {isTeacher && (
        <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: 12, overflow: 'hidden' }} ref={formRef}>
          <div className="pro-card-header">
            <h5 className="pro-card-header-title">
              <i className="bi bi-calendar-check me-2" />
              Điểm danh theo ngày
            </h5>
            {students.length > 0 && (
              <span className="text-muted small">
                <i className="bi bi-people me-1" />
                {students.length} học viên
              </span>
            )}
          </div>

          <Card.Body className="p-0">
            {message && <Alert variant="success" className="m-3 mb-0 py-2">{message}</Alert>}
            {error && <Alert variant="danger" className="m-3 mb-0 py-2">{error}</Alert>}

            {students.length === 0 ? (
              <div className="p-3">
                <Alert variant="warning" className="mb-0">
                  Chưa có học viên trong lớp. Vào tab <strong>Thành viên</strong> để thêm học viên.
                </Alert>
              </div>
            ) : (
              <Form onSubmit={handleSubmit}>
                <div className="pro-toolbar">
                  <div className="pro-toolbar-field">
                    <label>Ngày học</label>
                    <Form.Control
                      type="date"
                      value={sessionDate}
                      onChange={(e) => setSessionDate(e.target.value)}
                      required
                      style={{ maxWidth: 180 }}
                    />
                  </div>
                  <div className="pro-toolbar-field flex-grow-1">
                    <label>Ghi chú</label>
                    <Form.Control
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Buổi 1, Buổi 2..."
                    />
                  </div>
                  <div className="d-flex flex-wrap gap-2 ms-auto align-self-end">
                    <Button
                      type="button"
                      variant="outline-success"
                      size="sm"
                      onClick={() => setAllStatus('present')}
                    >
                      <i className="bi bi-check-all me-1" />
                      Tất cả có mặt
                    </Button>
                    <Button
                      type="button"
                      variant="outline-danger"
                      size="sm"
                      onClick={() => setAllStatus('absent')}
                    >
                      <i className="bi bi-x-lg me-1" />
                      Tất cả vắng
                    </Button>
                  </div>
                </div>

                {editingExisting && (
                  <Alert variant="info" className="mx-3 mt-3 mb-0 py-2 small">
                    <i className="bi bi-pencil-square me-1" />
                    Đang chỉnh sửa điểm danh ngày{' '}
                    <strong>{new Date(sessionDate).toLocaleDateString('vi-VN')}</strong>.
                    Thay đổi và bấm <strong>Lưu điểm danh</strong> để cập nhật.
                  </Alert>
                )}

                <div className="px-3 py-2 d-flex flex-wrap gap-2 border-bottom">
                  {STATUS_OPTIONS.map((opt) => (
                    <span key={opt.value} className={`pro-stat-chip ${opt.value}`}>
                      <i className={`bi ${opt.icon}`} />
                      {opt.label}: {stats[opt.value] || 0}
                    </span>
                  ))}
                </div>

                <DataTable className="flat">
                  <thead>
                    <tr>
                      <th style={{ width: 56 }}>#</th>
                      <th>Học viên</th>
                      <th style={{ width: 120 }}>Mã HV</th>
                      <th style={{ width: 180 }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, idx) => {
                      const status = records[s.id] || 'present';
                      return (
                        <tr key={s.id}>
                          <td><span className="pro-row-num">{idx + 1}</span></td>
                          <td>
                            <div className="pro-student-cell">
                              <span
                                className="pro-avatar"
                                style={{ background: avatarColor(s.id) }}
                              >
                                {getInitials(s.fullname)}
                              </span>
                              <span className="pro-student-name">{s.fullname}</span>
                            </div>
                          </td>
                          <td><span className="pro-badge-code">{s.code}</span></td>
                          <td>
                            <Form.Select
                              size="sm"
                              className={`pro-status-select ${status}`}
                              value={status}
                              onChange={(e) => setRecords({ ...records, [s.id]: e.target.value })}
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </Form.Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>

                <div className="p-3 border-top bg-light">
                  <Button type="submit" variant="primary" disabled={saving} className="px-4">
                    {saving ? (
                      <><Spinner size="sm" className="me-2" />Đang lưu...</>
                    ) : (
                      <><i className="bi bi-save me-2" />{editingExisting ? 'Lưu điểm danh lại' : 'Lưu điểm danh'}</>
                    )}
                  </Button>
                </div>
              </Form>
            )}
          </Card.Body>
        </Card>
      )}

      <div className="pro-section-header">
        <h6 className="pro-section-title">Lịch sử điểm danh</h6>
        {history.length > 0 && (
          <span className="pro-count-badge">{history.length}</span>
        )}
      </div>

      {history.length === 0 ? (
        <DataTable>
          <tbody>
            <tr>
              <td className="p-0">
                <DataTableEmpty
                  icon="bi-calendar-x"
                  message="Chưa có buổi điểm danh nào"
                  hint="Lưu điểm danh đầu tiên để xem lịch sử tại đây"
                />
              </td>
            </tr>
          </tbody>
        </DataTable>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Ngày</th>
              <th className="text-center">Có mặt</th>
              <th className="text-center">Vắng</th>
              <th className="text-center">Muộn</th>
              <th className="text-center">Có phép</th>
              <th className="text-center">Nghỉ luôn</th>
              <th>Người điểm danh</th>
              {isTeacher && <th style={{ width: 100 }}></th>}
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>
                  <span className="fw-semibold text-dark">
                    {new Date(h.session_date).toLocaleDateString('vi-VN', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </span>
                  {h.note && (
                    <div className="text-muted small">{h.note}</div>
                  )}
                </td>
                <td className="text-center">
                  <span className="pro-history-badge success">{h.present_count || 0}</span>
                </td>
                <td className="text-center">
                  <span className="pro-history-badge danger">{h.absent_count || 0}</span>
                </td>
                <td className="text-center">
                  <span className="pro-history-badge warning">{h.late_count || 0}</span>
                </td>
                <td className="text-center">
                  <span className="pro-history-badge info">{h.excused_count || 0}</span>
                </td>
                <td className="text-center">
                  <span className="pro-history-badge secondary">{h.dropped_count || 0}</span>
                </td>
                <td>
                  <span className="text-muted small">
                    <i className="bi bi-person-badge me-1" />
                    {h.teacher_name}
                  </span>
                </td>
                {isTeacher && (
                  <td>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => openHistoryDate(h.session_date)}
                    >
                      Sửa
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
    </LoadingOverlay>
  );
}

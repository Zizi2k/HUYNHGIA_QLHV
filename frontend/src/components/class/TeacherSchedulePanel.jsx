import { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Form, Alert, Spinner, Badge,
} from 'react-bootstrap';
import { scheduleService } from '../../services';
import { currentMonthValue, formatDayLabel, slotStateKey } from '../../utils/scheduleTimeSlots';

export default function TeacherSchedulePanel({
  classId, isTeacher, isStudent, currentUserId,
}) {
  const [month, setMonth] = useState(currentMonthValue());
  const [selectedDate, setSelectedDate] = useState('');
  const [days, setDays] = useState([]);
  const [pending, setPending] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bookingId, setBookingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadMonth = () => {
    setLoading(true);
    setError('');
    scheduleService.getMonth(classId, month)
      .then((res) => {
        const loadedDays = res.data.days || [];
        setDays(loadedDays);
        setPending({});
        if (!selectedDate && loadedDays.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const inMonth = loadedDays.find((d) => d.date === today);
          setSelectedDate(inMonth ? today : loadedDays[0].date);
        } else if (selectedDate && !loadedDays.some((d) => d.date === selectedDate)) {
          setSelectedDate(loadedDays[0]?.date || '');
        }
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Không thể tải lịch làm việc');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMonth();
  }, [classId, month]);

  const selectedDay = useMemo(
    () => days.find((d) => d.date === selectedDate) || null,
    [days, selectedDate],
  );

  const getSlotState = (slot) => {
    const key = slotStateKey(slot.slot_date, slot.start_time);
    if (Object.prototype.hasOwnProperty.call(pending, key)) {
      return pending[key];
    }
    return slot.is_available;
  };

  const getDisplaySlot = (slot) => {
    const available = getSlotState(slot);
    return { ...slot, is_available: available };
  };

  const toggleTeacherSlot = (slot) => {
    if (slot.booking_id) return;
    const key = slotStateKey(slot.slot_date, slot.start_time);
    const next = !getSlotState(slot);
    setPending((prev) => ({ ...prev, [key]: next }));
  };

  const handleSave = async () => {
    const slots = [];
    days.forEach((day) => {
      day.slots.forEach((slot) => {
        const key = slotStateKey(slot.slot_date, slot.start_time);
        if (!Object.prototype.hasOwnProperty.call(pending, key)) return;
        slots.push({
          slot_date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          label: slot.label,
          is_available: pending[key],
        });
      });
    });

    if (slots.length === 0) {
      setError('Chưa có thay đổi nào để lưu');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await scheduleService.save(classId, { class_id: parseInt(classId, 10), slots });
      setMessage(res.data.message);
      loadMonth();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể lưu lịch');
    } finally {
      setSaving(false);
    }
  };

  const handleBook = async (slot) => {
    if (!slot.id) {
      alert('Giáo viên chưa mở khung giờ này');
      return;
    }
    setBookingId(`${slot.id}-${slot.start_time}`);
    setError('');
    try {
      await scheduleService.book(slot.id);
      setMessage('Đã đăng ký khung giờ học');
      loadMonth();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể đăng ký');
    } finally {
      setBookingId(null);
    }
  };

  const handleCancel = async (slot) => {
    if (!slot.id) return;
    setBookingId(`${slot.id}-cancel`);
    try {
      await scheduleService.cancelBooking(slot.id);
      setMessage('Đã hủy đăng ký');
      loadMonth();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể hủy đăng ký');
    } finally {
      setBookingId(null);
    }
  };

  const pendingCount = Object.keys(pending).length;

  if (loading && days.length === 0) {
    return <div className="text-center py-4"><Spinner animation="border" /></div>;
  }

  return (
    <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: 12, overflow: 'hidden' }}>
      <div className="pro-card-header">
        <h5 className="pro-card-header-title">
          <i className="bi bi-calendar3-week me-2" />
          {isStudent ? 'Đăng ký giờ học với giáo viên' : 'Lịch làm việc giáo viên theo tháng'}
        </h5>
      </div>
      <Card.Body>
        {message && <Alert variant="success" className="py-2">{message}</Alert>}
        {error && <Alert variant="danger" className="py-2">{error}</Alert>}

        <div className="d-flex flex-wrap align-items-end gap-3 mb-3">
          <Form.Group>
            <Form.Label className="small text-muted mb-1">Tháng</Form.Label>
            <Form.Control
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ maxWidth: 180 }}
            />
          </Form.Group>
          {isTeacher && (
            <Button
              variant="primary"
              disabled={saving || pendingCount === 0}
              onClick={handleSave}
            >
              {saving ? (
                <><Spinner size="sm" className="me-2" />Đang lưu...</>
              ) : (
                <><i className="bi bi-save me-2" />Lưu lịch{pendingCount > 0 ? ` (${pendingCount})` : ''}</>
              )}
            </Button>
          )}
        </div>

        {isTeacher && pendingCount > 0 && (
          <Alert variant="warning" className="py-2 small">
            <i className="bi bi-exclamation-triangle me-1" />
            Bạn đã chọn {pendingCount} khung giờ — bấm <strong>Lưu lịch</strong> để học sinh thấy được.
          </Alert>
        )}

        <Alert variant="light" className="py-2 small">
          {isTeacher ? (
            <>
              Chọn ngày → bấm vào <strong>khung giờ</strong> để đánh dấu <Badge bg="success">Có thể dạy</Badge> hoặc{' '}
              <Badge bg="secondary">Không dạy</Badge>, rồi bấm <strong>Lưu lịch</strong>.
            </>
          ) : (
            <>
              Chọn ngày → đăng ký khung giờ <Badge bg="success">Có thể dạy</Badge> (còn trống) để học với giáo viên.
            </>
          )}
        </Alert>

        <div className="d-flex flex-wrap gap-2 mb-3">
          {days.map((day) => {
            const availableCount = isStudent
              ? day.slots.filter((s) => getSlotState(s) && !s.booking_id).length
              : day.slots.filter((s) => getSlotState(s)).length;
            const bookedByMe = day.slots.some((s) => s.booked_by === currentUserId);
            return (
              <Button
                key={day.date}
                size="sm"
                variant={selectedDate === day.date ? 'primary' : 'outline-secondary'}
                className={!isTeacher && availableCount > 0 ? 'border-success' : undefined}
                onClick={() => setSelectedDate(day.date)}
              >
                {formatDayLabel(day.date)}
                {availableCount > 0 && (
                  <Badge bg={isStudent ? 'success' : 'light'} text={isStudent ? undefined : 'dark'} className="ms-1">
                    {availableCount}
                  </Badge>
                )}
                {bookedByMe && <i className="bi bi-bookmark-fill ms-1 text-warning" />}
              </Button>
            );
          })}
        </div>

        {selectedDay ? (
          (() => {
            const visibleSlots = isStudent
              ? selectedDay.slots.filter((slot) => {
                const display = getDisplaySlot(slot);
                return display.is_available || display.booked_by === currentUserId;
              })
              : selectedDay.slots;

            if (isStudent && visibleSlots.length === 0) {
              return (
                <Alert variant="light" className="mb-0">
                  <i className="bi bi-calendar-x me-2" />
                  Giáo viên chưa mở khung giờ nào trong ngày{' '}
                  <strong>{formatDayLabel(selectedDay.date)}</strong>.
                  Hãy chọn ngày khác (có số trên nút ngày = số khung còn trống).
                </Alert>
              );
            }

            return (
          <div className="schedule-slot-grid">
            {visibleSlots.map((slot) => {
              const display = getDisplaySlot(slot);
              const isMine = display.booked_by === currentUserId;
              const isBooked = Boolean(display.booking_id);
              const isBusy = bookingId?.startsWith(String(display.id));

              let btnVariant = 'outline-secondary';
              let statusText = 'Không dạy';
              if (display.is_available && !isBooked) {
                btnVariant = 'outline-success';
                statusText = 'Có thể dạy — còn trống';
              } else if (display.is_available && isBooked) {
                btnVariant = isMine ? 'primary' : 'warning';
                statusText = isMine
                  ? 'Bạn đã đăng ký'
                  : `Đã có HS: ${display.booked_by_name || '...'}`;
              }

              return (
                <div key={slot.start_time} className="schedule-slot-item">
                  {isTeacher ? (
                    <Button
                      variant={display.is_available ? 'success' : 'secondary'}
                      size="sm"
                      className="w-100 schedule-slot-btn"
                      disabled={Boolean(slot.booking_id)}
                      onClick={() => toggleTeacherSlot(slot)}
                      title={slot.booking_id ? 'Đã có học sinh đăng ký, không thể đổi' : undefined}
                    >
                      <div className="fw-semibold">{slot.label}</div>
                      <div className="small opacity-75">
                        {display.is_available ? 'Có thể dạy' : 'Không dạy'}
                      </div>
                    </Button>
                  ) : (
                    <div className={`schedule-slot-student border rounded p-2 ${btnVariant.replace('outline-', 'border-')}`}>
                      <div className="fw-semibold small">{slot.label}</div>
                      <div className="text-muted small mb-2">{statusText}</div>
                      {display.is_available && !isBooked && display.id && (
                        <Button
                          size="sm"
                          variant="success"
                          className="w-100"
                          disabled={isBusy}
                          onClick={() => handleBook(display)}
                        >
                          {isBusy ? <Spinner size="sm" /> : 'Đăng ký học'}
                        </Button>
                      )}
                      {isMine && (
                        <Button
                          size="sm"
                          variant="outline-danger"
                          className="w-100 mt-1"
                          disabled={isBusy}
                          onClick={() => handleCancel(display)}
                        >
                          Hủy đăng ký
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
            );
          })()
        ) : (
          <Alert variant="light" className="mb-0">Chọn tháng để xem lịch.</Alert>
        )}
      </Card.Body>
    </Card>
  );
}

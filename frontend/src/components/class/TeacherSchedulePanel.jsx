import { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Form, Alert, Spinner, Badge,
} from 'react-bootstrap';
import { scheduleService } from '../../services';
import {
  currentMonthValue,
  formatDayLabel,
  formatMonthTitle,
  getCalendarWeeks,
  shiftMonth,
  slotStateKey,
} from '../../utils/scheduleTimeSlots';

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

  const calendar = useMemo(() => getCalendarWeeks(month), [month]);
  const today = new Date().toISOString().slice(0, 10);

  const dayMap = useMemo(() => {
    const map = {};
    days.forEach((d) => { map[d.date] = d; });
    return map;
  }, [days]);

  const loadMonth = () => {
    setLoading(true);
    setError('');
    scheduleService.getMonth(classId, month)
      .then((res) => {
        const loadedDays = res.data.days || [];
        setDays(loadedDays);
        setPending({});
        if (!selectedDate && loadedDays.length > 0) {
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

  const selectedDay = dayMap[selectedDate] || null;

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

  const getBookings = (slot) => slot.bookings || [];

  const isBookedByMe = (slot) => getBookings(slot).some((b) => b.student_id === currentUserId);

  const hasBookings = (slot) => getBookings(slot).length > 0;

  const getDaySummary = (dateStr) => {
    const day = dayMap[dateStr];
    if (!day) return { open: 0, booked: 0, mine: false };
    let open = 0;
    let booked = 0;
    let mine = false;
    day.slots.forEach((slot) => {
      const display = getDisplaySlot(slot);
      if (display.is_available && !isBookedByMe(display)) open += 1;
      if (hasBookings(display)) booked += 1;
      if (isBookedByMe(display)) mine = true;
    });
    return { open, booked, mine };
  };

  const toggleTeacherSlot = (slot) => {
    if (hasBookings(slot)) return;
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

  const visibleSlots = selectedDay
    ? (isStudent
      ? selectedDay.slots.filter((slot) => {
        const display = getDisplaySlot(slot);
        return display.is_available || isBookedByMe(display);
      })
      : selectedDay.slots)
    : [];

  return (
    <Card className="border-0 shadow-sm mb-4 schedule-calendar-card">
      <div className="pro-card-header">
        <h5 className="pro-card-header-title">
          <i className="bi bi-calendar3-week me-2" />
          {isStudent ? 'Đăng ký giờ học với giáo viên' : 'Lịch làm việc giáo viên'}
        </h5>
        {isTeacher && (
          <Button
            variant="primary"
            size="sm"
            disabled={saving || pendingCount === 0}
            onClick={handleSave}
          >
            {saving ? (
              <><Spinner size="sm" className="me-1" />Đang lưu...</>
            ) : (
              <><i className="bi bi-save me-1" />Lưu lịch{pendingCount > 0 ? ` (${pendingCount})` : ''}</>
            )}
          </Button>
        )}
      </div>
      <Card.Body>
        {message && <Alert variant="success" className="py-2">{message}</Alert>}
        {error && <Alert variant="danger" className="py-2">{error}</Alert>}

        {isTeacher && pendingCount > 0 && (
          <Alert variant="warning" className="py-2 small">
            <i className="bi bi-exclamation-triangle me-1" />
            Bạn đã chọn {pendingCount} khung giờ — bấm <strong>Lưu lịch</strong> để học sinh thấy được.
          </Alert>
        )}

        <div className="schedule-calendar-toolbar">
          <div className="schedule-calendar-nav">
            <Button variant="outline-secondary" size="sm" onClick={() => setMonth(shiftMonth(month, -1))}>
              <i className="bi bi-chevron-left" />
            </Button>
            <h6 className="schedule-calendar-month-title mb-0">{formatMonthTitle(month)}</h6>
            <Button variant="outline-secondary" size="sm" onClick={() => setMonth(shiftMonth(month, 1))}>
              <i className="bi bi-chevron-right" />
            </Button>
          </div>
          <Form.Control
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="schedule-calendar-month-input"
          />
        </div>

        <div className="schedule-legend mb-3">
          <span><i className="schedule-legend-dot open" /> Có thể dạy / còn trống</span>
          <span><i className="schedule-legend-dot closed" /> Không dạy</span>
          <span><i className="schedule-legend-dot booked" /> Đã đăng ký</span>
        </div>

        <div className="schedule-calendar-grid">
          {calendar.headers.map((h) => (
            <div key={h} className="schedule-calendar-head">{h}</div>
          ))}
          {calendar.weeks.flat().map((dateStr, idx) => {
            if (!dateStr) {
              return <div key={`empty-${idx}`} className="schedule-calendar-cell empty" />;
            }
            const summary = getDaySummary(dateStr);
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === today;
            const dayNum = parseInt(dateStr.slice(8, 10), 10);

            return (
              <button
                key={dateStr}
                type="button"
                className={`schedule-calendar-cell${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
                onClick={() => setSelectedDate(dateStr)}
              >
                <span className="schedule-calendar-day-num">{dayNum}</span>
                <div className="schedule-calendar-dots">
                  {summary.open > 0 && <span className="dot open" title={`${summary.open} khung trống`} />}
                  {summary.booked > 0 && <span className="dot booked" title={`${summary.booked} đã đăng ký`} />}
                  {summary.mine && <i className="bi bi-bookmark-fill mine" title="Bạn đã đăng ký" />}
                </div>
              </button>
            );
          })}
        </div>

        {selectedDay ? (
          <div className="schedule-day-panel">
            <div className="schedule-day-panel-head">
              <h6 className="mb-0">
                <i className="bi bi-clock me-2 text-primary" />
                Khung giờ — <strong>{formatDayLabel(selectedDay.date)}</strong>
              </h6>
              <span className="text-muted small">{visibleSlots.length} khung</span>
            </div>

            {isStudent && visibleSlots.length === 0 ? (
              <Alert variant="light" className="mb-0 mt-3">
                Giáo viên chưa mở khung giờ nào trong ngày này.
              </Alert>
            ) : (
              <div className="schedule-slot-list">
                {visibleSlots.map((slot) => {
                  const display = getDisplaySlot(slot);
                  const bookings = getBookings(display);
                  const mine = isBookedByMe(display);
                  const booked = hasBookings(display);
                  const isBusy = bookingId?.startsWith(String(display.id));
                  const pendingKey = slotStateKey(slot.slot_date, slot.start_time);
                  const isPending = Object.prototype.hasOwnProperty.call(pending, pendingKey);

                  let stateClass = 'closed';
                  let statusText = 'Không dạy';
                  if (display.is_available && !booked) {
                    stateClass = 'open';
                    statusText = isStudent ? 'Còn trống — có thể đăng ký' : 'Có thể dạy';
                  } else if (display.is_available && booked) {
                    stateClass = mine ? 'mine' : 'booked';
                    statusText = mine
                      ? `Bạn đã đăng ký (${bookings.length} HS)`
                      : `${bookings.length} học sinh đã đăng ký`;
                  }

                  return (
                    <div
                      key={slot.start_time}
                      className={`schedule-slot-row ${stateClass}${isPending ? ' pending' : ''}`}
                    >
                      <div className="schedule-slot-row-time">
                        <i className="bi bi-clock" />
                        <span>{slot.label}</span>
                      </div>
                      <div className="schedule-slot-row-status">
                        {isTeacher && booked ? (
                          <details className="schedule-booking-dropdown">
                            <summary>
                              <Badge bg="primary">
                                {bookings.length} học sinh
                                <i className="bi bi-chevron-down ms-1" />
                              </Badge>
                            </summary>
                            <ul className="schedule-booking-list">
                              {bookings.map((b) => (
                                <li key={b.booking_id}>
                                  <span className="fw-semibold">{b.fullname}</span>
                                  {b.code && <span className="text-muted ms-1">({b.code})</span>}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : (
                          <Badge bg={stateClass === 'open' ? 'success' : stateClass === 'closed' ? 'secondary' : 'primary'}>
                            {statusText}
                          </Badge>
                        )}
                      </div>
                      <div className="schedule-slot-row-action">
                        {isTeacher && (
                          <Button
                            variant={display.is_available ? 'success' : 'outline-secondary'}
                            size="sm"
                            disabled={booked}
                            onClick={() => toggleTeacherSlot(slot)}
                            title={booked ? 'Đã có học sinh đăng ký' : undefined}
                          >
                            {display.is_available ? 'Có thể dạy' : 'Không dạy'}
                          </Button>
                        )}
                        {isStudent && display.is_available && !mine && display.id && (
                          <Button size="sm" variant="success" disabled={isBusy} onClick={() => handleBook(display)}>
                            {isBusy ? <Spinner size="sm" /> : 'Đăng ký'}
                          </Button>
                        )}
                        {isStudent && mine && (
                          <Button size="sm" variant="outline-danger" disabled={isBusy} onClick={() => handleCancel(display)}>
                            Hủy
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <Alert variant="light" className="mb-0 mt-3">Chọn một ngày trên lịch để xem khung giờ.</Alert>
        )}
      </Card.Body>
    </Card>
  );
}

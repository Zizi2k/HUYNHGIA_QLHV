import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Stack, Table } from 'react-bootstrap';
import api from '../services/api';

const base = '/staff-rota';
const todayVN = () => new Date(Date.now() + 25200000).toISOString().slice(0, 10);
const failure = (err) => err.response?.data?.message || 'Không xử lý được lịch làm.';
const shiftText = (rows) => rows.map((s) => s.start + '–' + s.end).join(', ');

export default function StaffRotaPage() {
  const [day, setDay] = useState(todayVN);
  const [departments, setDepartments] = useState(null);
  const [dept, setDept] = useState('');
  const [week, setWeek] = useState(null);
  const [draft, setDraft] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api.get(base + '/departments', { signal: controller.signal }).then(({ data }) => {
      setDepartments(data);
      setDept(data[0] ? String(data[0].id) : '');
    }).catch((err) => { if (!controller.signal.aborted) setNotice({ error: true, text: failure(err) }); });
    return () => controller.abort();
  }, []);
  const load = useCallback(async (signal) => {
    if (!dept) return;
    try {
      const { data } = await api.get(base + '/' + dept, { params: { day }, signal });
      if (!signal?.aborted) setWeek(data);
    } catch (err) { if (!signal?.aborted) setNotice({ error: true, text: failure(err) }); }
  }, [dept, day]);
  useEffect(() => {
    const controller = new AbortController();
    setWeek(null);
    setNotice(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const shiftWeek = (direction) => setDay((value) => new Date(Date.parse(value + 'T00:00:00Z') + direction * 7 * 86400000).toISOString().slice(0, 10));
  function edit(row, mode) {
    setError('');
    setDraft({ day: row.day, mode, capacity: row.capacity,
      shifts: row.bookings.find((b) => b.own)?.shifts || [{ start: '', end: '' }] });
  }
  async function save(e) {
    e.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    const url = `${base}/${dept}/${draft.day}`;
    try {
      if (draft.mode === 'capacity') await api.put(url + '/capacity', { capacity: Number(draft.capacity) });
      else if (draft.mode === 'cancel') await api.delete(url + '/booking');
      else await api.put(url + '/booking', { shifts: draft.shifts });
      setDraft(null);
      setNotice({ text: draft.mode === 'cancel' ? 'Đã hủy đăng ký.' : 'Đã lưu lịch làm.' });
      await load();
    } catch (err) { setError(failure(err)); } finally { setBusy(false); }
  }
  return <section>
    <h1 className="h3">Đăng ký lịch làm</h1>
    <p className="text-body-secondary">Một giáo viên chiếm một chỗ mỗi ngày, kể cả khi đăng ký nhiều ca. Lịch này không tự tạo giờ công hoặc tiền lương.</p>
    {notice && <Alert className="text-center" variant={notice.error ? 'danger' : 'success'}>{notice.text}</Alert>}
    {departments?.length === 0 && <p>Bạn chưa được phân công vào phòng ban đang hoạt động.</p>}
    {departments?.length > 0 && <Stack direction="horizontal" gap={2} className="align-items-end flex-wrap mb-3">
      <Form.Group controlId="rota-department"><Form.Label>Phòng ban</Form.Label>
        <Form.Select value={dept} onChange={(e) => setDept(e.target.value)}>
          {departments.map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}
        </Form.Select></Form.Group>
      <Form.Group controlId="rota-week"><Form.Label>Chọn ngày trong tuần</Form.Label>
        <Form.Control type="date" value={day} onChange={(e) => { if (e.target.value) setDay(e.target.value); }} /></Form.Group>
      <Button variant="outline-secondary" onClick={() => shiftWeek(-1)}>Tuần trước</Button>
      <Button variant="outline-secondary" onClick={() => shiftWeek(1)}>Tuần sau</Button>
    </Stack>}
    {dept && !week && !notice?.error && <p role="status">Đang tải lịch…</p>}
    {week && <Table responsive bordered>
      <thead><tr><th>Ngày</th><th>Đăng ký / Giới hạn</th><th>{week.manager ? 'Ca đã đăng ký' : 'Ca của bạn'}</th><th>Thao tác</th></tr></thead>
      <tbody>{week.days.map((row, i) => {
        const own = row.bookings.some((b) => b.own);
        const past = row.day < week.today;
        return <tr key={row.day}><td>{i === 6 ? 'CN' : 'Thứ ' + (i + 2)} · {row.day.split('-').reverse().join('/')}</td>
          <td>{row.capacity ? `${row.used} / ${row.capacity}` : 'Chưa mở'}</td>
          <td>{row.bookings.map((b) => <div key={b.teacher_id}>{week.manager ? b.name + ': ' : ''}{shiftText(b.shifts)}</div>)}
            {row.bookings.length === 0 && '—'}</td>
          <td><div className="d-flex flex-wrap gap-2">
            {!past && week.manager && <Button size="sm" variant="outline-primary" onClick={() => edit(row,'capacity')}>Giới hạn</Button>}
            {!past && week.member && Boolean(row.capacity) && <Button size="sm" disabled={!own && Number(row.used) >= row.capacity}
              onClick={() => edit(row,'book')}>{own ? 'Sửa ca' : 'Đăng ký'}</Button>}
            {!past && own && <Button size="sm" variant="outline-danger" onClick={() => edit(row,'cancel')}>Hủy đăng ký</Button>}
          </div></td></tr>;
      })}</tbody></Table>}
    <Modal centered show={Boolean(draft)} onHide={() => { if (!busy) setDraft(null); }}>
      <Form onSubmit={save}>
        <Modal.Header closeButton={!busy}><Modal.Title>{draft?.mode === 'capacity' ? 'Mở hoặc chỉnh giới hạn đăng ký'
          : draft?.mode === 'cancel' ? 'Hủy đăng ký lịch làm' : 'Đăng ký ca làm'}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <p>Ngày {draft?.day.split('-').reverse().join('/')}</p>
          {draft?.mode === 'capacity' && <Form.Group controlId="rota-capacity"><Form.Label>Số người tối đa</Form.Label>
            <Form.Control required type="number" min={0} max={1000} step={1} value={draft.capacity}
              onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} /><Form.Text>0 nghĩa là chưa mở đăng ký.</Form.Text></Form.Group>}
          {draft?.mode === 'cancel' && <p>Hủy tất cả ca của bạn trong ngày này và giải phóng một chỗ?</p>}
          {draft?.mode === 'book' && <>
            {draft.shifts.map((shift, index) => <Stack key={index} direction="horizontal" gap={2} className="align-items-end mb-2">
              {['start','end'].map((key) => <Form.Group key={key} controlId={`rota-${key}-${index}`}>
                <Form.Label>Ca {index + 1} · {key === 'start' ? 'Bắt đầu' : 'Kết thúc'}</Form.Label>
                <Form.Control required type="time" value={shift[key]} onChange={(e) => {
                  const value = e.target.value;
                  setDraft((old) => ({ ...old, shifts: old.shifts.map((s, i) => i === index ? { ...s, [key]: value } : s) }));
                }} /></Form.Group>)}
              {draft.shifts.length > 1 && <Button type="button" variant="outline-danger" aria-label={`Bỏ ca ${index + 1}`}
                onClick={() => setDraft({ ...draft, shifts: draft.shifts.filter((_, i) => i !== index) })}>Bỏ</Button>}
            </Stack>)}
            <Button type="button" variant="outline-secondary" disabled={draft.shifts.length >= 8}
              onClick={() => setDraft({ ...draft, shifts: [...draft.shifts, { start: '', end: '' }] })}>Thêm ca</Button>
          </>}
        </Modal.Body>
        <Modal.Footer><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận'}</Button></Modal.Footer>
      </Form>
    </Modal>
  </section>;
}

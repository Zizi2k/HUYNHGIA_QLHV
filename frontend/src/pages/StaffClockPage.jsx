import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Stack, Table } from 'react-bootstrap';
import api from '../services/api';

const path = '/staff-clock';
const vnMonth = () => new Date(Date.now() + 25200000).toISOString().slice(0, 7);
const dateTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
const stamp = (ms) => ms == null ? '—' : dateTime.format(Number(ms));
const msg = (err) => err.response?.data?.message || err.message || 'Không thể xử lý yêu cầu';
const MAX_IMAGE = 1536 * 1024;

export default function StaffClockPage() {
  const [month, setMonth] = useState(vnMonth);
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [photo, setPhoto] = useState('');
  const [limit, setLimit] = useState(10);
  const load = useCallback(async (signal) => {
    try {
      const { data: result } = await api.get(path, { params: { month }, signal });
      if (!signal?.aborted) setData(result);
    } catch (err) { if (!signal?.aborted) setNotice({ failure: true, text: msg(err) }); }
  }, [month]);
  useEffect(() => {
    const controller = new AbortController();
    setLimit(10);
    setNotice(null);
    setData(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  function start() {
    setError('');
    setDraft({ direction: data.open ? 'out' : 'in', rest: '0', requestId: crypto.randomUUID(), file: null, location: null });
  }
  function locate() {
    if (!navigator.geolocation) { setError('Thiết bị không hỗ trợ lấy vị trí.'); return; }
    setError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setDraft((old) => old && ({ ...old, location: { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy } }));
      setLocating(false);
    }, (err) => {
      setError(err.code === 1 ? 'Bạn chưa cho phép truy cập vị trí. Hãy bật quyền vị trí rồi thử lại.' : 'Không lấy được vị trí. Hãy kiểm tra GPS và thử lại.');
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  }
  function selectPhoto(event) {
    const file = event.target.files[0];
    setError('');
    if (file && file.size > MAX_IMAGE) {
      event.target.value = '';
      setDraft((old) => ({ ...old, file: null }));
      setError('Ảnh vượt 1,5 MB. Hãy chọn ảnh nhỏ hơn.');
      return;
    }
    setDraft((old) => ({ ...old, file: file || null }));
  }
  async function save(event) {
    event.preventDefault();
    if (!draft?.file || !draft.location || busy) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries({ ...draft.location, rest: draft.rest, requestId: draft.requestId })) form.append(key, String(value));
      form.append('photo', draft.file);
      await api.post(path + '/' + draft.direction, form);
      setNotice({ text: draft.direction === 'in' ? 'Đã chấm công vào.' : 'Đã chấm công ra.' });
      setDraft(null);
      await load();
    } catch (err) { setError(msg(err)); }
    finally { setBusy(false); }
  }
  async function evidence(id) {
    try {
      const { data: blob } = await api.get(path + '/evidence/' + id, { responseType: 'blob' });
      setPhoto(URL.createObjectURL(blob));
    } catch { setNotice({ failure: true, text: 'Không mở được ảnh. Ảnh có thể đã hết hạn hoặc bạn không có quyền xem.' }); }
  }

  return <section>
    <h1 className="h3">Chấm công giáo viên</h1>
    <p className="text-body-secondary">Giờ do máy chủ ghi nhận, hiển thị theo giờ Việt Nam. Ca chấm công chưa tự cộng vào lương theo tiết.</p>
    {notice && <Alert className="text-center" variant={notice.failure ? 'danger' : 'success'}>{notice.text}</Alert>}
    <Stack direction="horizontal" gap={2} className="align-items-end flex-wrap mb-3">
      <Form.Group controlId="staff-clock-month"><Form.Label>Tháng</Form.Label>
        <Form.Control type="month" value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} /></Form.Group>
      {data && !data.admin && <Button onClick={start}>{data.open ? 'Chấm công ra' : 'Chấm công vào'}</Button>}
    </Stack>
    {data?.open && <p><Badge bg="warning" text="dark">Đang làm việc</Badge> · Vào lúc {stamp(data.open.started_ms)}</p>}
    {!data && !notice && <p role="status">Đang tải…</p>}
    {data && <>
      <Table responsive bordered hover><thead><tr>{data.admin && <th>Giáo viên</th>}<th>Giờ vào</th><th>Giờ ra</th>
        <th>Nghỉ không lương</th><th>Phút tính công</th><th>Minh chứng</th></tr></thead>
        <tbody>{data.shifts.slice(0, limit).map((row) => <tr key={row.id}>{data.admin && <td>{row.teacher}</td>}
          <td>{stamp(row.started_ms)}</td><td>{row.ended_ms == null ? 'Chưa chấm ra' : stamp(row.ended_ms)}</td>
          <td>{row.rest_minutes} phút</td><td>{row.payable_minutes ?? '—'}</td><td><div className="d-flex gap-2 flex-wrap">
            {row.inPhoto && <Button size="sm" variant="outline-primary" onClick={() => evidence(row.inPhoto)}>Ảnh vào</Button>}
            {row.outPhoto && <Button size="sm" variant="outline-primary" onClick={() => evidence(row.outPhoto)}>Ảnh ra</Button>}
            {!row.inPhoto && !row.outPhoto && <span>Không còn ảnh</span>}</div></td></tr>)}</tbody>
      </Table>
      {!data.shifts.length && <p>Chưa có ca chấm công.</p>}
      {data.shifts.length > limit && <Button variant="outline-secondary" onClick={() => setLimit(limit + 10)}>Xem thêm</Button>}
    </>}
    <Modal centered show={Boolean(draft)} onHide={() => { if (!busy && !locating) setDraft(null); }}>
      <Form onSubmit={save}>
        <Modal.Header closeButton={!busy && !locating}><Modal.Title>{draft?.direction === 'out' ? 'Chấm công ra' : 'Chấm công vào'}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" className="text-center" role="alert">{error}</Alert>}
          <Button type="button" variant="outline-primary" disabled={busy || locating} onClick={locate}>
            {locating ? 'Đang lấy vị trí…' : draft?.location ? 'Lấy lại vị trí' : 'Cho phép lấy vị trí'}</Button>
          {draft?.location && <span className="ms-2" role="status">Đã lấy vị trí (±{Math.round(draft.location.accuracy)} m)</span>}
          <Form.Group controlId="staff-clock-photo" className="mt-3">
            <Form.Label>Ảnh minh chứng</Form.Label>
            <Form.Control type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} disabled={busy} />
            <Form.Text>JPG, PNG, WebP; tối đa 1,5 MB. Ảnh giữ 2 tháng.</Form.Text>
          </Form.Group>
          <Form.Group controlId="staff-clock-camera" className="mt-2"><Form.Label>Chụp ảnh bằng camera điện thoại</Form.Label>
            <Form.Control type="file" accept="image/*" capture="environment" onChange={selectPhoto} disabled={busy} />
            {draft?.file && <Form.Text>Ảnh đang dùng: {draft.file.name}</Form.Text>}
          </Form.Group>
          {draft?.direction === 'out' && <Form.Group controlId="staff-clock-rest" className="mt-3"><Form.Label>Số phút nghỉ không lương</Form.Label>
            <Form.Control type="number" min={0} max={720} step={15} required value={draft.rest} disabled={busy}
              onChange={(e) => setDraft((old) => ({ ...old, rest: e.target.value }))} /></Form.Group>}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" disabled={busy || locating} onClick={() => setDraft(null)}>Đóng</Button>
          <Button type="submit" disabled={busy || locating || !draft?.location || !draft?.file}>{busy ? 'Đang lưu…' : 'Xác nhận'}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
    <Modal centered show={Boolean(photo)} onHide={() => setPhoto('')}>
      <Modal.Header closeButton><Modal.Title>Ảnh minh chứng</Modal.Title></Modal.Header>
      <Modal.Body>{photo && <img className="img-fluid" src={photo} alt="Ảnh minh chứng chấm công" />}</Modal.Body>
    </Modal>
  </section>;
}

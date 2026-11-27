import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Stack, Table } from 'react-bootstrap';
import api from '../services/api';
import StaffClockImport from '../components/attendance/StaffClockImport';
import StaffClockCorrections from '../components/attendance/StaffClockCorrections';
import StaffPhotoRequests from '../components/attendance/StaffPhotoRequests';

const path = '/staff-clock';
const vnMonth = () => new Date(Date.now() + 25200000).toISOString().slice(0, 7);
const dateTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
const stamp = (ms) => ms == null ? '—' : dateTime.format(Number(ms));
const localStamp = (ms) => ms == null ? '' : new Date(Number(ms) + 25200000).toISOString().slice(0, 16);
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
  const [correctionShift, setCorrectionShift] = useState(null);
  const [photoEvent, setPhotoEvent] = useState(null);
  const [rateEdit, setRateEdit] = useState(null);
  const [adminShift, setAdminShift] = useState(null);
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
  async function saveRate(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.put(`${path}/shifts/${rateEdit.id}/rate`, { mode: rateEdit.mode, note: rateEdit.note, rate: Number(rateEdit.rate),
        minutes: rateEdit.mode === 'hour' && rateEdit.minutes !== '' ? Number(rateEdit.minutes) : null });
      setRateEdit(null);
      setNotice({ text: 'Đã lưu đơn giá ca.' });
      await load();
    } catch (err) { setError(msg(err)); }
    finally { setBusy(false); }
  }

  function openAdminShift(row) {
    setError('');
    const date = vnMonth() === month ? localStamp(Date.now()).slice(0, 10) : month + '-01';
    setAdminShift({ id: row?.id, teacherId: row?.teacher_id ?? '', teacher: row?.teacher,
      start: row ? localStamp(row.started_ms) : date + 'T08:00', end: row ? localStamp(row.ended_ms) : date + 'T11:30',
      rest: row?.rest_minutes ?? 0, reason: '', payUnit: row?.payUnit ?? 'default',
      payRate: row?.payRate ?? '', payPeriods: row?.payPeriods || 1 });
  }
  async function saveAdminShift(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { id, teacherId, start, end, rest, reason } = adminShift;
      const body = { teacherId: Number(teacherId), start, end, rest: Number(rest), reason,
        payUnit: adminShift.payUnit, payRate: Number(adminShift.payRate), payPeriods: Number(adminShift.payPeriods) };
      if (id) await api.put(`${path}/shifts/${id}/manual`, body);
      else await api.post(path + '/shifts/manual', body);
      setAdminShift(null);
      if (start.slice(0, 7) !== month) setMonth(start.slice(0, 7));
      else await load();
      setNotice({ text: id ? 'Đã sửa chấm công.' : 'Đã chấm công bổ sung.' });
    } catch (err) { setError(msg(err)); }
    finally { setBusy(false); }
  }
  const adminField = (key) => (e) => setAdminShift((row) => ({ ...row, [key]: e.target.value }));

  return <section>
    <h1 className="h3">Chấm công giáo viên</h1>
    <p className="text-body-secondary">Giờ do máy chủ ghi nhận, hiển thị theo giờ Việt Nam. Ca chấm công chưa tự cộng vào lương theo tiết.</p>
    {notice && <Alert className="text-center" variant={notice.failure ? 'danger' : 'success'}>{notice.text}</Alert>}
    <Stack direction="horizontal" gap={2} className="align-items-end flex-wrap mb-3">
      <Form.Group controlId="staff-clock-month"><Form.Label>Tháng</Form.Label>
        <Form.Control type="month" value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} /></Form.Group>
      {data?.teacher && <Button onClick={start}>{data.open ? 'Chấm công ra' : 'Chấm công vào'}</Button>}
      {data?.admin && <Button onClick={() => openAdminShift()}>Chấm công bổ sung</Button>}
    </Stack>
    {data?.open && <p><Badge bg="warning" text="dark">Đang làm việc</Badge> · Vào lúc {stamp(data.open.started_ms)}</p>}
    {!data && !notice && <p role="status">Đang tải…</p>}
    {data && <>
      {data.admin && <StaffClockImport onImported={load} />}
      <StaffClockCorrections data={data} shift={correctionShift} clearShift={() => setCorrectionShift(null)} onSaved={load} />
      <StaffPhotoRequests data={data} event={photoEvent} clearEvent={() => setPhotoEvent(null)} refresh={load} />
      <Table responsive bordered hover><thead><tr>{(data.admin || data.manager) && <th>Giáo viên</th>}<th>Giờ vào</th><th>Giờ ra</th>
        <th>Nghỉ không lương</th><th>Phút tính công</th><th>Minh chứng / Nguồn</th></tr></thead>
        <tbody>{data.shifts.slice(0, limit).map((row) => <tr key={row.id}>{(data.admin || data.manager) && <td>{row.teacher}</td>}
          <td>{stamp(row.started_ms)}</td><td>{row.ended_ms == null ? 'Chưa chấm ra' : stamp(row.ended_ms)}</td>
          <td>{row.rest_minutes} phút</td><td>{row.payable_minutes ?? '—'}</td><td><div className="d-flex gap-2 flex-wrap">
            {row.inPhoto && <Button size="sm" variant="outline-primary" onClick={() => evidence(row.inPhoto)}>Ảnh vào</Button>}
            {row.outPhoto && <Button size="sm" variant="outline-primary" onClick={() => evidence(row.outPhoto)}>Ảnh ra</Button>}
            {(data.admin || data.manager) && row.teacher_id !== data.viewerId && [
              { id: row.inEvent, label: 'ảnh vào' }, { id: row.outEvent, label: 'ảnh ra' },
            ].filter((item) => item.id).map((item) => <Button key={item.id} size="sm" variant="outline-secondary"
              onClick={() => setPhotoEvent(item)}>Yêu cầu thay {item.label}</Button>)}
            {row.teacher_id === data.viewerId && <Button size="sm" variant="outline-secondary" onClick={() => setCorrectionShift(row)}>Đề nghị sửa</Button>}
            {data.admin && <Button size="sm" variant="outline-primary" onClick={() => openAdminShift(row)}>Sửa chấm công</Button>}
            {row.payUnit && <span>{row.payUnit === 'hour' ? 'Theo giờ' : 'Theo tiết'} · {Number(row.payAmount).toLocaleString('vi-VN')} ₫</span>}
            {data.admin && !row.payUnit && row.ended_ms != null && <Button size="sm" variant="outline-primary" onClick={() => {
              setError(''); setRateEdit({ id: row.id, mode: row.rateMode || 'default', rate: row.rateOverride ?? '', note: row.rateNote || '',
                minutes: row.rateMinutes ?? '', payableMinutes: row.payable_minutes });
            }}>Đơn giá ca</Button>}
            {row.source === 'excel' ? <span>Excel · {row.work_type}{row.class_label ? ` · ${row.class_label}` : ''}<br />{row.import_note}</span>
              : row.source === 'manual' ? <span>Quản trị viên bổ sung</span>
              : !row.inPhoto && !row.outPhoto && <span>Không còn ảnh</span>}</div></td></tr>)}</tbody>
      </Table>
      {!data.shifts.length && <p>Chưa có ca chấm công.</p>}
      {data.shifts.length > limit && <Button variant="outline-secondary" onClick={() => setLimit(limit + 10)}>Xem thêm</Button>}
    </>}
    <Modal centered show={Boolean(adminShift)} onHide={() => { if (!busy) setAdminShift(null); }}>
      {adminShift && <Form onSubmit={saveAdminShift}>
        <Modal.Header closeButton={!busy}><Modal.Title>{adminShift.id ? 'Sửa chấm công' : 'Chấm công bổ sung'}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert role="alert" variant="danger">{error}</Alert>}
          <fieldset disabled={busy}>
            {adminShift.id ? <p>Giáo viên: <strong>{adminShift.teacher}</strong></p> :
              <Form.Group controlId="admin-clock-teacher" className="mb-2"><Form.Label>Giáo viên</Form.Label>
                <Form.Select required value={adminShift.teacherId} onChange={adminField('teacherId')}>
                  <option value="">Chọn giáo viên</option>
                  {data?.teachers?.map((row) => <option key={row.id} value={row.id}>{row.fullname} · {row.code}</option>)}
                </Form.Select></Form.Group>}
            <Form.Group controlId="admin-clock-start" className="mb-2"><Form.Label>Giờ vào (giờ Việt Nam)</Form.Label>
              <Form.Control required type="datetime-local" value={adminShift.start} onChange={adminField('start')} /></Form.Group>
            <Form.Group controlId="admin-clock-end" className="mb-2"><Form.Label>Giờ ra (giờ Việt Nam)</Form.Label>
              <Form.Control required type="datetime-local" value={adminShift.end} onChange={adminField('end')} /></Form.Group>
            <Form.Group controlId="admin-clock-rest" className="mb-2"><Form.Label>Phút nghỉ không lương</Form.Label>
              <Form.Control required type="number" min={0} max={720} step={15} value={adminShift.rest} onChange={adminField('rest')} /></Form.Group>
            <Form.Group controlId="admin-clock-pay-unit" className="mb-2"><Form.Label>Cách tính lương của ca</Form.Label>
              <Form.Select value={adminShift.payUnit} onChange={adminField('payUnit')}>
                <option value="default">Mặc định theo kỳ lương</option>
                <option value="hour">Theo giờ</option><option value="period">Theo tiết</option>
              </Form.Select>
              <Form.Text>Đơn giá riêng được tính một lần trên phiếu lương, tách khỏi công tính theo mặc định.</Form.Text>
            </Form.Group>
            {adminShift.payUnit !== 'default' && <Form.Group controlId="admin-clock-pay-rate" className="mb-2">
              <Form.Label>{adminShift.payUnit === 'hour' ? 'Đơn giá mỗi giờ (VND)' : 'Đơn giá mỗi tiết (VND)'}</Form.Label>
              <Form.Control required type="number" min={1} max={1000000000} step={1} value={adminShift.payRate} onChange={adminField('payRate')} />
            </Form.Group>}
            {adminShift.payUnit === 'period' && <Form.Group controlId="admin-clock-pay-periods" className="mb-2">
              <Form.Label>Số tiết</Form.Label>
              <Form.Control required type="number" min={1} max={24} step={1} value={adminShift.payPeriods} onChange={adminField('payPeriods')} />
              <Form.Text>Thành tiền: {(Number(adminShift.payRate) * Number(adminShift.payPeriods)).toLocaleString('vi-VN')} ₫</Form.Text>
            </Form.Group>}
            <Form.Group controlId="admin-clock-reason"><Form.Label>Lý do</Form.Label>
              <Form.Control required as="textarea" maxLength={500} value={adminShift.reason} onChange={adminField('reason')} /></Form.Group>
          </fieldset>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={busy} onClick={() => setAdminShift(null)}>Hủy</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu chấm công'}</Button>
        </Modal.Footer>
      </Form>}
    </Modal>
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
    <Modal centered show={Boolean(rateEdit)} onHide={() => { if (!busy) setRateEdit(null); }}>
      <Form onSubmit={saveRate}>
        <Modal.Header closeButton={!busy}><Modal.Title>Đơn giá ca #{rateEdit?.id}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          {rateEdit && <>
            <p>Chỉ áp dụng cho ca đã chấm ra thuộc kỳ chưa chốt tính theo giờ.</p>
            <Form.Group controlId="shift-rate-mode"><Form.Label>Cách tính ca</Form.Label>
              <Form.Select value={rateEdit.mode} onChange={(e) => setRateEdit({ ...rateEdit, mode: e.target.value })}>
                <option value="default">Đơn giá giờ của kỳ</option><option value="hour">Đơn giá giờ riêng</option><option value="fixed">Tiền cố định cho ca</option>
              </Form.Select></Form.Group>
            {rateEdit.mode !== 'default' && <Form.Group controlId="shift-rate-value" className="mt-2">
              <Form.Label>{rateEdit.mode === 'hour' ? 'VND mỗi giờ' : 'VND mỗi ca'}</Form.Label>
              <Form.Control required type="number" step={1} min={0} max={1000000000} value={rateEdit.rate}
                onChange={(e) => setRateEdit({ ...rateEdit, rate: e.target.value })} /></Form.Group>}
            {rateEdit.mode === 'hour' && rateEdit.payableMinutes > 1 && <Form.Group controlId="shift-rate-minutes" className="mt-2">
              <Form.Label>Số phút dùng đơn giá riêng</Form.Label>
              <Form.Control type="number" step={1} min={1} max={rateEdit.payableMinutes - 1} value={rateEdit.minutes}
                onChange={(e) => setRateEdit({ ...rateEdit, minutes: e.target.value })} />
              <Form.Text>Để trống nếu áp dụng cho cả ca. Nếu nhập số phút, phần còn lại dùng đơn giá giờ của kỳ.</Form.Text>
            </Form.Group>}
            <Form.Group controlId="shift-rate-note" className="mt-2"><Form.Label>Lý do đặt đơn giá</Form.Label>
              <Form.Control required as="textarea" maxLength={500} value={rateEdit.note}
                onChange={(e) => setRateEdit({ ...rateEdit, note: e.target.value })} /></Form.Group>
          </>}
        </Modal.Body>
        <Modal.Footer><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu đơn giá'}</Button></Modal.Footer>
      </Form>
    </Modal>
  </section>;
}

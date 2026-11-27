import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Stack, Table } from 'react-bootstrap';
import api from '../../services/api';

const vnDate = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const states = { pending: ['warning', 'Chờ duyệt'], approved: ['success', 'Đã duyệt'], rejected: ['secondary', 'Từ chối'] };
const empty = { date: '', start: '', end: '', periods: '1', note: '', slotId: '' };
const errorText = (err) => err.response?.data?.message || 'Không kết nối được. Vui lòng thử lại.';

export default function ClassTeachingPeriodsTab({ classId }) {
  const base = `/classes/${classId}/teaching-periods`;
  const [month, setMonth] = useState(() => vnDate().slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [modal, setModal] = useState(null);
  const [draft, setDraft] = useState(empty);
  const [issue, setIssue] = useState('');
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState(10);
  const refresh = useCallback(async (signal) => {
    try {
      const { data: response } = await api.get(base, { params: { month }, signal });
      if (!signal?.aborted) setData(response);
    } catch (err) {
      if (!signal?.aborted) setFeedback({ error: true, text: errorText(err) });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [base, month]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setLimit(10);
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  const change = (field) => (event) => setDraft((old) => ({ ...old, [field]: event.target.value }));
  function open(row) {
    setIssue('');
    setModal(row || 'create');
    setDraft(row ? { status: 'approved', rate: '', reason: '' } : { ...empty, date: month === vnDate().slice(0, 7) ? vnDate() : month + '-01' });
  }
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setIssue('');
    try {
      if (modal === 'create') {
        await api.post(base, { ...draft, periods: Number(draft.periods), slotId: draft.slotId ? Number(draft.slotId) : null });
      } else {
        await api.patch(base + '/' + modal.id + '/review', {
          status: draft.status, rate: draft.rate === '' ? null : Number(draft.rate), reason: draft.reason,
        });
      }
      setModal(null);
      setFeedback({ text: modal === 'create' ? 'Đã gửi công dạy để duyệt.' : 'Đã xử lý công dạy.' });
      if (modal === 'create' && month !== draft.date.slice(0, 7)) setMonth(draft.date.slice(0, 7));
      else await refresh();
    } catch (err) { setIssue(errorText(err)); }
    finally { setSaving(false); }
  }
  return <>
    <h2 className="h5">Chấm công theo tiết dạy</h2>
    <p className="text-body-secondary">Ghi công theo số tiết đã dạy. Lịch dự kiến không tự phát sinh tiền công; số tiết do giáo viên khai và quản trị viên duyệt.</p>
    {feedback && <Alert variant={feedback.error ? 'danger' : 'success'} className="text-center" dismissible onClose={() => setFeedback(null)}>{feedback.text}</Alert>}
    <Stack direction="horizontal" gap={2} className="flex-wrap align-items-end mb-3">
      <Form.Group controlId="teaching-period-month">
        <Form.Label>Tháng</Form.Label>
        <Form.Control type="month" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} />
      </Form.Group>
      {data && !data.admin && <Button onClick={() => open()}>Ghi công dạy</Button>}
    </Stack>
    {loading && <p role="status">Đang tải sổ công…</p>}
    {data && <>
      <p>Đã duyệt: <strong>{data.totals.periods} tiết</strong> · Tiền công ghi nhận: <strong>{currency.format(data.totals.amount)}</strong></p>
      <Table responsive bordered hover>
        <thead><tr><th>Ngày dạy</th>{data.admin && <th>Giáo viên</th>}<th>Giờ dạy</th><th>Số tiết</th><th>Ghi chú</th><th>Trạng thái</th><th>Đơn giá/tiết</th><th>Tiền công</th>{data.admin && <th>Thao tác</th>}</tr></thead>
        <tbody>{data.rows.slice(0, limit).map((row) => <tr key={row.id}>
          <td>{row.date.split('-').reverse().join('/')}</td>{data.admin && <td>{row.teacher}</td>}
          <td>{row.startTime}–{row.endTime}</td><td>{row.periods}</td><td>{row.note}{row.reason && <div className="text-body-secondary">Duyệt: {row.reason}</div>}</td>
          <td><Badge bg={states[row.status][0]}>{states[row.status][1]}</Badge></td>
          <td>{row.rate == null ? '—' : currency.format(row.rate)}</td><td>{row.amount == null ? '—' : currency.format(row.amount)}</td>
          {data.admin && <td>{row.status === 'pending' && <Button variant="outline-primary" size="sm" onClick={() => open(row)}>Duyệt</Button>}</td>}
        </tr>)}</tbody>
      </Table>
      {!data.rows.length && <p>Chưa có công dạy trong tháng này.</p>}
      {data.rows.length > limit && <Button variant="outline-secondary" onClick={() => setLimit(limit + 10)}>Xem thêm</Button>}
    </>}
    <Modal show={Boolean(modal)} centered onHide={() => { if (!saving) setModal(null); }}>
      <Form onSubmit={submit}>
        <Modal.Header closeButton={!saving}><Modal.Title>{modal === 'create' ? 'Ghi công dạy' : 'Duyệt công dạy'}</Modal.Title></Modal.Header>
        <Modal.Body>
          {issue && <Alert variant="danger" className="text-center">{issue}</Alert>}
          {modal === 'create' ? <>
            {!!data?.slots.length && <Form.Group controlId="period-slot" className="mb-3"><Form.Label>Khung lịch giảng dạy (không bắt buộc)</Form.Label>
              <Form.Select value={draft.slotId} onChange={(e) => {
                const slot = data.slots.find((item) => String(item.id) === e.target.value);
                setDraft((old) => slot ? { ...old, slotId: e.target.value, date: slot.date, start: slot.startTime, end: slot.endTime } : { ...old, slotId: '' });
              }}><option value="">Nhập giờ dạy thực tế</option>
                {data.slots.map((s) => <option key={s.id} value={s.id}>{s.date} · {s.startTime}–{s.endTime}</option>)}
              </Form.Select></Form.Group>}
            <Form.Group controlId="period-date" className="mb-3"><Form.Label>Ngày dạy</Form.Label>
              <Form.Control required type="date" value={draft.date} max={vnDate()}
                onChange={(e) => setDraft((old) => ({ ...old, date: e.target.value, slotId: '' }))} />
            </Form.Group>
            <Stack direction="horizontal" gap={2} className="mb-3 flex-wrap">
              <Form.Group controlId="period-start"><Form.Label>Giờ bắt đầu</Form.Label><Form.Control required type="time" value={draft.start} onChange={change('start')} /></Form.Group>
              <Form.Group controlId="period-end"><Form.Label>Giờ kết thúc</Form.Label><Form.Control required type="time" value={draft.end} onChange={change('end')} /></Form.Group>
              <Form.Group controlId="period-count"><Form.Label>Số tiết thực dạy</Form.Label><Form.Control required type="number" min={1} max={24} value={draft.periods} onChange={change('periods')} /></Form.Group>
            </Stack>
            <Form.Group controlId="period-note"><Form.Label>Nội dung hoặc lý do</Form.Label><Form.Control required as="textarea" maxLength={500} value={draft.note} onChange={change('note')} /></Form.Group>
          </> : modal && <>
            <p>{modal.teacher} · {modal.date} · {modal.periods} tiết</p>
            <Form.Group controlId="period-decision" className="mb-3"><Form.Label>Kết quả</Form.Label>
              <Form.Select value={draft.status} onChange={change('status')}>
                <option value="approved">Duyệt và ghi nhận tiền công</option><option value="rejected">Từ chối</option>
              </Form.Select>
            </Form.Group>
            {draft.status === 'approved' && <Form.Group controlId="period-rate" className="mb-3"><Form.Label>Đơn giá mỗi tiết (VND)</Form.Label>
              <Form.Control required type="number" min={0} max={100000000} step={1} value={draft.rate} onChange={change('rate')} />
              {draft.rate !== '' && <Form.Text>Tạm tính: {currency.format(Number(draft.rate) * modal.periods)}</Form.Text>}
            </Form.Group>}
            <Form.Group controlId="period-reason"><Form.Label>{draft.status === 'rejected' ? 'Lý do từ chối' : 'Ghi chú duyệt (không bắt buộc)'}</Form.Label>
              <Form.Control required={draft.status === 'rejected'} as="textarea" maxLength={500} value={draft.reason} onChange={change('reason')} />
            </Form.Group>
          </>}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" disabled={saving} onClick={() => setModal(null)}>Đóng</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Xác nhận'}</Button></Modal.Footer>
      </Form>
    </Modal>
  </>;
}

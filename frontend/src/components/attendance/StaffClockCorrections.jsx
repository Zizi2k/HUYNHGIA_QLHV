import { useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import api from '../../services/api';

const path = '/staff-clock';
const local = (ms) => new Date(Number(ms) + 25200000).toISOString().slice(0,16);
const label = { pending: 'Chờ duyệt', granted: 'Được sửa một lần', rejected: 'Từ chối', applied: 'Đã áp dụng' };
export default function StaffClockCorrections({ data, shift, clearShift, onSaved }) {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function history() {
    setError('');
    setRows([]);
    try { setRows((await api.get(path + '/corrections')).data); }
    catch (err) { setError(err.response?.data?.message || 'Không tải được yêu cầu'); }
  }
  const current = draft || (shift ? {
    start: local(shift.started_ms), end: shift.ended_ms == null ? '' : local(shift.ended_ms),
    rest: shift.rest_minutes, reason: '',
  } : null);
  const field = (key) => (e) => setDraft({ ...current, [key]: e.target.value });
  function close() { setDraft(null); clearShift(); setError(''); }
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (shift) await api.post(path + '/shifts/' + shift.id + '/corrections', { ...current, rest: Number(current.rest) });
      else if (draft.mode === 'apply') await api.post(path + '/corrections/' + draft.id + '/apply');
      else await api.post(path + '/corrections/' + draft.id + '/review', { decision: draft.decision, note: draft.note });
      close();
      await onSaved();
      await history();
    } catch (err) { setError(err.response?.data?.message || 'Không lưu được yêu cầu'); }
    finally { setBusy(false); }
  }
  const act = (row, mode) => { setError(''); setDraft({ id: row.id, mode, decision: 'granted', note: '' }); };
  return <>
    <Button size="sm" variant="outline-primary" className="my-2" onClick={history}>Yêu cầu sửa công</Button>
    <Modal centered size="xl" show={rows !== null && !current} onHide={() => setRows(null)}>
      <Modal.Header closeButton><Modal.Title>Yêu cầu sửa chấm công</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {rows?.length === 0 && <p>Chưa có yêu cầu.</p>}
        <Table responsive size="sm"><thead><tr><th>Giáo viên / Ca</th><th>Đề nghị (giờ Việt Nam)</th><th>Lý do</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{rows?.map((r) => <tr key={r.id}><td>{r.teacher} · #{r.shift_id}</td>
            <td>{local(r.after_start).replace('T',' ')} đến {local(r.after_end).replace('T',' ')} · nghỉ {r.after_rest} phút</td>
            <td>{r.reason}{r.review_note && <div>Phản hồi: {r.review_note}</div>}</td><td>{label[r.status]}</td><td>
              {r.teacher_id === data.viewerId && r.status === 'granted' && <Button size="sm" onClick={() => act(r,'apply')}>Áp dụng một lần</Button>}
              {r.teacher_id !== data.viewerId && (data.admin || data.manager) && r.status === 'pending' && <Button size="sm" onClick={() => act(r,'review')}>Xét duyệt</Button>}
            </td></tr>)}</tbody></Table>
      </Modal.Body>
    </Modal>
    <Modal centered show={Boolean(current)} onHide={() => { if (!busy) close(); }}>
      <Form onSubmit={save}>
        <Modal.Header closeButton={!busy}><Modal.Title>{shift ? 'Đề nghị sửa ca #' + shift.id : 'Xử lý yêu cầu'}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          {shift && current && <>
            <Form.Group controlId="correction-start"><Form.Label>Giờ vào (Việt Nam)</Form.Label><Form.Control required type="datetime-local" value={current.start} onChange={field('start')} /></Form.Group>
            <Form.Group controlId="correction-end"><Form.Label>Giờ ra (Việt Nam)</Form.Label><Form.Control required type="datetime-local" value={current.end} onChange={field('end')} /></Form.Group>
            <Form.Group controlId="correction-rest"><Form.Label>Phút nghỉ</Form.Label><Form.Control required type="number" step={15} min={0} max={720} value={current.rest} onChange={field('rest')} /></Form.Group>
            <Form.Group controlId="correction-reason"><Form.Label>Lý do sửa</Form.Label><Form.Control required as="textarea" maxLength={500} value={current.reason} onChange={field('reason')} /></Form.Group>
          </>}
          {draft?.mode === 'review' && <>
            <Form.Group controlId="correction-decision"><Form.Label>Kết quả</Form.Label><Form.Select value={draft.decision} onChange={field('decision')}>
              <option value="granted">Cấp quyền sửa một lần</option><option value="rejected">Từ chối</option></Form.Select></Form.Group>
            <Form.Group controlId="correction-note"><Form.Label>Phản hồi</Form.Label><Form.Control as="textarea" required={draft.decision === 'rejected'} maxLength={500} value={draft.note} onChange={field('note')} /></Form.Group>
          </>}
          {draft?.mode === 'apply' && <p>Áp dụng đúng nội dung đã được duyệt. Quyền sửa sẽ hết hiệu lực sau khi lưu.</p>}
        </Modal.Body>
        <Modal.Footer><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận'}</Button></Modal.Footer>
      </Form>
    </Modal>
  </>;
}

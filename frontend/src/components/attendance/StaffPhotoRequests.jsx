import { useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import api from '../../services/api';

const path = '/staff-clock/photo-requests';
export default function StaffPhotoRequests({ data, event, clearEvent, refresh }) {
  const [rows, setRows] = useState(null);
  const [replacement, setReplacement] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function history() {
    setRows([]);
    setError('');
    try { setRows((await api.get(path)).data); }
    catch (err) { setError(err.response?.data?.message || 'Không tải được yêu cầu thay ảnh.'); }
  }
  function closeEdit() { clearEvent(); setReplacement(null); setReason(''); setError(''); }
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (event) await api.post(path + '/event/' + event.id, { reason });
      else {
        const form = new FormData();
        form.append('photo', replacement.file);
        await api.post(path + '/' + replacement.id + '/replace', form);
      }
      closeEdit();
      await refresh();
      await history();
    } catch (err) { setError(err.response?.data?.message || 'Không lưu được yêu cầu.'); }
    finally { setBusy(false); }
  }
  return <>
    <Button size="sm" variant="outline-secondary" className="ms-2" onClick={history}>Yêu cầu thay ảnh</Button>
    <Modal centered size="lg" show={rows !== null && !event && !replacement} onHide={() => setRows(null)}>
      <Modal.Header closeButton><Modal.Title>Yêu cầu thay ảnh minh chứng</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {rows?.length === 0 && <p>Chưa có yêu cầu thay ảnh.</p>}
        {rows?.length > 0 && <Table responsive size="sm"><thead><tr><th>Ca</th><th>Lý do</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td>{row.teacher} · #{row.shift_id} · {row.direction === 'in' ? 'Ảnh vào' : 'Ảnh ra'}</td>
            <td>{row.reason}</td><td>{row.completed_at ? 'Đã thay' : 'Chờ giáo viên'}</td>
            <td>{row.teacher_id === data.viewerId && !row.completed_at && <Button size="sm" onClick={() => {
              setError(''); setReplacement({ id: row.id, file: null });
            }}>Nộp ảnh mới</Button>}</td></tr>)}</tbody></Table>}
      </Modal.Body>
    </Modal>
    <Modal centered show={Boolean(event || replacement)} onHide={() => { if (!busy) closeEdit(); }}>
      <Form onSubmit={save}>
        <Modal.Header closeButton={!busy}><Modal.Title>{event ? 'Yêu cầu thay ' + event.label : 'Nộp ảnh minh chứng mới'}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          {event ? <Form.Group controlId="photo-request-reason"><Form.Label>Lý do</Form.Label>
            <Form.Control required as="textarea" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Form.Group>
            : <Form.Group controlId="photo-replacement"><Form.Label>Ảnh mới</Form.Label>
              <Form.Control required type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => {
                const file = e.target.files[0] || null;
                if (file && file.size > 1536 * 1024) {
                  setError('Ảnh tối đa 1,5 MB.'); e.target.value = ''; setReplacement((old) => ({ ...old, file: null })); return;
                }
                setError(''); setReplacement((old) => ({ ...old, file }));
              }} /><Form.Text>Ảnh mới thay ảnh cũ; giờ công và vị trí gốc giữ nguyên.</Form.Text></Form.Group>}
        </Modal.Body>
        <Modal.Footer><Button disabled={busy || (!event && !replacement?.file)} type="submit">{busy ? 'Đang lưu…' : 'Xác nhận'}</Button></Modal.Footer>
      </Form>
    </Modal>
  </>;
}

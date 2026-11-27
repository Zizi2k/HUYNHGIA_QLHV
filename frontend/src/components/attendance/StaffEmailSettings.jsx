import { useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import api from '../../services/api';

const base = '/staff-departments/email';
const states = { queued: 'Chờ gửi / thử lại', sending: 'Đang gửi', accepted: 'Dịch vụ đã nhận', failed: 'Không gửi được', skipped: 'Đã bỏ qua' };
export default function StaffEmailSettings() {
  const [show, setShow] = useState(false);
  const [data, setData] = useState(null);
  const [chosen, setChosen] = useState('');
  const [email, setEmail] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    try { setData((await api.get(base + '/settings')).data); }
    catch (err) { setError(err.response?.data?.message || 'Không tải được cấu hình email.'); }
  }
  function open() { setError(''); setShow(true); void load(); }
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.put(base + '/' + chosen, { email, enabled });
      setChosen(''); setEmail(''); setEnabled(false);
      await load();
    } catch (err) { setError(err.response?.data?.message || 'Không lưu được địa chỉ email.'); }
    finally { setBusy(false); }
  }
  return <>
    <Button className="ms-2" variant="outline-primary" onClick={open}>Email thông báo</Button>
    <Modal size="lg" centered show={show} onHide={() => { if (!busy) setShow(false); }}>
      <Modal.Header closeButton={!busy}><Modal.Title>Email chấm công và lương</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {data && <>
          <Alert variant={data.configured ? 'info' : 'warning'}>
            {data.configured ? 'Máy chủ đã bật dịch vụ gửi email. Trạng thái “Dịch vụ đã nhận” không xác nhận thư đến hộp thư.'
              : 'Chưa cấu hình hoặc chưa bật dịch vụ gửi email. Hiện chỉ có thông báo trong web.'}
          </Alert>
          <Form onSubmit={save}>
            <Form.Group controlId="staff-email-user" className="mb-2"><Form.Label>Tài khoản</Form.Label>
              <Form.Select required value={chosen} onChange={(e) => {
                const id = e.target.value, user = data.contacts.find((row) => String(row.id) === id);
                setChosen(id); setEmail(user?.email || ''); setEnabled(Boolean(user?.enabled));
              }}><option value="">Chọn giáo viên hoặc quản trị viên</option>
                {data.contacts.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.code}</option>)}</Form.Select></Form.Group>
            <Form.Group controlId="staff-email-address" className="mb-2"><Form.Label>Email nhận</Form.Label>
              <Form.Control type="email" value={email} required={enabled} maxLength={254} onChange={(e) => setEmail(e.target.value)} /></Form.Group>
            <Form.Check className="mb-2" id="staff-email-enabled" label="Đã xác nhận địa chỉ và bật nhận thông báo mới"
              checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <Button type="submit" disabled={!chosen || busy}>{busy ? 'Đang lưu…' : 'Lưu email'}</Button>
          </Form>
          <Table responsive size="sm" className="mt-3"><thead><tr><th>Tài khoản</th><th>Email nhận</th><th>Trạng thái</th><th>Gửi gần nhất</th></tr></thead>
            <tbody>{data.contacts.filter((u) => u.email).map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td>
              <td>{u.enabled ? 'Đã bật' : 'Đã tắt'}</td><td>{states[u.last_state] || '—'}</td></tr>)}</tbody></Table>
        </>}
      </Modal.Body>
    </Modal>
  </>;
}

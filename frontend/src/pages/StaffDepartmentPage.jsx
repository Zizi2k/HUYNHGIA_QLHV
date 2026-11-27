import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import api from '../services/api';
import StaffEmailSettings from '../components/attendance/StaffEmailSettings';

const endpoint = '/staff-departments';
const empty = { name: '', active: true, assignments: [] };

export default function StaffDepartmentPage() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try { setData((await api.get(endpoint)).data); }
    catch (e) { setError(e.response?.data?.message || 'Không tải được phòng ban'); }
  }
  useEffect(() => { void refresh(); }, []);
  function toggle(user_id, membership, checked) {
    setDraft((old) => ({
      ...old, assignments: checked ? [...old.assignments, { user_id, membership }]
        : old.assignments.filter((row) => row.user_id !== user_id || row.membership !== membership),
    }));
  }
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!draft.id) await api.post(endpoint, { name: draft.name });
      else await api.put(endpoint + '/' + draft.id, draft);
      setDraft(null);
      await refresh();
    } catch (err) { setError(err.response?.data?.message || 'Không lưu được phòng ban'); }
    finally { setBusy(false); }
  }
  return <section>
    <h1 className="h3">Phòng ban giảng dạy</h1>
    <p>Quản lý được xem công, minh chứng và kỳ lương của giáo viên trong phòng ban được phân công. Không có quyền chốt lương hoặc ghi giao dịch.</p>
    {!draft && error && <Alert variant="danger">{error}</Alert>}
    {data && <><Button onClick={() => { setError(''); setDraft(empty); }}>Tạo phòng ban</Button><StaffEmailSettings />
      <Table responsive bordered className="mt-3"><thead><tr><th>Phòng ban</th><th>Giáo viên</th><th>Quản lý</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{data.departments.map((d) => <tr key={d.id}>
          <td>{d.name}</td><td>{d.assignments.filter((a) => a.membership === 'member').length}</td>
          <td>{d.assignments.filter((a) => a.membership === 'manager').map((a) => data.accounts.find((u) => u.id === a.user_id)?.name || a.user_id).join(', ') || '—'}</td>
          <td>{d.active ? 'Hoạt động' : 'Đã ngừng'}</td><td><Button size="sm" variant="outline-primary" onClick={() => { setError(''); setDraft({ ...d, active: Boolean(d.active) }); }}>Phân công</Button></td>
        </tr>)}</tbody></Table></>}
    <Modal centered show={Boolean(draft)} onHide={() => { if (!busy) setDraft(null); }}>
      <Form onSubmit={save}>
        <Modal.Header closeButton={!busy}><Modal.Title>{draft?.id ? 'Phân công phòng ban' : 'Tạo phòng ban'}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form.Group controlId="department-name"><Form.Label>Tên phòng ban</Form.Label><Form.Control required maxLength={100} value={draft?.name || ''}
            onChange={(e) => setDraft((old) => ({ ...old, name: e.target.value }))} /></Form.Group>
          {draft?.id && <>
            <Form.Check className="my-3" id="department-active" label="Đang hoạt động" checked={draft.active}
              onChange={(e) => setDraft((old) => ({ ...old, active: e.target.checked }))} />
            <div className="overflow-auto" style={{ maxHeight: '45vh' }}>
              <Table size="sm"><thead><tr><th>Tài khoản</th><th>Giáo viên</th><th>Quản lý</th></tr></thead>
                <tbody>{data.accounts.map((u) => <tr key={u.id}><td>{u.name} · {u.code}</td>
                  {['member','manager'].map((role) => <td key={role}>{(role === 'manager' || u.role === 'teacher') && <Form.Check
                    aria-label={u.name + (role === 'manager' ? ' làm quản lý' : ' là giáo viên')}
                    checked={draft.assignments.some((a) => a.user_id === u.id && a.membership === role)}
                    onChange={(e) => toggle(u.id, role, e.target.checked)} />}</td>)}</tr>)}</tbody></Table>
            </div>
          </>}
        </Modal.Body>
        <Modal.Footer><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</Button></Modal.Footer>
      </Form>
    </Modal>
  </section>;
}

import { useState } from 'react';
import { Alert, Button, Form, Modal, Stack, Table } from 'react-bootstrap';
import api from '../../services/api';

const base = '/staff-clock/import';
export default function StaffClockImport({ onImported }) {
  const [show, setShow] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');
  const permitted = preview && !preview.alreadyImported && preview.rows.some((r) => r.status === 'ready')
    && preview.rows.every((r) => r.status === 'ready' || (skip && r.status === 'duplicate'));
  function close(force = false) {
    if (busy && force !== true) return;
    setShow(false);
    setFile(null);
    setPreview(null);
    setSkip(false);
    setError('');
  }
  async function template() {
    setBusy('template');
    setNotice(null);
    try {
      const { data } = await api.get(base + '/template', { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'mau-cham-cong-giao-vien.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setNotice({ error: true, text: 'Không tải được mẫu Excel.' }); }
    finally { setBusy(''); }
  }
  async function send(action) {
    if (!file || busy) return;
    setBusy(action);
    setError('');
    const form = new FormData();
    form.append('file', file);
    if (action === 'commit') {
      form.append('hash', preview.hash);
      form.append('skipDuplicates', skip ? '1' : '0');
    }
    try {
      const { data } = await api.post(base + '/' + action, form);
      if (action === 'preview') setPreview(data);
      else if (data.blocked) {
        setPreview((old) => ({ ...old, rows: data.rows }));
        setError('Dữ liệu đã thay đổi hoặc có dòng lỗi. Chưa lưu dòng nào.');
      } else {
        setNotice({ text: data.imported ? `Đã nhập ${data.imported} ca.` : 'Không có ca mới để nhập.' });
        close(true);
        await onImported();
      }
    } catch (err) { setError(err.response?.data?.message || 'Không xử lý được tệp Excel.'); }
    finally { setBusy(''); }
  }
  return <>
    <Stack direction="horizontal" gap={2} className="mb-2 flex-wrap">
      <Button variant="outline-secondary" disabled={Boolean(busy)} onClick={template}>Tải mẫu Excel</Button>
      <Button variant="outline-primary" disabled={Boolean(busy)} onClick={() => { setNotice(null); setShow(true); }}>Nhập chấm công Excel</Button>
    </Stack>
    {notice && <Alert className="text-center" variant={notice.error ? 'danger' : 'success'}>{notice.text}</Alert>}
    <Modal centered size="xl" show={show} onHide={close}>
      <Modal.Header closeButton={!busy}><Modal.Title>Nhập chấm công từ Excel</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="text-center">{error}</Alert>}
        <Form.Group controlId="staff-clock-import-file" className="mb-3"><Form.Label>Tệp Excel chấm công</Form.Label>
          <Form.Control type="file" accept=".xlsx" disabled={Boolean(busy)} onChange={(e) => {
            setFile(e.target.files[0] || null); setPreview(null); setError(''); setSkip(false);
          }} /><Form.Text>Tối đa 300 dòng và 1 MB. Xem trước không ghi dữ liệu; khi xác nhận, nếu còn lỗi thì không lưu dòng nào.</Form.Text>
        </Form.Group>
        {preview?.alreadyImported && <Alert variant="warning">Tệp này đã được nhập trước đó.</Alert>}
        {preview && <>
          <Form.Check className="mb-3" label="Bỏ qua ca đã tồn tại đúng giờ vào, giờ ra và phút nghỉ"
            checked={skip} disabled={Boolean(busy)} onChange={(e) => setSkip(e.target.checked)} />
          <div className="overflow-auto" style={{ maxHeight: '45vh' }}>
            <Table responsive bordered size="sm"><thead><tr><th>Dòng</th><th>Giáo viên</th><th>Ngày / giờ</th><th>Phút công</th><th>Kết quả</th></tr></thead>
              <tbody>{preview.rows.map((r) => <tr key={r.line}>
                <td>{r.line}</td><td>{r.code} {r.name}</td>
                <td>{r.date ? `${r.date} · ${r.start}–${r.end}` : '—'}</td>
                <td>{r.payableMinutes ?? '—'}</td>
                <td className={r.status === 'error' ? 'text-danger' : r.status === 'duplicate' ? 'text-warning-emphasis' : 'text-success'}>
                  {r.status === 'ready' ? 'Hợp lệ' : r.error}
                </td></tr>)}</tbody></Table>
          </div>
        </>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={Boolean(busy)} onClick={close}>Đóng</Button>
        <Button variant="outline-primary" disabled={!file || Boolean(busy)} onClick={() => send('preview')}>{busy === 'preview' ? 'Đang kiểm tra…' : 'Xem trước'}</Button>
        <Button disabled={!permitted || Boolean(busy)} onClick={() => send('commit')}>{busy === 'commit' ? 'Đang nhập…' : 'Xác nhận nhập'}</Button>
      </Modal.Footer>
    </Modal>
  </>;
}

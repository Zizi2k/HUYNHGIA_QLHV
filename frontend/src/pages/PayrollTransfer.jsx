import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';

const normalize = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/đ/g, 'd');

export default function PayrollTransfer({ api, path, format }) {
  const [banks, setBanks] = useState(null);
  const [search, setSearch] = useState('');
  const [bin, setBin] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [name, setName] = useState('');
  const [qr, setQr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const eligible = consent && /^[0-9]{6,19}$/.test(accountNumber) && !!bin && !busy;
  const clear = () => { setName(''); setQr(null); setError(''); };
  async function run(action) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (err) { setError(err.response?.data?.message || 'Không thể kết nối dịch vụ VietQR'); }
    finally { setBusy(false); }
  }
  if (!banks) return <div className="mb-3">
    <Button size="sm" variant="outline-primary" disabled={busy} onClick={() => run(async () => setBanks((await api.get('/teaching-payroll/transfer/banks')).data))}>
      {busy ? 'Đang tải…' : 'Chuẩn bị QR chuyển khoản'}</Button>
    {error && <Alert variant="danger" className="mt-2">{error}</Alert>}
  </div>;
  const filtered = banks.filter((bank) => bank.bin === bin || normalize(`${bank.shortName} ${bank.name} ${bank.code} ${bank.bin}`).includes(normalize(search.trim())));
  return <section className="border rounded p-3 mb-3">
    <h3 className="h6">QR chuyển khoản</h3>
    <fieldset disabled={busy}>
      <Form.Group controlId="pay-qr-search"><Form.Label>Tìm ngân hàng</Form.Label>
        <Form.Control value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên, mã hoặc BIN" /></Form.Group>
      <Form.Group controlId="pay-qr-bank" className="mt-2"><Form.Label>Ngân hàng nhận</Form.Label>
        <Form.Select value={bin} onChange={(e) => { clear(); setBin(e.target.value); }}>
          <option value="">Chọn ngân hàng</option>{filtered.map((bank) => <option key={bank.bin} value={bank.bin}>{bank.shortName} · {bank.name}</option>)}
        </Form.Select></Form.Group>
      <Form.Group controlId="pay-qr-account" className="mt-2"><Form.Label>Số tài khoản nhận</Form.Label>
        <Form.Control inputMode="numeric" value={accountNumber} maxLength={19}
          onChange={(e) => { clear(); setAccountNumber(e.target.value.replace(/[^0-9]/g, '')); }} /></Form.Group>
      <Form.Check id="pay-qr-consent" className="mt-2" checked={consent} onChange={(e) => { clear(); setConsent(e.target.checked); }}
        label="Đồng ý gửi thông tin cần thiết tới VietQR để tra cứu hoặc tạo QR." />
    </fieldset>
    <div className="d-flex gap-2 flex-wrap my-2">
      <Button size="sm" variant="outline-secondary" disabled={!eligible} onClick={() => run(async () => {
        setName(''); setName((await api.post(path + '/lookup', { bin, accountNumber })).data.accountName);
      })}>Tra tên chủ tài khoản</Button>
      <Button size="sm" disabled={!eligible} onClick={() => run(async () => {
        setQr(null); setQr((await api.post(path + '/qr', { bin, accountNumber })).data);
      })}>Tạo QR</Button>
    </div>
    {error && <Alert variant="danger">{error}</Alert>}
    <div>{name ? `Tên VietQR trả về: ${name}` : 'Chưa xác minh tên chủ tài khoản.'}</div>
    {qr && <div><img width="220" height="220" src={qr.image} alt="QR chuyển khoản lương" /><p>Số tiền trên QR: {format(qr.amount)}</p></div>}
    <small>Đối chiếu tên, số tài khoản và số tiền trong ứng dụng ngân hàng trước khi chuyển. Tạo QR không ghi nhận đã thanh toán.</small>
  </section>;
}

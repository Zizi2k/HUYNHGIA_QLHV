import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import api from '../services/api';
import TeachingPayrollReport from '../components/attendance/TeachingPayrollReport';

const path = '/teaching-payroll';
const dateVN = () => new Date(Date.now() + 25200000).toISOString().slice(0, 10);
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const format = (value) => money.format(Number(value || 0));
const remaining = (row) => Number(row.amount) - Number(row.advance) - Number(row.payment);
const errorText = (error) => error.response?.data?.message || 'Không thể xử lý yêu cầu';
const methods = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', other: 'Khác' };
const bases = { period: 'Theo tiết', hour: 'Theo giờ', month: 'Lương tháng' };
const units = { period: 'tiết', hour: 'giờ', month: 'tháng' };
const quantity = (row) => row.unit === 'hour' ? `${row.quantity} phút` : `${row.quantity ?? row.periods} ${units[row.unit || 'period']}`;

export default function TeachingPayrollPage() {
  const [month, setMonth] = useState(dateVN().slice(0, 7));
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [debts, setDebts] = useState(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [draftDetail, setDraftDetail] = useState(null);
  const [form, setForm] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState('');
  const load = useCallback(async (signal) => {
    try {
      const { data: result } = await api.get(path, { params: { month }, signal });
      if (!signal?.aborted) setData(result);
    } catch (err) { if (!signal?.aborted) setFeedback({ error: true, text: errorText(err) }); }
  }, [month]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setFeedback(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  async function view(id) {
    setFeedback(null);
    try { setDetail((await api.get(path + '/' + id)).data); }
    catch (err) { setFeedback({ error: true, text: errorText(err) }); }
  }
  async function viewDebts() {
    setDebtLoading(true);
    try { setDebts((await api.get(path + '/debts')).data); }
    catch (err) { setFeedback({ error: true, text: errorText(err) }); }
    finally { setDebtLoading(false); }
  }
  const draftPath = (teacher) => `${path}/draft/${teacher.teacherId}/${month}/advances`;
  async function viewDraft(teacher) {
    try { setDraftDetail({ teacher, entries: (await api.get(draftPath(teacher))).data }); }
    catch (err) { setFeedback({ error: true, text: errorText(err) }); }
  }
  function open(formValue) { setError(''); setForm(formValue); }
  async function download(format, entryId) {
    if (exporting || !detail) return;
    const key = entryId ? 'receipt-' + entryId : format;
    setExporting(key);
    setFeedback(null);
    try {
      const base = path + '/' + detail.id;
      const endpoint = entryId ? base + '/entries/' + entryId + '/receipt' : base + '/export/' + format;
      const { data: blob } = await api.get(endpoint, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = entryId ? `phieu-giao-dich-${detail.id}-${entryId}.pdf` : `luong-giao-vien-${detail.month}-${detail.id}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      const response = err.response?.data;
      let text = 'Không tải được chứng từ. Vui lòng thử lại.';
      if (response instanceof Blob) {
        try { text = JSON.parse(await response.text()).message || text; } catch { /* dùng thông báo mặc định */ }
      }
      setFeedback({ error: true, text });
    } finally { setExporting(''); }
  }
  const field = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (form.mode === 'close') {
        await api.post(path + '/close', { teacherId: form.teacher.teacherId, month });
      } else if (form.mode === 'basis') {
        await api.put(path + '/draft/' + form.teacherId + '/' + month + '/basis',
          { basis: form.basis, rate: Number(form.rate), note: form.note });
      } else if (form.mode === 'entry') {
        await api.post(path + '/' + detail.id + '/entries', { ...form, amount: Number(form.amount) });
      } else if (form.mode === 'draft-entry') {
        await api.post(draftPath(draftDetail.teacher), { ...form, amount: Number(form.amount) });
      } else if (form.mode === 'draft-void') {
        await api.post(draftPath(draftDetail.teacher) + '/' + form.id + '/void', { reason: form.reason });
      } else {
        await api.post(path + '/' + detail.id + '/entries/' + form.id + '/void', { reason: form.reason });
      }
      setForm(null);
      setFeedback({ text: form.mode === 'close' ? 'Đã chốt kỳ lương.' : form.mode === 'basis' ? 'Đã lưu cách tính lương.' : 'Đã cập nhật giao dịch.' });
      await load();
      if (detail) setDetail((await api.get(path + '/' + detail.id)).data);
      if (draftDetail) await viewDraft(draftDetail.teacher);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  return <section>
    <h1 className="h3">Lương giáo viên</h1>
    <p className="text-body-secondary">Mỗi kỳ chọn một cách tính chính: theo tiết, theo giờ hoặc lương tháng. Ghi nhận ứng và trả lương không thực hiện chuyển tiền.</p>
    {feedback && <Alert className="text-center" variant={feedback.error ? 'danger' : 'success'}>{feedback.text}</Alert>}
    <div className="d-flex gap-2 flex-wrap align-items-end mb-3"><Form.Group controlId="teaching-pay-month">
      <Form.Label>Tháng</Form.Label>
      <Form.Control className="w-auto" type="month" value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} />
    </Form.Group>
      <Button variant="outline-primary" disabled={!data || debtLoading} onClick={viewDebts}>
        {debtLoading ? 'Đang tải…' : 'Xem công nợ lương'}
      </Button>
      {(data?.admin || data?.manager) && <TeachingPayrollReport admin={data.admin} month={month} />}
    </div>
    {!data && !feedback?.error && <p role="status">Đang tải…</p>}
    {data?.admin && <><div className="d-flex gap-2 align-items-center flex-wrap mb-2">
      <h2 className="h5 mb-0">Chưa chốt</h2>
      <Button variant="outline-primary" size="sm" onClick={() => open({ mode: 'basis', teacherId: '', basis: 'period', rate: '', note: '' })}>Chọn cách tính lương</Button>
    </div>
      <Table responsive bordered><thead><tr><th>Giáo viên</th><th>Cách tính / Công</th><th>Công chưa hoàn tất</th><th>Tiền công tạm tính</th><th>Đã ứng</th><th>Thao tác</th></tr></thead>
        <tbody>{data.drafts.map((row) => <tr key={row.teacherId}><td>{row.name} · {row.code}</td>
          <td>{bases[row.basis]}{row.basis === 'period' ? ` · ${row.periods} tiết` : row.basis === 'hour' ? ` · ${row.minutes} phút` : ''}</td>
          <td>{row.pending}</td><td>{format(row.amount)}</td><td>{format(row.advance)}</td><td><div className="d-flex flex-wrap gap-2"><Button size="sm"
            disabled={!data.canClose || Number(row.pending) > 0}
            onClick={() => open({ mode: 'close', teacher: row })}>Chốt tháng</Button>
            <Button size="sm" variant="outline-primary" onClick={() => viewDraft(row)}>Ứng trước kỳ</Button></div></td></tr>)}</tbody></Table>
      {!data.drafts.length && <p>Không có công đang chờ chốt trong tháng này.</p>}
      {!data.canClose && <p className="text-body-secondary">Chỉ chốt khi tháng đã kết thúc.</p>}
    </>}
    {data && <><h2 className="h5">Kỳ đã chốt</h2>
      <Table responsive bordered><thead><tr><th>Giáo viên</th><th>Phải trả</th><th>Đã ứng</th><th>Đã trả</th><th>Còn phải trả</th><th>Chi tiết</th></tr></thead>
        <tbody>{data.closed.map((row) => <tr key={row.id}><td>{row.name}</td><td>{format(row.amount)}</td>
          <td>{format(row.advance)}</td><td>{format(row.payment)}</td><td>{format(remaining(row))}</td>
          <td><Button variant="outline-primary" size="sm" onClick={() => view(row.id)}>Xem phiếu</Button></td></tr>)}</tbody></Table>
      {!data.closed.length && <p>Chưa có kỳ lương được chốt trong tháng này.</p>}
    </>}
    <Modal centered size="lg" show={debts !== null} onHide={() => setDebts(null)}>
      <Modal.Header closeButton><Modal.Title>Công nợ lương đã chốt</Modal.Title></Modal.Header>
      <Modal.Body>
        {debts?.length === 0 && <p>Không có khoản lương còn phải trả.</p>}
        {debts?.map((group) => <section key={group.teacherId} className="mb-3">
          <h3 className="h6">{group.name} · {group.code} · Tổng còn nợ: {format(group.total)}</h3>
          <Table responsive size="sm"><thead><tr><th>Kỳ lương</th><th>Còn phải trả</th><th>Phiếu</th></tr></thead>
            <tbody>{group.months.map((row) => <tr key={row.id}><td>{row.month}</td><td>{format(row.remaining)}</td>
              <td><Button size="sm" variant="outline-primary" onClick={() => { setDebts(null); void view(row.id); }}>Xem phiếu</Button></td></tr>)}</tbody>
          </Table>
        </section>)}
      </Modal.Body>
    </Modal>
    <Modal centered size="lg" show={Boolean(detail) && !form} onHide={() => setDetail(null)}>
      <Modal.Header closeButton><Modal.Title>Phiếu lương #{detail?.id}</Modal.Title></Modal.Header>
      {detail && <Modal.Body>
        {feedback && <Alert className="text-center" variant={feedback.error ? 'danger' : 'success'}>{feedback.text}</Alert>}
        <p>{detail.name} · {detail.code} · Kỳ {detail.month}</p>
        <div className="d-flex gap-2 flex-wrap mb-3">
          <Button variant="outline-primary" size="sm" disabled={Boolean(exporting)} onClick={() => download('pdf')}>{exporting === 'pdf' ? 'Đang xuất…' : 'Tải PDF để in'}</Button>
          <Button variant="outline-success" size="sm" disabled={Boolean(exporting)} onClick={() => download('xlsx')}>{exporting === 'xlsx' ? 'Đang xuất…' : 'Tải Excel'}</Button>
        </div>
        <Table responsive bordered size="sm"><thead><tr><th>Ngày</th><th>Nội dung</th><th>Khối lượng</th><th>Đơn giá</th><th>Tiền công</th></tr></thead>
          <tbody>{detail.snapshot.map((row) => <tr key={row.id}><td>{row.date}</td><td>{row.className}</td><td>{quantity(row)}</td>
            <td>{format(row.rate)}/{units[row.unit || 'period']}</td><td>{format(row.amount)}</td></tr>)}</tbody></Table>
        <p><strong>Phải trả: {format(detail.amount)}</strong><br />
          Đã ứng: {format(detail.advance)} · Đã trả: {format(detail.payment)} · Còn phải trả: {format(detail.remaining)}</p>
        <h3 className="h6">Giao dịch</h3>
        <Table responsive size="sm"><thead><tr><th>Mã / Ngày</th><th>Loại / Phương thức</th><th>Số tiền</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
          <tbody>{detail.entries.map((entry) => <tr key={entry.id}><td>#{entry.id} · {entry.date}</td>
            <td>{entry.kind === 'advance' ? 'Ứng lương' : 'Trả lương'} · {methods[entry.method]}</td><td>{format(entry.amount_vnd)}</td>
            <td>{entry.note}{entry.voided_at && <div>Đã hủy: {entry.void_reason}</div>}</td>
            <td><div className="d-flex gap-2 flex-wrap"><Button variant="outline-primary" size="sm" disabled={Boolean(exporting)}
              onClick={() => download('pdf', entry.id)}>{exporting === 'receipt-' + entry.id ? 'Đang xuất…' : 'Tải phiếu'}</Button>
              {data?.admin && !entry.voided_at && <Button variant="outline-danger" size="sm"
                onClick={() => open({ mode: 'void', id: entry.id, reason: '' })}>Hủy</Button>}</div></td></tr>)}</tbody></Table>
        {data?.admin && detail.remaining > 0 && <Button onClick={() => open({
          mode: 'entry', kind: 'payment', method: 'transfer', date: dateVN(), amount: '', note: '', requestId: crypto.randomUUID(),
        })}>Ghi nhận ứng / trả lương</Button>}
      </Modal.Body>}
    </Modal>
    <Modal centered size="lg" show={Boolean(draftDetail) && !form} onHide={() => setDraftDetail(null)}>
      <Modal.Header closeButton><Modal.Title>Ứng trước kỳ · {draftDetail?.teacher.name}</Modal.Title></Modal.Header>
      {draftDetail && <Modal.Body>
        {feedback && <Alert className="text-center" variant={feedback.error ? 'danger' : 'success'}>{feedback.text}</Alert>}
        <p>Chỉ ứng trong phạm vi công đã duyệt. Khi chốt, các giao dịch sẽ được đưa vào kỳ lương.</p>
        <Table responsive size="sm"><thead><tr><th>Ngày</th><th>Số tiền</th><th>Phương thức</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
          <tbody>{draftDetail.entries.map((entry) => <tr key={entry.id}><td>{entry.date}</td><td>{format(entry.amount_vnd)}</td>
            <td>{methods[entry.method]}</td><td>{entry.note}{entry.voided_at && <div>Đã hủy: {entry.void_reason}</div>}</td>
            <td>{!entry.voided_at && <Button size="sm" variant="outline-danger"
              onClick={() => open({ mode: 'draft-void', id: entry.id, reason: '' })}>Hủy</Button>}</td></tr>)}</tbody>
        </Table>
        <Button onClick={() => open({ mode: 'draft-entry', method: 'transfer', date: dateVN(), amount: '', note: '', requestId: crypto.randomUUID() })}>Ghi nhận khoản ứng</Button>
      </Modal.Body>}
    </Modal>
    <Modal centered show={Boolean(form)} onHide={() => { if (!busy) setForm(null); }}>
      <Form onSubmit={save}>
        <Modal.Header closeButton={!busy}><Modal.Title>{{ close: 'Chốt kỳ lương', basis: 'Cách tính lương theo tháng', entry: 'Ghi nhận ứng / trả lương', void: 'Hủy giao dịch',
          'draft-entry': 'Ghi nhận ứng trước kỳ', 'draft-void': 'Hủy khoản ứng trước kỳ' }[form?.mode]}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" className="text-center">{error}</Alert>}
          {form?.mode === 'close' && <p>Chốt lương <strong>{bases[form.teacher.basis]?.toLowerCase()}</strong> cho <strong>{form.teacher.name}</strong> tháng {month} với số tiền <strong>{format(form.teacher.amount)}</strong>? Cách tính và dữ liệu nguồn của kỳ sẽ được giữ nguyên.</p>}
          {form?.mode === 'basis' && <>
            <Form.Group controlId="pay-basis-teacher" className="mb-2"><Form.Label>Giáo viên</Form.Label>
              <Form.Select required value={form.teacherId} onChange={(event) => {
                const teacherId = event.target.value;
                const row = data?.drafts.find((item) => String(item.teacherId) === teacherId);
                setForm((old) => ({ ...old, teacherId, basis: row?.basis || 'period', rate: row?.rate ?? '', note: row?.note || '' }));
              }}><option value="">Chọn giáo viên</option>
                {data?.teachers?.filter((teacher) => !data.closed.some((row) => row.teacherId === teacher.id)).map((teacher) =>
                  <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.code}</option>)}
              </Form.Select></Form.Group>
            <Form.Group controlId="pay-basis" className="mb-2"><Form.Label>Cách tính cho kỳ {month}</Form.Label>
              <Form.Select value={form.basis} onChange={field('basis')}>
                {Object.entries(bases).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Form.Select>
              <Form.Text>{form.basis === 'hour' ? 'Chốt dựa trên phút công của ca đã chấm ra. Không cộng thêm tiền theo tiết.'
                : form.basis === 'month' ? 'Số tiền cố định do quản trị viên nhập; không tự khấu trừ nghỉ hoặc tính thuế.'
                  : 'Chỉ lấy công theo tiết đã duyệt, không cộng giờ chấm công.'}</Form.Text>
            </Form.Group>
            {form.basis !== 'period' && <Form.Group controlId="pay-basis-rate" className="mb-2">
              <Form.Label>{form.basis === 'hour' ? 'Đơn giá một giờ (VND)' : 'Lương cố định tháng này (VND)'}</Form.Label>
              <Form.Control required type="number" min={1} max={1000000000} step={1} value={form.rate} onChange={field('rate')} />
            </Form.Group>}
            <Form.Group controlId="pay-basis-note"><Form.Label>Ghi chú chính sách</Form.Label>
              <Form.Control required maxLength={500} value={form.note} onChange={field('note')} /></Form.Group>
          </>}
          {['entry', 'draft-entry'].includes(form?.mode) && <>
            {form.mode === 'entry' && <Form.Group className="mb-2" controlId="pay-kind"><Form.Label>Loại giao dịch</Form.Label><Form.Select value={form.kind} onChange={field('kind')}>
              <option value="payment">Trả lương</option><option value="advance">Ứng lương</option>
            </Form.Select></Form.Group>}
            <Form.Group className="mb-2" controlId="pay-method"><Form.Label>Phương thức</Form.Label><Form.Select value={form.method} onChange={field('method')}>
              {Object.entries(methods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Form.Select></Form.Group>
            <Form.Group className="mb-2" controlId="pay-amount"><Form.Label>Số tiền (VND)</Form.Label><Form.Control required type="number" min={1} step={1} max={detail?.remaining} value={form.amount} onChange={field('amount')} /></Form.Group>
            <Form.Group className="mb-2" controlId="pay-date"><Form.Label>Ngày giao dịch</Form.Label><Form.Control required type="date" max={dateVN()} value={form.date} onChange={field('date')} /></Form.Group>
            <Form.Group controlId="pay-note"><Form.Label>Nội dung</Form.Label><Form.Control as="textarea" maxLength={500} value={form.note} onChange={field('note')} /></Form.Group>
          </>}
          {['void', 'draft-void'].includes(form?.mode) && <Form.Group controlId="pay-void"><Form.Label>Lý do hủy giao dịch #{form.id}</Form.Label>
            <Form.Control required as="textarea" maxLength={500} value={form.reason} onChange={field('reason')} />
            <Form.Text>Giao dịch gốc vẫn được lưu. Hủy ghi nhận không hoàn tiền tự động.</Form.Text></Form.Group>}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" disabled={busy} onClick={() => setForm(null)}>Đóng</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận'}</Button></Modal.Footer>
      </Form>
    </Modal>
  </section>;
}

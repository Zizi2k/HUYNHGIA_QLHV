import { useState } from 'react';
import { Alert, Button, Form, Modal, Stack, Table } from 'react-bootstrap';
import api from '../../services/api';

const base = '/teaching-payroll/reports';
const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const fields = ['amount', 'advance', 'payment', 'remaining'];
const errText = (err) => err.response?.data?.message || 'Không tạo được báo cáo.';

export default function TeachingPayrollReport({ admin, month }) {
  const [show, setShow] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({ period: month, department: '', debt: false });
  const [mode, setMode] = useState('month');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  async function open() {
    setError('');
    setData(null);
    setMode('month');
    setBusy('loading');
    setShow(true);
    try {
      const { data: list } = await api.get(base + '/departments');
      setDepartments(list);
      setFilters({ period: month, department: admin ? '' : String(list[0]?.id ?? ''), debt: false });
    } catch (err) { setError(errText(err)); }
    finally { setBusy(''); }
  }
  function change(value) {
    setData(null);
    setError('');
    setFilters((old) => ({ ...old, ...value }));
  }
  async function fetchReport(format) {
    if (busy || (!admin && !filters.department)) return;
    setBusy(format);
    setError('');
    const params = { ...filters, debt: filters.debt ? '1' : '0' };
    try {
      if (format === 'preview') {
        setData((await api.get(base + '/preview', { params })).data);
      } else {
        const { data: blob } = await api.get(base + '/export/' + format, { params, responseType: 'blob' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bao-cao-luong-${filters.period}.${format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      let value = errText(err);
      if (err.response?.data instanceof Blob) {
        try { value = JSON.parse(await err.response.data.text()).message || value; } catch { /* keep fallback */ }
      }
      setError(value);
    } finally { setBusy(''); }
  }
  return <>
    <Button variant="outline-primary" onClick={open}>Báo cáo tổng hợp</Button>
    <Modal centered size="xl" show={show} onHide={() => { if (!busy) setShow(false); }}>
      <Modal.Header closeButton={!busy}><Modal.Title>Báo cáo lương đã chốt</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <p className="text-body-secondary">Báo cáo phòng ban dùng phân công hiện tại. Chỉ giao dịch còn hiệu lực được cộng vào đã ứng và đã trả.</p>
        <Form onSubmit={(e) => { e.preventDefault(); void fetchReport('preview'); }}>
          <Stack direction="horizontal" gap={2} className="align-items-end flex-wrap mb-3">
            <Form.Group controlId="payroll-report-dept"><Form.Label>Phạm vi</Form.Label>
              <Form.Select disabled={Boolean(busy)} value={filters.department} onChange={(e) => change({ department: e.target.value })}>
                {admin ? <option value="">Toàn trung tâm</option> : <option value="" disabled>Chọn phòng ban</option>}
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Form.Select></Form.Group>
            <Form.Group controlId="payroll-report-mode"><Form.Label>Tổng hợp theo</Form.Label>
              <Form.Select disabled={Boolean(busy)} value={mode} onChange={(e) => {
                setMode(e.target.value);
                change({ period: e.target.value === 'month' ? month : month.slice(0,4) });
              }}><option value="month">Tháng</option><option value="year">Năm</option></Form.Select></Form.Group>
            <Form.Group controlId="payroll-report-period"><Form.Label>Kỳ báo cáo</Form.Label>
              <Form.Control required disabled={Boolean(busy)} type={mode === 'month' ? 'month' : 'number'} min={mode === 'year' ? 2000 : undefined}
                max={mode === 'year' ? 2099 : undefined} step={mode === 'year' ? 1 : undefined} value={filters.period}
                onChange={(e) => change({ period: e.target.value })} /></Form.Group>
            <Button type="submit" disabled={Boolean(busy) || (!admin && !filters.department)}>{busy === 'preview' ? 'Đang tải…' : 'Xem trước'}</Button>
          </Stack>
          <Form.Check id="payroll-report-debt" label="Chỉ kỳ còn công nợ" checked={filters.debt} disabled={Boolean(busy)} onChange={(e) => change({ debt: e.target.checked })} />
        </Form>
        {data && <>
          <h3 className="h6 mt-3">{data.department} · {data.period}</h3>
          <Table responsive bordered size="sm"><thead><tr><th>Kỳ</th><th>Giáo viên</th><th>Phải trả</th><th>Đã ứng</th><th>Đã trả</th><th>Còn phải trả</th></tr></thead>
            <tbody>{data.rows.map((r) => <tr key={r.id}><td>{r.month}</td><td>{r.name} · {r.code}</td>
              {fields.map((field) => <td key={field} className="text-nowrap">{currency.format(r[field])}</td>)}</tr>)}</tbody>
            <tfoot><tr><th colSpan={2}>Tổng</th>{fields.map((field) => <th key={field} className="text-nowrap">{currency.format(data.totals[field])}</th>)}</tr></tfoot>
          </Table>
          {!data.rows.length && <p>Không có kỳ lương phù hợp.</p>}
          <Stack direction="horizontal" gap={2} className="flex-wrap">
            <Button variant="outline-success" disabled={Boolean(busy)} onClick={() => fetchReport('xlsx')}>{busy === 'xlsx' ? 'Đang xuất…' : 'Tải Excel'}</Button>
            <Button variant="outline-primary" disabled={Boolean(busy)} onClick={() => fetchReport('pdf')}>{busy === 'pdf' ? 'Đang xuất…' : 'Tải PDF'}</Button>
          </Stack>
        </>}
      </Modal.Body>
    </Modal>
  </>;
}

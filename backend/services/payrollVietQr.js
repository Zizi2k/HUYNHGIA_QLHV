const { fail } = require('./teachingPeriods');

const options = { signal: undefined, redirect: 'error' };
async function provider(url, init = {}, request = fetch) {
  try {
    const response = await request(url, { ...options, ...init, signal: AbortSignal.timeout(7000) });
    if (response.ok) return response;
  } catch { /* Never log URLs containing bank account numbers. */ }
  fail('Không thể kết nối VietQR. Vui lòng thử lại sau.', 502);
}
async function json(response) {
  try { return await response.json(); }
  catch { fail('VietQR trả về dữ liệu không hợp lệ', 502); }
}
let cached;
async function banks() {
  if (cached?.expires > Date.now()) return cached.rows;
  const result = await json(await provider('https://api.vietqr.io/v2/banks'));
  if (result.code !== '00' || !Array.isArray(result.data)) fail('Không tải được danh sách ngân hàng', 502);
  const rows = result.data.filter((b) => /^[0-9]{6}$/.test(b.bin) && Number(b.transferSupported) === 1)
    .map(({ bin, code, shortName, name }) => ({ bin, code, shortName, name }));
  cached = { expires: Date.now() + 3600000, rows };
  return rows;
}
function fields(input) {
  const { bin, accountNumber } = input || {};
  if (typeof bin !== 'string' || !/^[0-9]{6}$/.test(bin) ||
      typeof accountNumber !== 'string' || !/^[0-9]{6,19}$/.test(accountNumber)) fail('Mã ngân hàng hoặc số tài khoản không hợp lệ');
  return { bin, accountNumber };
}
function qrUrl(input, id, amount) {
  const { bin, accountNumber } = fields(input);
  if (!Number.isSafeInteger(amount) || amount <= 0) fail('Phiếu lương không còn số tiền phải trả', 409);
  const url = new URL(`https://img.vietqr.io/image/${bin}-${accountNumber}-qr_only.png`);
  url.search = new URLSearchParams({ amount: String(amount), addInfo: 'LUONG HG ' + id }).toString();
  return url;
}
async function qr(input, id, amount) {
  const response = await provider(qrUrl(input, id, amount));
  if (response.headers.get('content-type')?.split(';')[0] !== 'image/png') fail('VietQR không trả về ảnh PNG hợp lệ', 502);
  const image = Buffer.from(await response.arrayBuffer());
  if (image.length > 512000 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('VietQR không trả về ảnh PNG hợp lệ', 502);
  return 'data:image/png;base64,' + image.toString('base64');
}
async function lookup(input) {
  const { bin, accountNumber } = fields(input);
  const client = process.env.VIETQR_CLIENT_ID?.trim(), key = process.env.VIETQR_API_KEY?.trim();
  if (!client || !key) fail('Chưa cấu hình tra cứu tên chủ tài khoản', 503);
  const result = await json(await provider('https://api.vietqr.io/v2/lookup', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-client-id': client, 'x-api-key': key },
    body: JSON.stringify({ bin: Number(bin), accountNumber }) }));
  const accountName = result.data?.accountName;
  if (result.code !== '00' || typeof accountName !== 'string' || !accountName.trim()) fail('Không xác minh được tên chủ tài khoản', 422);
  return { accountName: accountName.trim().slice(0, 150) };
}
module.exports = { banks, lookup, qr, qrUrl, fields };

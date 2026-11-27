const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { addressOK, settings, send, retryDelay } = require('../services/staffEmail');
after(() => require('../config/db').end());
test('email mặc định tắt và chỉ nhận địa chỉ hợp lệ', () => {
  assert.equal(settings({}), null);
  assert.equal(settings({ STAFF_EMAIL_ENABLED: 'false', STAFF_EMAIL_FROM: 'a@example.com', STAFF_EMAIL_RESEND_KEY: 'secret' }), null);
  assert.equal(addressOK('teacher@example.com'), true);
  assert.equal(addressOK('a@example.com\nb@example.com'), false);
  assert.ok(retryDelay(2) > retryDelay(1));
});
test('lỗi tạm có thể thử lại với cùng khóa, lỗi địa chỉ là lỗi cuối', async () => {
  const job = { notification_id: 4, email: 'teacher@example.com' };
  const cfg = { from: 'staff@example.com', key: 'fixture' };
  let key;
  const temp = await send(cfg, job, async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    key = options.headers['Idempotency-Key'];
    return new Response('{}', { status: 429 });
  });
  assert.deepEqual(temp, { state: 'queued', code: '429' });
  assert.deepEqual(await send(cfg, job, async (_url, options) => {
    assert.equal(options.headers['Idempotency-Key'], key);
    return new Response('{}', { status: 422 });
  }), { state: 'failed', code: '422' });
});

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('84') && digits.length >= 11) return digits;
  if (digits.startsWith('0') && digits.length >= 10) return `84${digits.slice(1)}`;
  if (digits.length >= 9 && digits.length <= 11) return digits.startsWith('84') ? digits : `84${digits}`;
  return null;
}

function pickPhone(student) {
  return normalizePhone(student.phone) || normalizePhone(student.zalo);
}

function isZaloConfigured() {
  return Boolean(process.env.ZALO_ACCESS_TOKEN && process.env.ZALO_TEMPLATE_ID);
}

async function sendZnsMessage(phone, templateData) {
  const accessToken = process.env.ZALO_ACCESS_TOKEN;
  const templateId = process.env.ZALO_TEMPLATE_ID;
  if (!accessToken || !templateId) {
    return { ok: false, status: 'not_configured', error: 'Chưa cấu hình Zalo OA (ZALO_ACCESS_TOKEN, ZALO_TEMPLATE_ID)' };
  }

  const body = {
    phone,
    template_id: templateId,
    template_data: templateData,
    tracking_id: `reminder_${Date.now()}_${phone}`,
  };

  try {
    const res = await fetch('https://business.openapi.zalo.me/message/template', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: accessToken,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.error === 0 || data.message === 'Success')) {
      return { ok: true, status: 'sent', data };
    }
    return {
      ok: false,
      status: 'failed',
      error: data.message || data.error_description || `Zalo API lỗi (${res.status})`,
      data,
    };
  } catch (err) {
    return { ok: false, status: 'failed', error: err.message };
  }
}

async function sendReminderZalo(student, reminderText, className) {
  const phone = pickPhone(student);
  if (!phone) {
    return { ok: false, status: 'no_contact', error: 'Học sinh chưa có SĐT/Zalo hợp lệ' };
  }

  const templateData = {
    customer_name: student.fullname || 'Học sinh',
    class_name: className || '',
    note: reminderText.slice(0, 500),
  };

  if (process.env.ZALO_TEMPLATE_DATA_JSON) {
    try {
      const customKeys = JSON.parse(process.env.ZALO_TEMPLATE_DATA_JSON);
      Object.assign(templateData, customKeys);
    } catch {
      // ignore invalid JSON
    }
  }

  return sendZnsMessage(phone, templateData);
}

module.exports = {
  normalizePhone,
  pickPhone,
  isZaloConfigured,
  sendReminderZalo,
};

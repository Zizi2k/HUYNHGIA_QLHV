import { useEffect, useState } from 'react';
import { Modal, Form, Button, Row, Col } from 'react-bootstrap';
import { tuitionService } from '../../services';
import { SUBJECT_OPTIONS } from './tuitionConstants';
import { applyTuitionFieldChange, isFeeAfterAutoCalculated } from './tuitionDiscountCalc';

const emptyForm = {
  student_code: '', fullname: '', subject: 'english',
  class_label: '', enrichment_class: '', current_class: '',
  phone: '', zalo: '',
  base_fee: '', fee_before_discount: '', fee_after_discount: '', book_fee: '',
  discount_id: '', discount_reason: '',
};

export default function ProfileEditModal({ show, onHide, profile, discounts, onSuccess }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) {
      setForm({
        student_code: profile.student_code || '',
        fullname: profile.fullname || '',
        subject: profile.subject || 'english',
        class_label: profile.class_label || '',
        enrichment_class: profile.enrichment_class || '',
        current_class: profile.current_class || '',
        phone: profile.phone || '',
        zalo: profile.zalo || '',
        base_fee: profile.base_fee ?? '',
        fee_before_discount: profile.fee_before_discount ?? '',
        fee_after_discount: profile.fee_after_discount ?? '',
        book_fee: profile.book_fee ?? '',
        discount_id: profile.discount_id || '',
        discount_reason: profile.discount_reason || '',
      });
    } else {
      setForm(emptyForm);
    }
    setError('');
  }, [profile, show]);

  const handleChange = (field, value) => {
    setForm((prev) => applyTuitionFieldChange(prev, field, value, discounts));
  };

  const feeAfterAuto = isFeeAfterAutoCalculated(form.discount_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        discount_id: form.discount_id || null,
        base_fee: Number(form.base_fee) || 0,
        fee_before_discount: Number(form.fee_before_discount) || 0,
        fee_after_discount: Number(form.fee_after_discount) || 0,
        book_fee: Number(form.book_fee) || 0,
      };
      if (profile?.id) {
        await tuitionService.updateProfile(profile.id, payload);
      } else {
        await tuitionService.createProfile(payload);
      }
      onSuccess?.();
      onHide();
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{profile ? 'Sửa hồ sơ học phí' : 'Thêm hồ sơ học phí'}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <Row className="g-3">
            <Col md={4}>
              <Form.Group>
                <Form.Label>Mã học viên</Form.Label>
                <Form.Control value={form.student_code} onChange={(e) => handleChange('student_code', e.target.value)} required disabled={!!profile} />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Họ tên</Form.Label>
                <Form.Control value={form.fullname} onChange={(e) => handleChange('fullname', e.target.value)} required />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Môn học</Form.Label>
                <Form.Select value={form.subject} onChange={(e) => handleChange('subject', e.target.value)} disabled={!!profile}>
                  {SUBJECT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={4}><Form.Group><Form.Label>Lớp học</Form.Label><Form.Control value={form.class_label} onChange={(e) => handleChange('class_label', e.target.value)} /></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>Lớp tăng cường</Form.Label><Form.Control value={form.enrichment_class} onChange={(e) => handleChange('enrichment_class', e.target.value)} /></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>Đang học lớp</Form.Label><Form.Control value={form.current_class} onChange={(e) => handleChange('current_class', e.target.value)} /></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>SĐT</Form.Label><Form.Control value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} /></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>Zalo</Form.Label><Form.Control value={form.zalo} onChange={(e) => handleChange('zalo', e.target.value)} /></Form.Group></Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Mức giảm</Form.Label>
                <Form.Select value={form.discount_id} onChange={(e) => handleChange('discount_id', e.target.value)}>
                  <option value="">— Không —</option>
                  {discounts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}><Form.Group><Form.Label>HP ban đầu</Form.Label><Form.Control type="number" min="0" value={form.base_fee} onChange={(e) => handleChange('base_fee', e.target.value)} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>HP trước giảm</Form.Label><Form.Control type="number" min="0" value={form.fee_before_discount} onChange={(e) => handleChange('fee_before_discount', e.target.value)} /></Form.Group></Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>HP sau giảm {feeAfterAuto && <small className="text-muted">(tự tính)</small>}</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  value={form.fee_after_discount}
                  onChange={(e) => handleChange('fee_after_discount', e.target.value)}
                  readOnly={feeAfterAuto}
                  className={feeAfterAuto ? 'bg-light' : ''}
                />
              </Form.Group>
            </Col>
            <Col md={6}><Form.Group><Form.Label>Phí sách</Form.Label><Form.Control type="number" min="0" value={form.book_fee} onChange={(e) => handleChange('book_fee', e.target.value)} /></Form.Group></Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Lý do giảm {form.discount_id ? <span className="text-danger">*</span> : null}</Form.Label>
                <Form.Control as="textarea" rows={2} value={form.discount_reason} onChange={(e) => handleChange('discount_reason', e.target.value)} required={!!form.discount_id} />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Hủy</Button>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

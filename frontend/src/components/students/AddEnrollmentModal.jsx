import { useEffect, useMemo, useState } from 'react';
import {
  Modal, Form, Button, Alert, Spinner, Row, Col,
} from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { studentService, tuitionService } from '../../services';
import {
  SUBJECT_OPTIONS, CODE_PREFIX_OPTIONS, calcEndDate, formatDateVi, todayDateValue,
} from './studentConstants';
import { applyTuitionFieldChange, isFeeAfterAutoCalculated } from '../tuition/tuitionDiscountCalc';
import { lockedCodePrefix, isScopedUser } from '../../utils/adminScope';

const emptyTuition = {
  enrichment_class: '',
  current_class: '',
  base_fee: '',
  fee_before_discount: '',
  fee_after_discount: '',
  book_fee: '',
  discount_id: '',
  discount_reason: '',
};

const emptyForm = {
  subject: 'english',
  code_prefix: 'HG',
  class_id: '',
  course_id: '',
  start_date: todayDateValue(),
  code: '',
  fullname: '',
  phone: '',
  zalo: '',
  ...emptyTuition,
};

export default function AddEnrollmentModal({
  show,
  onHide,
  onSuccess,
  classes,
  courses,
  editStudent,
}) {
  const { user } = useAuth();
  const forcedPrefix = lockedCodePrefix(user);
  const prefixLocked = isScopedUser(user);

  const [form, setForm] = useState(emptyForm);
  const [discounts, setDiscounts] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!editStudent;

  const filteredClasses = useMemo(
    () => classes.filter((c) => !form.subject || c.subject === form.subject),
    [classes, form.subject],
  );

  const filteredCourses = useMemo(
    () => courses.filter((c) => c.subject === form.subject && c.is_active),
    [courses, form.subject],
  );

  const selectedCourse = useMemo(
    () => filteredCourses.find((c) => String(c.id) === String(form.course_id)),
    [filteredCourses, form.course_id],
  );

  const endDatePreview = useMemo(
    () => calcEndDate(form.start_date, selectedCourse?.duration_months),
    [form.start_date, selectedCourse],
  );

  useEffect(() => {
    if (!show) return;

    setError('');
    if (editStudent) {
      setForm({
        subject: editStudent.subject,
        code_prefix: editStudent.student_code?.toUpperCase().startsWith('EG') ? 'EG' : 'HG',
        class_id: editStudent.class_id || '',
        course_id: editStudent.course_id || '',
        start_date: editStudent.start_date?.slice(0, 10) || todayDateValue(),
        code: editStudent.student_code,
        fullname: editStudent.fullname,
        phone: editStudent.phone || '',
        zalo: editStudent.zalo || '',
        enrichment_class: editStudent.enrichment_class || '',
        current_class: editStudent.current_class || '',
        base_fee: editStudent.base_fee ?? '',
        fee_before_discount: editStudent.fee_before_discount ?? '',
        fee_after_discount: editStudent.fee_after_discount ?? '',
        book_fee: editStudent.book_fee ?? '',
        discount_id: editStudent.discount_id || '',
        discount_reason: editStudent.discount_reason || '',
      });
      tuitionService.getDiscounts().then((res) => setDiscounts(res.data));
      return;
    }

    setForm({ ...emptyForm, code_prefix: forcedPrefix || 'HG' });
    setLoadingMeta(true);
    const initialPrefix = forcedPrefix || 'HG';
    Promise.all([
      tuitionService.getDiscounts(),
      studentService.getNextCode('english', initialPrefix),
    ])
      .then(([discountRes, codeRes]) => {
        setDiscounts(discountRes.data);
        setForm((prev) => ({
          ...prev,
          code: codeRes.data.next_code,
          subject: codeRes.data.subject,
          code_prefix: initialPrefix,
        }));
      })
      .catch(() => setError('Không thể tải dữ liệu ban đầu'))
      .finally(() => setLoadingMeta(false));
  }, [show, editStudent, forcedPrefix]);

  const loadNextCode = async (subject, codePrefix = form.code_prefix) => {
    try {
      const res = await studentService.getNextCode(subject, codePrefix);
      setForm((prev) => ({ ...prev, code: res.data.next_code, subject, code_prefix: codePrefix }));
    } catch {
      setError('Không thể lấy mã học viên tiếp theo');
    }
  };

  const handleSubjectChange = (subject) => {
    setForm((prev) => ({
      ...prev,
      subject,
      class_id: '',
      course_id: '',
    }));
    if (!isEdit) loadNextCode(subject, form.code_prefix);
  };

  const handlePrefixChange = (codePrefix) => {
    setForm((prev) => ({ ...prev, code_prefix: codePrefix }));
    if (!isEdit) loadNextCode(form.subject, codePrefix);
  };

  const handleChange = (field, value) => {
    setForm((prev) => applyTuitionFieldChange(prev, field, value, discounts));
  };

  const feeAfterAuto = isFeeAfterAutoCalculated(form.discount_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const tuition = {
        enrichment_class: form.enrichment_class,
        current_class: form.current_class,
        base_fee: form.base_fee,
        fee_before_discount: form.fee_before_discount,
        fee_after_discount: form.fee_after_discount,
        book_fee: form.book_fee,
        discount_id: form.discount_id || null,
        discount_reason: form.discount_reason,
      };

      if (isEdit) {
        await studentService.updateEnrollment(editStudent.id, {
          class_id: form.class_id || null,
          course_id: form.course_id,
          start_date: form.start_date,
          fullname: form.fullname,
          phone: form.phone,
          zalo: form.zalo,
          student_code: form.code.trim().toUpperCase(),
          tuition,
        });
      } else {
        await studentService.createEnrollment({
          subject: form.subject,
          class_id: parseInt(form.class_id, 10),
          course_id: parseInt(form.course_id, 10),
          start_date: form.start_date,
          code: form.code,
          fullname: form.fullname,
          phone: form.phone,
          zalo: form.zalo,
          tuition,
        });
      }
      onSuccess();
      onHide();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể lưu học viên');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" className="scrollable-form-modal">
      <Modal.Header closeButton>
        <Modal.Title>{isEdit ? 'Cập nhật học viên' : 'Thêm học viên mới'}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}
          {loadingMeta ? (
            <div className="text-center py-4"><Spinner animation="border" /></div>
          ) : (
            <>
              <Row className="g-3 mb-3">
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Môn học <span className="text-danger">*</span></Form.Label>
                    <Form.Select
                      value={form.subject}
                      onChange={(e) => handleSubjectChange(e.target.value)}
                      disabled={isEdit}
                      required
                    >
                      {SUBJECT_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Lớp học <span className="text-danger">*</span></Form.Label>
                    <Form.Select
                      value={form.class_id}
                      onChange={(e) => handleChange('class_id', e.target.value)}
                      required
                    >
                      <option value="">— Chọn lớp —</option>
                      {filteredClasses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Khóa học <span className="text-danger">*</span></Form.Label>
                    <Form.Select
                      value={form.course_id}
                      onChange={(e) => handleChange('course_id', e.target.value)}
                      required
                    >
                      <option value="">— Chọn khóa —</option>
                      {filteredCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.duration_months} tháng)
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Ngày bắt đầu <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="date"
                      value={form.start_date}
                      onChange={(e) => handleChange('start_date', e.target.value)}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Ngày kết thúc (tự tính)</Form.Label>
                    <Form.Control
                      value={endDatePreview ? formatDateVi(endDatePreview) : '—'}
                      readOnly
                      className="bg-light"
                    />
                  </Form.Group>
                </Col>
              </Row>

              <hr />
              <h6 className="fw-bold mb-3">Thông tin học viên</h6>
              <Row className="g-3">
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Tiền tố mã</Form.Label>
                    <Form.Select
                      value={form.code_prefix}
                      onChange={(e) => handlePrefixChange(e.target.value)}
                      disabled={isEdit || prefixLocked}
                    >
                      {CODE_PREFIX_OPTIONS.filter((p) => p.value).map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Mã học viên <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      value={form.code}
                      onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
                      placeholder="HGTA0001"
                      required
                    />
                    {!isEdit && (
                      <Form.Text className="text-muted">
                        Có thể sửa tay — ví dụ đổi HG thành EG.
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Họ tên <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      value={form.fullname}
                      onChange={(e) => handleChange('fullname', e.target.value)}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Số điện thoại</Form.Label>
                    <Form.Control
                      value={form.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Zalo</Form.Label>
                    <Form.Control
                      value={form.zalo}
                      onChange={(e) => handleChange('zalo', e.target.value)}
                    />
                  </Form.Group>
                </Col>
              </Row>

              <hr className="my-4" />
              <h6 className="fw-bold mb-3">Thông tin học phí</h6>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Lớp tăng cường</Form.Label>
                    <Form.Control
                      value={form.enrichment_class}
                      onChange={(e) => handleChange('enrichment_class', e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Đang học lớp</Form.Label>
                    <Form.Control
                      value={form.current_class}
                      onChange={(e) => handleChange('current_class', e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>HP ban đầu <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      value={form.base_fee}
                      onChange={(e) => handleChange('base_fee', e.target.value)}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>HP trước giảm <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      value={form.fee_before_discount}
                      onChange={(e) => handleChange('fee_before_discount', e.target.value)}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>
                      HP sau giảm <span className="text-danger">*</span>
                      {feeAfterAuto && <small className="text-muted ms-1">(tự tính)</small>}
                    </Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      value={form.fee_after_discount}
                      onChange={(e) => handleChange('fee_after_discount', e.target.value)}
                      readOnly={feeAfterAuto}
                      className={feeAfterAuto ? 'bg-light' : ''}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Phí sách <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      value={form.book_fee}
                      onChange={(e) => handleChange('book_fee', e.target.value)}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Mức giảm</Form.Label>
                    <Form.Select
                      value={form.discount_id}
                      onChange={(e) => handleChange('discount_id', e.target.value)}
                    >
                      <option value="">— Không —</option>
                      {discounts.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group>
                    <Form.Label>
                      Lý do giảm
                      {form.discount_id ? <span className="text-danger"> *</span> : null}
                    </Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={form.discount_reason}
                      onChange={(e) => handleChange('discount_reason', e.target.value)}
                      required={!!form.discount_id}
                    />
                  </Form.Group>
                </Col>
              </Row>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Hủy</Button>
          <Button type="submit" variant="primary" disabled={saving || loadingMeta}>
            {saving ? <><Spinner size="sm" className="me-2" />Đang lưu...</> : isEdit ? 'Cập nhật' : 'Thêm học viên'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

import { Modal, Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap';
import { calcEndDate, formatDateVi } from '../students/studentConstants';
import { isFeeAfterAutoCalculated } from '../tuition/tuitionDiscountCalc';

const emptyStudentFields = {
  code: '',
  fullname: '',
  phone: '',
  zalo: '',
};

const emptyTuitionFields = {
  course_id: '',
  start_date: new Date().toISOString().slice(0, 10),
  enrichment_class: '',
  current_class: '',
  base_fee: '',
  fee_before_discount: '',
  fee_after_discount: '',
  book_fee: '',
  discount_id: '',
  discount_reason: '',
};

export default function AddStudentModal({
  show,
  onHide,
  isAdmin,
  subjectLabel,
  loadingMeta,
  saving,
  error,
  form,
  discounts,
  courses = [],
  onChange,
  onSubmit,
}) {
  const selectedCourse = courses.find((c) => String(c.id) === String(form.course_id));
  const endDatePreview = calcEndDate(form.start_date, selectedCourse?.duration_months);
  const feeAfterAuto = isFeeAfterAutoCalculated(form.discount_id);
  return (
    <Modal show={show} onHide={onHide} size={isAdmin ? 'lg' : undefined} className={isAdmin ? 'scrollable-form-modal' : ''}>
      <Modal.Header closeButton>
        <Modal.Title>Thêm học viên</Modal.Title>
      </Modal.Header>
      <Form onSubmit={onSubmit}>
        <Modal.Body>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}
          {loadingMeta ? (
            <div className="text-center py-4"><Spinner animation="border" /></div>
          ) : (
            <>
              {isAdmin && subjectLabel && (
                <Alert variant="info" className="py-2 small">
                  Môn học: <strong>{subjectLabel}</strong>. Mã học viên được tự sinh theo danh sách môn.
                </Alert>
              )}

              <Row className="g-3">
                <Col md={isAdmin ? 6 : 12}>
                  <Form.Group>
                    <Form.Label>Mã học viên <span className="text-danger">*</span></Form.Label>
                    <Form.Control value={form.code} readOnly required className="bg-light" />
                  </Form.Group>
                </Col>
                <Col md={isAdmin ? 6 : 12}>
                  <Form.Group>
                    <Form.Label>Họ tên <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      value={form.fullname}
                      onChange={(e) => onChange('fullname', e.target.value)}
                      placeholder="VD: Nguyễn Văn A"
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={isAdmin ? 6 : 12}>
                  <Form.Group>
                    <Form.Label>Số điện thoại</Form.Label>
                    <Form.Control
                      value={form.phone}
                      onChange={(e) => onChange('phone', e.target.value)}
                      placeholder="VD: 0901234567"
                    />
                  </Form.Group>
                </Col>
                <Col md={isAdmin ? 6 : 12}>
                  <Form.Group>
                    <Form.Label>Zalo</Form.Label>
                    <Form.Control
                      value={form.zalo}
                      onChange={(e) => onChange('zalo', e.target.value)}
                      placeholder="Số Zalo hoặc tên Zalo"
                    />
                  </Form.Group>
                </Col>
              </Row>

              {isAdmin && (
                <>
                  <hr className="my-4" />
                  <h6 className="fw-bold mb-3">Khóa học & thời hạn</h6>
                  <Row className="g-3 mb-3">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Khóa học <span className="text-danger">*</span></Form.Label>
                        <Form.Select
                          value={form.course_id}
                          onChange={(e) => onChange('course_id', e.target.value)}
                          required
                        >
                          <option value="">— Chọn khóa —</option>
                          {courses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.duration_months} tháng)
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Ngày bắt đầu <span className="text-danger">*</span></Form.Label>
                        <Form.Control
                          type="date"
                          value={form.start_date}
                          onChange={(e) => onChange('start_date', e.target.value)}
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Ngày kết thúc</Form.Label>
                        <Form.Control
                          value={endDatePreview ? formatDateVi(endDatePreview) : '—'}
                          readOnly
                          className="bg-light"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <h6 className="fw-bold mb-3">Thông tin học phí</h6>
                  <Row className="g-3">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Lớp tăng cường</Form.Label>
                        <Form.Control
                          value={form.enrichment_class}
                          onChange={(e) => onChange('enrichment_class', e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Đang học lớp</Form.Label>
                        <Form.Control
                          value={form.current_class}
                          onChange={(e) => onChange('current_class', e.target.value)}
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
                          onChange={(e) => onChange('base_fee', e.target.value)}
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
                          onChange={(e) => onChange('fee_before_discount', e.target.value)}
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
                          onChange={(e) => onChange('fee_after_discount', e.target.value)}
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
                          onChange={(e) => onChange('book_fee', e.target.value)}
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Mức giảm</Form.Label>
                        <Form.Select
                          value={form.discount_id}
                          onChange={(e) => onChange('discount_id', e.target.value)}
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
                          onChange={(e) => onChange('discount_reason', e.target.value)}
                          required={!!form.discount_id}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                </>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Hủy</Button>
          <Button type="submit" variant="primary" disabled={saving || loadingMeta}>
            {saving ? <><Spinner size="sm" className="me-2" />Đang lưu...</> : 'Thêm'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export { emptyStudentFields, emptyTuitionFields };

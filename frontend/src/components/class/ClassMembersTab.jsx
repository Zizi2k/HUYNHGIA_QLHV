import { useMemo, useState } from 'react';
import { Modal, Form, Button, Alert, Spinner, InputGroup, ListGroup, Badge,
} from 'react-bootstrap';
import { notifyDeleteResult } from '../../utils/deleteHelpers';
import { classService, tuitionService, studentService } from '../../services';
import { applyTuitionFieldChange } from '../tuition/tuitionDiscountCalc';
import DataTable, { DataTableEmpty } from '../common/DataTable';
import AddStudentModal, { emptyStudentFields, emptyTuitionFields } from './AddStudentModal';

const emptyForm = { ...emptyStudentFields, ...emptyTuitionFields };

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

function avatarColor(id) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

export default function ClassMembersTab({ classId, className, members, isTeacher, isAdmin, isStudent, onUpdated }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [availableTeachers, setAvailableTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [discounts, setDiscounts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [subjectLabel, setSubjectLabel] = useState('');

  const students = members?.filter((m) => m.role === 'student') || [];
  const teachers = members?.filter((m) => m.role !== 'student') || [];

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    if (isStudent) {
      return students.filter((s) => s.fullname?.toLowerCase().includes(q));
    }
    return students.filter((s) =>
      s.fullname?.toLowerCase().includes(q)
      || s.code?.toLowerCase().includes(q)
      || s.phone?.includes(q)
      || s.zalo?.toLowerCase().includes(q));
  }, [students, search, isStudent]);

  const openAddModal = async () => {
    setError('');
    setLoadingMeta(true);
    setShowAddModal(true);
    try {
      const requests = [classService.getNextStudentCode(classId)];
      if (isAdmin) requests.push(tuitionService.getDiscounts());
      const [codeRes, discountRes] = await Promise.all(requests);
      setDiscounts(discountRes?.data || []);
      setSubjectLabel(codeRes.data.subject_label || '');

      if (isAdmin && codeRes.data.subject) {
        const courseRes = await studentService.getCourses({
          subject: codeRes.data.subject,
          active_only: '1',
        });
        setCourses(courseRes.data);
      } else {
        setCourses([]);
      }

      setForm({
        ...emptyForm,
        code: codeRes.data.next_code,
        current_class: className || codeRes.data.class_label || '',
        start_date: new Date().toISOString().slice(0, 10),
      });
    } catch (err) {
      setShowAddModal(false);
      alert(err.response?.data?.message || 'Không thể tải mã học viên tiếp theo');
    } finally {
      setLoadingMeta(false);
    }
  };

  const openEditModal = (student) => {
    setError('');
    setEditingId(student.id);
    setForm({
      code: student.code || '',
      fullname: student.fullname || '',
      phone: student.phone || '',
      zalo: student.zalo || '',
    });
    setShowEditModal(true);
  };

  const openImportModal = () => {
    setError('');
    setImportResult(null);
    setImportFile(null);
    setShowImportModal(true);
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await classService.downloadImportTemplate(classId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mau-hoc-vien.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Không thể tải file mẫu');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        code: form.code,
        fullname: form.fullname,
        phone: form.phone,
        zalo: form.zalo,
      };
      if (isAdmin) {
        payload.tuition = {
          course_id: form.course_id,
          start_date: form.start_date,
          enrichment_class: form.enrichment_class,
          current_class: form.current_class,
          base_fee: form.base_fee,
          fee_before_discount: form.fee_before_discount,
          fee_after_discount: form.fee_after_discount,
          book_fee: form.book_fee,
          discount_id: form.discount_id || null,
          discount_reason: form.discount_reason,
        };
      }
      await classService.createStudent(classId, payload);
      setShowAddModal(false);
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể thêm học viên');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await classService.updateStudent(classId, editingId, form);
      setShowEditModal(false);
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể cập nhật học viên');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importFile) {
      setError('Vui lòng chọn file Excel');
      return;
    }
    setImporting(true);
    setError('');
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await classService.importStudents(classId, formData);
      setImportResult(res.data);
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể import file Excel');
    } finally {
      setImporting(false);
    }
  };

  const handleRemove = async (userId, name) => {
    if (!window.confirm(`Xóa "${name}" khỏi lớp?`)) return;
    try {
      const res = await classService.removeMember(classId, userId);
      if (!notifyDeleteResult(res)) onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa học viên');
    }
  };

  const handleSyncUsernames = async () => {
    if (!window.confirm('Cập nhật tên đăng nhập = họ tên (không dấu) + số trong mã HV?')) return;
    try {
      const res = await classService.syncUsernames(classId);
      alert(res.data.message);
      onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể cập nhật tên đăng nhập');
    }
  };

  const openTeacherModal = async () => {
    setError('');
    setSelectedTeacherId('');
    try {
      const res = await classService.getAvailableTeachers(classId);
      setAvailableTeachers(res.data);
      setShowTeacherModal(true);
    } catch {
      alert('Không thể tải danh sách giáo viên');
    }
  };

  const handleAddTeacher = async (e) => {
    e.preventDefault();
    if (!selectedTeacherId) {
      setError('Vui lòng chọn giáo viên');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await classService.addTeacher(classId, parseInt(selectedTeacherId, 10));
      setShowTeacherModal(false);
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể thêm giáo viên');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveTeacher = async (userId, name) => {
    if (!window.confirm(`Xóa giáo viên "${name}" khỏi lớp?`)) return;
    try {
      await classService.removeTeacher(classId, userId);
      onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa giáo viên');
    }
  };

  const renderStudentForm = () => (
    <>
      <Form.Group className="mb-3">
        <Form.Label>Mã học viên <span className="text-danger">*</span></Form.Label>
        <Form.Control
          value={form.code}
          onChange={(e) => handleFormChange('code', e.target.value)}
          placeholder="VD: HS001"
          required
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Họ tên <span className="text-danger">*</span></Form.Label>
        <Form.Control
          value={form.fullname}
          onChange={(e) => handleFormChange('fullname', e.target.value)}
          placeholder="VD: Nguyễn Văn A"
          required
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Số điện thoại</Form.Label>
        <Form.Control
          value={form.phone}
          onChange={(e) => handleFormChange('phone', e.target.value)}
          placeholder="VD: 0901234567"
        />
      </Form.Group>
      <Form.Group>
        <Form.Label>Zalo</Form.Label>
        <Form.Control
          value={form.zalo}
          onChange={(e) => handleFormChange('zalo', e.target.value)}
          placeholder="Số Zalo hoặc tên Zalo"
        />
      </Form.Group>
    </>
  );

  return (
    <>
      {isTeacher && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          <Button onClick={openAddModal}>
            <i className="bi bi-person-plus me-1" />
            Thêm học viên
          </Button>
          <Button variant="success" onClick={openImportModal}>
            <i className="bi bi-file-earmark-excel me-1" />
            Import Excel
          </Button>
          <Button variant="outline-secondary" onClick={handleDownloadTemplate}>
            <i className="bi bi-download me-1" />
            Tải file mẫu
          </Button>
          {students.length > 0 && (
            <Button variant="outline-info" onClick={handleSyncUsernames}>
              <i className="bi bi-arrow-repeat me-1" />
              Đồng bộ tên đăng nhập
            </Button>
          )}
        </div>
      )}

      {teachers.length > 0 && (
        <>
          <div className="pro-section-header d-flex justify-content-between align-items-center">
            <h6 className="pro-section-title mb-0">Giáo viên phụ trách</h6>
            {isAdmin && (
              <Button size="sm" variant="outline-primary" onClick={openTeacherModal}>
                <i className="bi bi-person-plus me-1" />
                Thêm giáo viên
              </Button>
            )}
          </div>
          <ListGroup className="mb-4 shadow-sm" style={{ borderRadius: 12, overflow: 'hidden' }}>
            {teachers.map((m) => (
              <ListGroup.Item key={m.id} className="d-flex justify-content-between align-items-center py-3">
                <div className="pro-student-cell">
                  <span className="pro-avatar" style={{ background: '#3b82f6' }}>
                    {getInitials(m.fullname)}
                  </span>
                  <div>
                    <div className="pro-student-name">{m.fullname}</div>
                    <div className="text-muted small">{m.username}</div>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <Badge bg="primary" className="px-3 py-2">Giáo viên</Badge>
                  {isAdmin && (
                    <Button
                      variant="light"
                      size="sm"
                      title="Xóa khỏi lớp"
                      onClick={() => handleRemoveTeacher(m.id, m.fullname)}
                    >
                      <i className="bi bi-trash text-danger" />
                    </Button>
                  )}
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </>
      )}

      {isAdmin && teachers.length === 0 && (
        <Alert variant="light" className="d-flex justify-content-between align-items-center">
          <span>Chưa có giáo viên được phân công cho lớp này.</span>
          <Button size="sm" variant="primary" onClick={openTeacherModal}>
            <i className="bi bi-person-plus me-1" />
            Thêm giáo viên
          </Button>
        </Alert>
      )}

      <div className="pro-section-header">
        <h6 className="pro-section-title">
          Danh sách học viên
          <span className="pro-count-badge ms-2">{students.length}</span>
        </h6>
        {students.length > 0 && (
          <InputGroup size="sm" style={{ maxWidth: 280 }}>
            <InputGroup.Text className="bg-white">
              <i className="bi bi-search text-muted" />
            </InputGroup.Text>
            <Form.Control
              placeholder={isStudent ? 'Tìm theo tên...' : 'Tìm theo tên, mã, SĐT...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        )}
      </div>

      {students.length === 0 ? (
        <DataTable>
          <tbody>
            <tr>
              <td className="p-0">
                <DataTableEmpty
                  icon="bi-people"
                  message="Chưa có học viên nào trong lớp"
                  hint="Thêm thủ công hoặc import từ file Excel"
                />
              </td>
            </tr>
          </tbody>
        </DataTable>
      ) : filteredStudents.length === 0 ? (
        <DataTable>
          <tbody>
            <tr>
              <td className="p-0">
                <DataTableEmpty
                  icon="bi-search"
                  message="Không tìm thấy học viên phù hợp"
                  hint="Thử từ khóa tìm kiếm khác"
                />
              </td>
            </tr>
          </tbody>
        </DataTable>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th style={{ width: 56 }}>#</th>
              <th>Học viên</th>
              {!isStudent && (
                <>
                  <th style={{ width: 120 }}>Mã HV</th>
                  <th>Tên đăng nhập</th>
                  <th>Số điện thoại</th>
                  <th>Zalo</th>
                </>
              )}
              {isTeacher && <th style={{ width: 100 }} className="text-center">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((m, idx) => (
              <tr key={m.id}>
                <td><span className="pro-row-num">{idx + 1}</span></td>
                <td>
                  <div className="pro-student-cell">
                    <span
                      className="pro-avatar"
                      style={{ background: avatarColor(m.id) }}
                    >
                      {getInitials(m.fullname)}
                    </span>
                    <span className="pro-student-name">{m.fullname}</span>
                  </div>
                </td>
                {!isStudent && (
                  <>
                    <td><span className="pro-badge-code">{m.code}</span></td>
                    <td><code className="small">{m.username}</code></td>
                    <td>
                      {m.phone ? (
                        <span><i className="bi bi-telephone me-1 text-muted small" />{m.phone}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {m.zalo ? (
                        <span><i className="bi bi-chat-dots me-1 text-muted small" />{m.zalo}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </>
                )}
                {isTeacher && (
                  <td className="text-center">
                    <div className="pro-action-group">
                      <Button
                        variant="light"
                        size="sm"
                        onClick={() => openEditModal(m)}
                        title="Sửa"
                      >
                        <i className="bi bi-pencil text-primary" />
                      </Button>
                      <Button
                        variant="light"
                        size="sm"
                        onClick={() => handleRemove(m.id, m.fullname)}
                        title="Xóa khỏi lớp"
                      >
                        <i className="bi bi-trash text-danger" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <AddStudentModal
        show={showAddModal}
        onHide={() => setShowAddModal(false)}
        isAdmin={isAdmin}
        subjectLabel={subjectLabel}
        loadingMeta={loadingMeta}
        saving={saving}
        error={error}
        form={form}
        discounts={discounts}
        courses={courses}
        onChange={(field, value) => setForm((prev) => applyTuitionFieldChange(prev, field, value, discounts))}
        onSubmit={handleAdd}
      />

      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Sửa thông tin học viên</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleEdit}>
          <Modal.Body>
            {error && <Alert variant="danger" className="py-2">{error}</Alert>}
            {renderStudentForm()}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>Hủy</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? <><Spinner size="sm" className="me-2" />Đang lưu...</> : 'Lưu'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showImportModal} onHide={() => setShowImportModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Import học viên từ Excel</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleImport}>
          <Modal.Body>
            {error && <Alert variant="danger" className="py-2">{error}</Alert>}
            {importResult && (
              <Alert variant="success" className="py-2">
                <div>{importResult.message}</div>
                {importResult.errors?.length > 0 && (
                  <ul className="mb-0 mt-2 small">
                    {importResult.errors.map((e) => (
                      <li key={`${e.row}-${e.message}`}>Dòng {e.row}: {e.message}</li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}

            <Alert variant="info" className="small">
              {isAdmin ? (
                <>
                  File mẫu gồm đủ thông tin như <strong>Thêm học viên thủ công</strong>: mã HV, họ tên, liên hệ,
                  khóa học, ngày bắt đầu và các khoản học phí. Bấm <strong>Tải file mẫu</strong> để xem định dạng.
                  Cột học phí có thể để trống nếu chỉ thêm học viên vào lớp.
                </>
              ) : (
                <>
                  File Excel cần các cột: <strong>Mã học viên, Họ tên, Mã lớp, Số điện thoại, Zalo</strong>.
                  Bấm <strong>Tải file mẫu</strong> để xem định dạng chuẩn.
                </>
              )}
            </Alert>

            <Form.Group>
              <Form.Label>Chọn file Excel (.xlsx, .xls)</Form.Label>
              <Form.Control
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setImportFile(e.target.files[0] || null)}
                required
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowImportModal(false)}>Đóng</Button>
            <Button type="submit" variant="success" disabled={importing}>
              {importing ? <><Spinner size="sm" className="me-2" />Đang import...</> : 'Import'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showTeacherModal} onHide={() => setShowTeacherModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Thêm giáo viên vào lớp</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleAddTeacher}>
          <Modal.Body>
            {error && <Alert variant="danger" className="py-2">{error}</Alert>}
            {availableTeachers.length === 0 ? (
              <Alert variant="light" className="mb-0">
                Không còn giáo viên nào để thêm. Tạo tài khoản giáo viên tại mục Quản lý người dùng.
              </Alert>
            ) : (
              <Form.Group>
                <Form.Label>Chọn giáo viên</Form.Label>
                <Form.Select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  required
                >
                  <option value="">-- Chọn giáo viên --</option>
                  {availableTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullname} ({t.username})
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowTeacherModal(false)}>Hủy</Button>
            <Button type="submit" variant="primary" disabled={saving || availableTeachers.length === 0}>
              {saving ? <><Spinner size="sm" className="me-2" />Đang lưu...</> : 'Thêm'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}

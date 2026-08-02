import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Modal, Form, Button, Alert, Spinner, InputGroup, ListGroup, Badge,
} from 'react-bootstrap';
import { notifyDeleteResult } from '../../utils/deleteHelpers';
import { classService, tuitionService, studentService } from '../../services';
import { applyTuitionFieldChange } from '../tuition/tuitionDiscountCalc';
import DataTable, { DataTableEmpty } from '../common/DataTable';
import AddStudentModal, { emptyStudentFields, emptyTuitionFields } from './AddStudentModal';
import { teachingStaffBadge } from '../../utils/roles';
import UserAvatar from '../UserAvatar';
import AdminAvatarPicker from '../AdminAvatarPicker';
import ClassGradeTools from './ClassGradeTools';

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

function studentProfilePath(classId, student, { isAdmin, isTeacher }) {
  if (isAdmin) return `/users?class_id=${classId}&user_id=${student.id}`;
  if (isTeacher) return `/classes/${classId}?tab=members&user_id=${student.id}`;
  return null;
}

export default function ClassMembersTab({ classId, className, members, isTeacher, isAdmin, isStudent, onUpdated }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [teacherAvatarTarget, setTeacherAvatarTarget] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [availableTeachers, setAvailableTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [search, setSearch] = useState('');
  const [feeFilter, setFeeFilter] = useState('all'); // all | renewal
  const [saving, setSaving] = useState(false);
  const [feeSavingId, setFeeSavingId] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removingAll, setRemovingAll] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [discounts, setDiscounts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [subjectLabel, setSubjectLabel] = useState('');

  const students = members?.filter((m) => m.role === 'student') || [];
  const teachers = members?.filter((m) => m.role !== 'student') || [];
  const canLinkStudentProfile = isAdmin || isTeacher;

  const filteredStudents = useMemo(() => {
    let list = students;
    if (feeFilter === 'renewal') {
      list = list.filter((s) => s.needs_fee_renewal);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    if (isStudent) {
      return list.filter((s) => s.fullname?.toLowerCase().includes(q));
    }
    return list.filter((s) =>
      s.fullname?.toLowerCase().includes(q)
      || s.code?.toLowerCase().includes(q)
      || s.phone?.includes(q)
      || s.zalo?.toLowerCase().includes(q));
  }, [students, search, isStudent, feeFilter]);

  const renewalCount = useMemo(
    () => students.filter((s) => s.needs_fee_renewal).length,
    [students],
  );

  // Giáo viên và admin đều nhập học phí khi thêm học viên trong lớp
  const canManageTuition = Boolean(isAdmin || isTeacher);

  const openAddModal = async () => {
    setError('');
    setLoadingMeta(true);
    setShowAddModal(true);
    try {
      const codeRes = await classService.getNextStudentCode(classId);
      setSubjectLabel(codeRes.data.subject_label || '');

      let nextDiscounts = [];
      let nextCourses = [];
      try {
        const discountRes = await tuitionService.getDiscounts();
        nextDiscounts = discountRes?.data || [];
      } catch {
        nextDiscounts = [];
      }
      if (codeRes.data.subject) {
        try {
          const courseRes = await studentService.getCourses({
            subject: codeRes.data.subject,
            active_only: '1',
          });
          nextCourses = courseRes.data || [];
        } catch {
          nextCourses = [];
        }
      }
      setDiscounts(nextDiscounts);
      setCourses(nextCourses);

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
    setEditingStudent(student);
    setForm({
      code: student.code || '',
      fullname: student.fullname || '',
      phone: student.phone || '',
      zalo: student.zalo || '',
    });
    setShowEditModal(true);
  };

  useEffect(() => {
    if (isAdmin || isStudent) return;
    const userId = searchParams.get('user_id');
    if (!userId) return;

    const student = students.find((s) => String(s.id) === userId);
    if (!student) return;

    setError('');
    setEditingId(student.id);
    setEditingStudent(student);
    setForm({
      code: student.code || '',
      fullname: student.fullname || '',
      phone: student.phone || '',
      zalo: student.zalo || '',
    });
    setShowEditModal(true);

    const next = new URLSearchParams(searchParams);
    next.delete('user_id');
    setSearchParams(next, { replace: true });
  }, [students, searchParams, setSearchParams, isAdmin, isStudent]);

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
      if (canManageTuition) {
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

  const handleRemoveAllStudents = async () => {
    if (students.length === 0) return;
    const msg = `Xóa toàn bộ ${students.length} học viên khỏi lớp?\n\nChỉ gỡ khỏi danh sách lớp — tài khoản và học phí vẫn giữ nguyên.`;
    if (!window.confirm(msg)) return;
    setRemovingAll(true);
    try {
      const res = await classService.removeAllStudents(classId);
      alert(res.data.message || 'Đã xóa toàn bộ học viên');
      onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa danh sách học viên');
    } finally {
      setRemovingAll(false);
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

  const handleFeeRenewal = async (student, needsRenewal) => {
    const confirmMsg = needsRenewal
      ? `Báo "${student.fullname}" đã đóng đủ tháng?\n\nGiảng viên sẽ biết cần thu phí khóa mới. Học viên vẫn giữ trong lớp.`
      : `Bỏ đánh dấu thu khóa mới cho "${student.fullname}"?`;
    if (!window.confirm(confirmMsg)) return;
    setFeeSavingId(student.id);
    try {
      const res = await classService.setFeeRenewal(classId, student.id, {
        needs_fee_renewal: needsRenewal,
        note: needsRenewal ? 'Đã đóng đủ tháng — thu phí khóa mới' : '',
      });
      alert(res.data.message);
      onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể lưu trạng thái học phí');
    } finally {
      setFeeSavingId(null);
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
      {(isAdmin || isTeacher) && (
        <ClassGradeTools classId={classId} className={className} />
      )}

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
          {isAdmin && students.length > 0 && (
            <Button
              variant="outline-danger"
              onClick={handleRemoveAllStudents}
              disabled={removingAll}
            >
              <i className="bi bi-trash me-1" />
              {removingAll ? 'Đang xóa...' : 'Xóa tất cả'}
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
                  <UserAvatar user={m} size={40} />
                  <div>
                    <div className="pro-student-name">{m.fullname}</div>
                    <div className="text-muted small">{m.username}</div>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  {(() => {
                    const badge = teachingStaffBadge(m);
                    return <Badge bg={badge.bg} className="px-3 py-2">{badge.label}</Badge>;
                  })()}
                  {isAdmin && (
                    <>
                      <Button
                        variant="light"
                        size="sm"
                        title="Đổi ảnh đại diện"
                        onClick={() => setTeacherAvatarTarget(m)}
                      >
                        <i className="bi bi-camera" />
                      </Button>
                      <Button
                        variant="light"
                        size="sm"
                        title="Xóa khỏi lớp"
                        onClick={() => handleRemoveTeacher(m.id, m.fullname)}
                      >
                        <i className="bi bi-trash text-danger" />
                      </Button>
                    </>
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
          {isTeacher && renewalCount > 0 && (
            <Badge bg="warning" text="dark" className="ms-2">
              {renewalCount} cần thu khóa mới
            </Badge>
          )}
        </h6>
        {students.length > 0 && (
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {isTeacher && (
              <Form.Select
                size="sm"
                value={feeFilter}
                onChange={(e) => setFeeFilter(e.target.value)}
                style={{ maxWidth: 200 }}
              >
                <option value="all">Tất cả học viên</option>
                <option value="renewal">Cần thu khóa mới ({renewalCount})</option>
              </Form.Select>
            )}
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
          </div>
        )}
      </div>

      {isTeacher && (
        <Alert variant="light" className="py-2 small mb-3">
          <i className="bi bi-cash-coin me-1 text-success" />
          Dùng nút <strong>Báo đủ tháng</strong> khi học viên đã đóng tiền và học đủ tháng.
          Hệ thống đánh dấu để thu phí khóa mới — <strong>học viên vẫn giữ trong lớp</strong>.
        </Alert>
      )}

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
                  {isTeacher && <th style={{ width: 150 }}>Học phí</th>}
                </>
              )}
              {isTeacher && <th style={{ width: 160 }} className="text-center">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((m, idx) => (
              <tr key={m.id} className={m.needs_fee_renewal ? 'table-warning' : undefined}>
                <td><span className="pro-row-num">{idx + 1}</span></td>
                <td>
                  <div className="pro-student-cell">
                    <UserAvatar user={m} size={36} />
                    <div>
                      {canLinkStudentProfile ? (
                        <Link
                          to={studentProfilePath(classId, m, { isAdmin, isTeacher })}
                          className="dash-class-link pro-student-name text-decoration-none"
                        >
                          {m.fullname}
                        </Link>
                      ) : (
                        <span className="pro-student-name">{m.fullname}</span>
                      )}
                      {m.needs_fee_renewal && (
                        <div>
                          <Badge bg="warning" text="dark" className="mt-1">
                            Thu khóa mới
                          </Badge>
                        </div>
                      )}
                    </div>
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
                    {isTeacher && (
                      <td>
                        {m.needs_fee_renewal ? (
                          <div>
                            <Badge bg="success" className="mb-1">Đã báo đủ tháng</Badge>
                            {m.fee_renewal_flagged_at && (
                              <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                                {new Date(m.fee_renewal_flagged_at).toLocaleDateString('vi-VN')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted small">—</span>
                        )}
                      </td>
                    )}
                  </>
                )}
                {isTeacher && (
                  <td className="text-center">
                    <div className="pro-action-group flex-wrap justify-content-center">
                      {m.needs_fee_renewal ? (
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          disabled={feeSavingId === m.id}
                          onClick={() => handleFeeRenewal(m, false)}
                          title="Bỏ đánh dấu thu khóa mới"
                        >
                          {feeSavingId === m.id ? <Spinner size="sm" /> : <i className="bi bi-x-circle" />}
                        </Button>
                      ) : (
                        <Button
                          variant="outline-success"
                          size="sm"
                          disabled={feeSavingId === m.id}
                          onClick={() => handleFeeRenewal(m, true)}
                          title="Báo đủ tháng — thu khóa mới"
                        >
                          {feeSavingId === m.id ? (
                            <Spinner size="sm" />
                          ) : (
                            <><i className="bi bi-cash-coin me-1" />Báo đủ tháng</>
                          )}
                        </Button>
                      )}
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
        withTuition
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
            {isAdmin && editingStudent && (
              <AdminAvatarPicker
                userId={editingId}
                user={editingStudent}
                onUploaded={() => onUpdated?.()}
              />
            )}
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
              <Alert variant={importResult.tuition_failed ? 'warning' : 'success'} className="py-2">
                <div>{importResult.message}</div>
                {(importResult.tuition_created > 0 || importResult.tuition_updated > 0) && (
                  <div className="small mt-1">
                    Học phí: {importResult.tuition_created || 0} mới, {importResult.tuition_updated || 0} cập nhật
                  </div>
                )}
                {importResult.tuition_errors?.length > 0 && (
                  <ul className="mb-0 mt-2 small text-danger">
                    <li className="fw-semibold">Lỗi học phí (học viên vẫn được thêm vào lớp):</li>
                    {importResult.tuition_errors.map((e) => (
                      <li key={`tuition-${e.row}-${e.message}`}>Dòng {e.row}: {e.message}</li>
                    ))}
                  </ul>
                )}
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
                Không còn giáo viên hoặc admin phụ HG/EG nào để thêm. Tạo tài khoản tại Quản lý người dùng hoặc Phân quyền admin.
              </Alert>
            ) : (
              <Form.Group>
                <Form.Label>Chọn giáo viên / admin phụ</Form.Label>
                <Form.Select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  required
                >
                  <option value="">-- Chọn giáo viên hoặc admin --</option>
                  {availableTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullname} ({t.username}){t.role === 'admin' ? ' — Admin phụ' : ''}
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

      <Modal show={!!teacherAvatarTarget} onHide={() => setTeacherAvatarTarget(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Ảnh đại diện — {teacherAvatarTarget?.fullname}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {teacherAvatarTarget && (
            <AdminAvatarPicker
              userId={teacherAvatarTarget.id}
              user={teacherAvatarTarget}
              onUploaded={() => {
                setTeacherAvatarTarget(null);
                onUpdated?.();
              }}
            />
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}

import { useEffect, useState } from 'react';
import { Button, ButtonGroup, Modal, Form, Spinner, Badge, Alert, Row, Col } from 'react-bootstrap';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userService, classService } from '../services';
import PageHeader from '../components/layout/PageHeader';
import FilterPanel from '../components/layout/FilterPanel';
import ModuleSection from '../components/layout/ModuleSection';
import { isSuperAdmin, isScopedAdmin, lockedCodePrefix, scopeLabel } from '../utils/adminScope';
import { teachingStaffBadge } from '../utils/roles';
import AdminAvatarPicker from '../components/AdminAvatarPicker';

const allRoleOptions = [
  { value: 'admin', label: 'Quản trị viên' },
  { value: 'teacher', label: 'Giáo viên' },
  { value: 'student', label: 'Học sinh' },
];

const scopedRoleOptions = [
  { value: 'teacher', label: 'Giáo viên' },
  { value: 'student', label: 'Học sinh' },
];

const emptyForm = { fullname: '', username: '', code: '', role: 'student', status: true };

function UserTableRow({ user, onEdit, onDelete, extraActions, canManage = true }) {
  const roleOptions = allRoleOptions;
  return (
    <tr>
      <td>{user.fullname}</td>
      <td>{user.username}</td>
      <td>{user.code}</td>
      <td>
        <Badge bg={user.role === 'admin' ? 'danger' : user.role === 'teacher' ? 'primary' : 'secondary'}>
          {roleOptions.find((r) => r.value === user.role)?.label}
        </Badge>
      </td>
      <td>
        <Badge bg={user.status ? 'success' : 'secondary'}>
          {user.status ? 'Hoạt động' : 'Đã khóa'}
        </Badge>
      </td>
      <td>
        {extraActions}
        {canManage && (
          <>
            <Button
              variant="outline-primary"
              size="sm"
              className="me-1"
              onClick={() => onEdit(user)}
            >
              <i className="bi bi-pencil me-1" />Sửa
            </Button>
            <Button variant="outline-danger" size="sm" onClick={() => onDelete(user.id)}>
              Xóa
            </Button>
          </>
        )}
      </td>
    </tr>
  );
}

export default function UsersPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState('class');
  const [classes, setClasses] = useState([]);
  const [classSearch, setClassSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [members, setMembers] = useState([]);
  const [unassignedTeachers, setUnassignedTeachers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    classService.getAll()
      .then((res) => setClasses(res.data))
      .finally(() => setLoadingClasses(false));
  }, []);

  useEffect(() => {
    const classId = searchParams.get('class_id');
    if (classId) setSelectedClassId(classId);
    if (searchParams.get('view') === 'teachers') setViewMode('teachers');
  }, [searchParams]);

  const loadTeachers = () => {
    setLoadingUsers(true);
    userService.listTeachers()
      .then((res) => setTeachers(res.data))
      .catch(() => setTeachers([]))
      .finally(() => setLoadingUsers(false));
  };

  const loadUsers = (classId) => {
    if (!classId) {
      setMembers([]);
      setUnassignedTeachers([]);
      return;
    }
    setLoadingUsers(true);
    userService.getAll(classId)
      .then((res) => {
        const data = res.data;
        if (Array.isArray(data)) {
          setMembers(data);
          setUnassignedTeachers([]);
        } else {
          setMembers(data.members || []);
          setUnassignedTeachers(data.unassigned_teachers || []);
        }
      })
      .finally(() => setLoadingUsers(false));
  };

  useEffect(() => {
    if (viewMode === 'teachers') {
      loadTeachers();
    } else {
      loadUsers(selectedClassId);
    }
  }, [viewMode, selectedClassId]);

  const refreshCurrentView = () => {
    if (viewMode === 'teachers') loadTeachers();
    else loadUsers(selectedClassId);
  };

  useEffect(() => {
    const userId = searchParams.get('user_id');
    if (!userId || loadingUsers) return;

    let target;
    if (viewMode === 'teachers') {
      target = teachers.find((t) => String(t.id) === userId);
    } else {
      if (!selectedClassId) return;
      target = members.find((m) => String(m.id) === userId)
        || unassignedTeachers.find((t) => String(t.id) === userId);
    }
    if (!target) return;

    setEditingId(target.id);
    setEditingUser(target);
    setForm({
      fullname: target.fullname,
      username: target.username,
      code: target.code,
      role: target.role,
      status: Boolean(target.status),
    });
    setError('');
    setShowModal(true);

    const next = new URLSearchParams(searchParams);
    next.delete('user_id');
    setSearchParams(next, { replace: true });
  }, [loadingUsers, members, unassignedTeachers, teachers, selectedClassId, viewMode, searchParams, setSearchParams]);

  const filteredClasses = classes.filter((cls) => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return true;
    return cls.name?.toLowerCase().includes(q)
      || cls.code?.toLowerCase().includes(q)
      || cls.description?.toLowerCase().includes(q);
  });

  const filteredTeachers = teachers.filter((t) => {
    const q = teacherSearch.trim().toLowerCase();
    if (!q) return true;
    return t.fullname?.toLowerCase().includes(q)
      || t.username?.toLowerCase().includes(q)
      || t.code?.toLowerCase().includes(q)
      || t.class_names?.toLowerCase().includes(q);
  });

  const switchViewMode = (mode) => {
    setViewMode(mode);
    const next = new URLSearchParams(searchParams);
    if (mode === 'teachers') next.set('view', 'teachers');
    else next.delete('view');
    setSearchParams(next, { replace: true });
  };

  const openCreateModal = () => {
    setEditingId(null);
    setEditingUser(null);
    setForm(viewMode === 'teachers' ? { ...emptyForm, role: 'teacher' } : emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setEditingId(user.id);
    setEditingUser(user);
    setForm({
      fullname: user.fullname,
      username: user.username,
      code: user.code,
      role: user.role,
      status: Boolean(user.status),
    });
    setError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setEditingUser(null);
    setForm(emptyForm);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await userService.update(editingId, form);
      } else {
        await userService.create(form);
      }
      closeModal();
      refreshCurrentView();
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Xóa người dùng này?')) {
      await userService.delete(id);
      refreshCurrentView();
    }
  };

  const handleAssignTeacher = async (teacherId) => {
    setAssigningId(teacherId);
    try {
      await classService.addTeacher(selectedClassId, teacherId);
      refreshCurrentView();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể thêm giáo viên vào lớp');
    } finally {
      setAssigningId(null);
    }
  };

  const canManageUser = (targetUser) => {
    if (isSuperAdmin(user)) return true;
    if (!isScopedAdmin(user)) return false;
    if (targetUser.role === 'admin') return false;
    return targetUser.role === 'teacher' || targetUser.role === 'student';
  };

  const roleOptions = isSuperAdmin(user) ? allRoleOptions : scopedRoleOptions;
  const codePrefix = lockedCodePrefix(user);

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  if (loadingClasses) {
    return <div className="page-container text-center py-5"><Spinner animation="border" /></div>;
  }

  const selectedClass = classes.find((c) => String(c.id) === selectedClassId);
  const totalCount = members.length + unassignedTeachers.length;

  return (
    <div className="page-container module-page">
      <PageHeader
        icon="bi-person-gear"
        title="Quản lý người dùng"
        subtitle={
          isScopedAdmin(user)
            ? `Tạo tài khoản giáo viên và học sinh nhánh ${scopeLabel(codePrefix)}. Không tạo được tài khoản admin.`
            : 'Tạo tài khoản và phân công giáo viên vào lớp học.'
        }
        actions={
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <i className="bi bi-person-plus me-1" />Tạo tài khoản
          </Button>
        }
      />

      <div className="mb-3">
        <ButtonGroup>
          <Button
            variant={viewMode === 'class' ? 'primary' : 'outline-primary'}
            size="sm"
            onClick={() => switchViewMode('class')}
          >
            <i className="bi bi-mortarboard me-1" />Theo lớp học
          </Button>
          <Button
            variant={viewMode === 'teachers' ? 'primary' : 'outline-primary'}
            size="sm"
            onClick={() => switchViewMode('teachers')}
          >
            <i className="bi bi-person-badge me-1" />Giáo viên
          </Button>
        </ButtonGroup>
      </div>

      {viewMode === 'class' ? (
        <FilterPanel title="Chọn lớp học">
        <Row className="g-2">
          <Col md={5} lg={4}>
            <Form.Control
              type="search"
              placeholder="Tìm lớp..."
              value={classSearch}
              onChange={(e) => setClassSearch(e.target.value)}
              className="mb-2"
            />
            <Form.Select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="">-- Chọn lớp để xem tài khoản --</option>
              {filteredClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}{cls.code ? ` (${cls.code})` : ''}
                </option>
              ))}
            </Form.Select>
            {classSearch && filteredClasses.length === 0 && (
              <Form.Text className="text-muted">Không tìm thấy lớp phù hợp.</Form.Text>
            )}
          </Col>
        </Row>
      </FilterPanel>
      ) : (
        <FilterPanel title="Tìm giáo viên">
          <Row className="g-2">
            <Col md={5} lg={4}>
              <Form.Control
                type="search"
                placeholder="Tìm theo tên, mã, lớp..."
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
              />
            </Col>
          </Row>
        </FilterPanel>
      )}

      {viewMode === 'teachers' ? (
        loadingUsers ? (
          <div className="text-center py-5"><Spinner animation="border" /></div>
        ) : filteredTeachers.length === 0 ? (
          <Alert variant="light" className="text-center py-4 mb-0">
            <i className="bi bi-person-badge d-block fs-3 text-muted mb-2" />
            {teacherSearch
              ? 'Không tìm thấy giáo viên phù hợp.'
              : 'Chưa có tài khoản giáo viên. Nhấn "Tạo tài khoản" để thêm mới.'}
          </Alert>
        ) : (
          <ModuleSection
            title="Danh sách giáo viên"
            icon="bi-person-badge"
            count={filteredTeachers.length}
            flush
          >
            <div className="pro-table-wrap">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Tên đăng nhập</th>
                    <th>Mã</th>
                    <th>Loại</th>
                    <th>Lớp đang dạy</th>
                    <th>Trạng thái</th>
                    <th style={{ width: 140 }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeachers.map((t) => {
                    const badge = teachingStaffBadge(t);
                    return (
                      <tr key={t.id}>
                        <td>{t.fullname}</td>
                        <td>{t.username}</td>
                        <td>{t.code}</td>
                        <td><Badge bg={badge.bg}>{badge.label}</Badge></td>
                        <td className="text-muted small">
                          {t.class_names || <span className="fst-italic">Chưa phân lớp</span>}
                        </td>
                        <td>
                          <Badge bg={t.status ? 'success' : 'secondary'}>
                            {t.status ? 'Hoạt động' : 'Đã khóa'}
                          </Badge>
                        </td>
                        <td>
                          {canManageUser(t) && (
                            <>
                              <Button
                                variant="outline-primary"
                                size="sm"
                                className="me-1"
                                onClick={() => openEditModal(t)}
                              >
                                <i className="bi bi-pencil me-1" />Sửa
                              </Button>
                              <Button variant="outline-danger" size="sm" onClick={() => handleDelete(t.id)}>
                                Xóa
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ModuleSection>
        )
      ) : !selectedClassId ? (
        <Alert variant="light" className="text-center py-4 mb-0">
          <i className="bi bi-funnel d-block fs-3 text-muted mb-2" />
          Vui lòng chọn lớp học để xem danh sách tài khoản trong lớp.
        </Alert>
      ) : loadingUsers ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <>
          {totalCount === 0 ? (
            <Alert variant="light" className="text-center py-4 mb-0">
              Lớp này chưa có tài khoản nào. Thêm học viên tại tab Thành viên trong lớp học.
            </Alert>
          ) : (
            <>
              {members.length > 0 && (
                <ModuleSection
                  title="Thành viên trong lớp"
                  icon="bi-people"
                  count={members.length}
                  flush
                  className="mb-3"
                >
                  <div className="pro-table-wrap">
                    <table className="pro-table">
                      <thead>
                        <tr>
                          <th>Họ tên</th>
                          <th>Tên đăng nhập</th>
                          <th>Mã</th>
                          <th>Vai trò</th>
                          <th>Trạng thái</th>
                          <th style={{ width: 140 }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((u) => (
                          <UserTableRow
                            key={u.id}
                            user={u}
                            onEdit={openEditModal}
                            onDelete={handleDelete}
                            canManage={canManageUser(u)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ModuleSection>
              )}

              {unassignedTeachers.length > 0 && (
                <ModuleSection
                  title="Giáo viên chưa được thêm vào lớp"
                  icon="bi-person-badge"
                  count={unassignedTeachers.length}
                  flush
                >
                  <p className="text-muted small px-3 pt-2 mb-0">
                    Có thể thêm trực tiếp vào lớp <strong>{selectedClass?.name}</strong>
                  </p>
                  <div className="pro-table-wrap">
                    <table className="pro-table">
                      <thead>
                        <tr>
                          <th>Họ tên</th>
                          <th>Tên đăng nhập</th>
                          <th>Mã</th>
                          <th>Vai trò</th>
                          <th>Trạng thái</th>
                          <th style={{ width: 180 }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unassignedTeachers.map((u) => (
                          <UserTableRow
                            key={u.id}
                            user={u}
                            onEdit={openEditModal}
                            onDelete={handleDelete}
                            canManage={canManageUser(u)}
                            extraActions={(
                              <Button
                                variant="outline-success"
                                size="sm"
                                className="me-1"
                                disabled={assigningId === u.id}
                                onClick={() => handleAssignTeacher(u.id)}
                              >
                                {assigningId === u.id ? (
                                  <Spinner animation="border" size="sm" />
                                ) : (
                                  <>
                                    <i className="bi bi-person-plus me-1" />
                                    Thêm vào lớp
                                  </>
                                )}
                              </Button>
                            )}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ModuleSection>
              )}
            </>
          )}
        </>
      )}

      <Modal show={showModal} onHide={closeModal}>
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Sửa thông tin người dùng' : 'Tạo tài khoản mới'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            {editingId && editingUser && (form.role === 'student' || form.role === 'teacher') && (
              <AdminAvatarPicker
                userId={editingId}
                user={{ ...editingUser, fullname: form.fullname, role: form.role }}
                onUploaded={(avatarUrl) => {
                  setEditingUser((prev) => ({ ...prev, avatar_url: avatarUrl }));
                  refreshCurrentView();
                }}
              />
            )}
            <Form.Group className="mb-3">
              <Form.Label>Họ tên</Form.Label>
              <Form.Control
                value={form.fullname}
                onChange={(e) => setForm({ ...form, fullname: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Tên đăng nhập</Form.Label>
              <Form.Control
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mã</Form.Label>
              <Form.Control
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
              {codePrefix && form.role === 'student' && (
                <Form.Text className="text-muted">
                  Mã học sinh nên bắt đầu bằng <strong>{codePrefix}</strong>
                </Form.Text>
              )}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Vai trò</Form.Label>
              <Form.Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Form.Select>
            </Form.Group>
            {editingId && (
              <Form.Group>
                <Form.Check
                  type="switch"
                  id="user-status"
                  label="Tài khoản hoạt động"
                  checked={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.checked })}
                />
              </Form.Group>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeModal}>Hủy</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Tạo'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

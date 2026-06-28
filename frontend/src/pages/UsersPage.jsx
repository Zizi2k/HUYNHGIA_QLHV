import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Spinner, Badge, Alert, Row, Col } from 'react-bootstrap';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userService, classService } from '../services';
import PageHeader from '../components/layout/PageHeader';
import { isSuperAdmin, isScopedAdmin, lockedCodePrefix, scopeLabel } from '../utils/adminScope';

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
  const [classes, setClasses] = useState([]);
  const [classSearch, setClassSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [members, setMembers] = useState([]);
  const [unassignedTeachers, setUnassignedTeachers] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    classService.getAll()
      .then((res) => setClasses(res.data))
      .finally(() => setLoadingClasses(false));
  }, []);

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
    loadUsers(selectedClassId);
  }, [selectedClassId]);

  const filteredClasses = classes.filter((cls) => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return true;
    return cls.name?.toLowerCase().includes(q)
      || cls.code?.toLowerCase().includes(q)
      || cls.description?.toLowerCase().includes(q);
  });

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setEditingId(user.id);
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
      loadUsers(selectedClassId);
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Xóa người dùng này?')) {
      await userService.delete(id);
      loadUsers(selectedClassId);
    }
  };

  const handleAssignTeacher = async (teacherId) => {
    setAssigningId(teacherId);
    try {
      await classService.addTeacher(selectedClassId, teacherId);
      loadUsers(selectedClassId);
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
    <div className="page-container">
      <PageHeader
        title="Quản lý người dùng"
        subtitle={
          isScopedAdmin(user)
            ? `Tạo tài khoản giáo viên và học sinh nhánh ${scopeLabel(codePrefix)}. Không tạo được tài khoản admin.`
            : 'Tạo tài khoản và phân công giáo viên vào lớp học.'
        }
        actions={
          <Button variant="success" size="sm" className="page-header-btn" onClick={openCreateModal}>
            <i className="bi bi-person-plus me-1" />Tạo tài khoản
          </Button>
        }
      />

      <Row className="mb-4 g-3">
        <Col md={5} lg={4}>
          <Form.Group>
            <Form.Label className="fw-semibold">Lọc lớp học</Form.Label>
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
          </Form.Group>
        </Col>
      </Row>

      {!selectedClassId ? (
        <Alert variant="light" className="text-center py-4">
          <i className="bi bi-funnel d-block fs-3 text-muted mb-2" />
          Vui lòng chọn lớp học để xem danh sách tài khoản trong lớp.
        </Alert>
      ) : loadingUsers ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <>
          <div className="mb-3 text-muted small">
            Lớp: <strong>{selectedClass?.name}</strong>
            <span className="ms-2 badge bg-primary bg-opacity-10 text-primary">
              {members.length} thành viên trong lớp
            </span>
            {unassignedTeachers.length > 0 && (
              <span className="ms-2 badge bg-warning bg-opacity-10 text-warning">
                {unassignedTeachers.length} giáo viên chưa phân lớp
              </span>
            )}
          </div>

          {totalCount === 0 ? (
            <Alert variant="light" className="text-center py-4">
              Lớp này chưa có tài khoản nào. Thêm học viên tại tab Thành viên trong lớp học.
            </Alert>
          ) : (
            <>
              {members.length > 0 && (
                <>
                  <h6 className="mb-3">Thành viên trong lớp</h6>
                  <Table responsive hover className="bg-white shadow-sm rounded mb-4">
                    <thead className="table-light">
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
                  </Table>
                </>
              )}

              {unassignedTeachers.length > 0 && (
                <>
                  <h6 className="mb-3">
                    Giáo viên chưa được thêm vào lớp nào
                    <span className="text-muted fw-normal ms-2 small">
                      Có thể thêm trực tiếp vào lớp đang chọn
                    </span>
                  </h6>
                  <Table responsive hover className="bg-white shadow-sm rounded">
                    <thead className="table-light">
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
                  </Table>
                </>
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

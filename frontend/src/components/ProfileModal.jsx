import { useEffect, useState } from 'react';
import { Modal, Form, Button, Alert } from 'react-bootstrap';
import { authService } from '../services';
import { useAuth } from '../context/AuthContext';
import UserAvatar from './UserAvatar';

const roleLabels = { admin: 'Quản trị viên', teacher: 'Giáo viên', student: 'Học sinh' };

export default function ProfileModal({ show, onHide }) {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ fullname: '', username: '', code: '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (show && user) {
      setForm({
        fullname: user.fullname || '',
        username: user.username || '',
        code: user.code || '',
      });
      setAvatarFile(null);
      setPreview(null);
      setError('');
    }
  }, [show, user]);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('fullname', form.fullname);
      formData.append('username', form.username);
      formData.append('code', form.code);
      if (avatarFile) formData.append('avatar', avatarFile);

      const res = await authService.updateProfile(formData);
      updateUser(res.data.user);
      onHide();
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  const displayUser = preview
    ? { ...user, avatar_url: preview }
    : user;

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Thông tin cá nhân</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}

          <div className="text-center mb-4">
            <div className="position-relative d-inline-block">
              <UserAvatar user={displayUser} size={96} />
              <label
                htmlFor="avatar-upload"
                className="position-absolute bottom-0 end-0 btn btn-primary btn-sm rounded-circle p-2"
                style={{ width: 32, height: 32, lineHeight: 1 }}
                title="Đổi ảnh đại diện"
              >
                <i className="bi bi-camera-fill" style={{ fontSize: '0.75rem' }} />
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="d-none"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="mt-2 text-muted small">Nhấn biểu tượng máy ảnh để đổi ảnh</div>
          </div>

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
            <Form.Label>Mã người dùng</Form.Label>
            <Form.Control
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
            {user?.role === 'student' && user?.student_codes?.length > 1 && (
              <Form.Text className="text-muted d-block mt-1">
                Các mã theo môn: {user.student_codes.map((item) => item.code).join(', ')}
              </Form.Text>
            )}
          </Form.Group>
          <Form.Group>
            <Form.Label>Vai trò</Form.Label>
            <Form.Control value={roleLabels[user?.role] || ''} disabled readOnly />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Hủy</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

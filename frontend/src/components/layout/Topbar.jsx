import { useState, useEffect } from 'react';
import { Dropdown, Badge, Modal, Form, Button } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { auditService } from '../../services';
import { isSuperAdmin, scopeLabel, getAdminScope } from '../../utils/adminScope';
import UserAvatar from '../UserAvatar';
import ProfileModal from '../ProfileModal';
import NotificationBell from '../notifications/NotificationBell';
import { accountThemes } from '../../layouts/themes';

export default function Topbar({ onToggleSidebar, onToggleMobile, appearance, onAppearanceChange }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
  const [appearanceDraft, setAppearanceDraft] = useState(null);
  const [pendingDeletes, setPendingDeletes] = useState(0);
  const isAdmin = user?.role === 'admin';
  const isSuper = isSuperAdmin(user);
  const adminScope = getAdminScope(user);

  useEffect(() => {
    if (!isSuper) return undefined;
    const load = () => {
      auditService.getPendingCount()
        .then((res) => setPendingDeletes(res.data.count || 0))
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [isSuper]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="app-topbar">
        <div className="app-topbar-left">
          <button
            type="button"
            className="app-topbar-btn d-lg-none"
            onClick={onToggleMobile}
            aria-label="Mở menu"
          >
            <i className="bi bi-list" />
          </button>
          <button
            type="button"
            className="app-topbar-btn d-none d-lg-inline-flex"
            onClick={onToggleSidebar}
            aria-label="Thu gọn menu"
          >
            <i className="bi bi-layout-sidebar" />
          </button>
        </div>

        <div className="app-topbar-right">
          {adminScope && (
            <Badge bg={adminScope === 'HG' ? 'primary' : 'success'} className="me-2">
              {scopeLabel(adminScope)}
            </Badge>
          )}
          {isSuper && (
            <Link
              to="/audit"
              className="app-topbar-btn position-relative text-decoration-none"
              title="Yêu cầu xóa chờ duyệt"
            >
              <i className="bi bi-shield-check" />
              {pendingDeletes > 0 && (
                <Badge
                  bg="danger"
                  pill
                  className="position-absolute top-0 start-100 translate-middle"
                  style={{ fontSize: '0.65rem' }}
                >
                  {pendingDeletes > 99 ? '99+' : pendingDeletes}
                </Badge>
              )}
            </Link>
          )}
          <NotificationBell />
          <Dropdown align="end">
            <Dropdown.Toggle as="button" className="app-topbar-user">
              <UserAvatar user={user} size={36} />
              <div className="app-topbar-user-info d-none d-sm-block">
                <span className="app-topbar-user-name">{user?.fullname}</span>
              </div>
              <i className="bi bi-chevron-down app-topbar-chevron d-none d-sm-inline" />
            </Dropdown.Toggle>
            <Dropdown.Menu className="app-dropdown-menu">
              <Dropdown.Item as={Link} to={`/profile/${user?.id}`}>
                <i className="bi bi-person-badge me-2" />
                Trang cá nhân
              </Dropdown.Item>
              <Dropdown.Item onClick={() => setShowProfile(true)}>
                <i className="bi bi-person-gear me-2" />
                Sửa thông tin cá nhân
              </Dropdown.Item>
              <Dropdown.Item onClick={() => setAppearanceDraft(appearance)}>
                <i className="bi bi-palette me-2" />Giao diện
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={handleLogout} className="text-danger">
                <i className="bi bi-box-arrow-right me-2" />
                Đăng xuất
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </header>

      <ProfileModal show={showProfile} onHide={() => setShowProfile(false)} />
      <Modal centered show={appearanceDraft !== null} onHide={() => setAppearanceDraft(null)}>
        <Form onSubmit={(e) => { e.preventDefault(); onAppearanceChange(appearanceDraft); setAppearanceDraft(null); }}>
          <Modal.Header closeButton><Modal.Title>Cài đặt giao diện</Modal.Title></Modal.Header>
          <Modal.Body>
            <Form.Group controlId="account-theme" className="mb-3">
              <Form.Label>Chủ đề màu</Form.Label>
              <Form.Select value={appearanceDraft?.theme || 'blue'} onChange={(e) => setAppearanceDraft({ ...appearanceDraft, theme: e.target.value })}>
                {accountThemes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Form.Select>
            </Form.Group>
            {isAdmin && <Form.Group controlId="account-layout">
              <Form.Label>Bố cục quản trị</Form.Label>
              <Form.Select value={appearanceDraft?.layout || 'standard'} onChange={(e) => setAppearanceDraft({ ...appearanceDraft, layout: e.target.value })}>
                <option value="standard">Tiêu chuẩn</option>
                <option value="compact">Gọn: thanh bên hẹp, giảm khoảng cách</option>
                <option value="focused">Tập trung: căn giữa vùng làm việc</option>
              </Form.Select>
            </Form.Group>}
            <Form.Text>Tùy chọn được lưu riêng cho tài khoản trên trình duyệt này.</Form.Text>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setAppearanceDraft(null)}>Hủy</Button><Button type="submit">Lưu giao diện</Button></Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}

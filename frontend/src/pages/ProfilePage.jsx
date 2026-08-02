import { useEffect, useRef, useState } from 'react';
import { Alert, Dropdown, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authService, userService } from '../services';
import { useAuth } from '../context/AuthContext';
import { getAvatarUrl, getInitials } from '../utils/avatar';
import ProfileModal from '../components/ProfileModal';
import LoadingOverlay from '../components/common/LoadingOverlay';

function formatJoined(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

function zaloHref(zalo) {
  const digits = String(zalo || '').replace(/\D/g, '');
  return digits ? `https://zalo.me/${digits}` : null;
}

export default function ProfilePage() {
  const { userId } = useParams();
  const { user: me, updateUser } = useAuth();
  const navigate = useNavigate();
  const avatarInputRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const reloadProfile = async () => {
    const res = await userService.getProfile(userId);
    setProfile(res.data);
    return res.data;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await userService.getProfile(userId);
        if (!cancelled) setProfile(res.data);
      } catch (err) {
        if (!cancelled) {
          setProfile(null);
          setError(err.response?.data?.message || 'Không thể tải trang cá nhân');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userId]);

  const avatarSrc = getAvatarUrl(profile?.avatar_url);
  const initials = getInitials(profile?.fullname);
  const joined = formatJoined(profile?.created_at);
  const highlights = profile?.highlights || [];
  const isSelf = profile?.is_self || Number(me?.id) === Number(userId);
  const canEdit = Boolean(profile?.can_edit || isSelf);
  const zaloLink = zaloHref(profile?.zalo);

  const handleAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canEdit || !profile) return;
    setUploadingAvatar(true);
    setError('');
    try {
      if (isSelf) {
        const formData = new FormData();
        formData.append('fullname', profile.fullname || me?.fullname || '');
        formData.append('username', profile.username || me?.username || '');
        formData.append('code', profile.code || me?.code || '');
        formData.append('phone', profile.phone || '');
        formData.append('zalo', profile.zalo || '');
        formData.append('avatar', file);
        const res = await authService.updateProfile(formData);
        updateUser(res.data.user);
      } else {
        const formData = new FormData();
        formData.append('avatar', file);
        await userService.uploadAvatar(profile.id, formData);
      }
      await reloadProfile();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể cập nhật ảnh đại diện');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <LoadingOverlay loading={loading && !profile} minHeight={420}>
      <div className="profile-page">
        {error && (
          <Alert variant="danger" className="mb-3">
            {error}
            <div className="mt-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => navigate(-1)}>
                Quay lại
              </button>
            </div>
          </Alert>
        )}

        {profile && (
          <>
            <header className="profile-hero">
              {canEdit && (
                <div className="profile-hero-menu">
                  <Dropdown align="end">
                    <Dropdown.Toggle
                      as="button"
                      type="button"
                      className="profile-menu-btn"
                      aria-label="Tuỳ chọn trang cá nhân"
                    >
                      <i className="bi bi-three-dots" />
                    </Dropdown.Toggle>
                    <Dropdown.Menu className="app-dropdown-menu profile-menu-dropdown">
                      <Dropdown.Item onClick={() => avatarInputRef.current?.click()}>
                        <i className="bi bi-camera me-2" />
                        Đổi ảnh đại diện
                      </Dropdown.Item>
                      <Dropdown.Item onClick={() => setShowEdit(true)}>
                        <i className="bi bi-pencil-square me-2" />
                        Sửa thông tin cá nhân
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>
              )}

              <div className="profile-hero-grid">
                <div className="profile-hero-spacer" aria-hidden="true" />

                <div className="profile-hero-center">
                  <div className={`profile-hero-avatar-wrap${canEdit ? ' is-editable' : ''}`}>
                    <div className="profile-hero-avatar-ring" aria-hidden="true" />
                    <div className="profile-hero-avatar">
                      {avatarSrc ? (
                        <img src={avatarSrc} alt={profile.fullname} />
                      ) : (
                        <span className="profile-hero-initials">{initials}</span>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        className="profile-avatar-edit"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        title="Đổi ảnh đại diện"
                      >
                        {uploadingAvatar
                          ? <Spinner animation="border" size="sm" />
                          : <i className="bi bi-camera-fill" />}
                      </button>
                    )}
                  </div>

                  <p className="profile-hero-role">{profile.role_label}</p>
                  <h1 className="profile-hero-name">{profile.fullname}</h1>

                  {!isSelf && zaloLink && (
                    <a
                      className="profile-hero-cta"
                      href={zaloLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Liên hệ Zalo
                      <i className="bi bi-arrow-right" />
                    </a>
                  )}
                  {!isSelf && !zaloLink && (
                    <button
                      type="button"
                      className="profile-hero-cta profile-hero-cta--ghost"
                      onClick={() => navigate(-1)}
                    >
                      Quay lại
                      <i className="bi bi-arrow-right" />
                    </button>
                  )}
                </div>

                <ul className="profile-hero-tags">
                  {highlights.map((tag, idx) => (
                    <li key={tag} className={idx === 0 ? 'is-accent' : undefined}>
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>

              {canEdit && (
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="d-none"
                  onChange={handleAvatarFile}
                />
              )}
            </header>

            <section className="profile-about">
              <div className="profile-about-header">
                <h2>Giới thiệu</h2>
                <span className="profile-about-underline" />
              </div>

              <div className="profile-about-panel">
                <div className="profile-about-main">
                  <blockquote className="profile-about-quote">
                    “{profile.quote}”
                  </blockquote>
                  <p className="profile-about-bio">
                    {profile.role === 'teacher' && (
                      <>
                        Giáo viên tại hệ thống LHG — đồng hành cùng học viên trong các lớp học trực tuyến,
                        theo dõi tiến độ và tạo môi trường học tập tích cực.
                      </>
                    )}
                    {profile.role === 'student' && (
                      <>
                        Học viên đang tham gia các khóa học tại LHG. Hồ sơ này giúp theo dõi thông tin liên hệ
                        và các lớp đang học.
                      </>
                    )}
                    {profile.role === 'admin' && (
                      <>
                        Quản trị viên hệ thống LHG — hỗ trợ vận hành lớp học, tài khoản và các hoạt động học tập.
                      </>
                    )}
                    {joined && (
                      <> Tham gia từ <strong>{joined}</strong>.</>
                    )}
                  </p>

                  {profile.classes?.length > 0 && (
                    <div className="profile-class-list">
                      <h3>Lớp đang tham gia</h3>
                      <div className="profile-class-chips">
                        {profile.classes.map((c) => (
                          <Link key={c.id} to={`/classes/${c.id}`} className="profile-class-chip">
                            {c.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <aside className="profile-about-aside">
                  {(profile.phone || profile.zalo || profile.code || profile.username) && (
                    <ul className="profile-contact-list">
                      {profile.phone && (
                        <li>
                          <span className="profile-contact-icon"><i className="bi bi-telephone" /></span>
                          <div>
                            <span className="profile-contact-label">Điện thoại</span>
                            <a href={`tel:${profile.phone}`}>{profile.phone}</a>
                          </div>
                        </li>
                      )}
                      {profile.zalo && (
                        <li>
                          <span className="profile-contact-icon"><i className="bi bi-chat-dots" /></span>
                          <div>
                            <span className="profile-contact-label">Zalo</span>
                            <span>{profile.zalo}</span>
                          </div>
                        </li>
                      )}
                      {profile.code && (
                        <li>
                          <span className="profile-contact-icon"><i className="bi bi-person-badge" /></span>
                          <div>
                            <span className="profile-contact-label">Mã</span>
                            <span>{profile.code}</span>
                          </div>
                        </li>
                      )}
                      {profile.username && (
                        <li>
                          <span className="profile-contact-icon"><i className="bi bi-at" /></span>
                          <div>
                            <span className="profile-contact-label">Tên đăng nhập</span>
                            <span>{profile.username}</span>
                          </div>
                        </li>
                      )}
                    </ul>
                  )}
                  {!profile.phone && !profile.zalo && !profile.code && (
                    <p className="profile-contact-empty text-muted small mb-0">
                      Thông tin liên hệ chỉ hiển thị với giáo viên / quản trị.
                    </p>
                  )}
                  <div className="profile-about-deco" aria-hidden="true" />
                </aside>
              </div>
            </section>
          </>
        )}

        {loading && !profile && (
          <div className="text-center py-5">
            <Spinner animation="border" />
          </div>
        )}
      </div>

      {canEdit && (
        <ProfileModal
          show={showEdit}
          onHide={() => setShowEdit(false)}
          targetProfile={isSelf ? null : profile}
          onSaved={async () => {
            try {
              await reloadProfile();
            } catch {
              /* keep current view */
            }
          }}
        />
      )}
    </LoadingOverlay>
  );
}

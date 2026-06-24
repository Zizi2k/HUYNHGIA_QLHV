import { getAvatarUrl, getInitials } from '../utils/avatar';

const roleColors = {
  admin: '#dc3545',
  teacher: '#0d6efd',
  student: '#6c757d',
};

export default function UserAvatar({ user, size = 40, className = '' }) {
  const avatarSrc = getAvatarUrl(user?.avatar_url);
  const initials = getInitials(user?.fullname);
  const bgColor = roleColors[user?.role] || '#6c757d';

  if (avatarSrc) {
    return (
      <img
        src={avatarSrc}
        alt={user?.fullname || 'Ảnh đại diện'}
        className={`rounded-circle object-fit-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-circle d-flex align-items-center justify-content-center text-white fw-semibold ${className}`}
      style={{ width: size, height: size, backgroundColor: bgColor, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

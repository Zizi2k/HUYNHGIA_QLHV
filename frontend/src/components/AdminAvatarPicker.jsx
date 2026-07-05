import { useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { userService } from '../services';
import UserAvatar from './UserAvatar';

export default function AdminAvatarPicker({
  userId, user, onUploaded, disabled = false,
}) {
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  if (!userId || !user) return null;

  const displayUser = preview
    ? { ...user, avatar_url: preview }
    : user;

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await userService.uploadAvatar(userId, fd);
      onUploaded?.(res.data.avatar_url);
      setPreview(null);
    } catch (err) {
      setPreview(null);
      setError(err.response?.data?.message || 'Không thể tải ảnh');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="text-center mb-4">
      <div className="position-relative d-inline-block">
        <UserAvatar user={displayUser} size={96} />
        {!disabled && (
          <label
            htmlFor={`admin-avatar-${userId}`}
            className="position-absolute bottom-0 end-0 btn btn-primary btn-sm rounded-circle p-2"
            style={{ width: 32, height: 32, lineHeight: 1 }}
            title="Đổi ảnh đại diện"
          >
            {uploading ? (
              <Spinner size="sm" animation="border" />
            ) : (
              <i className="bi bi-camera-fill" style={{ fontSize: '0.75rem' }} />
            )}
          </label>
        )}
        <input
          id={`admin-avatar-${userId}`}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="d-none"
          disabled={disabled || uploading}
          onChange={handleChange}
        />
      </div>
      {error && <div className="text-danger small mt-2">{error}</div>}
      {!disabled && (
        <div className="mt-2 text-muted small">Admin có thể đổi ảnh đại diện</div>
      )}
    </div>
  );
}

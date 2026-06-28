import { API_BASE } from '../config/apiBase';

export function getInitials(fullname) {
  if (!fullname) return '?';
  const parts = fullname.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function getAvatarUrl(avatarUrl) {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('blob:') || avatarUrl.startsWith('http')) return avatarUrl;
  return `${API_BASE}${avatarUrl}`;
}

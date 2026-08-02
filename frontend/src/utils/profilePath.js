/** Trang cá nhân của tài khoản */
export function profilePath(userId) {
  if (userId == null || userId === '') return null;
  return `/profile/${userId}`;
}

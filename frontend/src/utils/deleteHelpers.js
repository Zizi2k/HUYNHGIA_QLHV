export function notifyDeleteResult(res) {
  if (res?.data?.pending_approval) {
    alert(res.data.message || 'Yêu cầu xóa đã gửi admin duyệt');
    return true;
  }
  return false;
}

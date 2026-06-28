export const LESSON_FILE_ACCEPT =
  '.pdf,.doc,.docx,.ppt,.pptx,.pps,.ppsx,.mp4,.avi,.mov,.wmv,.webm,.mkv,' +
  'application/pdf,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-powerpoint,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'video/mp4,video/avi,video/quicktime,video/webm';

export const LESSON_IMAGE_ACCEPT =
  '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,' +
  'image/jpeg,image/png,image/gif,image/webp,image/bmp,image/svg+xml';

export const LESSON_FILE_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.pps', '.ppsx',
  '.mp4', '.avi', '.mov', '.wmv', '.webm', '.mkv',
];

export const LESSON_IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
];

export function isLessonFileAllowed(file) {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return LESSON_FILE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function isLessonImageAllowed(file) {
  if (!file) return false;
  const name = file.name.toLowerCase();
  if (LESSON_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  return (file.type || '').startsWith('image/');
}

export function isImageLesson(lesson) {
  if (!lesson) return false;
  if (lesson.file_type === 'link/image') return true;
  if ((lesson.file_type || '').startsWith('image/')) return true;
  const url = (lesson.file_url || '').toLowerCase();
  return LESSON_IMAGE_EXTENSIONS.some((ext) => url.includes(ext));
}

export function getFileIcon(fileUrl) {
  if (!fileUrl) return 'bi-file-earmark';
  const ext = fileUrl.toLowerCase().split('.').pop()?.split('?')[0];
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'bi-image';
  if (ext === 'pdf') return 'bi-file-earmark-pdf';
  if (['doc', 'docx'].includes(ext)) return 'bi-file-earmark-word';
  if (['ppt', 'pptx', 'pps', 'ppsx'].includes(ext)) return 'bi-file-earmark-ppt';
  if (['mp4', 'avi', 'mov', 'wmv', 'webm', 'mkv'].includes(ext)) return 'bi-file-earmark-play';
  return 'bi-file-earmark';
}

export function getLessonIcon(lesson) {
  if (lesson?.file_type === 'link/website') return 'bi-globe2';
  if (lesson?.file_type === 'link/document') return 'bi-link-45deg';
  if (lesson?.file_type === 'link/image' || isImageLesson(lesson)) return 'bi-image';
  return getFileIcon(lesson?.file_url);
}

export function isExternalLessonUrl(fileUrl) {
  return /^https?:\/\//i.test(fileUrl || '');
}

export function getLessonResourceUrl(fileUrl, apiBase) {
  if (!fileUrl) return '';
  if (isExternalLessonUrl(fileUrl)) return fileUrl;
  const base = (apiBase || '').replace(/\/$/, '');
  return `${base}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
}

export function getLessonLinkLabel(fileType, lesson) {
  if (fileType === 'link/website') return 'Mở trang web';
  if (fileType === 'link/document') return 'Mở tài liệu';
  if (fileType === 'link/image' || (lesson && isImageLesson(lesson))) return 'Xem ảnh';
  return 'Tải về';
}

export function getLessonBadge(lesson) {
  if (!lesson?.file_type?.startsWith('link/') && !isImageLesson(lesson)) return null;
  if (lesson.file_type === 'link/website') return { text: 'Link trang web', variant: 'info' };
  if (lesson.file_type === 'link/document') return { text: 'Link tài liệu', variant: 'info' };
  if (lesson.file_type === 'link/image' || isImageLesson(lesson)) return { text: 'Ảnh', variant: 'secondary' };
  return null;
}

export const STUDENT_SUBMIT_FILE_ACCEPT =
  '.docx,.xlsx,.xls,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-excel';

export const STUDENT_SUBMIT_EXTENSIONS = ['.docx', '.xlsx', '.xls'];

export function isStudentSubmitFileAllowed(file) {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return STUDENT_SUBMIT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export const LESSON_FILE_ACCEPT =
  '.pdf,.doc,.docx,.xlsx,.xls,.ppt,.pptx,.pps,.ppsx,.mp4,.avi,.mov,.wmv,.webm,.mkv,' +
  'application/pdf,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-excel,' +
  'application/vnd.ms-powerpoint,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'video/mp4,video/avi,video/quicktime,video/webm';

export const LESSON_IMAGE_ACCEPT =
  '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,' +
  'image/jpeg,image/png,image/gif,image/webp,image/bmp,image/svg+xml';

export const LESSON_FILE_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xlsx', '.xls', '.ppt', '.pptx', '.pps', '.ppsx',
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
  if (['xls', 'xlsx'].includes(ext)) return 'bi-file-earmark-excel';
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

const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|avi|wmv|mkv)(\?|$)/i;
const OFFICE_EXT_RE = /\.(doc|docx|xls|xlsx|ppt|pptx|pps|ppsx)(\?|$)/i;

export function resolveAbsoluteResourceUrl(fileUrl, apiBase) {
  const relative = getLessonResourceUrl(fileUrl, apiBase);
  if (isExternalLessonUrl(relative)) return relative;
  if (typeof window !== 'undefined') {
    const base = (apiBase || '').replace(/\/$/, '');
    if (relative.startsWith('http')) return relative;
    return `${window.location.origin}${base}${relative.startsWith('/') ? relative : `/${relative}`}`;
  }
  return relative;
}

export function getGoogleGviewUrl(absoluteUrl) {
  return `https://docs.google.com/gview?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;
}

function inferPreviewKindFromUrlAndMime(fileUrl, mime) {
  const url = (fileUrl || '').toLowerCase();
  const type = (mime || '').toLowerCase();

  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf' || url.includes('.pdf')) return 'pdf';
  if (type.startsWith('video/') || VIDEO_EXT_RE.test(url)) return 'video';
  if (
    OFFICE_EXT_RE.test(url)
    || type.includes('word')
    || type.includes('spreadsheet')
    || type.includes('presentation')
    || type.includes('excel')
    || type.includes('msword')
    || type.includes('officedocument')
  ) {
    return 'office';
  }
  return 'none';
}

export function getContentPreviewKind(item) {
  if (!item?.file_url) return 'none';

  if (item.file_type === 'link/website') return 'external';
  if (item.file_type === 'link/document') return 'external';
  if (item.file_type === 'link/image' || isImageLesson(item)) return 'image';

  return inferPreviewKindFromUrlAndMime(item.file_url, item.file_type);
}

export function getPreviewKindFromFile(file) {
  if (!file) return 'none';
  return inferPreviewKindFromUrlAndMime(file.name, file.type);
}

export function canPreviewContent(item) {
  return getContentPreviewKind(item) !== 'none';
}

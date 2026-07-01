import { useEffect, useMemo } from 'react';
import { Alert } from 'react-bootstrap';
import { getPreviewKindFromFile } from '../../utils/fileTypes';

function LocalPreviewBody({ url, kind, fileName, height = 280 }) {
  switch (kind) {
    case 'image':
      return (
        <img
          src={url}
          alt={fileName}
          className="content-preview-image"
        />
      );
    case 'pdf':
      return (
        <iframe
          src={url}
          title={fileName}
          className="content-preview-frame"
          style={{ height }}
        />
      );
    case 'video':
      return (
        <video src={url} controls className="content-preview-video">
          Trình duyệt không hỗ trợ phát video.
        </video>
      );
    default:
      return null;
  }
}

export default function LocalFilePreview({ file, height = 280 }) {
  const kind = getPreviewKindFromFile(file);

  const blobUrl = useMemo(() => {
    if (!file || kind === 'none' || kind === 'office') return null;
    return URL.createObjectURL(file);
  }, [file, kind]);

  useEffect(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  if (!file) return null;

  if (kind === 'office') {
    return (
      <Alert variant="light" className="small py-2 mt-2 mb-0">
        Đã chọn: <strong>{file.name}</strong> — xem trước Office sau khi lưu tài liệu.
      </Alert>
    );
  }

  if (kind === 'none') {
    return (
      <Alert variant="light" className="small py-2 mt-2 mb-0">
        Đã chọn: <strong>{file.name}</strong>
      </Alert>
    );
  }

  if (!blobUrl) return null;

  return (
    <div className="content-preview-panel mt-2">
      <div className="text-muted small mb-1">Xem trước</div>
      <LocalPreviewBody url={blobUrl} kind={kind} fileName={file.name} height={height} />
    </div>
  );
}

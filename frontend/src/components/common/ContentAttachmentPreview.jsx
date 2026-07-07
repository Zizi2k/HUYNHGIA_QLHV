import { useEffect, useState } from 'react';
import { Button, Modal, Badge, Alert } from 'react-bootstrap';
import api from '../../services/api';
import {
  getLessonResourceUrl,
  getLessonLinkLabel,
  getLessonIcon,
  getLessonBadge,
  getContentPreviewKind,
  resolveAbsoluteResourceUrl,
  getGoogleGviewUrl,
  isImageLesson,
  isPrivateApiFileUrl,
  canUseGoogleGview,
} from '../../utils/fileTypes';

function OfficeFallback({ url, title }) {
  return (
    <Alert variant="light" className="mb-0">
      <div className="fw-semibold mb-1">{title || 'Tài liệu Office'}</div>
      <p className="small text-muted mb-2">
        Không thể xem trước trực tiếp trên trình duyệt. Vui lòng tải về để mở bằng Word/Excel/PowerPoint.
      </p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary">
        <i className="bi bi-download me-1" />
        Tải về
      </a>
    </Alert>
  );
}

function ExternalLinkFallback({ url, title }) {
  return (
    <Alert variant="light" className="mb-0">
      <div className="fw-semibold mb-1">{title || 'Liên kết ngoài'}</div>
      <p className="small text-muted mb-2">
        Trang web này không cho phép nhúng xem trước. Hãy mở trong tab mới.
      </p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary">
        <i className="bi bi-box-arrow-up-right me-1" />
        Mở trang web
      </a>
    </Alert>
  );
}

function toApiPath(resourceUrl) {
  if (!resourceUrl) return '';
  const match = resourceUrl.match(/\/api(\/[^?#]*)/i);
  if (match) return match[1];
  if (resourceUrl.startsWith('/')) return resourceUrl;
  return resourceUrl;
}

function PrivatePdfPreview({ url, title, height = 360 }) {
  const [blobUrl, setBlobUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    api.get(toApiPath(url), { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(res.data);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError('Không thể tải PDF để xem trước.');
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (error) {
    return (
      <Alert variant="warning" className="mb-0 py-2 small">
        {error}{' '}
        <a href={url} target="_blank" rel="noopener noreferrer">Tải về</a>
      </Alert>
    );
  }

  if (!blobUrl) {
    return <div className="text-muted small py-3 text-center">Đang tải xem trước PDF...</div>;
  }

  return (
    <iframe
      src={blobUrl}
      title={title || 'Xem trước PDF'}
      className="content-preview-frame"
      style={{ height }}
    />
  );
}

function PreviewBody({ item, url, kind, absoluteUrl, title, height = 360, active }) {
  if (!active) return null;

  switch (kind) {
    case 'image':
      return (
        <img
          src={url}
          alt={title || 'Xem trước'}
          className="content-preview-image"
        />
      );
    case 'pdf':
      if (isPrivateApiFileUrl(absoluteUrl)) {
        return <PrivatePdfPreview url={url} title={title} height={height} />;
      }
      return (
        <iframe
          src={url}
          title={title || 'Xem trước PDF'}
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
    case 'office':
      if (!canUseGoogleGview(absoluteUrl)) {
        return <OfficeFallback url={url} title={title} />;
      }
      return (
        <iframe
          src={getGoogleGviewUrl(absoluteUrl)}
          title={title || 'Xem trước tài liệu'}
          className="content-preview-frame"
          style={{ height }}
        />
      );
    case 'external':
      if (item.file_type === 'link/website') {
        return <ExternalLinkFallback url={url} title={title} />;
      }
      if (isImageLesson(item) || item.file_type === 'link/image') {
        return (
          <img
            src={url}
            alt={title || 'Xem trước'}
            className="content-preview-image"
          />
        );
      }
      return <ExternalLinkFallback url={url} title={title} />;
    default:
      return null;
  }
}

export default function ContentAttachmentPreview({
  item,
  apiBase,
  title,
  defaultExpanded = false,
  compact = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded && !compact);
  const [modalOpen, setModalOpen] = useState(false);

  if (!item?.file_url) return null;

  const url = getLessonResourceUrl(item.file_url, apiBase);
  const absoluteUrl = resolveAbsoluteResourceUrl(item.file_url, apiBase);
  const kind = getContentPreviewKind(item);
  const badge = getLessonBadge(item);
  const label = getLessonLinkLabel(item.file_type, item);
  const icon = getLessonIcon(item);
  const canPreview = kind !== 'none';
  const previewActive = expanded || modalOpen;

  return (
    <div className="content-attachment-preview">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm btn-outline-secondary"
        >
          <i className={`bi ${icon} me-1`} />
          {label}
        </a>
        {canPreview && (
          <>
            {!compact && (
              <Button
                size="sm"
                variant="outline-primary"
                onClick={() => setExpanded((v) => !v)}
              >
                <i className={`bi bi-eye${expanded ? '-slash' : ''} me-1`} />
                {expanded ? 'Ẩn xem trước' : 'Xem trước'}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline-primary"
              onClick={() => setModalOpen(true)}
            >
              <i className="bi bi-arrows-fullscreen me-1" />
              {compact ? 'Xem trước' : 'Phóng to'}
            </Button>
          </>
        )}
        {badge && <Badge bg={badge.variant}>{badge.text}</Badge>}
      </div>

      {canPreview && expanded && !compact && (
        <div className="content-preview-panel mt-2">
          <PreviewBody
            item={item}
            url={url}
            kind={kind}
            absoluteUrl={absoluteUrl}
            title={title}
            active={previewActive}
          />
        </div>
      )}

      <Modal
        show={modalOpen}
        onHide={() => setModalOpen(false)}
        size="xl"
        centered
        scrollable
        className="content-preview-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>{title || 'Xem trước'}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-2">
          <PreviewBody
            item={item}
            url={url}
            kind={kind}
            absoluteUrl={absoluteUrl}
            title={title}
            height={520}
            active={modalOpen}
          />
        </Modal.Body>
      </Modal>
    </div>
  );
}

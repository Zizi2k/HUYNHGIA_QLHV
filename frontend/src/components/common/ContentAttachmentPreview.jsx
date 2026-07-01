import { useState } from 'react';
import { Button, Modal, Badge } from 'react-bootstrap';
import {
  getLessonResourceUrl,
  getLessonLinkLabel,
  getLessonIcon,
  getLessonBadge,
  getContentPreviewKind,
  resolveAbsoluteResourceUrl,
  getGoogleGviewUrl,
  isImageLesson,
} from '../../utils/fileTypes';

function PreviewBody({ item, url, kind, absoluteUrl, title, height = 360 }) {
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
      return (
        <iframe
          src={getGoogleGviewUrl(absoluteUrl)}
          title={title || 'Xem trước tài liệu'}
          className="content-preview-frame"
          style={{ height }}
        />
      );
    case 'external':
      if (isImageLesson(item) || item.file_type === 'link/image') {
        return (
          <img
            src={url}
            alt={title || 'Xem trước'}
            className="content-preview-image"
          />
        );
      }
      return (
        <>
          <iframe
            src={url}
            title={title || 'Xem trước'}
            className="content-preview-frame"
            style={{ height: Math.min(height, 320) }}
          />
          <p className="text-muted small mt-2 mb-0">
            Nếu không hiển thị, hãy mở link trong tab mới.
          </p>
        </>
      );
    default:
      return null;
  }
}

export default function ContentAttachmentPreview({
  item,
  apiBase,
  title,
  defaultExpanded = true,
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
          />
        </Modal.Body>
      </Modal>
    </div>
  );
}

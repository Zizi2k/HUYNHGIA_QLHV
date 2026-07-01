import { useState } from 'react';
import { Button, Form, Alert } from 'react-bootstrap';
import {
  LESSON_FILE_ACCEPT, LESSON_IMAGE_ACCEPT,
  isLessonFileAllowed, isLessonImageAllowed,
} from '../../utils/fileTypes';
import ContentAttachmentPreview from './ContentAttachmentPreview';
import LocalFilePreview from './LocalFilePreview';
import {
  getVisibleAttachments, linkTypeToFileType,
} from '../../utils/attachmentHelpers';

let linkKeyCounter = 0;

function nextLinkKey() {
  linkKeyCounter += 1;
  return `link-${linkKeyCounter}`;
}

export default function AttachmentManager({
  value,
  onChange,
  apiBase,
  required = false,
  showPreview = true,
}) {
  const [linkDraft, setLinkDraft] = useState({ url: '', linkType: 'document' });
  const [error, setError] = useState('');

  const items = getVisibleAttachments(value);

  const update = (patch) => onChange({ ...value, ...patch });

  const handleFilesSelected = (e) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (!selected.length) return;

    const valid = [];
    for (const file of selected) {
      const isImage = (file.type || '').startsWith('image/')
        || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name);
      if (isImage ? !isLessonImageAllowed(file) : !isLessonFileAllowed(file)) {
        setError(isImage
          ? 'Một số ảnh không hợp lệ (JPG, PNG, GIF, WEBP, BMP, SVG)'
          : 'Một số tệp không hợp lệ (PDF, Word, PowerPoint, video, ảnh)');
        continue;
      }
      valid.push(file);
    }
    if (valid.length) {
      setError('');
      update({ newFiles: [...value.newFiles, ...valid] });
    }
  };

  const handleAddLink = () => {
    const url = linkDraft.url.trim();
    if (!url) {
      setError('Vui lòng dán link');
      return;
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      setError('Link không hợp lệ');
      return;
    }
    setError('');
    update({
      newLinks: [...value.newLinks, { key: nextLinkKey(), url, linkType: linkDraft.linkType }],
    });
    setLinkDraft({ url: '', linkType: linkDraft.linkType });
  };

  const removeItem = (item) => {
    if (item.kind === 'existing') {
      update({ removedIds: [...value.removedIds, item.attachment.id] });
    } else if (item.kind === 'file') {
      update({ newFiles: value.newFiles.filter((f) => f !== item.file) });
    } else if (item.kind === 'link') {
      update({ newLinks: value.newLinks.filter((l) => l.key !== item.key) });
    }
  };

  return (
    <div className="attachment-manager">
      <Form.Label className="fw-semibold">
        Tài liệu đính kèm{required ? ' *' : ''}
      </Form.Label>
      <div className="d-flex flex-wrap gap-2 mb-2">
        <Button as="label" size="sm" variant="outline-primary" className="mb-0">
          <i className="bi bi-upload me-1" />
          Chọn tệp
          <Form.Control
            type="file"
            multiple
            accept={`${LESSON_FILE_ACCEPT},${LESSON_IMAGE_ACCEPT}`}
            className="d-none"
            onChange={handleFilesSelected}
          />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={linkDraft.linkType === 'document' ? 'primary' : 'outline-primary'}
          onClick={() => setLinkDraft({ ...linkDraft, linkType: 'document' })}
        >
          Link tài liệu
        </Button>
        <Button
          type="button"
          size="sm"
          variant={linkDraft.linkType === 'website' ? 'primary' : 'outline-primary'}
          onClick={() => setLinkDraft({ ...linkDraft, linkType: 'website' })}
        >
          Link web
        </Button>
        <Button
          type="button"
          size="sm"
          variant={linkDraft.linkType === 'image' ? 'primary' : 'outline-primary'}
          onClick={() => setLinkDraft({ ...linkDraft, linkType: 'image' })}
        >
          Link ảnh
        </Button>
      </div>

      <div className="d-flex gap-2 mb-2">
        <Form.Control
          type="url"
          size="sm"
          placeholder={
            linkDraft.linkType === 'website'
              ? 'https://example.com'
              : linkDraft.linkType === 'image'
                ? 'https://example.com/image.jpg'
                : 'https://docs.google.com/...'
          }
          value={linkDraft.url}
          onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
        />
        <Button type="button" size="sm" variant="outline-secondary" onClick={handleAddLink}>
          Thêm link
        </Button>
      </div>

      {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

      {items.length === 0 ? (
        <Alert variant="light" className="py-2 small mb-0">
          {required ? 'Chưa có tài liệu — hãy chọn tệp hoặc thêm link.' : 'Chưa đính kèm tài liệu.'}
        </Alert>
      ) : (
        <div className="attachment-manager-list">
          {items.map((item) => (
            <div key={item.key} className="attachment-manager-item">
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div className="flex-grow-1 min-w-0">
                  <div className="small fw-semibold text-truncate" title={item.label}>
                    {item.label}
                  </div>
                  {showPreview && item.kind === 'existing' && (
                    <ContentAttachmentPreview
                      item={item.attachment}
                      apiBase={apiBase}
                      title={item.label}
                      defaultExpanded={false}
                    />
                  )}
                  {showPreview && item.kind === 'file' && (
                    <LocalFilePreview file={item.file} height={180} />
                  )}
                  {showPreview && item.kind === 'link' && (
                    <ContentAttachmentPreview
                      item={{ file_url: item.url, file_type: linkTypeToFileType(item.linkType) }}
                      apiBase={apiBase}
                      title={item.url}
                      defaultExpanded={false}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline-danger"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => removeItem(item)}
                  title="Xóa"
                >
                  <i className="bi bi-x-lg" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Form, Button, InputGroup, Spinner, Badge } from 'react-bootstrap';
import {
  STUDENT_SUBMIT_FILE_ACCEPT,
  isStudentSubmitFileAllowed,
} from '../../utils/fileTypes';
import ContentAttachmentPreview from '../common/ContentAttachmentPreview';
import AttachmentList from '../common/AttachmentList';
import LocalFilePreview from '../common/LocalFilePreview';
import { API_BASE } from '../../config/apiBase';

export default function StudentWorkSubmission({
  itemId,
  submitting,
  submissionAttachments,
  submissionUrl,
  submittedAt,
  onSubmitWork,
}) {
  const [linkUrl, setLinkUrl] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [pendingLinks, setPendingLinks] = useState([]);

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (!selected.length) return;

    const invalid = selected.find((file) => !isStudentSubmitFileAllowed(file));
    if (invalid) {
      alert('Chỉ chấp nhận file .docx hoặc .xlsx');
      return;
    }
    setPendingFiles((prev) => [...prev, ...selected]);
  };

  const removePendingFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const addPendingLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      alert('Vui lòng dán link bài nộp');
      return;
    }
    if (pendingLinks.includes(url)) {
      alert('Link này đã có trong danh sách');
      return;
    }
    setPendingLinks((prev) => [...prev, url]);
    setLinkUrl('');
  };

  const removePendingLink = (index) => {
    setPendingLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pendingFiles.length && !pendingLinks.length) {
      alert('Vui lòng chọn file hoặc thêm link trước khi nộp');
      return;
    }
    try {
      await onSubmitWork(itemId, { files: pendingFiles, links: pendingLinks });
      setPendingFiles([]);
      setPendingLinks([]);
    } catch {
      // parent shows error
    }
  };

  const submittedItem = submissionAttachments?.length
    ? { attachments: submissionAttachments }
    : (submissionUrl
      ? {
          file_url: submissionUrl,
          file_type: /^https?:\/\//i.test(submissionUrl) ? 'link/document' : undefined,
        }
      : null);

  const hasPending = pendingFiles.length > 0 || pendingLinks.length > 0;

  return (
    <div className="mt-3 pt-3 border-top">
      <Form onSubmit={handleSubmit}>
        <Form.Label className="fw-semibold">
          {submissionUrl || submissionAttachments?.length ? 'Nộp lại bài' : 'Nộp bài'}
        </Form.Label>

        <div className="mb-2">
          <InputGroup size="sm">
            <Form.Control
              type="url"
              placeholder="Dán link bài làm (Google Docs, Drive, OneDrive...)"
              value={linkUrl}
              disabled={submitting}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <Button
              type="button"
              variant="outline-secondary"
              disabled={submitting || !linkUrl.trim()}
              onClick={addPendingLink}
            >
              Thêm link
            </Button>
          </InputGroup>
          {linkUrl.trim() && !submitting && (
            <ContentAttachmentPreview
              item={{ file_url: linkUrl.trim(), file_type: 'link/document' }}
              apiBase={API_BASE}
              title="Xem trước link bài nộp"
              defaultExpanded={false}
            />
          )}
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
          <Form.Control
            type="file"
            size="sm"
            multiple
            accept={STUDENT_SUBMIT_FILE_ACCEPT}
            disabled={submitting}
            onChange={handleFileChange}
            className="flex-grow-1"
            style={{ maxWidth: 320 }}
          />
          <span className="text-muted small">chọn nhiều file .docx / .xlsx</span>
        </div>

        {pendingFiles.length > 0 && (
          <div className="mb-2">
            {pendingFiles.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="d-flex align-items-center gap-2 mb-1">
                <Badge bg="light" text="dark" className="text-truncate" style={{ maxWidth: 240 }}>
                  {file.name}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline-danger"
                  disabled={submitting}
                  onClick={() => removePendingFile(idx)}
                >
                  <i className="bi bi-x" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {pendingLinks.length > 0 && (
          <div className="mb-2">
            {pendingLinks.map((url, idx) => (
              <div key={url} className="d-flex align-items-center gap-2 mb-1">
                <Badge bg="light" text="dark" className="text-truncate" style={{ maxWidth: 280 }}>
                  {url}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline-danger"
                  disabled={submitting}
                  onClick={() => removePendingLink(idx)}
                >
                  <i className="bi bi-x" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {hasPending && (
          <Button type="submit" size="sm" variant="primary" disabled={submitting} className="mb-2">
            {submitting ? <><Spinner size="sm" className="me-1" />Đang nộp...</> : 'Nộp bài'}
          </Button>
        )}

        {pendingFiles.length === 1 && submitting && (
          <LocalFilePreview file={pendingFiles[0]} height={200} />
        )}
      </Form>

      {submittedItem && (
        <div className="mt-2">
          {submissionAttachments?.length ? (
            <AttachmentList
              item={submittedItem}
              apiBase={API_BASE}
              defaultExpanded={false}
            />
          ) : (
            <ContentAttachmentPreview
              item={submittedItem}
              apiBase={API_BASE}
              title="Bài đã nộp"
              defaultExpanded={false}
            />
          )}
          {submittedAt && (
            <span className="text-muted small d-block mt-1">
              Nộp lúc {new Date(submittedAt).toLocaleString('vi-VN')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

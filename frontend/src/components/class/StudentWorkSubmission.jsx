import { useState } from 'react';
import { Form, Button, InputGroup, Spinner } from 'react-bootstrap';
import {
  STUDENT_SUBMIT_FILE_ACCEPT,
  isStudentSubmitFileAllowed,
} from '../../utils/fileTypes';
import ContentAttachmentPreview from '../common/ContentAttachmentPreview';
import LocalFilePreview from '../common/LocalFilePreview';
import { API_BASE } from '../../config/apiBase';

export default function StudentWorkSubmission({
  itemId,
  submitting,
  submissionUrl,
  submissionFileType,
  submittedAt,
  onSubmitFile,
  onSubmitLink,
}) {
  const [linkUrl, setLinkUrl] = useState('');
  const [pendingFile, setPendingFile] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isStudentSubmitFileAllowed(file)) {
      alert('Chỉ chấp nhận file .docx hoặc .xlsx');
      return;
    }
    setPendingFile(file);
    onSubmitFile(itemId, file);
  };

  const handleLinkSubmit = (e) => {
    e.preventDefault();
    const url = linkUrl.trim();
    if (!url) {
      alert('Vui lòng dán link bài nộp');
      return;
    }
    onSubmitLink(itemId, url);
    setLinkUrl('');
  };

  const submittedItem = submissionUrl
    ? {
        file_url: submissionUrl,
        file_type: submissionFileType
          || (/^https?:\/\//i.test(submissionUrl) ? 'link/document' : undefined),
      }
    : null;

  return (
    <div className="mt-3 pt-3 border-top">
      <Form.Label className="fw-semibold">
        {submissionUrl ? 'Nộp lại bài' : 'Nộp bài'}
      </Form.Label>
      <Form onSubmit={handleLinkSubmit} className="mb-2">
        <InputGroup size="sm">
          <Form.Control
            type="url"
            placeholder="Dán link bài làm (Google Docs, Drive, OneDrive...)"
            value={linkUrl}
            disabled={submitting}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <Button type="submit" variant="outline-primary" disabled={submitting || !linkUrl.trim()}>
            {submitting ? <Spinner size="sm" /> : 'Nộp link'}
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
      </Form>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <Form.Control
          type="file"
          size="sm"
          accept={STUDENT_SUBMIT_FILE_ACCEPT}
          disabled={submitting}
          onChange={handleFileChange}
          className="flex-grow-1"
          style={{ maxWidth: 320 }}
        />
        <span className="text-muted small">hoặc chọn file .docx / .xlsx</span>
      </div>
      {pendingFile && submitting && (
        <LocalFilePreview file={pendingFile} height={200} />
      )}
      {submittedItem && (
        <div className="mt-2">
          <ContentAttachmentPreview
            item={submittedItem}
            apiBase={API_BASE}
            title="Bài đã nộp"
            defaultExpanded={false}
          />
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

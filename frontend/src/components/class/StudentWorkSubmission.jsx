import { useState } from 'react';
import { Form, Button, InputGroup, Spinner } from 'react-bootstrap';
import {
  STUDENT_SUBMIT_FILE_ACCEPT,
  isStudentSubmitFileAllowed,
  getLessonResourceUrl,
} from '../../utils/fileTypes';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function StudentWorkSubmission({
  itemId,
  submitting,
  submissionUrl,
  submittedAt,
  onSubmitFile,
  onSubmitLink,
}) {
  const [linkUrl, setLinkUrl] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isStudentSubmitFileAllowed(file)) {
      alert('Chỉ chấp nhận file .docx hoặc .xlsx');
      return;
    }
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

  const viewUrl = submissionUrl ? getLessonResourceUrl(submissionUrl, API_BASE) : '';
  const isLink = /^https?:\/\//i.test(submissionUrl || '');

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
      {submissionUrl && (
        <div className="mt-2 small">
          <a href={viewUrl} target="_blank" rel="noopener noreferrer">
            <i className={`bi bi-${isLink ? 'link-45deg' : 'file-earmark'} me-1`} />
            {isLink ? 'Mở link bài đã nộp' : 'Xem file bài đã nộp'}
          </a>
          {submittedAt && (
            <span className="text-muted ms-2">
              ({new Date(submittedAt).toLocaleString('vi-VN')})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

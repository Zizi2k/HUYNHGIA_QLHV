import { useState, useMemo, useEffect } from 'react';
import {
  Button, Card, Modal, Form, Alert, Badge, Spinner, Table,
} from 'react-bootstrap';
import { assignmentService } from '../../services';
import { notifyDeleteResult } from '../../utils/deleteHelpers';
import {
  LESSON_FILE_ACCEPT, LESSON_IMAGE_ACCEPT,
  isLessonFileAllowed, isLessonImageAllowed,
  getLessonIcon, getLessonResourceUrl, getLessonLinkLabel, getLessonBadge, isImageLesson,
  isExternalLessonUrl,
} from '../../utils/fileTypes';

import { API_BASE } from '../../config/apiBase';

const emptyForm = {
  title: '', description: '', deadline: '',
  sourceType: 'none', file: null, linkUrl: '', removeAttachment: false,
};

function getAttachmentSourceType(a) {
  if (!a?.file_url) return 'none';
  if (a.file_type === 'link/website') return 'website';
  if (a.file_type === 'link/document') return 'document';
  if (a.file_type === 'link/image') return 'image_link';
  if ((a.file_type || '').startsWith('image/') || isImageLesson(a)) {
    return isExternalLessonUrl(a.file_url) ? 'image_link' : 'image';
  }
  return 'file';
}

const isUploadSource = (type) => type === 'file' || type === 'image';
const isLinkSource = (type) => type === 'document' || type === 'website' || type === 'image_link';

export default function ClassAssignmentsTab({
  classId, assignments, isTeacher, isStudent, onUpdated,
}) {
  const [showForm, setShowForm] = useState(false);
  const [showGrade, setShowGrade] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submissions, setSubmissions] = useState([]);
  const [gradeAssignmentId, setGradeAssignmentId] = useState(null);
  const [gradeDrafts, setGradeDrafts] = useState({});
  const [submittingId, setSubmittingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const imagePreviewUrl = useMemo(() => {
    if (form.sourceType === 'image' && form.file) {
      return URL.createObjectURL(form.file);
    }
    if (form.sourceType === 'image_link' && form.linkUrl.trim()) {
      return form.linkUrl.trim();
    }
    return null;
  }, [form.sourceType, form.file, form.linkUrl]);

  useEffect(() => () => {
    if (imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
  }, [imagePreviewUrl]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  };

  const openEdit = (a) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      description: a.description || '',
      deadline: a.deadline ? a.deadline.slice(0, 16) : '',
      sourceType: getAttachmentSourceType(a),
      linkUrl: isExternalLessonUrl(a.file_url) ? a.file_url : '',
      file: null,
      removeAttachment: false,
      existingFileUrl: a.file_url,
      existingFileType: a.file_type,
    });
    setError('');
    setShowForm(true);
  };

  const openGrade = async (assignmentId) => {
    setError('');
    setGradeDrafts({});
    setGradeAssignmentId(assignmentId);
    try {
      const res = await assignmentService.getSubmissions(assignmentId);
      setSubmissions(res.data);
      setShowGrade(true);
    } catch {
      alert('Không thể tải danh sách bài nộp');
    }
  };

  const updateDraft = (submissionId, field, value) => {
    setGradeDrafts((prev) => ({
      ...prev,
      [submissionId]: { ...prev[submissionId], [field]: value },
    }));
  };

  const handleGrade = async (submissionId) => {
    const draft = gradeDrafts[submissionId] || {};
    if (!draft.score) {
      setError('Vui lòng nhập điểm');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await assignmentService.grade(submissionId, {
        score: parseFloat(draft.score),
        feedback: draft.feedback || '',
      });
      if (gradeAssignmentId) {
        const res = await assignmentService.getSubmissions(gradeAssignmentId);
        setSubmissions(res.data);
      }
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể chấm điểm');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');

    if (isUploadSource(form.sourceType) && form.sourceType !== 'none') {
      if (!form.file && !form.existingFileUrl) {
        setError(form.sourceType === 'image'
          ? 'Vui lòng chọn hoặc dán ảnh đính kèm'
          : 'Vui lòng chọn tệp tin đính kèm');
        return;
      }
      if (form.file) {
        if (form.sourceType === 'image' && !isLessonImageAllowed(form.file)) {
          setError('Chỉ chấp nhận ảnh JPG, PNG, GIF, WEBP, BMP, SVG');
          return;
        }
        if (form.sourceType === 'file' && !isLessonFileAllowed(form.file)) {
          setError('Chỉ chấp nhận tệp PDF, Word, PowerPoint hoặc video');
          return;
        }
      }
    } else if (isLinkSource(form.sourceType)) {
      if (!form.linkUrl.trim()) {
        setError('Vui lòng dán link đính kèm');
        return;
      }
    }

    setSaving(true);
    try {
      const base = {
        title: form.title,
        description: form.description,
        deadline: form.deadline || null,
      };

      if (form.sourceType === 'none') {
        const payload = editingId && form.existingFileUrl
          ? { ...base, remove_attachment: true }
          : base;
        if (editingId) {
          await assignmentService.update(editingId, payload);
        } else {
          await assignmentService.create({ ...payload, class_id: parseInt(classId, 10) });
        }
      } else if (isUploadSource(form.sourceType) && form.file) {
        const formData = new FormData();
        formData.append('title', form.title);
        formData.append('description', form.description || '');
        formData.append('deadline', form.deadline || '');
        formData.append('file', form.file);
        if (!editingId) formData.append('class_id', classId);
        if (editingId) {
          await assignmentService.update(editingId, formData);
        } else {
          await assignmentService.create(formData);
        }
      } else if (isLinkSource(form.sourceType)) {
        const linkTypeMap = { document: 'document', website: 'website', image_link: 'image' };
        const payload = {
          ...base,
          link_url: form.linkUrl.trim(),
          link_type: linkTypeMap[form.sourceType],
        };
        if (editingId) {
          await assignmentService.update(editingId, payload);
        } else {
          await assignmentService.create({ ...payload, class_id: parseInt(classId, 10) });
        }
      } else {
        if (editingId) {
          await assignmentService.update(editingId, base);
        } else {
          await assignmentService.create({ ...base, class_id: parseInt(classId, 10) });
        }
      }

      setShowForm(false);
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể lưu bài tập');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Xóa bài tập "${title}"?`)) return;
    try {
      const res = await assignmentService.delete(id);
      if (!notifyDeleteResult(res)) onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa bài tập');
    }
  };

  const handleSubmitFile = async (assignmentId, file) => {
    if (!file) return;
    setSubmittingId(assignmentId);
    try {
      const formData = new FormData();
      formData.append('assignment_id', assignmentId);
      formData.append('file', file);
      await assignmentService.upload(formData);
      onUpdated();
      alert('Nộp bài thành công!');
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể nộp bài');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    const isImage = form.sourceType === 'image';
    if (file && (isImage ? !isLessonImageAllowed(file) : !isLessonFileAllowed(file))) {
      setError(isImage
        ? 'Chỉ chấp nhận ảnh JPG, PNG, GIF, WEBP, BMP, SVG'
        : 'Chỉ chấp nhận tệp PDF, Word, PowerPoint hoặc video');
      setForm({ ...form, file: null });
      e.target.value = '';
      return;
    }
    setError('');
    setForm({ ...form, file: file || null });
  };

  const handlePasteImage = (e) => {
    if (form.sourceType !== 'image') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file && isLessonImageAllowed(file)) {
          setError('');
          setForm({ ...form, file });
        } else {
          setError('Ảnh dán không hợp lệ');
        }
        return;
      }
    }
  };

  const getResourceUrl = (fileUrl) => getLessonResourceUrl(fileUrl, API_BASE);

  const renderAttachment = (a) => {
    if (!a.file_url) return null;
    const badge = getLessonBadge(a);
    const url = getResourceUrl(a.file_url);
    const label = getLessonLinkLabel(a.file_type, a);
    const icon = getLessonIcon(a);

    return (
      <div className="mt-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm btn-outline-secondary"
        >
          <i className={`bi ${icon} me-1`} />
          {label}
        </a>
        {badge && (
          <Badge bg={badge.variant} className="ms-2">{badge.text}</Badge>
        )}
        {isImageLesson(a) && (
          <div className="mt-2">
            <img
              src={url}
              alt={a.title}
              className="rounded border"
              style={{ maxHeight: 160, maxWidth: '100%', objectFit: 'contain' }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {isTeacher && (
        <Button className="mb-3" onClick={openCreate}>
          <i className="bi bi-plus-circle me-1" />
          Giao bài tập
        </Button>
      )}

      {assignments.length === 0 ? (
        <Alert variant="light">Chưa có bài tập nào.</Alert>
      ) : (
        assignments.map((a) => (
          <Card key={a.id} className="mb-3 border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-start gap-3">
                <div className="flex-grow-1">
                  <h5 className="mb-1">{a.title}</h5>
                  {a.description && <p className="text-muted mb-2">{a.description}</p>}
                  {renderAttachment(a)}
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {a.deadline && (
                      <Badge bg="warning" text="dark">
                        Hạn nộp: {new Date(a.deadline).toLocaleString('vi-VN')}
                      </Badge>
                    )}
                    {isTeacher && (
                      <Badge bg="secondary">{a.submission_count || 0} bài nộp</Badge>
                    )}
                    {isStudent && a.submission_id && (
                      <Badge bg="success">Đã nộp</Badge>
                    )}
                    {isStudent && a.score != null && (
                      <Badge bg="primary">Điểm: {a.score}/10</Badge>
                    )}
                  </div>
                  {isStudent && a.feedback && (
                    <Alert variant="info" className="mt-2 mb-0 py-2 small">
                      <strong>Nhận xét:</strong> {a.feedback}
                    </Alert>
                  )}
                </div>
                {isTeacher && (
                  <div className="d-flex gap-1 flex-shrink-0">
                    <Button variant="outline-success" size="sm" onClick={() => openGrade(a.id)}>
                      <i className="bi bi-check2-square" />
                    </Button>
                    <Button variant="outline-primary" size="sm" onClick={() => openEdit(a)}>
                      <i className="bi bi-pencil" />
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={() => handleDelete(a.id, a.title)}>
                      <i className="bi bi-trash" />
                    </Button>
                  </div>
                )}
              </div>

              {isStudent && (
                <div className="mt-3 pt-3 border-top">
                  <Form.Label className="fw-semibold">
                    {a.submission_id ? 'Nộp lại bài' : 'Nộp bài'}
                  </Form.Label>
                  <Form.Control
                    type="file"
                    accept=".pdf,.doc,.docx,.zip,.ppt,.pptx,.jpg,.jpeg,.png"
                    disabled={submittingId === a.id}
                    onChange={(e) => handleSubmitFile(a.id, e.target.files[0])}
                  />
                  {a.submission_url && (
                    <div className="mt-2 small">
                      <a
                        href={getResourceUrl(a.submission_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <i className="bi bi-file-earmark me-1" />
                        Xem bài đã nộp
                      </a>
                      {a.submitted_at && (
                        <span className="text-muted ms-2">
                          ({new Date(a.submitted_at).toLocaleString('vi-VN')})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card.Body>
          </Card>
        ))
      )}

      <Modal
        show={showForm}
        onHide={() => setShowForm(false)}
        scrollable
        dialogClassName="scrollable-form-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Sửa bài tập' : 'Giao bài tập mới'}</Modal.Title>
        </Modal.Header>
        <Form id="assignment-form" onSubmit={handleSave}>
          <Modal.Body>
            {error && <Alert variant="danger" className="py-2">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Tiêu đề</Form.Label>
              <Form.Control
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mô tả</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Hạn nộp</Form.Label>
              <Form.Control
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </Form.Group>

            <Form.Label className="fw-semibold">Đính kèm (tùy chọn)</Form.Label>
            <div className="d-flex flex-wrap gap-2 mb-3">
              <Button
                type="button"
                size="sm"
                variant={form.sourceType === 'none' ? 'secondary' : 'outline-secondary'}
                onClick={() => setForm({ ...form, sourceType: 'none', file: null, linkUrl: '' })}
              >
                Không đính kèm
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.sourceType === 'file' ? 'primary' : 'outline-primary'}
                onClick={() => setForm({ ...form, sourceType: 'file', linkUrl: '' })}
              >
                <i className="bi bi-file-earmark me-1" />
                Tệp tin
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.sourceType === 'document' ? 'primary' : 'outline-primary'}
                onClick={() => setForm({ ...form, sourceType: 'document', file: null })}
              >
                <i className="bi bi-link-45deg me-1" />
                Link tài liệu
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.sourceType === 'website' ? 'primary' : 'outline-primary'}
                onClick={() => setForm({ ...form, sourceType: 'website', file: null })}
              >
                <i className="bi bi-globe2 me-1" />
                Link web
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.sourceType === 'image' ? 'primary' : 'outline-primary'}
                onClick={() => setForm({ ...form, sourceType: 'image', linkUrl: '' })}
              >
                <i className="bi bi-image me-1" />
                Tải ảnh
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.sourceType === 'image_link' ? 'primary' : 'outline-primary'}
                onClick={() => setForm({ ...form, sourceType: 'image_link', file: null })}
              >
                <i className="bi bi-link me-1" />
                Link ảnh
              </Button>
            </div>

            {form.sourceType === 'file' && (
              <Form.Group className="mb-3">
                <Form.Control
                  type="file"
                  accept={LESSON_FILE_ACCEPT}
                  onChange={handleFileChange}
                />
                {form.existingFileUrl && !form.file && !isExternalLessonUrl(form.existingFileUrl) && (
                  <Form.Text className="text-muted">
                    Đang dùng tệp hiện tại. Chọn tệp mới để thay thế.
                  </Form.Text>
                )}
              </Form.Group>
            )}

            {form.sourceType === 'image' && (
              <Form.Group className="mb-3" onPaste={handlePasteImage}>
                <Form.Control
                  type="file"
                  accept={LESSON_IMAGE_ACCEPT}
                  onChange={handleFileChange}
                />
                <Form.Text className="text-muted">Có thể dán ảnh từ clipboard (Ctrl+V)</Form.Text>
                {imagePreviewUrl && (
                  <div className="mt-2">
                    <img
                      src={imagePreviewUrl}
                      alt="Xem trước"
                      className="rounded border"
                      style={{ maxHeight: 120, maxWidth: '100%', objectFit: 'contain' }}
                    />
                  </div>
                )}
              </Form.Group>
            )}

            {isLinkSource(form.sourceType) && form.sourceType !== 'image_link' && (
              <Form.Group className="mb-3">
                <Form.Label>
                  {form.sourceType === 'website' ? 'Link trang web' : 'Link tài liệu'}
                </Form.Label>
                <Form.Control
                  type="url"
                  placeholder={
                    form.sourceType === 'website'
                      ? 'https://example.com'
                      : 'https://docs.google.com/...'
                  }
                  value={form.linkUrl}
                  onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                />
              </Form.Group>
            )}

            {form.sourceType === 'image_link' && (
              <Form.Group className="mb-3">
                <Form.Label>Link ảnh</Form.Label>
                <Form.Control
                  type="url"
                  placeholder="https://..."
                  value={form.linkUrl}
                  onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                />
                {imagePreviewUrl && (
                  <div className="mt-2">
                    <img
                      src={imagePreviewUrl}
                      alt="Xem trước"
                      className="rounded border"
                      style={{ maxHeight: 120, maxWidth: '100%', objectFit: 'contain' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                )}
              </Form.Group>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Hủy</Button>
            <Button type="submit" variant="primary" form="assignment-form" disabled={saving}>
              {saving ? <><Spinner size="sm" className="me-2" />Đang lưu...</> : 'Lưu'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showGrade} onHide={() => setShowGrade(false)} size="lg" scrollable dialogClassName="scrollable-form-modal">
        <Modal.Header closeButton>
          <Modal.Title>Chấm điểm bài tập</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}
          {submissions.length === 0 ? (
            <Alert variant="light" className="mb-0">Chưa có học sinh nộp bài.</Alert>
          ) : (
            <Table responsive hover className="mb-0">
              <thead className="table-light">
                <tr>
                  <th>Học sinh</th>
                  <th>Bài nộp</th>
                  <th>Điểm</th>
                  <th>Nhận xét</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="fw-semibold">{s.fullname}</div>
                      <div className="text-muted small">{s.code}</div>
                    </td>
                    <td>
                      {s.file_url ? (
                        <a href={getResourceUrl(s.file_url)} target="_blank" rel="noopener noreferrer">
                          Tải về
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ width: 90 }}>
                      {s.score != null ? (
                        <Badge bg="primary">{s.score}/10</Badge>
                      ) : (
                        <Form.Control
                          type="number"
                          min="0"
                          max="10"
                          step="0.5"
                          size="sm"
                          placeholder="0-10"
                          value={gradeDrafts[s.id]?.score ?? ''}
                          onChange={(e) => updateDraft(s.id, 'score', e.target.value)}
                        />
                      )}
                    </td>
                    <td>
                      {s.score != null ? (
                        <span className="small">{s.feedback || '—'}</span>
                      ) : (
                        <Form.Control
                          size="sm"
                          placeholder="Nhận xét..."
                          value={gradeDrafts[s.id]?.feedback ?? ''}
                          onChange={(e) => updateDraft(s.id, 'feedback', e.target.value)}
                        />
                      )}
                    </td>
                    <td>
                      {s.score == null && (
                        <Button
                          size="sm"
                          variant="success"
                          disabled={saving}
                          onClick={() => handleGrade(s.id)}
                        >
                          Chấm
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}

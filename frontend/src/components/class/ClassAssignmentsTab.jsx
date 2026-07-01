import { useState } from 'react';
import {
  Button, Card, Modal, Form, Alert, Badge, Spinner, Table,
} from 'react-bootstrap';
import { assignmentService } from '../../services';
import { notifyDeleteResult } from '../../utils/deleteHelpers';
import { API_BASE } from '../../config/apiBase';
import {
  appendVisibilityFields, getContentVisibilityStatus, toDatetimeLocalValue,
} from '../../utils/contentVisibility';
import {
  emptyAttachmentDraft, attachmentDraftFromItem,
  appendAttachmentsToFormData, buildAttachmentJsonPayload,
  shouldUseMultipartForAttachments, getItemAttachments,
} from '../../utils/attachmentHelpers';
import StudentWorkSubmission from './StudentWorkSubmission';
import ShareContentModal from './ShareContentModal';
import AttachmentManager from '../common/AttachmentManager';
import AttachmentList from '../common/AttachmentList';
import ContentAttachmentPreview from '../common/ContentAttachmentPreview';

const emptyForm = {
  title: '', description: '', deadline: '',
  visible_from: '', is_hidden: false,
  attachments: emptyAttachmentDraft(),
};

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
  const [shareTarget, setShareTarget] = useState(null);

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
      visible_from: toDatetimeLocalValue(a.visible_from),
      is_hidden: a.is_hidden === 1 || a.is_hidden === true,
      attachments: attachmentDraftFromItem(a),
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
    setSaving(true);
    try {
      const base = {
        title: form.title,
        description: form.description,
        deadline: form.deadline || null,
      };
      appendVisibilityFields(base, form);

      const draft = form.attachments;
      const attachmentPayload = buildAttachmentJsonPayload(draft);

      if (shouldUseMultipartForAttachments(draft)) {
        const formData = new FormData();
        formData.append('title', form.title);
        formData.append('description', form.description || '');
        formData.append('deadline', form.deadline || '');
        appendVisibilityFields(formData, form);
        appendAttachmentsToFormData(formData, draft);
        if (!editingId) formData.append('class_id', classId);
        if (editingId) {
          await assignmentService.update(editingId, formData);
        } else {
          await assignmentService.create(formData);
        }
      } else if (editingId) {
        await assignmentService.update(editingId, { ...base, ...attachmentPayload });
      } else {
        await assignmentService.create({
          ...base,
          ...attachmentPayload,
          class_id: parseInt(classId, 10),
        });
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

  const handleShare = async (targetClassIds) => {
    const res = await assignmentService.share(shareTarget.id, targetClassIds);
    alert(res.data?.message || 'Chia sẻ thành công');
    onUpdated();
  };

  const handleToggleHide = async (assignment) => {
    const hidden = Number(assignment.is_hidden) === 1 || assignment.is_hidden === true;
    try {
      await assignmentService.setVisibility(assignment.id, {
        is_hidden: !hidden,
      });
      onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể cập nhật trạng thái hiển thị');
    }
  };

  const renderVisibilityFields = () => (
    <>
      <Form.Group className="mb-3">
        <Form.Label>Thời điểm hiển thị cho học sinh</Form.Label>
        <Form.Control
          type="datetime-local"
          value={form.visible_from}
          onChange={(e) => setForm({ ...form, visible_from: e.target.value })}
        />
        <Form.Text className="text-muted">
          Để trống = hiển thị ngay (khi không bật ẩn). Học sinh chỉ thấy sau thời điểm này.
        </Form.Text>
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Check
          type="switch"
          id="assignment-hidden-switch"
          label="Ẩn bài tập với học sinh"
          checked={form.is_hidden}
          onChange={(e) => setForm({ ...form, is_hidden: e.target.checked })}
        />
      </Form.Group>
    </>
  );

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

  const handleSubmitLink = async (assignmentId, linkUrl) => {
    setSubmittingId(assignmentId);
    try {
      await assignmentService.submitLink({
        assignment_id: assignmentId,
        link_url: linkUrl,
      });
      onUpdated();
      alert('Nộp bài thành công!');
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể nộp bài');
    } finally {
      setSubmittingId(null);
    }
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
        assignments.map((a) => {
          const visibility = getContentVisibilityStatus(a);
          return (
          <Card key={a.id} className="mb-3 border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-start gap-3">
                <div className="flex-grow-1">
                  <h5 className="mb-1">{a.title}</h5>
                  {a.description && <p className="text-muted mb-2">{a.description}</p>}
                  <AttachmentList item={a} apiBase={API_BASE} defaultExpanded />
                  {getItemAttachments(a).length > 1 && (
                    <Badge bg="secondary" className="mb-2">{getItemAttachments(a).length} tài liệu</Badge>
                  )}
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {isTeacher && (
                      <Badge bg={visibility.variant}>{visibility.label}</Badge>
                    )}
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
                    <Button
                      variant={a.is_hidden ? 'outline-success' : 'outline-warning'}
                      size="sm"
                      title={a.is_hidden ? 'Hiện cho học sinh' : 'Ẩn với học sinh'}
                      onClick={() => handleToggleHide(a)}
                    >
                      <i className={`bi bi-${a.is_hidden ? 'eye' : 'eye-slash'}`} />
                    </Button>
                    <Button variant="outline-success" size="sm" onClick={() => openGrade(a.id)}>
                      <i className="bi bi-check2-square" />
                    </Button>
                    <Button variant="outline-primary" size="sm" onClick={() => openEdit(a)}>
                      <i className="bi bi-pencil" />
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      title="Chia sẻ sang lớp khác"
                      onClick={() => setShareTarget({ id: a.id, title: a.title })}
                    >
                      <i className="bi bi-share" />
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={() => handleDelete(a.id, a.title)}>
                      <i className="bi bi-trash" />
                    </Button>
                  </div>
                )}
              </div>

              {isStudent && (
                <StudentWorkSubmission
                  itemId={a.id}
                  submitting={submittingId === a.id}
                  submissionUrl={a.submission_url}
                  submittedAt={a.submitted_at}
                  onSubmitFile={handleSubmitFile}
                  onSubmitLink={handleSubmitLink}
                />
              )}
            </Card.Body>
          </Card>
          );
        })
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

            {renderVisibilityFields()}

            <AttachmentManager
              value={form.attachments}
              onChange={(attachments) => setForm({ ...form, attachments })}
              apiBase={API_BASE}
            />
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
                        <ContentAttachmentPreview
                          item={{ file_url: s.file_url, file_type: s.file_type }}
                          apiBase={API_BASE}
                          title={`Bài nộp — ${s.fullname}`}
                          compact
                        />
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

      <ShareContentModal
        show={!!shareTarget}
        onHide={() => setShareTarget(null)}
        contentType="assignment"
        contentTitle={shareTarget?.title}
        sourceClassId={classId}
        onShare={handleShare}
      />
    </>
  );
}

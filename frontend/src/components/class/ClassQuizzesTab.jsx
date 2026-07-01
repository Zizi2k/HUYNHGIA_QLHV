import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Button, Card, Modal, Form, Alert, Badge, Spinner, Table, Collapse,
} from 'react-bootstrap';
import { quizService } from '../../services';
import { notifyDeleteResult } from '../../utils/deleteHelpers';
import {
  appendVisibilityFields, getContentVisibilityStatus, toDatetimeLocalValue,
} from '../../utils/contentVisibility';
import StudentWorkSubmission from './StudentWorkSubmission';
import ShareContentModal from './ShareContentModal';
import ContentAttachmentPreview from '../common/ContentAttachmentPreview';
import AttachmentManager from '../common/AttachmentManager';
import AttachmentList from '../common/AttachmentList';
import {
  emptyAttachmentDraft, attachmentDraftFromItem,
  appendAttachmentsToFormData, buildAttachmentJsonPayload,
  shouldUseMultipartForAttachments,
} from '../../utils/attachmentHelpers';
import { API_BASE } from '../../config/apiBase';

const emptyQuestion = {
  question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A', needsAnswerReview: false,
};

const mapImportedQuestion = (q) => ({
  question: q.question || '',
  optionA: q.optionA || '',
  optionB: q.optionB || '',
  optionC: q.optionC || '',
  optionD: q.optionD || '',
  answer: q.answer || 'A',
  needsAnswerReview: q.answerAutoDetected === false,
});

const emptyForm = {
  title: '', time_limit: 30, visible_from: '', is_hidden: false,
  questions: [{ ...emptyQuestion }],
  attachments: emptyAttachmentDraft(),
};

export default function ClassQuizzesTab({
  classId, quizzes, isTeacher, isStudent, onUpdated,
}) {
  const [showForm, setShowForm] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editQuestionsOnly, setEditQuestionsOnly] = useState(false);
  const [expandedQuestions, setExpandedQuestions] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [results, setResults] = useState([]);
  const [resultsQuizId, setResultsQuizId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importInfo, setImportInfo] = useState('');
  const [importWarning, setImportWarning] = useState('');
  const [error, setError] = useState('');
  const [submittingId, setSubmittingId] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [gradeDrafts, setGradeDrafts] = useState({});
  const docxInputRef = useRef(null);

  const isOnlineSubmission = (q) => q.submission_id && Number(q.answer_count) > 0;
  const isFileSubmission = (q) => q.submission_id && q.submission_url && Number(q.answer_count) === 0;

  const openCreate = () => {
    setEditingId(null);
    setEditQuestionsOnly(false);
    setExpandedQuestions({ 0: true });
    setForm({ ...emptyForm, questions: [{ ...emptyQuestion }] });
    setError('');
    setImportInfo('');
    setImportWarning('');
    setShowForm(true);
  };

  const loadQuizForm = async (quiz, questionsOnly = false) => {
    setError('');
    setLoadingEdit(true);
    try {
      const res = await quizService.getById(quiz.id);
      const data = res.data;
      setEditingId(quiz.id);
      setEditQuestionsOnly(questionsOnly);
      const questions = data.questions.map((q) => ({
        id: q.id,
        question: q.question || '',
        optionA: q.optionA || '',
        optionB: q.optionB || '',
        optionC: q.optionC || '',
        optionD: q.optionD || '',
        answer: q.answer || 'A',
        needsAnswerReview: false,
      }));
      const expanded = {};
      questions.forEach((_, idx) => { expanded[idx] = true; });
      setExpandedQuestions(expanded);
      setForm({
        title: data.title,
        time_limit: data.time_limit || 30,
        visible_from: toDatetimeLocalValue(data.visible_from),
        is_hidden: data.is_hidden === 1 || data.is_hidden === true,
        questions,
        attachments: attachmentDraftFromItem(data),
      });
      setShowForm(true);
    } catch {
      alert('Không thể tải câu hỏi');
    } finally {
      setLoadingEdit(false);
    }
  };

  const openEdit = (quiz) => loadQuizForm(quiz, false);
  const openEditQuestions = (quiz) => loadQuizForm(quiz, true);

  const openResults = async (quizId) => {
    try {
      const res = await quizService.getSubmissions(quizId);
      setResults(res.data);
      setResultsQuizId(quizId);
      const drafts = {};
      res.data.forEach((r) => {
        if (r.file_url && Number(r.answer_count) === 0 && r.score == null) {
          drafts[r.id] = { score: '', feedback: r.feedback || '' };
        }
      });
      setGradeDrafts(drafts);
      setError('');
      setShowResults(true);
    } catch {
      alert('Không thể tải kết quả');
    }
  };

  const updateGradeDraft = (submissionId, field, value) => {
    setGradeDrafts((prev) => ({
      ...prev,
      [submissionId]: { ...prev[submissionId], [field]: value },
    }));
  };

  const handleGradeQuiz = async (submissionId) => {
    const draft = gradeDrafts[submissionId] || {};
    if (!draft.score) {
      setError('Vui lòng nhập điểm');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await quizService.gradeSubmission(submissionId, {
        score: parseFloat(draft.score),
        feedback: draft.feedback || '',
      });
      if (resultsQuizId) {
        const res = await quizService.getSubmissions(resultsQuizId);
        setResults(res.data);
      }
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể chấm điểm');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitQuizWork = async (quizId, { files = [], links = [] }) => {
    if (!files.length && !links.length) return;
    setSubmittingId(quizId);
    try {
      if (files.length) {
        const formData = new FormData();
        formData.append('quiz_id', quizId);
        files.forEach((file) => formData.append('files', file));
        if (links.length) {
          formData.append('links', JSON.stringify(
            links.map((url) => ({ url, link_type: 'document' })),
          ));
        }
        await quizService.submitAttachment(formData);
      } else {
        await quizService.submitAttachment({
          quiz_id: quizId,
          links: links.map((url) => ({ url, link_type: 'document' })),
        });
      }
      onUpdated();
      alert('Nộp bài thành công!');
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể nộp bài');
      throw err;
    } finally {
      setSubmittingId(null);
    }
  };

  const updateQuestion = (idx, field, value) => {
    const questions = [...form.questions];
    const updated = { ...questions[idx], [field]: value };
    if (field === 'answer') {
      updated.needsAnswerReview = false;
    }
    questions[idx] = updated;
    setForm({ ...form, questions });
  };

  const pendingReviewCount = form.questions.filter((q) => q.needsAnswerReview).length;

  const handleDownloadTemplate = async (format = 'docx') => {
    setDownloadingTemplate(true);
    setError('');
    try {
      const res = await quizService.downloadImportTemplate(format);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = format === 'xlsx' ? 'mau-trac-nghiem.xlsx' : 'mau-trac-nghiem.docx';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Không thể tải file mẫu');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleToggleHide = async (quiz) => {
    const hidden = Number(quiz.is_hidden) === 1 || quiz.is_hidden === true;
    try {
      await quizService.setVisibility(quiz.id, {
        is_hidden: !hidden,
      });
      onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể cập nhật trạng thái hiển thị');
    }
  };

  const addQuestion = () => {
    const newIdx = form.questions.length;
    setForm({ ...form, questions: [...form.questions, { ...emptyQuestion }] });
    setExpandedQuestions((prev) => ({ ...prev, [newIdx]: true }));
  };

  const removeQuestion = (idx) => {
    if (form.questions.length <= 1) return;
    setForm({ ...form, questions: form.questions.filter((_, i) => i !== idx) });
  };

  const toggleQuestion = (idx) => {
    setExpandedQuestions((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const validateQuestions = () => {
    for (let i = 0; i < form.questions.length; i++) {
      const q = form.questions[i];
      if (!q.question.trim()) {
        setError(`Câu ${i + 1}: vui lòng nhập nội dung câu hỏi`);
        return false;
      }
      if (!q.optionA.trim() || !q.optionB.trim() || !q.optionC.trim() || !q.optionD.trim()) {
        setError(`Câu ${i + 1}: vui lòng nhập đầy đủ 4 đáp án`);
        return false;
      }
      if (q.needsAnswerReview) {
        setError(`Câu ${i + 1}: vui lòng chọn đáp án đúng (chưa xác nhận sau khi import)`);
        setExpandedQuestions((prev) => ({ ...prev, [i]: true }));
        return false;
      }
    }
    return true;
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.docx') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setError('Chỉ hỗ trợ file .docx hoặc .xlsx');
      return;
    }

    setImporting(true);
    setError('');
    setImportInfo('');
    setImportWarning('');
    try {
      const res = await quizService.parseImportFile(file);
      const imported = (res.data.questions || []).map(mapImportedQuestion);
      if (!imported.length) {
        setError('Không nhận dạng được câu hỏi trong file');
        return;
      }

      const hasContent = form.questions.some(
        (q) => q.question.trim() || q.optionA.trim() || q.optionB.trim(),
      );
      let merged;
      if (hasContent && window.confirm(
        `File có ${imported.length} câu. Thêm vào danh sách hiện tại? (Hủy = thay thế toàn bộ)`,
      )) {
        merged = [...form.questions, ...imported];
      } else {
        merged = imported;
      }

      const expanded = {};
      merged.forEach((_, idx) => { expanded[idx] = true; });
      setExpandedQuestions(expanded);
      setForm((prev) => ({ ...prev, questions: merged }));
      setImportInfo(res.data.message || `Đã import ${imported.length} câu hỏi`);
      const manual = res.data.manualCount ?? imported.filter((q) => q.needsAnswerReview).length;
      if (manual > 0) {
        setImportWarning(
          `${manual} câu chưa có đáp án tô vàng — vui lòng chọn "Đáp án đúng" cho từng câu bên dưới trước khi lưu.`,
        );
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể đọc file Word/Excel');
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateQuestions()) return;

    setSaving(true);
    setError('');
    try {
      const questionsPayload = form.questions.map((q) => ({
        ...(q.id ? { id: q.id } : {}),
        question: q.question.trim(),
        optionA: q.optionA.trim(),
        optionB: q.optionB.trim(),
        optionC: q.optionC.trim(),
        optionD: q.optionD.trim(),
        answer: q.answer,
      }));
      const draft = form.attachments || emptyAttachmentDraft();
      const attachmentPayload = buildAttachmentJsonPayload(draft);

      if (shouldUseMultipartForAttachments(draft)) {
        const formData = new FormData();
        formData.append('title', form.title);
        formData.append('time_limit', String(parseInt(form.time_limit, 10) || 30));
        formData.append('questions', JSON.stringify(questionsPayload));
        appendVisibilityFields(formData, form);
        if (!editingId) formData.append('class_id', classId);
        appendAttachmentsToFormData(formData, draft);
        if (editingId) {
          await quizService.update(editingId, formData);
        } else {
          await quizService.create(formData);
        }
      } else {
        const payload = {
          class_id: parseInt(classId, 10),
          title: form.title,
          time_limit: parseInt(form.time_limit, 10) || 30,
          questions: questionsPayload,
          ...attachmentPayload,
        };
        appendVisibilityFields(payload, form);
        if (editingId) {
          await quizService.update(editingId, payload);
        } else {
          await quizService.create(payload);
        }
      }
      setShowForm(false);
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể lưu bài kiểm tra');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Xóa bài kiểm tra "${title}"?`)) return;
    try {
      const res = await quizService.delete(id);
      if (!notifyDeleteResult(res)) onUpdated();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa bài kiểm tra');
    }
  };

  const handleShare = async (targetClassIds) => {
    const res = await quizService.share(shareTarget.id, targetClassIds);
    alert(res.data?.message || 'Chia sẻ thành công');
    onUpdated();
  };

  return (
    <>
      {isTeacher && (
        <Button className="mb-3" onClick={openCreate}>
          <i className="bi bi-plus-circle me-1" />
          Tạo bài kiểm tra
        </Button>
      )}

      {quizzes.length === 0 ? (
        <Alert variant="light">Chưa có bài kiểm tra nào.</Alert>
      ) : (
        quizzes.map((q) => {
          const visibility = getContentVisibilityStatus(q);
          return (
          <Card key={q.id} className="mb-3 border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center gap-3">
              <div>
                <h5 className="mb-1">{q.title}</h5>
                <div className="d-flex flex-wrap gap-2">
                  {isTeacher && (
                    <Badge bg={visibility.variant}>{visibility.label}</Badge>
                  )}
                  <span className="text-muted small">
                    <i className="bi bi-clock me-1" />
                    {q.time_limit} phút
                  </span>
                  {isTeacher && q.question_count != null && (
                    <Badge bg="light" text="dark">{q.question_count} câu hỏi</Badge>
                  )}
                  {isTeacher && (
                    <Badge bg="secondary">{q.submission_count || 0} lượt làm</Badge>
                  )}
                  {isStudent && isOnlineSubmission(q) && (
                    <Badge bg="success">Đã làm trắc nghiệm — {q.quiz_score}/10</Badge>
                  )}
                  {isStudent && isFileSubmission(q) && q.quiz_score != null && (
                    <Badge bg="success">Đã nộp — {q.quiz_score}/10</Badge>
                  )}
                  {isStudent && isFileSubmission(q) && q.quiz_score == null && (
                    <Badge bg="warning" text="dark">Đã nộp — chờ chấm</Badge>
                  )}
                </div>
                <AttachmentList item={q} apiBase={API_BASE} defaultExpanded={false} />
              </div>
              <div className="d-flex gap-1 flex-shrink-0 flex-wrap justify-content-end">
                {isStudent && !q.submission_id && (
                  <Button as={Link} to={`/quizzes/${q.id}`} variant="outline-primary" size="sm">
                    Làm trắc nghiệm
                  </Button>
                )}
                {isStudent && isOnlineSubmission(q) && (
                  <Badge bg="primary" className="d-flex align-items-center px-3">
                    Điểm: {q.quiz_score}/10
                  </Badge>
                )}
                {isTeacher && (
                  <>
                    <Button
                      variant={q.is_hidden ? 'outline-success' : 'outline-warning'}
                      size="sm"
                      title={q.is_hidden ? 'Hiện cho học sinh' : 'Ẩn với học sinh'}
                      onClick={() => handleToggleHide(q)}
                    >
                      <i className={`bi bi-${q.is_hidden ? 'eye' : 'eye-slash'}`} />
                    </Button>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => openEditQuestions(q)}
                      disabled={loadingEdit}
                    >
                      <i className="bi bi-pencil-square me-1" />
                      Sửa câu hỏi
                    </Button>
                    <Button variant="outline-info" size="sm" onClick={() => openResults(q.id)} title="Kết quả">
                      <i className="bi bi-bar-chart" />
                    </Button>
                    <Button variant="outline-secondary" size="sm" onClick={() => openEdit(q)} title="Sửa tiêu đề">
                      <i className="bi bi-gear" />
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      title="Chia sẻ sang lớp khác"
                      onClick={() => setShareTarget({ id: q.id, title: q.title })}
                    >
                      <i className="bi bi-share" />
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={() => handleDelete(q.id, q.title)}>
                      <i className="bi bi-trash" />
                    </Button>
                  </>
                )}
              </div>
              </div>
              {isStudent && !isOnlineSubmission(q) && (
                <StudentWorkSubmission
                  itemId={q.id}
                  submitting={submittingId === q.id}
                  submissionAttachments={q.submission_attachments}
                  submissionUrl={isFileSubmission(q) ? q.submission_url : null}
                  submittedAt={q.quiz_submitted_at}
                  onSubmitWork={handleSubmitQuizWork}
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
        size="lg"
        scrollable
        dialogClassName="scrollable-form-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {editingId
              ? (editQuestionsOnly ? 'Sửa câu hỏi' : 'Sửa bài kiểm tra')
              : 'Tạo bài kiểm tra'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form id="quiz-form" onSubmit={handleSave}>
            {error && <Alert variant="danger" className="py-2">{error}</Alert>}

            {!editQuestionsOnly && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label>Tiêu đề</Form.Label>
                  <Form.Control
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-4">
                  <Form.Label>Thời gian (phút)</Form.Label>
                  <Form.Control
                    type="number"
                    min="5"
                    max="180"
                    value={form.time_limit}
                    onChange={(e) => setForm({ ...form, time_limit: e.target.value })}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Thời điểm hiển thị cho học sinh</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    value={form.visible_from}
                    onChange={(e) => setForm({ ...form, visible_from: e.target.value })}
                  />
                  <Form.Text className="text-muted">
                    Để trống = hiển thị ngay (khi không bật ẩn).
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-4">
                  <Form.Check
                    type="switch"
                    id="quiz-hidden-switch"
                    label="Ẩn bài kiểm tra với học sinh"
                    checked={form.is_hidden}
                    onChange={(e) => setForm({ ...form, is_hidden: e.target.checked })}
                  />
                </Form.Group>
                <AttachmentManager
                  value={form.attachments}
                  onChange={(attachments) => setForm({ ...form, attachments })}
                  apiBase={API_BASE}
                />
              </>
            )}

            {editQuestionsOnly && (
              <Alert variant="light" className="py-2 small mb-3">
                Bài kiểm tra: <strong>{form.title}</strong> — {form.questions.length} câu hỏi
              </Alert>
            )}

            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <Form.Label className="mb-0 fw-semibold">Câu hỏi trắc nghiệm</Form.Label>
              <div className="d-flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline-secondary"
                  size="sm"
                  disabled={downloadingTemplate}
                  onClick={() => handleDownloadTemplate('docx')}
                >
                  {downloadingTemplate ? (
                    <><Spinner size="sm" className="me-1" />Đang tải...</>
                  ) : (
                    <><i className="bi bi-download me-1" />Mẫu Word</>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline-secondary"
                  size="sm"
                  disabled={downloadingTemplate}
                  onClick={() => handleDownloadTemplate('xlsx')}
                >
                  <i className="bi bi-download me-1" />Mẫu Excel
                </Button>
                <input
                  ref={docxInputRef}
                  type="file"
                  accept=".docx,.xlsx,.xls,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="d-none"
                  onChange={handleImportFile}
                />
                <Button
                  type="button"
                  variant="outline-success"
                  size="sm"
                  disabled={importing}
                  onClick={() => docxInputRef.current?.click()}
                >
                  {importing ? (
                    <><Spinner size="sm" className="me-1" />Đang đọc file...</>
                  ) : (
                    <><i className="bi bi-upload me-1" />Import Word/Excel</>
                  )}
                </Button>
                <Button type="button" variant="outline-primary" size="sm" onClick={addQuestion}>
                  <i className="bi bi-plus me-1" />Thêm câu
                </Button>
              </div>
            </div>

            <Alert variant="light" className="py-2 small mb-3">
              <strong>Cách dùng:</strong> tải <strong>Mẫu Word</strong> hoặc <strong>Mẫu Excel</strong> → soạn câu hỏi →{' '}
              <strong>Import Word/Excel</strong>.
              <ul className="mb-0 mt-2 ps-3">
                <li>Word: <code>Câu 1: ...</code>, <code>A.</code>–<code>D.</code>, tô vàng đáp án đúng (tùy chọn)</li>
                <li>Excel: cột Câu hỏi | A | B | C | D | Đáp án đúng (A-D)</li>
                <li>Sau import: kiểm tra/chọn <strong>Đáp án đúng</strong> thủ công nếu cần</li>
              </ul>
            </Alert>

            {importInfo && <Alert variant="success" className="py-2 small">{importInfo}</Alert>}
            {importWarning && <Alert variant="warning" className="py-2 small">{importWarning}</Alert>}
            {pendingReviewCount > 0 && (
              <Alert variant="warning" className="py-2 small">
                Còn <strong>{pendingReviewCount}</strong> câu cần chọn đáp án đúng thủ công.
              </Alert>
            )}

            {form.questions.map((q, idx) => (
              <Card key={q.id || `new-${idx}`} className="mb-3 border">
                <Card.Header
                  className="d-flex justify-content-between align-items-center py-2 bg-light"
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleQuestion(idx)}
                >
                  <div className="d-flex align-items-center gap-2">
                    <i className={`bi bi-chevron-${expandedQuestions[idx] ? 'down' : 'right'}`} />
                    <strong>Câu {idx + 1}</strong>
                    {!expandedQuestions[idx] && q.question && (
                      <span className="text-muted small text-truncate" style={{ maxWidth: 280 }}>
                        — {q.question}
                      </span>
                    )}
                    <Badge bg={q.needsAnswerReview ? 'warning' : 'success'} className="ms-1">
                      {q.needsAnswerReview ? 'Chọn đáp án' : `Đáp án ${q.answer}`}
                    </Badge>
                  </div>
                  {form.questions.length > 1 && (
                    <Button
                      type="button"
                      variant="outline-danger"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); removeQuestion(idx); }}
                    >
                      <i className="bi bi-trash" />
                    </Button>
                  )}
                </Card.Header>
                <Collapse in={expandedQuestions[idx] !== false}>
                  <div>
                    <Card.Body>
                      <Form.Group className="mb-2">
                        <Form.Label className="small text-muted">Nội dung câu hỏi</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          placeholder="Nhập câu hỏi..."
                          value={q.question}
                          onChange={(e) => updateQuestion(idx, 'question', e.target.value)}
                          required
                        />
                      </Form.Group>
                      {['A', 'B', 'C', 'D'].map((opt) => (
                        <Form.Group key={opt} className="mb-2">
                          <Form.Label className="small text-muted">Đáp án {opt}</Form.Label>
                          <Form.Control
                            placeholder={`Nhập đáp án ${opt}`}
                            value={q[`option${opt}`]}
                            onChange={(e) => updateQuestion(idx, `option${opt}`, e.target.value)}
                            required
                          />
                        </Form.Group>
                      ))}
                      <Form.Group className={q.needsAnswerReview ? 'p-2 rounded border border-warning bg-warning-subtle' : ''}>
                        <Form.Label className="small text-muted">
                          Đáp án đúng
                          {q.needsAnswerReview && (
                            <span className="text-warning ms-1">(bắt buộc chọn thủ công)</span>
                          )}
                        </Form.Label>
                        <Form.Select
                          value={q.answer}
                          onChange={(e) => updateQuestion(idx, 'answer', e.target.value)}
                          className={q.needsAnswerReview ? 'border-warning' : ''}
                        >
                          <option value="A">A — {q.optionA || '...'}</option>
                          <option value="B">B — {q.optionB || '...'}</option>
                          <option value="C">C — {q.optionC || '...'}</option>
                          <option value="D">D — {q.optionD || '...'}</option>
                        </Form.Select>
                      </Form.Group>
                    </Card.Body>
                  </div>
                </Collapse>
              </Card>
            ))}
          </Form>
        </Modal.Body>
        <Modal.Footer className="border-top bg-white">
          <Button variant="secondary" onClick={() => setShowForm(false)}>Hủy</Button>
          <Button type="submit" form="quiz-form" variant="primary" disabled={saving || loadingEdit}>
            {saving ? <><Spinner size="sm" className="me-2" />Đang lưu...</> : 'Lưu câu hỏi'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showResults} onHide={() => setShowResults(false)} size="lg" scrollable dialogClassName="scrollable-form-modal">
        <Modal.Header closeButton>
          <Modal.Title>Kết quả bài kiểm tra</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}
          {results.length === 0 ? (
            <Alert variant="light" className="mb-0">Chưa có học sinh làm bài.</Alert>
          ) : (
            <Table responsive hover className="mb-0">
              <thead className="table-light">
                <tr>
                  <th>#</th>
                  <th>Học sinh</th>
                  <th>Hình thức</th>
                  <th>Bài nộp</th>
                  <th>Điểm</th>
                  <th>Nhận xét</th>
                  <th>Thời gian nộp</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => {
                  const isFile = r.file_url && Number(r.answer_count) === 0;
                  return (
                  <tr key={r.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <div className="fw-semibold">{r.fullname}</div>
                      <div className="text-muted small">{r.code}</div>
                    </td>
                    <td>{isFile ? 'File/Link' : 'Trắc nghiệm'}</td>
                    <td>
                      {r.file_url ? (
                        <AttachmentList
                          item={{ attachments: r.attachments, file_url: r.file_url }}
                          apiBase={API_BASE}
                          compact
                        />
                      ) : '—'}
                    </td>
                    <td style={{ width: 90 }}>
                      {r.score != null ? (
                        <Badge bg="primary">{r.score}/10</Badge>
                      ) : isFile ? (
                        <Form.Control
                          type="number"
                          min="0"
                          max="10"
                          step="0.5"
                          size="sm"
                          placeholder="0-10"
                          value={gradeDrafts[r.id]?.score ?? ''}
                          onChange={(e) => updateGradeDraft(r.id, 'score', e.target.value)}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {r.score != null ? (
                        <span className="small">{r.feedback || '—'}</span>
                      ) : isFile ? (
                        <Form.Control
                          size="sm"
                          placeholder="Nhận xét..."
                          value={gradeDrafts[r.id]?.feedback ?? ''}
                          onChange={(e) => updateGradeDraft(r.id, 'feedback', e.target.value)}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-muted small">
                      {new Date(r.submitted_at).toLocaleString('vi-VN')}
                    </td>
                    <td>
                      {isFile && r.score == null && (
                        <Button
                          size="sm"
                          variant="success"
                          disabled={saving}
                          onClick={() => handleGradeQuiz(r.id)}
                        >
                          Chấm
                        </Button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <Alert variant="info" className="mt-3 mb-0 small">
            Bài trắc nghiệm online được chấm tự động. Bài nộp file/link cần giáo viên chấm thủ công.
          </Alert>
        </Modal.Body>
      </Modal>

      <ShareContentModal
        show={!!shareTarget}
        onHide={() => setShareTarget(null)}
        contentType="quiz"
        contentTitle={shareTarget?.title}
        sourceClassId={classId}
        onShare={handleShare}
      />
    </>
  );
}

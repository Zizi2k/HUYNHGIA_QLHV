import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button, Card, Modal, Form, Alert, Badge, Spinner, Table, Collapse,
} from 'react-bootstrap';
import { quizService } from '../../services';
import { notifyDeleteResult } from '../../utils/deleteHelpers';

const emptyQuestion = {
  question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 'A',
};

const emptyForm = { title: '', time_limit: 30, questions: [{ ...emptyQuestion }] };

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
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [error, setError] = useState('');

  const openCreate = () => {
    setEditingId(null);
    setEditQuestionsOnly(false);
    setExpandedQuestions({ 0: true });
    setForm({ ...emptyForm, questions: [{ ...emptyQuestion }] });
    setError('');
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
      }));
      const expanded = {};
      questions.forEach((_, idx) => { expanded[idx] = true; });
      setExpandedQuestions(expanded);
      setForm({
        title: data.title,
        time_limit: data.time_limit || 30,
        questions,
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
      setShowResults(true);
    } catch {
      alert('Không thể tải kết quả');
    }
  };

  const updateQuestion = (idx, field, value) => {
    const questions = [...form.questions];
    questions[idx] = { ...questions[idx], [field]: value };
    setForm({ ...form, questions });
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
    }
    return true;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateQuestions()) return;

    setSaving(true);
    setError('');
    try {
      const payload = {
        class_id: parseInt(classId, 10),
        title: form.title,
        time_limit: parseInt(form.time_limit, 10) || 30,
        questions: form.questions.map((q) => ({
          ...(q.id ? { id: q.id } : {}),
          question: q.question.trim(),
          optionA: q.optionA.trim(),
          optionB: q.optionB.trim(),
          optionC: q.optionC.trim(),
          optionD: q.optionD.trim(),
          answer: q.answer,
        })),
      };
      if (editingId) {
        await quizService.update(editingId, payload);
      } else {
        await quizService.create(payload);
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
        quizzes.map((q) => (
          <Card key={q.id} className="mb-3 border-0 shadow-sm">
            <Card.Body className="d-flex justify-content-between align-items-center gap-3">
              <div>
                <h5 className="mb-1">{q.title}</h5>
                <div className="d-flex flex-wrap gap-2">
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
                  {isStudent && q.submission_id && (
                    <Badge bg="success">Đã làm — {q.quiz_score}/10</Badge>
                  )}
                </div>
              </div>
              <div className="d-flex gap-1 flex-shrink-0 flex-wrap justify-content-end">
                {isStudent && !q.submission_id && (
                  <Button as={Link} to={`/quizzes/${q.id}`} variant="primary" size="sm">
                    Làm bài
                  </Button>
                )}
                {isStudent && q.submission_id && (
                  <Badge bg="primary" className="d-flex align-items-center px-3">
                    Điểm: {q.quiz_score}/10
                  </Badge>
                )}
                {isTeacher && (
                  <>
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
                    <Button variant="outline-danger" size="sm" onClick={() => handleDelete(q.id, q.title)}>
                      <i className="bi bi-trash" />
                    </Button>
                  </>
                )}
              </div>
            </Card.Body>
          </Card>
        ))
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
              </>
            )}

            {editQuestionsOnly && (
              <Alert variant="light" className="py-2 small mb-3">
                Bài kiểm tra: <strong>{form.title}</strong> — {form.questions.length} câu hỏi
              </Alert>
            )}

            <div className="d-flex justify-content-between align-items-center mb-2">
              <Form.Label className="mb-0 fw-semibold">Câu hỏi trắc nghiệm</Form.Label>
              <Button type="button" variant="outline-primary" size="sm" onClick={addQuestion}>
                <i className="bi bi-plus me-1" />Thêm câu
              </Button>
            </div>

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
                    <Badge bg="success" className="ms-1">Đáp án {q.answer}</Badge>
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
                      <Form.Group>
                        <Form.Label className="small text-muted">Đáp án đúng</Form.Label>
                        <Form.Select
                          value={q.answer}
                          onChange={(e) => updateQuestion(idx, 'answer', e.target.value)}
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
          {results.length === 0 ? (
            <Alert variant="light" className="mb-0">Chưa có học sinh làm bài.</Alert>
          ) : (
            <Table responsive hover className="mb-0">
              <thead className="table-light">
                <tr>
                  <th>#</th>
                  <th>Học sinh</th>
                  <th>Điểm</th>
                  <th>Thời gian nộp</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={r.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <div className="fw-semibold">{r.fullname}</div>
                      <div className="text-muted small">{r.code}</div>
                    </td>
                    <td><Badge bg="primary">{r.score}/10</Badge></td>
                    <td className="text-muted small">
                      {new Date(r.submitted_at).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Alert variant="info" className="mt-3 mb-0 small">
            Điểm bài kiểm tra được tính tự động và cộng vào bảng vinh danh.
          </Alert>
        </Modal.Body>
      </Modal>
    </>
  );
}

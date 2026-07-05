import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Button, Spinner, Alert, Badge } from 'react-bootstrap';
import { quizService } from '../services';
import { useAuth } from '../context/AuthContext';

function draftKey(userId, quizId) {
  return `quiz-draft-${userId || 'anon'}-${quizId}`;
}

function loadDraft(userId, quizId) {
  try {
    const raw = localStorage.getItem(draftKey(userId, quizId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveDraft(userId, quizId, answers) {
  try {
    localStorage.setItem(draftKey(userId, quizId), JSON.stringify(answers));
  } catch {
    // ignore quota errors
  }
}

function clearDraft(userId, quizId) {
  try {
    localStorage.removeItem(draftKey(userId, quizId));
  } catch {
    // ignore
  }
}

function ReviewList({ review }) {
  if (!review?.length) return null;
  return (
    <div className="text-start mt-4">
      <h5 className="mb-3">Chi tiết câu trả lời</h5>
      {review.map((q, idx) => (
        <Card
          key={q.question_id}
          className={`mb-3 border-0 shadow-sm ${q.is_correct ? 'border-start border-success border-4' : 'border-start border-danger border-4'}`}
        >
          <Card.Body>
            <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
              <h6 className="mb-0 text-break">Câu {idx + 1}: {q.question}</h6>
              <Badge bg={q.is_correct ? 'success' : 'danger'}>
                {q.is_correct ? 'Đúng' : 'Sai'}
              </Badge>
            </div>
            {['A', 'B', 'C', 'D'].map((opt) => {
              const isSelected = q.selected_answer === opt;
              const isCorrect = q.correct_answer === opt;
              let className = 'mb-1 ps-2 py-1 rounded text-break';
              if (isCorrect) className += ' bg-success-subtle';
              else if (isSelected) className += ' bg-danger-subtle';
              return (
                <div key={opt} className={className}>
                  <strong>{opt}.</strong> {q[`option${opt}`]}
                  {isCorrect && <span className="ms-2 text-success small">(đáp án đúng)</span>}
                  {isSelected && !isCorrect && <span className="ms-2 text-danger small">(bạn chọn)</span>}
                  {isSelected && isCorrect && <span className="ms-2 text-success small">(bạn chọn)</span>}
                </div>
              );
            })}
            {!q.selected_answer && (
              <p className="text-muted small mb-0 mt-1">Bạn chưa chọn đáp án câu này.</p>
            )}
          </Card.Body>
        </Card>
      ))}
    </div>
  );
}

export default function QuizPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    quizService.getById(id)
      .then((res) => {
        setQuiz(res.data);
        if (res.data.mySubmission) {
          const sub = res.data.mySubmission;
          if (sub.file_url && Number(sub.answer_count) === 0) {
            setResult({
              score: sub.score,
              fileSubmission: true,
              alreadyDone: true,
              pendingGrade: sub.score == null,
            });
          } else {
            setResult({
              score: sub.score,
              correct: sub.correct ?? null,
              total: sub.total ?? res.data.questions?.length,
              alreadyDone: true,
              show_results: res.data.show_results,
              review: sub.review || null,
            });
          }
          clearDraft(user?.id, id);
        } else {
          const draft = loadDraft(user?.id, id);
          if (Object.keys(draft).length > 0) {
            setAnswers(draft);
            setDraftRestored(true);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [id, user?.id]);

  const updateAnswer = useCallback((questionId, selected) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: selected };
      saveDraft(user?.id, id, next);
      return next;
    });
    setDraftRestored(false);
  }, [user?.id, id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const answerList = Object.entries(answers).map(([questionId, selected]) => ({
        question_id: parseInt(questionId, 10),
        selected_answer: selected,
      }));
      const res = await quizService.submit({ quiz_id: parseInt(id, 10), answers: answerList });
      clearDraft(user?.id, id);
      setResult({
        ...res.data,
        alreadyDone: false,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể nộp bài');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="page-container text-center py-5"><Spinner animation="border" /></div>;
  }

  if (result) {
    const canReview = result.show_results && result.review?.length > 0;
    return (
      <div className="page-container page-container-narrow">
        <Card className="border-0 shadow text-center p-4">
          <i className="bi bi-trophy text-warning" style={{ fontSize: '4rem' }} />
          <h3 className="mt-3">
            {result.fileSubmission
              ? (result.pendingGrade ? 'Bạn đã nộp bài kiểm tra' : 'Kết quả bài kiểm tra')
              : (result.alreadyDone ? 'Bạn đã làm bài này' : 'Kết quả bài kiểm tra')}
          </h3>
          {result.pendingGrade ? (
            <p className="text-muted my-3">Giáo viên sẽ chấm điểm và thông báo sau.</p>
          ) : (
            <div className="display-4 fw-bold text-primary my-3">{result.score}/10</div>
          )}
          {result.correct != null && result.total != null && (
            <p>Đúng {result.correct}/{result.total} câu</p>
          )}
          {result.alreadyDone && !canReview && (
            <p className="text-muted">
              Điểm đã được tính vào bảng vinh danh.
              {!result.show_results && ' Giáo viên chưa mở xem đáp án.'}
            </p>
          )}
          {canReview && <ReviewList review={result.review} />}
          <Button className="mt-3" onClick={() => navigate(-1)}>Quay lại</Button>
        </Card>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = quiz?.questions?.length || 0;

  return (
    <div className="page-container page-container-narrow">
      <h2 className="mb-2 text-break">{quiz?.title}</h2>
      <p className="text-muted small mb-3">
        Đã chọn {answeredCount}/{totalQuestions} câu
        {draftRestored && (
          <span className="text-success ms-2">
            <i className="bi bi-arrow-counterclockwise me-1" />
            Đã khôi phục bài làm dang dở
          </span>
        )}
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <Form onSubmit={handleSubmit}>
        {quiz?.questions?.map((q, idx) => (
          <Card key={q.id} className="mb-3 border-0 shadow-sm">
            <Card.Body>
              <h6 className="text-break">Câu {idx + 1}: {q.question}</h6>
              {['A', 'B', 'C', 'D'].map((opt) => (
                <Form.Check
                  key={opt}
                  type="radio"
                  name={`q-${q.id}`}
                  label={q[`option${opt}`]}
                  value={opt}
                  checked={answers[q.id] === opt}
                  onChange={() => updateAnswer(q.id, opt)}
                  className="mb-2 text-break"
                  required
                />
              ))}
            </Card.Body>
          </Card>
        ))}
        <Alert variant="info" className="d-flex align-items-start gap-2">
          <i className="bi bi-info-circle mt-1" />
          <div>
            <div>Thời gian làm bài: {quiz?.time_limit} phút</div>
            <div className="small">Câu trả lời được lưu tự động — thoát giữa chừng vẫn làm tiếp được.</div>
          </div>
        </Alert>
        <Button type="submit" variant="primary" size="lg" className="w-100 w-sm-auto" disabled={submitting}>
          {submitting ? 'Đang nộp...' : 'Nộp bài'}
        </Button>
      </Form>
    </div>
  );
}

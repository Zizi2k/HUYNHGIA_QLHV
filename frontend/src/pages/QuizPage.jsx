import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Button, Spinner, Alert, Badge } from 'react-bootstrap';
import { quizService } from '../services';
import { useAuth } from '../context/AuthContext';

function sessionKey(userId, quizId) {
  return `quiz-session-${userId || 'anon'}-${quizId}`;
}

function loadSession(userId, quizId) {
  try {
    const raw = localStorage.getItem(sessionKey(userId, quizId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      answers: parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {},
      startedAt: Number(parsed.startedAt) || null,
    };
  } catch {
    return null;
  }
}

function saveSession(userId, quizId, session) {
  try {
    localStorage.setItem(sessionKey(userId, quizId), JSON.stringify(session));
  } catch {
    // ignore quota errors
  }
}

function clearSession(userId, quizId) {
  try {
    localStorage.removeItem(sessionKey(userId, quizId));
    localStorage.removeItem(`quiz-draft-${userId || 'anon'}-${quizId}`);
  } catch {
    // ignore
  }
}

function formatCountdown(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  const [startedAt, setStartedAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const answersRef = useRef({});
  const submittingRef = useRef(false);
  const resultRef = useRef(null);
  const autoSubmitTriedRef = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [id]);

  const submitAnswers = useCallback(async (currentAnswers, { auto = false } = {}) => {
    if (submittingRef.current || resultRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    if (auto) setAutoSubmitted(true);
    try {
      const answerList = Object.entries(currentAnswers || {}).map(([questionId, selected]) => ({
        question_id: parseInt(questionId, 10),
        selected_answer: selected,
      }));
      const res = await quizService.submit({ quiz_id: parseInt(id, 10), answers: answerList });
      clearSession(user?.id, id);
      setResult({
        ...res.data,
        alreadyDone: false,
        autoSubmitted: auto,
      });
    } catch (err) {
      if (err.response?.status === 401) {
        setSessionExpired(true);
        setError('Phiên đăng nhập hết hạn. Bài làm đã được lưu trên thiết bị — đăng nhập lại rồi mở lại bài kiểm tra để nộp.');
        submittingRef.current = true;
        return;
      }
      setError(err.response?.data?.message || (auto ? 'Hết giờ nhưng không thể nộp bài tự động' : 'Không thể nộp bài'));
      submittingRef.current = false;
      if (auto) autoSubmitTriedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    let cancelled = false;
    quizService.getById(id)
      .then(async (res) => {
        if (cancelled) return;
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
          clearSession(user?.id, id);
          return;
        }

        const limitMinutes = Number(res.data.time_limit) || 30;
        const limitMs = limitMinutes * 60 * 1000;
        const session = loadSession(user?.id, id);
        const now = Date.now();
        let start = session?.startedAt;
        if (!start || Number.isNaN(start)) start = now;

        const restoredAnswers = session?.answers || {};
        setAnswers(restoredAnswers);
        answersRef.current = restoredAnswers;
        setStartedAt(start);

        if (session?.answers && Object.keys(session.answers).length > 0) {
          setDraftRestored(true);
        }

        const elapsed = now - start;
        if (elapsed >= limitMs) {
          setRemainingSeconds(0);
          autoSubmitTriedRef.current = true;
          await submitAnswers(restoredAnswers, { auto: true });
        } else {
          setRemainingSeconds(Math.ceil((limitMs - elapsed) / 1000));
          saveSession(user?.id, id, {
            answers: restoredAnswers,
            startedAt: start,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) {
          setSessionExpired(true);
          setError('Phiên đăng nhập hết hạn. Đăng nhập lại để tiếp tục làm bài.');
        } else {
          setError(err.response?.data?.message || 'Không thể tải bài kiểm tra');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id, user?.id, submitAnswers]);

  useEffect(() => {
    if (!startedAt || result || loading) return undefined;
    const limitMinutes = Number(quiz?.time_limit) || 30;
    const limitMs = limitMinutes * 60 * 1000;

    const tick = () => {
      const leftMs = startedAt + limitMs - Date.now();
      const leftSec = Math.max(0, Math.ceil(leftMs / 1000));
      setRemainingSeconds(leftSec);
      if (leftSec <= 0 && !autoSubmitTriedRef.current) {
        autoSubmitTriedRef.current = true;
        submitAnswers(answersRef.current, { auto: true });
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt, quiz?.time_limit, result, loading, submitAnswers]);

  const updateAnswer = useCallback((questionId, selected) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: selected };
      answersRef.current = next;
      saveSession(user?.id, id, {
        answers: next,
        startedAt: startedAt || Date.now(),
      });
      return next;
    });
    setDraftRestored(false);
  }, [user?.id, id, startedAt]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await submitAnswers(answersRef.current, { auto: false });
  };

  if (sessionExpired) {
    return (
      <div className="page-container page-container-narrow">
        <Card className="border-0 shadow p-4 text-center">
          <i className="bi bi-shield-lock text-warning" style={{ fontSize: '3rem' }} />
          <h4 className="mt-3">Phiên đăng nhập hết hạn</h4>
          <Alert variant="warning" className="text-start mt-3 mb-0">
            {error || 'Bài làm của bạn vẫn được lưu trên thiết bị. Đăng nhập lại rồi mở lại bài kiểm tra để nộp.'}
          </Alert>
          <div className="d-flex gap-2 justify-content-center mt-4">
            <Button variant="primary" onClick={() => navigate('/login')}>Đăng nhập lại</Button>
            <Button variant="outline-secondary" onClick={() => navigate(-1)}>Quay lại</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading || (submitting && !result && autoSubmitted)) {
    return (
      <div className="page-container text-center py-5">
        <Spinner animation="border" />
        {autoSubmitted && (
          <p className="text-muted mt-3 mb-0">Hết giờ — đang nộp bài tự động...</p>
        )}
      </div>
    );
  }

  const totalQuestions = quiz?.questions?.length || 0;
  if (quiz && totalQuestions === 0 && !result) {
    return (
      <div className="page-container page-container-narrow">
        <Card className="border-0 shadow p-4 text-center">
          <i className="bi bi-file-earmark-arrow-up text-primary" style={{ fontSize: '3rem' }} />
          <h4 className="mt-3">{quiz.title}</h4>
          <p className="text-muted mb-0">
            Bài kiểm tra này chỉ nhận nộp file/link. Vui lòng quay lại lớp học và nộp bài ở tab <strong>Bài kiểm tra</strong>.
          </p>
          <Button className="mt-4" onClick={() => navigate(-1)}>Quay lại lớp</Button>
        </Card>
      </div>
    );
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
          {(result.autoSubmitted || autoSubmitted) && (
            <Alert variant="warning" className="mt-3 mb-0">
              Hết thời gian — hệ thống đã tự động nộp bài.
            </Alert>
          )}
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
  const urgent = remainingSeconds != null && remainingSeconds <= 60;
  const warning = remainingSeconds != null && remainingSeconds <= 300 && !urgent;

  return (
    <div className="page-container page-container-narrow quiz-page">
      <div
        className={`quiz-timer-bar p-3 rounded shadow-sm d-flex flex-wrap justify-content-between align-items-center gap-2 ${
          urgent ? 'bg-danger text-white' : warning ? 'bg-warning-subtle' : ''
        }`}
      >
        <div className="min-w-0 flex-grow-1">
          <div className="fw-semibold text-break">{quiz?.title}</div>
          <div className={`small ${urgent ? 'text-white-50' : 'text-muted'}`}>
            Đã chọn {answeredCount}/{totalQuestions} câu
            {draftRestored && (
              <span className={`ms-2 ${urgent ? 'text-white' : 'text-success'}`}>
                <i className="bi bi-arrow-counterclockwise me-1" />
                Đã khôi phục bài làm dang dở
              </span>
            )}
          </div>
        </div>
        <div className="text-end flex-shrink-0">
          <div className="small opacity-75">
            <i className="bi bi-clock me-1" />
            Thời gian còn lại
          </div>
          <div className="fs-3 fw-bold font-monospace lh-1">
            {remainingSeconds == null ? '—' : formatCountdown(remainingSeconds)}
          </div>
        </div>
      </div>

      <div className="quiz-questions-stack">
        {error && !sessionExpired && (
          <Alert variant={sessionExpired ? 'warning' : 'danger'}>
            {error}
            {sessionExpired && (
              <div className="mt-2">
                <Button size="sm" variant="primary" onClick={() => navigate('/login')}>
                  Đăng nhập lại
                </Button>
              </div>
            )}
          </Alert>
        )}

        <Form onSubmit={handleSubmit}>
          {quiz?.questions?.map((q, idx) => (
            <Card key={q.id} className="mb-3 border-0 shadow-sm quiz-question-card">
              <Card.Body>
                <h6 className="text-break mb-3">Câu {idx + 1}: {q.question}</h6>
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
                    disabled={submitting}
                  />
                ))}
              </Card.Body>
            </Card>
          ))}
          <Alert variant="info" className="d-flex align-items-start gap-2">
            <i className="bi bi-info-circle mt-1" />
            <div>
              <div>Thời gian làm bài: {quiz?.time_limit} phút — hết giờ hệ thống tự nộp bài.</div>
              <div className="small">Câu trả lời được lưu tự động — thoát giữa chừng vẫn làm tiếp được, đồng hồ không reset.</div>
            </div>
          </Alert>
          <Button type="submit" variant="primary" size="lg" className="w-100 w-sm-auto" disabled={submitting}>
            {submitting ? 'Đang nộp...' : 'Nộp bài'}
          </Button>
        </Form>
      </div>
    </div>
  );
}

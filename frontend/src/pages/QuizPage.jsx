import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { quizService } from '../services';

export default function QuizPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
              correct: null,
              total: res.data.questions?.length,
              alreadyDone: true,
            });
          }
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const answerList = Object.entries(answers).map(([questionId, selected]) => ({
        question_id: parseInt(questionId),
        selected_answer: selected,
      }));
      const res = await quizService.submit({ quiz_id: parseInt(id), answers: answerList });
      setResult(res.data);
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
          {!result.alreadyDone && result.correct != null && (
            <p>Đúng {result.correct}/{result.total} câu</p>
          )}
          {result.alreadyDone && (
            <p className="text-muted">Điểm đã được tính vào bảng vinh danh.</p>
          )}
          <Button onClick={() => navigate(-1)}>Quay lại</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container page-container-narrow">
      <h2 className="mb-4 text-break">{quiz?.title}</h2>
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
                  onChange={() => setAnswers({ ...answers, [q.id]: opt })}
                  className="mb-2 text-break"
                  required
                />
              ))}
            </Card.Body>
          </Card>
        ))}
        <Alert variant="info">Thời gian làm bài: {quiz?.time_limit} phút</Alert>
        <Button type="submit" variant="primary" size="lg" className="w-100 w-sm-auto" disabled={submitting}>
          {submitting ? 'Đang nộp...' : 'Nộp bài'}
        </Button>
      </Form>
    </div>
  );
}

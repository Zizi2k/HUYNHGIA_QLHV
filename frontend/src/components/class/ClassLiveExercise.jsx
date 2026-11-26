import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Form, Stack } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import api from '../../services/api';

const blank = { kind: 'choice', prompt: '', options: ['', '', '', ''], correct: 0, durationSeconds: 0 };
const labels = { open: 'Đang mở', submitted: 'Đã nộp · chờ chữa', reviewed: 'Đã chữa', closed: 'Đã kết thúc' };
const mathOptions = { trust: false, maxExpand: 100, maxSize: 10 };
const markdownPlugins = [remarkMath];
const renderPlugins = [[rehypeKatex, mathOptions]];
const disallowed = ['img', 'a'];

function Document({ children }) {
  return <div className="text-break overflow-auto">
    <ReactMarkdown skipHtml disallowedElements={disallowed} unwrapDisallowed
      remarkPlugins={markdownPlugins} rehypePlugins={renderPlugins}>{children}</ReactMarkdown>
  </div>;
}

function Editor({ label, value, onChange, maxLength = 8000 }) {
  const area = useRef(null);
  function insert(before, after, example) {
    const { selectionStart: start, selectionEnd: end } = area.current;
    const replacement = value.slice(start, end) || example;
    const next = value.slice(0, start) + before + replacement + after + value.slice(end);
    if (next.length > maxLength) return;
    onChange(next);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(start + before.length, start + before.length + replacement.length);
    });
  }
  return <Form.Group className="mb-3">
    <Form.Label>{label}</Form.Label>
    <Stack direction="horizontal" gap={1} className="flex-wrap mb-2" role="group" aria-label="Định dạng văn bản">
      {[
        ['Đậm', '**', '**', 'văn bản'],
        ['Nghiêng', '*', '*', 'văn bản'],
        ['Tiêu đề', '\n## ', '\n', 'Tiêu đề'],
        ['Danh sách', '\n- ', '\n', 'Nội dung'],
        ['Công thức ∑', '$', '$', String.raw`\frac{a}{b}`],
        ['Công thức riêng dòng', '\n$$\n', '\n$$\n', String.raw`\sqrt{x^2+1}`],
      ].map(([name, before, after, example]) =>
        <Button key={name} type="button" size="sm" variant="outline-secondary"
          onClick={() => insert(before, after, example)}>{name}</Button>)}
    </Stack>
    <Form.Control ref={area} as="textarea" rows={5} maxLength={maxLength} aria-label={label}
      value={value} onChange={(e) => onChange(e.target.value)} />
    <Form.Text>Công thức dùng cú pháp LaTeX. Bản xem trước cập nhật khi nhập.</Form.Text>
    {value && <div className="bg-body-tertiary border rounded p-3 mt-2">
      <span className="small text-body-secondary">Xem trước</span><Document>{value}</Document>
    </div>}
  </Form.Group>;
}

function QuestionForm({ initial = blank, edit, busy, send, onCancel }) {
  const [draft, setDraft] = useState(initial);
  function set(key, value) { setDraft((old) => ({ ...old, [key]: value })); }
  return <Form onSubmit={async (e) => {
    e.preventDefault();
    if (await send(edit ? 'edit' : 'publish', { ...draft, durationSeconds: Number(draft.durationSeconds || 0) })) {
      setDraft(blank);
      onCancel?.();
    }
  }}>
    <Form.Label>Loại câu hỏi</Form.Label>
    <Form.Select className="mb-3" aria-label="Loại câu hỏi" value={draft.kind} onChange={(e) => set('kind', e.target.value)}>
      <option value="choice">Trắc nghiệm một đáp án</option><option value="essay">Tự luận</option>
    </Form.Select>
    <Form.Group className="mb-3" controlId="live-duration">
      <Form.Label>Thời gian trả lời (giây)</Form.Label>
      <Form.Control type="number" min={0} max={3600} step={1} className="w-auto"
        value={draft.durationSeconds ?? 0} disabled={Boolean(initial.student)}
        onChange={(e) => set('durationSeconds', e.target.value)} />
      <Form.Text>{initial.student
        ? 'Không đổi thời lượng sau khi đã gọi học sinh.'
        : 'Nhập 5–3.600 giây hoặc 0 để không giới hạn. Đồng hồ chạy khi giáo viên gọi học sinh.'}</Form.Text>
    </Form.Group>
    <Editor label="Nội dung câu hỏi" value={draft.prompt} onChange={(value) => set('prompt', value)} />
    {draft.kind === 'choice' && <fieldset className="mb-3">
      <legend className="fs-6">Các lựa chọn · đánh dấu đáp án đúng</legend>
      {draft.options.map((option, i) => <Stack key={i} direction="horizontal" gap={2} className="mb-2">
        <Form.Check type="radio" name="live-correct" checked={draft.correct === i} onChange={() => set('correct', i)}
          aria-label={`Đáp án ${i + 1} là đáp án đúng`} />
        <Form.Control aria-label={`Nội dung lựa chọn ${i + 1}`} maxLength={500} required value={option}
          onChange={(e) => set('options', draft.options.map((v, j) => i === j ? e.target.value : v))} />
      </Stack>)}
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        <Button type="button" size="sm" variant="outline-secondary" disabled={draft.options.length >= 6}
          onClick={() => set('options', [...draft.options, ''])}>Thêm lựa chọn</Button>
        <Button type="button" size="sm" variant="outline-secondary" disabled={draft.options.length <= 2}
          onClick={() => setDraft({ ...draft, options: draft.options.slice(0, -1), correct: Math.min(draft.correct, draft.options.length - 2) })}>Bỏ lựa chọn cuối</Button>
      </Stack>
    </fieldset>}
    <Button type="submit" disabled={busy || !draft.prompt.trim()}>{edit ? 'Lưu câu hỏi' : 'Giao câu hỏi cho lớp'}</Button>
    {onCancel && <Button variant="link" type="button" onClick={onCancel}>Hủy sửa</Button>}
  </Form>;
}

function StudentAnswer({ question, send, busy }) {
  const [answer, setAnswer] = useState(question.kind === 'choice' ? null : '');
  return <Form onSubmit={(e) => { e.preventDefault(); void send('submit', { answer }); }}>
    {question.kind === 'choice' ? <fieldset>
      <legend className="fs-6">Chọn một đáp án</legend>
      {question.options.map((option, i) => <Form.Check className="mb-2" key={i} type="radio"
        name="live-answer" id={`live-answer-${i}`} label={option} checked={i === answer} onChange={() => setAnswer(i)} />)}
    </fieldset> : <Editor label="Bài làm tự luận" maxLength={20000} value={answer} onChange={setAnswer} />}
    <Button type="submit" disabled={busy || answer === null || (typeof answer === 'string' && !answer.trim())}>Nộp bài</Button>
  </Form>;
}

function Review({ question: q, send, busy }) {
  const [solution, setSolution] = useState(q.review?.solution ?? (q.kind === 'essay' ? q.response : ''));
  const [feedback, setFeedback] = useState(q.review?.feedback || '');
  const [shared, setShared] = useState(q.review?.shared ?? false);
  return <Form onSubmit={(e) => { e.preventDefault(); void send('review', { solution, feedback, shared }); }}>
    <h3 className="fs-6">Bài nộp gốc · {q.student?.fullname}</h3>
    {q.kind === 'essay' ? <><Document>{q.response}</Document>
      <Editor label="Bản giáo viên chữa" maxLength={20000} value={solution} onChange={setSolution} />
    </> : <p>Học sinh chọn: {q.options[q.response]} · Đáp án đúng: {q.options[q.correct]}</p>}
    <Editor label="Nhận xét" value={feedback} onChange={setFeedback} />
    <Form.Check className="mb-3" label="Chia sẻ bản chữa cho cả lớp (không kèm tên hoặc bài gốc)"
      checked={shared} onChange={(e) => setShared(e.target.checked)} />
    <Button type="submit" disabled={busy || (q.kind === 'essay' && !solution.trim())}>Lưu và gửi bản chữa</Button>
  </Form>;
}

const message = (err) => err.response?.data?.message || 'Không kết nối được với phòng bài tập';

function Countdown({ remaining, duration }) {
  if (remaining === null) return duration > 0
    ? <span className="text-body-secondary">Thời lượng: {duration} giây · Chưa bắt đầu</span>
    : null;
  const format = (value) => String(value).padStart(2, '0');
  return <Badge bg={remaining <= 10 ? 'danger' : 'primary'} className="fs-6" role={remaining === 0 ? 'status' : 'timer'}>
    {remaining === 0 ? 'Hết giờ' : `Còn ${format(Math.floor(remaining / 60))}:${format(remaining % 60)}`}
  </Badge>;
}

export default function ClassLiveExercise({ classId, active, onOpen }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [student, setStudent] = useState('');
  const [history, setHistory] = useState(null);
  const [clock, setClock] = useState(() => Date.now());
  const generation = useRef(0);
  const locked = useRef(false);
  const base = `/classes/${classId}/live-exercise`;
  const q = state?.question;
  const deadline = active && q?.phase === 'open' ? q.deadlineAt : null;
  const remaining = deadline == null ? null : Math.max(0, Math.ceil((deadline - clock - (state?.clockOffset || 0)) / 1000));

  useEffect(() => {
    if (deadline == null) return;
    const tick = () => setClock(Date.now());
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [deadline]);

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function sync() {
      const started = generation.current;
      try {
        if (!locked.current && !document.hidden) {
          const { data } = await api.post(base + '/sync', { present: active }, { signal: controller.signal, timeout: 12000 });
          if (!controller.signal.aborted && started === generation.current && !locked.current) {
            const receivedAt = Date.now();
            setClock(receivedAt);
            setState({ ...data, clockOffset: typeof data.serverNow === 'number' ? data.serverNow - receivedAt : 0 });
            setConnectionError('');
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) setConnectionError(message(err));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(sync, active ? 3000 : 8000);
      }
    }
    void sync();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [base, active]);

  async function send(action, fields = {}) {
    if (locked.current) return false;
    locked.current = true;
    generation.current++;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(base + '/action', {
        ...fields, action, questionId: q?.id ?? null, revision: q?.revision ?? 0,
      }, { timeout: 12000 });
      const receivedAt = Date.now();
      setClock(receivedAt);
      setState((old) => ({ ...old, question: data.question,
        clockOffset: typeof data.serverNow === 'number' ? data.serverNow - receivedAt : old?.clockOffset ?? 0 }));
      if (action === 'publish') setHistory(null);
      return true;
    } catch (err) {
      setError(message(err));
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  if (!active) return q && ['open', 'submitted', 'reviewed'].includes(q.phase) ? (
    <Alert variant="info" className="d-flex justify-content-between align-items-center flex-wrap gap-2">
      <span>{q.assignedToMe ? 'Giáo viên đã gọi bạn làm bài.' : 'Lớp đang có câu hỏi trực tiếp.'}</span>
      <Button size="sm" onClick={onOpen}>Vào làm bài trực tiếp</Button>
    </Alert>
  ) : null;

  return <Card className="shadow-sm mb-3">
    <Card.Body>
      <h2 className="h5">Bài tập trực tiếp</h2>
      <p className="text-body-secondary">{state?.manage
        ? 'Giao câu hỏi, gọi một học sinh đang mở phòng và chữa bài ngay tại đây.'
        : 'Cả lớp cùng xem câu hỏi. Chỉ học sinh được gọi mới có thể nộp bài.'}</p>
      {connectionError && <Alert variant="warning">{connectionError}. Đang thử kết nối lại.</Alert>}
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {!state && !connectionError && <p role="status">Đang vào phòng…</p>}
      {q && <section className="border rounded p-3 mb-3">
        <Stack direction="horizontal" gap={2} className="flex-wrap mb-3">
          <Badge bg="secondary">{labels[q.phase]}</Badge>
          {q.phase === 'open' && <Countdown remaining={remaining} duration={q.durationSeconds} />}
        </Stack>
        <Document>{q.prompt}</Document>
        {q.kind === 'choice' && (state.manage || !q.assignedToMe || q.phase !== 'open') &&
          <ol type="A">{q.options.map((option, i) => <li key={i}>{option}</li>)}</ol>}
        {q.assignedToMe && q.phase === 'open' &&
          <StudentAnswer key={`${q.id}:${q.revision}`} question={q} send={send} busy={busy || remaining === 0} />}
        {!state.manage && q.assignedToMe && q.response != null && <><h3 className="fs-6">Bài đã nộp</h3>
          {q.kind === 'essay' ? <Document>{q.response}</Document> : <p>{q.options[q.response]}</p>}
        </>}
        {!state.manage && q.review && <>
          <h3 className="fs-6">Giáo viên chữa bài</h3>
          {q.kind === 'essay' ? <Document>{q.review.solution}</Document> : <p>Đáp án đúng: {q.options[q.correct]}</p>}
          {q.review.feedback && <Document>{q.review.feedback}</Document>}
        </>}
        {state.manage && q.phase === 'open' && <>
          <p>Đang gọi: {q.student?.fullname || 'Chưa gọi học sinh'}</p>
          <Form.Label htmlFor="live-student">Học sinh đang trong phòng ({state.students.length})</Form.Label>
          <Stack direction="horizontal" gap={2} className="flex-wrap mb-3">
            <Form.Select id="live-student" className="w-auto mw-100" value={student} onChange={(e) => setStudent(e.target.value)}>
              <option value="">Chọn học sinh</option>
              {state.students.map((s) => <option key={s.id} value={s.id}>{s.fullname}</option>)}
            </Form.Select>
            <Button disabled={busy || String(q.student?.id) === student || !state.students.some((s) => String(s.id) === student)}
              onClick={() => {
                if (q.student && !window.confirm('Chuyển lượt cho học sinh khác? Đồng hồ sẽ tính lại từ đầu.')) return;
                void send('assign', { studentId: Number(student) });
              }}>Gọi làm bài</Button>
          </Stack>
          {editing ? <QuestionForm key={q.id} initial={{ ...q, options: q.kind === 'essay' ? blank.options : q.options,
            correct: q.correct ?? 0 }} edit busy={busy} send={send} onCancel={() => setEditing(false)} /> :
            <Button variant="outline-primary" disabled={busy} onClick={() => setEditing(true)}>Sửa câu hỏi</Button>}
        </>}
        {state.manage && ['submitted', 'reviewed'].includes(q.phase) &&
          <Review key={`${q.id}:${q.revision}`} question={q} send={send} busy={busy} />}
        {state.manage && ['open', 'reviewed'].includes(q.phase) &&
          <Button className="mt-3 d-block" variant="outline-secondary" disabled={busy} onClick={async () => {
            if (q.phase === 'open' && !window.confirm('Câu này chưa có bài nộp. Bạn vẫn muốn kết thúc?')) return;
            if (await send('close')) { setEditing(false); setStudent(''); }
          }}>Kết thúc câu</Button>}
      </section>}
      {state && !state.manage && !q && <p role="status">Đang chờ giáo viên giao câu hỏi.</p>}
      {state?.manage && (!q || q.phase === 'closed') && <QuestionForm busy={busy} send={send} />}
      {state?.manage && <div className="mt-3">
        <Button size="sm" variant="outline-secondary" onClick={async () => {
          if (history) { setHistory(null); return; }
          try { setHistory((await api.get(base + '/history', { timeout: 12000 })).data); }
          catch (err) { setError(message(err)); }
        }}>{history ? 'Ẩn lịch sử' : 'Xem lịch sử câu hỏi'}</Button>
        {history?.length === 0 && <p className="mt-2">Chưa có câu nào được lưu vào lịch sử.</p>}
        {history?.map((item) => <details className="border rounded p-2 mt-2" key={item.id}>
          <summary>{item.kind === 'essay' ? 'Tự luận' : 'Trắc nghiệm'} · {item.student?.fullname || 'Không có học sinh'} · {new Date(item.publishedAt).toLocaleString('vi-VN')}</summary>
          <Document>{item.prompt}</Document>
          {item.kind === 'essay' ? <><Document>{item.response ?? 'Chưa nộp'}</Document>
            {item.review && <Document>{item.review.solution}</Document>}</> :
            <p>Đáp án đúng: {item.options[item.correct]} · Đã chọn: {item.options[item.response] ?? 'Chưa nộp'}</p>}
          {item.review?.feedback && <Document>{item.review.feedback}</Document>}
        </details>)}
      </div>}
    </Card.Body>
  </Card>;
}

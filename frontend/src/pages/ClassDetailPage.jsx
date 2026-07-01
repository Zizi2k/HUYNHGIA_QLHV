import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Tab, Card, Button, Form, Modal, Spinner, Badge, ListGroup, Alert,
} from 'react-bootstrap';
import {
  classService, lessonService, assignmentService, quizService, discussionService,
} from '../services';
import { useAuth } from '../context/AuthContext';
import {
  LESSON_IMAGE_ACCEPT,
  getLessonIcon, getLessonResourceUrl, getLessonBadge, isImageLesson,
} from '../utils/fileTypes';
import {
  emptyAttachmentDraft, hasAttachmentDraftContent,
  appendAttachmentsToFormData, buildAttachmentJsonPayload,
  shouldUseMultipartForAttachments, getItemAttachments,
} from '../utils/attachmentHelpers';
import ClassMembersTab from '../components/class/ClassMembersTab';
import ClassAttendanceTab from '../components/class/ClassAttendanceTab';
import ClassAssignmentsTab from '../components/class/ClassAssignmentsTab';
import ClassQuizzesTab from '../components/class/ClassQuizzesTab';
import ClassOnlineTab from '../components/class/ClassOnlineTab';
import ShareContentModal from '../components/class/ShareContentModal';
import AttachmentManager from '../components/common/AttachmentManager';
import AttachmentList from '../components/common/AttachmentList';
import { notifyDeleteResult } from '../utils/deleteHelpers';
import { ClassMediaTile } from '../components/class/ClassCard';
import ModuleTabs from '../components/layout/ModuleTabs';
import { canActAsClassTeacher } from '../utils/roles';

import { API_BASE } from '../config/apiBase';

export default function ClassDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [classData, setClassData] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('lessons');
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [showDiscussionModal, setShowDiscussionModal] = useState(false);
  const [lessonForm, setLessonForm] = useState({
    title: '', description: '', attachments: emptyAttachmentDraft(),
  });
  const [discussionForm, setDiscussionForm] = useState({ title: '', content: '' });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [shareLessonTarget, setShareLessonTarget] = useState(null);

  const isAdmin = user?.role === 'admin';
  const isClassTeacher = canActAsClassTeacher(user, classData?.members);
  const canManageClass = isAdmin || isClassTeacher;
  const isStudent = user?.role === 'student';
  const classStudents = classData?.members?.filter((m) => m.role === 'student') || [];
  const primaryTeacher = useMemo(() => {
    const staff = classData?.members?.filter((m) => m.role === 'teacher' || m.role === 'admin') || [];
    return staff.find((m) => m.avatar_url) || staff[0] || null;
  }, [classData?.members]);

  const handleClassAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isLessonImageAllowed(file)) {
      alert('Chỉ chấp nhận ảnh JPG, PNG, GIF hoặc WEBP');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      await classService.uploadAvatar(id, fd);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể tải ảnh lớp');
    }
  };

  const fetchClassData = async () => {
    setAccessError('');
    setLoadError('');

    const classRes = await classService.getById(id);
    setClassData(classRes.data);

    const results = await Promise.allSettled([
      lessonService.getByClass(id),
      assignmentService.getAll(id),
      quizService.getAll(id),
      discussionService.getByClass(id),
    ]);

    const [lessonRes, assignRes, quizRes, discRes] = results;

    if (lessonRes.status === 'fulfilled') setLessons(lessonRes.value.data);
    else setLessons([]);

    if (assignRes.status === 'fulfilled') setAssignments(assignRes.value.data);
    else setAssignments([]);

    if (quizRes.status === 'fulfilled') setQuizzes(quizRes.value.data);
    else setQuizzes([]);

    if (discRes.status === 'fulfilled') setDiscussions(discRes.value.data);
    else setDiscussions([]);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error('Một số dữ liệu lớp học không tải được:', failed);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setAccessError('');
    setLoadError('');

    try {
      await fetchClassData();
    } catch (err) {
      if (err.response?.status === 403) {
        setAccessError(err.response?.data?.message || 'Bạn không có quyền truy cập lớp học này');
      } else {
        setLoadError(err.response?.data?.message || 'Không thể tải thông tin lớp học. Vui lòng thử lại.');
      }
      setClassData(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    try {
      await fetchClassData();
    } catch (err) {
      console.error('Không thể cập nhật dữ liệu lớp:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setActiveTab('lessons');
    loadData();
  }, [id]);

  const resetLessonForm = () => {
    setLessonForm({ title: '', description: '', attachments: emptyAttachmentDraft() });
    setUploadError('');
  };

  const handleUploadLesson = async (e) => {
    e.preventDefault();
    setUploadError('');

    if (!hasAttachmentDraftContent(lessonForm.attachments)) {
      setUploadError('Vui lòng chọn ít nhất một tệp tin hoặc thêm link');
      return;
    }

    setUploading(true);
    try {
      const draft = lessonForm.attachments;
      if (shouldUseMultipartForAttachments(draft)) {
        const formData = new FormData();
        formData.append('title', lessonForm.title);
        formData.append('description', lessonForm.description || '');
        appendAttachmentsToFormData(formData, draft);
        await lessonService.create(id, formData);
      } else {
        await lessonService.create(id, {
          title: lessonForm.title,
          description: lessonForm.description || '',
          ...buildAttachmentJsonPayload(draft),
        });
      }
      setShowLessonModal(false);
      resetLessonForm();
      refreshData();
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Không thể đăng tài liệu');
    } finally {
      setUploading(false);
    }
  };

  const handlePasteImage = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setUploadError('');
          setLessonForm((prev) => ({
            ...prev,
            attachments: {
              ...prev.attachments,
              newFiles: [...prev.attachments.newFiles, file],
            },
          }));
        }
        return;
      }
    }
  };

  const handleCreateDiscussion = async (e) => {
    e.preventDefault();
    await discussionService.create({ class_id: parseInt(id), ...discussionForm });
    setShowDiscussionModal(false);
    setDiscussionForm({ title: '', content: '' });
    refreshData();
  };

  const handleDeleteLesson = async (lessonId) => {
    if (!window.confirm('Xóa bài giảng này?')) return;
    try {
      const res = await lessonService.delete(lessonId);
      if (!notifyDeleteResult(res)) refreshData();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa bài giảng');
    }
  };

  const handleShareLesson = async (targetClassIds) => {
    const res = await lessonService.share(shareLessonTarget.id, targetClassIds);
    alert(res.data?.message || 'Chia sẻ thành công');
    refreshData();
  };

  const getLessonFileUrl = (fileUrl) => getLessonResourceUrl(fileUrl, API_BASE);

  if (loading) {
    return <div className="page-container text-center py-5"><Spinner animation="border" /></div>;
  }

  if (accessError) {
    return (
      <div className="page-container py-5">
        <Alert variant="warning">{accessError}</Alert>
      </div>
    );
  }

  if (loadError || !classData) {
    return (
      <div className="page-container py-5">
        <Alert variant="danger">{loadError || 'Không thể tải thông tin lớp học.'}</Alert>
        <Button variant="primary" className="mt-3" onClick={loadData}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="page-container module-page">
      <div className="class-detail-header mb-4">
        <div className="class-detail-header-text">
          <h2 className="mb-1 text-break">
            {classData.name}
            {refreshing && (
              <Spinner animation="border" size="sm" className="ms-2 align-middle" />
            )}
          </h2>
          <p className="text-muted mb-0 text-break">{classData.description}</p>
        </div>
        <div className="class-detail-header-visual-wrap">
          <div className="class-card-right class-detail-header-visual">
            <ClassMediaTile
              variant="class"
              src={classData.avatar_url}
              alt={classData.name}
              icon="mortarboard"
              label="Lớp học"
            />
            {primaryTeacher && (
              <ClassMediaTile
                variant="teacher"
                src={primaryTeacher.avatar_url}
                alt={primaryTeacher.fullname}
                initials={primaryTeacher.fullname?.charAt(0) || 'G'}
                icon="person-fill"
                label="Giáo viên"
              />
            )}
          </div>
          {canManageClass && (
            <>
              <input
                id="class-avatar-upload"
                type="file"
                accept={LESSON_IMAGE_ACCEPT}
                className="d-none"
                onChange={handleClassAvatarUpload}
              />
              <Button
                as="label"
                htmlFor="class-avatar-upload"
                variant="link"
                size="sm"
                className="class-detail-change-avatar"
              >
                Đổi ảnh lớp
              </Button>
            </>
          )}
        </div>
      </div>

      <ModuleTabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k || 'lessons')}
        tabs={[
          { key: 'lessons', label: 'Bài giảng', icon: 'bi-journal-text' },
          { key: 'assignments', label: 'Bài tập', icon: 'bi-clipboard-check' },
          { key: 'quizzes', label: 'Bài kiểm tra', icon: 'bi-patch-question' },
          { key: 'discussions', label: 'Thảo luận', icon: 'bi-chat-dots' },
          { key: 'online', label: 'Lớp online', icon: 'bi-camera-video' },
          { key: 'members', label: 'Thành viên', icon: 'bi-people' },
          { key: 'attendance', label: 'Điểm danh', icon: 'bi-calendar-check' },
        ]}
      >
          <Tab.Pane eventKey="lessons">
            {canManageClass && (
              <Button className="mb-3" onClick={() => { resetLessonForm(); setShowLessonModal(true); }}>
                <i className="bi bi-upload me-1" />Đăng tài liệu
              </Button>
            )}
            {lessons.length === 0 ? (
              <Alert variant="light">Chưa có bài giảng nào.</Alert>
            ) : (
              <ListGroup>
                {lessons.map((lesson) => {
                  const attachments = getItemAttachments(lesson);
                  const primary = attachments[0];
                  const badge = primary ? getLessonBadge(primary) : getLessonBadge(lesson);
                  const resourceUrl = primary ? getLessonFileUrl(primary.file_url) : '';
                  const showThumb = primary && isImageLesson(primary);
                  return (
                  <ListGroup.Item key={lesson.id} className="d-flex justify-content-between align-items-center gap-3">
                    <div className="d-flex align-items-center gap-3">
                      {showThumb ? (
                        <img
                          src={resourceUrl}
                          alt={lesson.title}
                          className="rounded border"
                          style={{ width: 52, height: 52, objectFit: 'cover' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <i className={`bi ${getLessonIcon(primary || lesson)} fs-3 text-primary`} />
                      )}
                      <div>
                        <strong>{lesson.title}</strong>
                        {lesson.description && (
                          <div className="text-muted small">{lesson.description}</div>
                        )}
                        {attachments.length > 1 && (
                          <Badge bg="secondary" className="mt-1">{attachments.length} tài liệu</Badge>
                        )}
                        {badge && (
                          <Badge bg={badge.variant} className="mt-1 ms-1">{badge.text}</Badge>
                        )}
                        {!attachments.length && (
                          <Badge bg="warning" text="dark" className="mt-1">
                            Chưa có tệp — vui lòng tải lên lại
                          </Badge>
                        )}
                        <AttachmentList item={lesson} apiBase={API_BASE} defaultExpanded={false} />
                      </div>
                    </div>
                    <div className="d-flex gap-2 flex-shrink-0">
                      {canManageClass && (
                        <>
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            title="Chia sẻ sang lớp khác"
                            onClick={() => setShareLessonTarget({ id: lesson.id, title: lesson.title })}
                          >
                            <i className="bi bi-share" />
                          </Button>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleDeleteLesson(lesson.id)}
                            title="Xóa bài giảng"
                          >
                            <i className="bi bi-trash" />
                          </Button>
                        </>
                      )}
                    </div>
                  </ListGroup.Item>
                  );
                })}
              </ListGroup>
            )}
          </Tab.Pane>

          <Tab.Pane eventKey="assignments">
            <ClassAssignmentsTab
              classId={id}
              assignments={assignments}
              isTeacher={canManageClass}
              isStudent={isStudent}
              onUpdated={refreshData}
            />
          </Tab.Pane>

          <Tab.Pane eventKey="quizzes">
            <ClassQuizzesTab
              classId={id}
              quizzes={quizzes}
              isTeacher={canManageClass}
              isStudent={isStudent}
              onUpdated={refreshData}
            />
          </Tab.Pane>

          <Tab.Pane eventKey="discussions">
            <Button className="mb-3" onClick={() => setShowDiscussionModal(true)}>
              <i className="bi bi-chat-dots me-1" />Tạo thảo luận
            </Button>
            {discussions.length === 0 ? (
              <Alert variant="light">Chưa có thảo luận nào.</Alert>
            ) : (
              discussions.map((d) => (
                <Card key={d.id} className="mb-3 border-0 shadow-sm">
                  <Card.Body>
                    <div className="d-flex justify-content-between">
                      <h5>{d.title}</h5>
                      <small className="text-muted">{d.fullname}</small>
                    </div>
                    <p>{d.content}</p>
                    <div className="text-muted small">
                      <i className="bi bi-heart me-1" />{d.like_count}
                      <i className="bi bi-chat ms-3 me-1" />{d.comment_count}
                    </div>
                  </Card.Body>
                </Card>
              ))
            )}
          </Tab.Pane>

          <Tab.Pane eventKey="online">
            <ClassOnlineTab
              classId={id}
              className={classData?.name}
              canManageClass={canManageClass}
              user={user}
            />
          </Tab.Pane>

          <Tab.Pane eventKey="members">
            <ClassMembersTab
              classId={id}
              className={classData?.name}
              members={classData.members}
              isTeacher={canManageClass}
              isAdmin={isAdmin}
              isStudent={isStudent}
              onUpdated={refreshData}
            />
          </Tab.Pane>

          <Tab.Pane eventKey="attendance">
            <ClassAttendanceTab
              classId={id}
              students={classStudents}
              isTeacher={canManageClass}
              isStudent={isStudent}
              currentUserId={user?.id}
            />
          </Tab.Pane>
      </ModuleTabs>

      <Modal show={showLessonModal} onHide={() => setShowLessonModal(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>Đăng tài liệu</Modal.Title></Modal.Header>
        <Form onSubmit={handleUploadLesson} onPaste={handlePasteImage}>
          <Modal.Body>
            {uploadError && <Alert variant="danger" className="py-2">{uploadError}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Tiêu đề</Form.Label>
              <Form.Control
                value={lessonForm.title}
                onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mô tả</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={lessonForm.description}
                onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })}
              />
            </Form.Group>

            <Form.Text className="text-muted d-block mb-2">
              Có thể đính kèm nhiều tệp và link trong cùng một bài giảng. Dán ảnh bằng <strong>Ctrl+V</strong>.
            </Form.Text>
            <AttachmentManager
              value={lessonForm.attachments}
              onChange={(attachments) => setLessonForm({ ...lessonForm, attachments })}
              apiBase={API_BASE}
              required
            />

          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowLessonModal(false)}>Hủy</Button>
            <Button type="submit" variant="primary" disabled={uploading}>
              {uploading ? 'Đang lưu...' : 'Đăng tài liệu'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showDiscussionModal} onHide={() => setShowDiscussionModal(false)}>
        <Modal.Header closeButton><Modal.Title>Tạo thảo luận</Modal.Title></Modal.Header>
        <Form onSubmit={handleCreateDiscussion}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Tiêu đề</Form.Label>
              <Form.Control
                value={discussionForm.title}
                onChange={(e) => setDiscussionForm({ ...discussionForm, title: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Nội dung</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                value={discussionForm.content}
                onChange={(e) => setDiscussionForm({ ...discussionForm, content: e.target.value })}
                required
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDiscussionModal(false)}>Hủy</Button>
            <Button type="submit" variant="primary">Đăng bài</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <ShareContentModal
        show={!!shareLessonTarget}
        onHide={() => setShareLessonTarget(null)}
        contentType="lesson"
        contentTitle={shareLessonTarget?.title}
        sourceClassId={Number(id)}
        onShare={handleShareLesson}
      />
    </div>
  );
}

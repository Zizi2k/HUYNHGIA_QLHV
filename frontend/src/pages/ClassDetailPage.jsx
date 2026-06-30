import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Nav, Tab, Card, Button, Form, Modal, Spinner, Badge, ListGroup, Alert,
} from 'react-bootstrap';
import {
  classService, lessonService, assignmentService, quizService, discussionService,
} from '../services';
import { useAuth } from '../context/AuthContext';
import {
  LESSON_FILE_ACCEPT, LESSON_IMAGE_ACCEPT,
  isLessonFileAllowed, isLessonImageAllowed,
  getLessonIcon, getLessonResourceUrl, getLessonLinkLabel, getLessonBadge, isImageLesson,
} from '../utils/fileTypes';
import ClassMembersTab from '../components/class/ClassMembersTab';
import ClassAttendanceTab from '../components/class/ClassAttendanceTab';
import ClassAssignmentsTab from '../components/class/ClassAssignmentsTab';
import ClassQuizzesTab from '../components/class/ClassQuizzesTab';
import ClassOnlineTab from '../components/class/ClassOnlineTab';
import { notifyDeleteResult } from '../utils/deleteHelpers';
import { canActAsClassTeacher } from '../utils/roles';
import { getAvatarUrl } from '../utils/avatar';

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
    title: '', description: '', file: null, sourceType: 'file', linkUrl: '',
  });
  const [discussionForm, setDiscussionForm] = useState({ title: '', content: '' });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [loadError, setLoadError] = useState('');

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
    setLessonForm({ title: '', description: '', file: null, sourceType: 'file', linkUrl: '' });
    setUploadError('');
  };

  const isUploadSource = (type) => type === 'file' || type === 'image';
  const isLinkSource = (type) => !isUploadSource(type);

  const imagePreviewUrl = useMemo(() => {
    if (lessonForm.sourceType === 'image' && lessonForm.file) {
      return URL.createObjectURL(lessonForm.file);
    }
    if (lessonForm.sourceType === 'image_link' && lessonForm.linkUrl.trim()) {
      return lessonForm.linkUrl.trim();
    }
    return null;
  }, [lessonForm.sourceType, lessonForm.file, lessonForm.linkUrl]);

  useEffect(() => () => {
    if (imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
  }, [imagePreviewUrl]);

  const handleUploadLesson = async (e) => {
    e.preventDefault();
    setUploadError('');

    if (isUploadSource(lessonForm.sourceType)) {
      if (!lessonForm.file) {
        setUploadError(lessonForm.sourceType === 'image'
          ? 'Vui lòng chọn hoặc dán ảnh để tải lên'
          : 'Vui lòng chọn tệp tin để tải lên');
        return;
      }
      if (lessonForm.sourceType === 'image' && !isLessonImageAllowed(lessonForm.file)) {
        setUploadError('Chỉ chấp nhận ảnh JPG, PNG, GIF, WEBP, BMP, SVG');
        return;
      }
      if (lessonForm.sourceType === 'file' && !isLessonFileAllowed(lessonForm.file)) {
        setUploadError('Chỉ chấp nhận tệp PDF, Word, PowerPoint hoặc video');
        return;
      }
    } else if (!lessonForm.linkUrl.trim()) {
      setUploadError('Vui lòng dán link');
      return;
    }

    setUploading(true);
    try {
      if (isUploadSource(lessonForm.sourceType)) {
        const formData = new FormData();
        formData.append('title', lessonForm.title);
        formData.append('description', lessonForm.description || '');
        formData.append('file', lessonForm.file);
        await lessonService.create(id, formData);
      } else {
        const linkTypeMap = { document: 'document', website: 'website', image_link: 'image' };
        await lessonService.create(id, {
          title: lessonForm.title,
          description: lessonForm.description || '',
          link_url: lessonForm.linkUrl.trim(),
          link_type: linkTypeMap[lessonForm.sourceType],
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

  const handleLessonFileChange = (e) => {
    const file = e.target.files[0];
    const isImage = lessonForm.sourceType === 'image';
    if (file && (isImage ? !isLessonImageAllowed(file) : !isLessonFileAllowed(file))) {
      setUploadError(isImage
        ? 'Chỉ chấp nhận ảnh JPG, PNG, GIF, WEBP, BMP, SVG'
        : 'Chỉ chấp nhận tệp PDF, Word, PowerPoint hoặc video');
      setLessonForm({ ...lessonForm, file: null });
      e.target.value = '';
      return;
    }
    setUploadError('');
    setLessonForm({ ...lessonForm, file: file || null });
  };

  const handlePasteImage = (e) => {
    if (lessonForm.sourceType !== 'image') return;
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file && isLessonImageAllowed(file)) {
          setUploadError('');
          setLessonForm({ ...lessonForm, file });
        } else {
          setUploadError('Ảnh dán không hợp lệ');
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
    <div className="page-container">
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
        <div className="class-card-visual class-detail-header-visual">
          <div className="class-card-avatar class-card-avatar--class">
            <div className="class-card-avatar-ring">
              {classData.avatar_url ? (
                <img
                  src={getAvatarUrl(classData.avatar_url)}
                  alt={classData.name}
                  className="class-card-avatar-img"
                />
              ) : (
                <div className="class-card-avatar-fallback">
                  <i className="bi bi-mortarboard" />
                </div>
              )}
            </div>
            <span className="class-card-avatar-label">Lớp học</span>
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
                  className="p-0 text-decoration-none small"
                >
                  Đổi ảnh lớp
                </Button>
              </>
            )}
          </div>
          {primaryTeacher && (
            <div className="class-card-avatar class-card-avatar--teacher">
              <div className="class-card-avatar-ring">
                {primaryTeacher.avatar_url ? (
                  <img
                    src={getAvatarUrl(primaryTeacher.avatar_url)}
                    alt={primaryTeacher.fullname}
                    className="class-card-avatar-img"
                  />
                ) : (
                  <div className="class-card-avatar-fallback">
                    {primaryTeacher.fullname?.charAt(0) || 'G'}
                  </div>
                )}
              </div>
              <span className="class-card-avatar-label">Giáo viên</span>
            </div>
          )}
        </div>
      </div>

      <Tab.Container activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'lessons')}>
        <Nav variant="tabs" className="mb-3 app-nav-tabs-scroll flex-nowrap">
          <Nav.Item><Nav.Link eventKey="lessons">Bài giảng</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="assignments">Bài tập</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="quizzes">Bài kiểm tra</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="discussions">Thảo luận</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="online">Lớp online</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="members">Thành viên</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="attendance">Điểm danh</Nav.Link></Nav.Item>
        </Nav>

        <Tab.Content>
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
                  const badge = getLessonBadge(lesson);
                  const resourceUrl = getLessonFileUrl(lesson.file_url);
                  return (
                  <ListGroup.Item key={lesson.id} className="d-flex justify-content-between align-items-center gap-3">
                    <div className="d-flex align-items-center gap-3">
                      {isImageLesson(lesson) && lesson.file_url ? (
                        <img
                          src={resourceUrl}
                          alt={lesson.title}
                          className="rounded border"
                          style={{ width: 52, height: 52, objectFit: 'cover' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <i className={`bi ${getLessonIcon(lesson)} fs-3 text-primary`} />
                      )}
                      <div>
                        {lesson.file_url ? (
                          <a
                            href={resourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="fw-semibold text-decoration-none"
                          >
                            {lesson.title}
                          </a>
                        ) : (
                          <strong>{lesson.title}</strong>
                        )}
                        {lesson.description && (
                          <div className="text-muted small">{lesson.description}</div>
                        )}
                        {badge && (
                          <Badge bg={badge.variant} className="mt-1">{badge.text}</Badge>
                        )}
                        {!lesson.file_url && (
                          <Badge bg="warning" text="dark" className="mt-1">
                            Chưa có tệp — vui lòng tải lên lại
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="d-flex gap-2 flex-shrink-0">
                      {lesson.file_url && (
                        <Button
                          as="a"
                          href={resourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="primary"
                          size="sm"
                        >
                          <i className={`bi ${
                            lesson.file_type?.startsWith('link/') || isImageLesson(lesson)
                              ? 'bi-box-arrow-up-right'
                              : 'bi-download'
                          } me-1`} />
                          {getLessonLinkLabel(lesson.file_type, lesson)}
                        </Button>
                      )}
                      {canManageClass && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDeleteLesson(lesson.id)}
                          title="Xóa bài giảng"
                        >
                          <i className="bi bi-trash" />
                        </Button>
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
        </Tab.Content>
      </Tab.Container>

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

            <Form.Label className="mb-2">Nguồn tài liệu</Form.Label>
            <div className="d-flex flex-wrap gap-2 mb-3">
              <Button
                type="button"
                variant={lessonForm.sourceType === 'file' ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => setLessonForm({ ...lessonForm, sourceType: 'file', linkUrl: '' })}
              >
                <i className="bi bi-upload me-1" />
                Tải file lên
              </Button>
              <Button
                type="button"
                variant={lessonForm.sourceType === 'document' ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => setLessonForm({ ...lessonForm, sourceType: 'document', file: null })}
              >
                <i className="bi bi-link-45deg me-1" />
                Link tài liệu
              </Button>
              <Button
                type="button"
                variant={lessonForm.sourceType === 'website' ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => setLessonForm({ ...lessonForm, sourceType: 'website', file: null })}
              >
                <i className="bi bi-globe2 me-1" />
                Link trang web
              </Button>
              <Button
                type="button"
                variant={lessonForm.sourceType === 'image' ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => setLessonForm({ ...lessonForm, sourceType: 'image', linkUrl: '' })}
              >
                <i className="bi bi-image me-1" />
                Tải ảnh lên
              </Button>
              <Button
                type="button"
                variant={lessonForm.sourceType === 'image_link' ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => setLessonForm({ ...lessonForm, sourceType: 'image_link', file: null })}
              >
                <i className="bi bi-link me-1" />
                Link ảnh
              </Button>
            </div>

            {lessonForm.sourceType === 'file' && (
              <Form.Group>
                <Form.Label>Tệp tin (PDF, Word, video, PowerPoint)</Form.Label>
                <Form.Control
                  type="file"
                  accept={LESSON_FILE_ACCEPT}
                  onChange={handleLessonFileChange}
                />
                <Form.Text className="text-muted">
                  Hỗ trợ: PDF, DOC, DOCX, PPT, PPTX, MP4, AVI, MOV, WEBM (tối đa 50MB)
                </Form.Text>
              </Form.Group>
            )}

            {lessonForm.sourceType === 'image' && (
              <Form.Group>
                <Form.Label>Ảnh minh họa</Form.Label>
                <div
                  className="border border-2 border-dashed rounded-3 p-4 text-center bg-light"
                  style={{ cursor: 'pointer' }}
                  onClick={() => document.getElementById('lesson-image-input')?.click()}
                >
                  {imagePreviewUrl ? (
                    <img
                      src={imagePreviewUrl}
                      alt="Xem trước"
                      className="rounded mb-2"
                      style={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <i className="bi bi-image display-6 text-muted d-block mb-2" />
                  )}
                  <div className="text-muted small">
                    Bấm để chọn ảnh hoặc <strong>Ctrl+V</strong> dán ảnh từ clipboard
                  </div>
                  <div className="text-muted small mt-1">
                    JPG, PNG, GIF, WEBP, BMP, SVG (tối đa 50MB)
                  </div>
                </div>
                <Form.Control
                  id="lesson-image-input"
                  type="file"
                  accept={LESSON_IMAGE_ACCEPT}
                  onChange={handleLessonFileChange}
                  className="d-none"
                />
              </Form.Group>
            )}

            {isLinkSource(lessonForm.sourceType) && lessonForm.sourceType !== 'image_link' && (
              <Form.Group>
                <Form.Label>
                  {lessonForm.sourceType === 'website' ? 'Link trang web' : 'Link tài liệu'}
                </Form.Label>
                <Form.Control
                  type="url"
                  value={lessonForm.linkUrl}
                  onChange={(e) => setLessonForm({ ...lessonForm, linkUrl: e.target.value })}
                  placeholder={
                    lessonForm.sourceType === 'website'
                      ? 'https://example.com/bai-hoc'
                      : 'https://drive.google.com/... hoặc https://example.com/file.pdf'
                  }
                />
                <Form.Text className="text-muted">
                  {lessonForm.sourceType === 'website'
                    ? 'Dán link trang web, bài đọc, video YouTube, v.v.'
                    : 'Dán link Google Drive, OneDrive, PDF trực tuyến hoặc tài liệu trên web'}
                </Form.Text>
              </Form.Group>
            )}

            {lessonForm.sourceType === 'image_link' && (
              <Form.Group>
                <Form.Label>Link ảnh</Form.Label>
                <Form.Control
                  type="url"
                  value={lessonForm.linkUrl}
                  onChange={(e) => setLessonForm({ ...lessonForm, linkUrl: e.target.value })}
                  placeholder="https://example.com/hinh-anh.jpg"
                />
                <Form.Text className="text-muted">
                  Dán link ảnh trực tiếp (JPG, PNG, GIF, WEBP...)
                </Form.Text>
                {imagePreviewUrl && (
                  <div className="mt-3 text-center">
                    <img
                      src={imagePreviewUrl}
                      alt="Xem trước"
                      className="rounded border"
                      style={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                )}
              </Form.Group>
            )}

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
    </div>
  );
}

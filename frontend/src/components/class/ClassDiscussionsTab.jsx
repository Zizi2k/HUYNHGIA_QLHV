import { useState, useEffect } from 'react';

import {

  Button, Card, Modal, Form, Alert, Spinner, Badge,

} from 'react-bootstrap';

import { discussionService } from '../../services';

import { API_BASE } from '../../config/apiBase';

import { getLessonResourceUrl, isLessonImageAllowed } from '../../utils/fileTypes';

import { teachingStaffBadge } from '../../utils/roles';



const QUICK_EMOJIS = [

  '😀', '😂', '😍', '🥰', '😊', '👍', '👏', '🙏', '❤️', '🔥',

  '✨', '🎉', '💯', '😢', '😮', '🤔', '👋', '💪', '🌟', '📚',

];



function roleLabel(role) {

  if (role === 'admin') return 'Quản trị viên';

  if (role === 'teacher') return 'Giáo viên';

  return 'Học viên';

}



function formatTime(value) {

  if (!value) return '';

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return '';

  return d.toLocaleString('vi-VN', {

    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',

  });

}



function DiscussionImagePreview({ src, onRemove, alt = 'Ảnh thảo luận' }) {

  if (!src) return null;

  return (

    <div className="mb-2 position-relative d-inline-block">

      <img

        src={src}

        alt={alt}

        className="rounded border"

        style={{ maxHeight: 160, maxWidth: '100%', objectFit: 'contain' }}

      />

      {onRemove && (

        <Button

          type="button"

          variant="danger"

          size="sm"

          className="position-absolute top-0 end-0 m-1"

          onClick={onRemove}

        >

          <i className="bi bi-x" />

        </Button>

      )}

    </div>

  );

}



function useImagePicker() {

  const [file, setFile] = useState(null);

  const [preview, setPreview] = useState('');

  const [existingUrl, setExistingUrl] = useState('');

  const [removeExisting, setRemoveExisting] = useState(false);



  const clearNew = () => {

    if (preview) URL.revokeObjectURL(preview);

    setFile(null);

    setPreview('');

  };



  const reset = () => {

    clearNew();

    setExistingUrl('');

    setRemoveExisting(false);

  };



  const initExisting = (url) => {

    clearNew();

    setExistingUrl(url || '');

    setRemoveExisting(false);

  };



  const pickFile = (nextFile) => {

    if (!nextFile || !isLessonImageAllowed(nextFile)) return false;

    clearNew();

    setRemoveExisting(false);

    setFile(nextFile);

    setPreview(URL.createObjectURL(nextFile));

    return true;

  };



  const removeExistingImage = () => {

    clearNew();

    setRemoveExisting(true);

  };



  const displayPreview = preview || (!removeExisting && existingUrl ? existingUrl : '');



  return {

    file,

    preview: displayPreview,

    removeExisting,

    clearNew,

    reset,

    initExisting,

    pickFile,

    removeExistingImage,

    hasImage: !!file || (!removeExisting && !!existingUrl),

  };

}



function DiscussionFormModal({

  show, onHide, mode, classId, discussion, onSaved,

}) {

  const [title, setTitle] = useState('');

  const [content, setContent] = useState('');

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');

  const image = useImagePicker();



  const isEdit = mode === 'edit';

  useEffect(() => {
    if (!show) return;
    setError('');
    if (isEdit && discussion) {
      setTitle(discussion.title || '');
      setContent(discussion.content || '');
      const url = discussion.image_url
        ? getLessonResourceUrl(discussion.image_url, API_BASE)
        : '';
      image.initExisting(url);
    } else {
      setTitle('');
      setContent('');
      image.reset();
    }
  }, [show, isEdit, discussion?.id]);

  const handleClose = () => {

    image.reset();

    onHide();

  };



  const handlePickImage = (e) => {

    const picked = e.target.files?.[0];

    e.target.value = '';

    if (!picked) return;

    if (!image.pickFile(picked)) {

      setError('Chỉ chấp nhận ảnh JPG, PNG, GIF hoặc WEBP');

    } else {

      setError('');

    }

  };



  const handlePasteImage = (e) => {

    const items = e.clipboardData?.items;

    if (!items) return;

    for (const item of items) {

      if (item.type.startsWith('image/')) {

        e.preventDefault();

        const picked = item.getAsFile();

        if (picked && image.pickFile(picked)) setError('');

        return;

      }

    }

  };



  const handleSubmit = async (e) => {

    e.preventDefault();

    const trimmedTitle = title.trim();

    const trimmedContent = content.trim();

    if (!trimmedTitle) {

      setError('Vui lòng nhập tiêu đề');

      return;

    }

    if (!trimmedContent && !image.hasImage) {

      setError('Vui lòng nhập nội dung hoặc đính kèm ảnh');

      return;

    }



    setSaving(true);

    setError('');

    try {

      const fd = new FormData();

      fd.append('title', trimmedTitle);

      fd.append('content', trimmedContent);

      if (image.file) fd.append('image', image.file);

      if (isEdit && image.removeExisting) fd.append('remove_image', '1');



      if (isEdit) {

        await discussionService.update(discussion.id, fd);

      } else {

        fd.append('class_id', parseInt(classId, 10));

        await discussionService.create(fd);

      }



      handleClose();

      onSaved?.();

    } catch (err) {

      setError(err.response?.data?.message || 'Không thể lưu thảo luận');

    } finally {

      setSaving(false);

    }

  };



  return (

    <Modal show={show} onHide={handleClose}>

      <Modal.Header closeButton>

        <Modal.Title>{isEdit ? 'Sửa thảo luận' : 'Tạo thảo luận'}</Modal.Title>

      </Modal.Header>

      <Form onSubmit={handleSubmit} onPaste={handlePasteImage}>

        <Modal.Body>

          {error && <Alert variant="danger" className="py-2">{error}</Alert>}

          <Form.Group className="mb-3">

            <Form.Label>Tiêu đề</Form.Label>

            <Form.Control

              value={title}

              onChange={(e) => setTitle(e.target.value)}

              required

            />

          </Form.Group>

          <Form.Group className="mb-3">

            <Form.Label>Nội dung</Form.Label>

            <Form.Control

              as="textarea"

              rows={4}

              value={content}

              onChange={(e) => setContent(e.target.value)}

              placeholder="Có thể dán ảnh bằng Ctrl+V"

            />

          </Form.Group>



          {image.preview && (

            <DiscussionImagePreview

              src={image.preview}

              onRemove={image.file ? image.clearNew : image.removeExistingImage}

            />

          )}



          <Button

            type="button"

            variant="outline-secondary"

            size="sm"

            as="label"

            title="Đính kèm ảnh"

          >

            <i className="bi bi-image me-1" />Ảnh

            <input type="file" accept="image/*" hidden onChange={handlePickImage} />

          </Button>

        </Modal.Body>

        <Modal.Footer>

          <Button variant="secondary" onClick={handleClose}>Hủy</Button>

          <Button type="submit" variant="primary" disabled={saving}>

            {saving ? 'Đang lưu...' : (isEdit ? 'Lưu' : 'Đăng bài')}

          </Button>

        </Modal.Footer>

      </Form>

    </Modal>

  );

}



function CommentItem({ comment }) {

  const imageUrl = comment.image_url

    ? getLessonResourceUrl(comment.image_url, API_BASE)

    : null;

  const staffBadge = comment.role !== 'student' ? teachingStaffBadge({ role: comment.role }) : null;



  return (

    <div className="discussion-comment py-2 border-bottom">

      <div className="d-flex justify-content-between align-items-start gap-2">

        <div className="fw-semibold small">

          {comment.fullname}

          {staffBadge && (

            <Badge bg={staffBadge.bg} className="ms-2">{staffBadge.label}</Badge>

          )}

        </div>

        <small className="text-muted text-nowrap">{formatTime(comment.created_at)}</small>

      </div>

      {comment.content && (

        <div className="mt-1 text-break" style={{ whiteSpace: 'pre-wrap' }}>{comment.content}</div>

      )}

      {imageUrl && (

        <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="d-inline-block mt-2">

          <img

            src={imageUrl}

            alt="Ảnh bình luận"

            className="rounded border"

            style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }}

          />

        </a>

      )}

    </div>

  );

}



function DiscussionCard({ discussion, isAdmin, onUpdated, onEdit }) {

  const [expanded, setExpanded] = useState(false);

  const [comments, setComments] = useState([]);

  const [loadingComments, setLoadingComments] = useState(false);

  const [commentText, setCommentText] = useState('');

  const [commentImage, setCommentImage] = useState(null);

  const [commentImagePreview, setCommentImagePreview] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const [liking, setLiking] = useState(false);

  const [likeCount, setLikeCount] = useState(discussion.like_count || 0);

  const [liked, setLiked] = useState(!!discussion.liked_by_me);

  const [commentCount, setCommentCount] = useState(discussion.comment_count || 0);

  const [error, setError] = useState('');

  const [showEmoji, setShowEmoji] = useState(false);



  const postImageUrl = discussion.image_url

    ? getLessonResourceUrl(discussion.image_url, API_BASE)

    : null;



  const staffBadge = discussion.role !== 'student'

    ? teachingStaffBadge({ role: discussion.role })

    : null;



  const loadComments = async () => {

    setLoadingComments(true);

    setError('');

    try {

      const res = await discussionService.getComments(discussion.id);

      setComments(res.data);

    } catch (err) {

      setError(err.response?.data?.message || 'Không thể tải bình luận');

    } finally {

      setLoadingComments(false);

    }

  };



  const handleToggleExpand = async () => {

    const next = !expanded;

    setExpanded(next);

    if (next && comments.length === 0) {

      await loadComments();

    }

  };



  const handleToggleLike = async () => {

    if (liking) return;

    setLiking(true);

    try {

      const res = await discussionService.toggleLike(discussion.id);

      setLiked(res.data.liked);

      setLikeCount(res.data.like_count);

    } catch (err) {

      alert(err.response?.data?.message || 'Không thể thích bài viết');

    } finally {

      setLiking(false);

    }

  };



  const handleDelete = async () => {

    if (!window.confirm('Bạn có chắc muốn xóa thảo luận này?')) return;

    setDeleting(true);

    try {

      await discussionService.delete(discussion.id);

      onUpdated?.();

    } catch (err) {

      alert(err.response?.data?.message || 'Không thể xóa thảo luận');

    } finally {

      setDeleting(false);

    }

  };



  const clearCommentImage = () => {

    if (commentImagePreview) URL.revokeObjectURL(commentImagePreview);

    setCommentImage(null);

    setCommentImagePreview('');

  };



  const handlePickImage = (e) => {

    const file = e.target.files?.[0];

    e.target.value = '';

    if (!file) return;

    if (!isLessonImageAllowed(file)) {

      setError('Chỉ chấp nhận ảnh JPG, PNG, GIF hoặc WEBP');

      return;

    }

    setError('');

    clearCommentImage();

    setCommentImage(file);

    setCommentImagePreview(URL.createObjectURL(file));

  };



  const handlePasteImage = (e) => {

    const items = e.clipboardData?.items;

    if (!items) return;

    for (const item of items) {

      if (item.type.startsWith('image/')) {

        e.preventDefault();

        const file = item.getAsFile();

        if (!file || !isLessonImageAllowed(file)) return;

        setError('');

        clearCommentImage();

        setCommentImage(file);

        setCommentImagePreview(URL.createObjectURL(file));

        return;

      }

    }

  };



  const insertEmoji = (emoji) => {

    setCommentText((prev) => `${prev}${emoji}`);

  };



  const handleSubmitComment = async (e) => {

    e.preventDefault();

    const text = commentText.trim();

    if (!text && !commentImage) {

      setError('Vui lòng nhập nội dung hoặc đính kèm ảnh');

      return;

    }



    setSubmitting(true);

    setError('');

    try {

      let res;

      if (commentImage) {

        const fd = new FormData();

        fd.append('content', text);

        fd.append('image', commentImage);

        res = await discussionService.addComment(discussion.id, fd);

      } else {

        res = await discussionService.addComment(discussion.id, { content: text });

      }



      const newComment = res.data.comment;

      setComments((prev) => [...prev, newComment]);

      setCommentCount((prev) => prev + 1);

      setCommentText('');

      clearCommentImage();

      setShowEmoji(false);

      onUpdated?.();

    } catch (err) {

      setError(err.response?.data?.message || 'Không thể gửi bình luận');

    } finally {

      setSubmitting(false);

    }

  };



  return (

    <Card className="mb-3 border-0 shadow-sm">

      <Card.Body>

        <div className="d-flex justify-content-between align-items-start gap-2">

          <h5 className="mb-1">{discussion.title}</h5>

          <div className="text-end">

            <small className="text-muted d-block">{discussion.fullname}</small>

            {staffBadge && <Badge bg={staffBadge.bg}>{staffBadge.label}</Badge>}

            {isAdmin && (

              <div className="mt-2 d-flex justify-content-end gap-1">

                <Button

                  variant="outline-secondary"

                  size="sm"

                  title="Sửa"

                  onClick={() => onEdit(discussion)}

                >

                  <i className="bi bi-pencil" />

                </Button>

                <Button

                  variant="outline-danger"

                  size="sm"

                  title="Xóa"

                  onClick={handleDelete}

                  disabled={deleting}

                >

                  {deleting ? (

                    <Spinner size="sm" animation="border" />

                  ) : (

                    <i className="bi bi-trash" />

                  )}

                </Button>

              </div>

            )}

          </div>

        </div>

        {discussion.content && (

          <p className="mb-2 text-break" style={{ whiteSpace: 'pre-wrap' }}>{discussion.content}</p>

        )}

        {postImageUrl && (

          <a href={postImageUrl} target="_blank" rel="noopener noreferrer" className="d-inline-block mb-2">

            <img

              src={postImageUrl}

              alt="Ảnh thảo luận"

              className="rounded border"

              style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain' }}

            />

          </a>

        )}



        <div className="d-flex align-items-center gap-3">

          <Button

            variant="link"

            className={`p-0 text-decoration-none ${liked ? 'text-danger' : 'text-muted'}`}

            onClick={handleToggleLike}

            disabled={liking}

            title={liked ? 'Bỏ thích' : 'Thích'}

          >

            <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'} me-1`} />

            {likeCount}

          </Button>

          <Button

            variant="link"

            className="p-0 text-muted text-decoration-none"

            onClick={handleToggleExpand}

          >

            <i className="bi bi-chat me-1" />

            {commentCount}

            <i className={`bi bi-chevron-${expanded ? 'up' : 'down'} ms-1 small`} />

          </Button>

        </div>



        {expanded && (

          <div className="mt-3 pt-3 border-top">

            {loadingComments ? (

              <div className="text-center py-2"><Spinner size="sm" animation="border" /></div>

            ) : (

              <>

                {comments.length === 0 ? (

                  <Alert variant="light" className="py-2 mb-3">Chưa có bình luận. Hãy là người đầu tiên!</Alert>

                ) : (

                  <div className="mb-3">

                    {comments.map((c) => <CommentItem key={c.id} comment={c} />)}

                  </div>

                )}



                <Form onSubmit={handleSubmitComment} onPaste={handlePasteImage}>

                  {error && <Alert variant="danger" className="py-2">{error}</Alert>}

                  <Form.Control

                    as="textarea"

                    rows={2}

                    placeholder="Viết bình luận... (có thể dán ảnh bằng Ctrl+V)"

                    value={commentText}

                    onChange={(e) => setCommentText(e.target.value)}

                    className="mb-2"

                  />



                  {commentImagePreview && (

                    <div className="mb-2 position-relative d-inline-block">

                      <img

                        src={commentImagePreview}

                        alt="Xem trước"

                        className="rounded border"

                        style={{ maxHeight: 120, maxWidth: '100%' }}

                      />

                      <Button

                        type="button"

                        variant="danger"

                        size="sm"

                        className="position-absolute top-0 end-0 m-1"

                        onClick={clearCommentImage}

                      >

                        <i className="bi bi-x" />

                      </Button>

                    </div>

                  )}



                  <div className="d-flex flex-wrap align-items-center gap-2">

                    <Button

                      type="button"

                      variant="outline-secondary"

                      size="sm"

                      onClick={() => setShowEmoji((v) => !v)}

                      title="Chèn biểu tượng"

                    >

                      <i className="bi bi-emoji-smile" />

                    </Button>

                    <Button

                      type="button"

                      variant="outline-secondary"

                      size="sm"

                      as="label"

                      title="Đính kèm ảnh"

                    >

                      <i className="bi bi-image me-1" />Ảnh

                      <input type="file" accept="image/*" hidden onChange={handlePickImage} />

                    </Button>

                    <Button type="submit" variant="primary" size="sm" disabled={submitting}>

                      {submitting ? 'Đang gửi...' : 'Gửi'}

                    </Button>

                  </div>



                  {showEmoji && (

                    <div className="mt-2 p-2 border rounded bg-light d-flex flex-wrap gap-1">

                      {QUICK_EMOJIS.map((emoji) => (

                        <Button

                          key={emoji}

                          type="button"

                          variant="link"

                          className="p-1 text-decoration-none"

                          style={{ fontSize: '1.25rem', lineHeight: 1 }}

                          onClick={() => insertEmoji(emoji)}

                        >

                          {emoji}

                        </Button>

                      ))}

                    </div>

                  )}

                </Form>

              </>

            )}

          </div>

        )}

      </Card.Body>

    </Card>

  );

}



export default function ClassDiscussionsTab({

  classId, discussions, canCreate, isAdmin, onUpdated,

}) {

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [editingDiscussion, setEditingDiscussion] = useState(null);



  return (

    <>

      {canCreate && (

        <Button className="mb-3" onClick={() => setShowCreateModal(true)}>

          <i className="bi bi-chat-dots me-1" />Tạo thảo luận

        </Button>

      )}



      {discussions.length === 0 ? (

        <Alert variant="light">Chưa có thảo luận nào.</Alert>

      ) : (

        discussions.map((d) => (

          <DiscussionCard

            key={d.id}

            discussion={d}

            isAdmin={isAdmin}

            onUpdated={onUpdated}

            onEdit={setEditingDiscussion}

          />

        ))

      )}



      <DiscussionFormModal

        show={showCreateModal}

        onHide={() => setShowCreateModal(false)}

        mode="create"

        classId={classId}

        onSaved={onUpdated}

      />



      <DiscussionFormModal

        show={!!editingDiscussion}

        onHide={() => setEditingDiscussion(null)}

        mode="edit"

        classId={classId}

        discussion={editingDiscussion}

        onSaved={onUpdated}

      />

    </>

  );

}



import { Link } from 'react-router-dom';
import { getAvatarUrl, getInitials } from '../../utils/avatar';

export function ClassMediaTile({
  variant, src, alt, initials, label, icon, className = '',
}) {
  const resolved = src ? getAvatarUrl(src) : null;
  return (
    <div className={`ls-media-tile ls-media-tile-${variant} ${className}`.trim()}>
      {resolved ? (
        <img src={resolved} alt={alt} className="ls-media-tile-img" />
      ) : (
        <div className="ls-media-tile-fallback">
          {initials || <i className={`bi bi-${icon}`} />}
        </div>
      )}
      {label && <span className="ls-media-tile-label">{label}</span>}
    </div>
  );
}

export default function ClassCard({ cls, canManage, onEdit, onDelete }) {
  const teacherName = cls.teacher_names?.split(',')[0]?.trim() || 'Chưa phân công';
  const teacherInitials = getInitials(teacherName);

  return (
    <article className="ls-course-card">
      <div className="ls-course-cover">
        {cls.avatar_url ? (
          <img src={getAvatarUrl(cls.avatar_url)} alt={cls.name} />
        ) : (
          <div className="ls-course-cover-fallback">
            <i className="bi bi-mortarboard-fill" />
          </div>
        )}
        <span className="ls-course-subject">{cls.subject || 'Lớp học'}</span>
        {canManage && (
          <div className="ls-course-actions">
            <button type="button" title="Sửa lớp học" onClick={() => onEdit(cls)}>
              <i className="bi bi-pencil" />
            </button>
            <button type="button" className="danger" title="Xóa lớp học" onClick={() => onDelete(cls)}>
              <i className="bi bi-trash" />
            </button>
          </div>
        )}
      </div>

      <div className="ls-course-body">
        <div className="ls-course-code">{cls.code || 'HUYNHGIA CLASS'}</div>
        <h3>{cls.name}</h3>
        <p>{cls.description || 'Chưa có mô tả cho lớp học này.'}</p>

        <div className="ls-course-teacher">
          <div className="ls-course-teacher-avatar">
            {cls.teacher_avatar_url ? (
              <img src={getAvatarUrl(cls.teacher_avatar_url)} alt={teacherName} />
            ) : (
              <span>{teacherInitials || 'GV'}</span>
            )}
          </div>
          <div>
            <small>Giáo viên phụ trách</small>
            <strong>{teacherName}</strong>
          </div>
        </div>

        <div className="ls-course-footer">
          <span><i className="bi bi-people" /> {cls.member_count ?? 0} thành viên</span>
          <Link to={`/classes/${cls.id}`}>
            Vào lớp <i className="bi bi-arrow-right" />
          </Link>
        </div>
      </div>
    </article>
  );
}

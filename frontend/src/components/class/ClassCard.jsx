import { Link } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { getAvatarUrl, getInitials } from '../../utils/avatar';

export function ClassMediaTile({
  variant, src, alt, initials, label, icon, className = '',
}) {
  const resolved = src ? getAvatarUrl(src) : null;
  const isClass = variant === 'class';

  return (
    <div className={`class-card-media class-card-media--${variant} ${className}`.trim()}>
      <div className={`class-card-media-body ${isClass ? 'class-card-media-body--rect' : 'class-card-media-body--round'}`}>
        {resolved ? (
          <img src={resolved} alt={alt} className="class-card-media-img" />
        ) : (
          <div className="class-card-media-fallback">
            {initials || <i className={`bi bi-${icon}`} />}
          </div>
        )}
      </div>
      <div className="class-card-media-footer">
        <i className={`bi bi-${icon}`} />
        <span>{label}</span>
      </div>
    </div>
  );
}

export default function ClassCard({ cls, canManage, onEdit, onDelete }) {
  const teacherName = cls.teacher_names?.split(',')[0]?.trim() || 'Giáo viên';
  const teacherInitials = getInitials(teacherName);

  return (
    <article className="class-card">
      <div className="class-card-left">
        <div className="class-card-head">
          <div className="class-card-head-text">
            <h5 className="class-card-title text-break">{cls.name}</h5>
            <div className="class-card-title-line" aria-hidden="true" />
          </div>
          {canManage && (
            <div className="class-card-actions">
              <button type="button" className="class-card-action-btn" title="Sửa lớp học" onClick={() => onEdit(cls)}>
                <i className="bi bi-pencil" />
              </button>
              <button type="button" className="class-card-action-btn class-card-action-btn--danger" title="Xóa lớp học" onClick={() => onDelete(cls)}>
                <i className="bi bi-trash" />
              </button>
            </div>
          )}
        </div>

        <div className="class-card-badges">
          {cls.teacher_names && (
            <div className="class-card-badge">
              <i className="bi bi-person-badge" />
              <span>GV: {cls.teacher_names}</span>
            </div>
          )}
          <div className="class-card-badge">
            <i className="bi bi-people" />
            <span>{cls.member_count} thành viên</span>
          </div>
        </div>

        <Button as={Link} to={`/classes/${cls.id}`} className="class-card-enter">
          Vào lớp học
          <i className="bi bi-arrow-right" />
        </Button>
      </div>

      <div className="class-card-right">
        <ClassMediaTile
          variant="class"
          src={cls.avatar_url}
          alt={cls.name}
          initials={getInitials(cls.name)}
          label="Lớp học"
          icon="mortarboard"
        />
        <ClassMediaTile
          variant="teacher"
          src={cls.teacher_avatar_url}
          alt={teacherName}
          initials={teacherInitials}
          label="Giáo viên"
          icon="person"
        />
      </div>
    </article>
  );
}

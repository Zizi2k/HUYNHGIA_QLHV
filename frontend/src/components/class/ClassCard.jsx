import { Link } from 'react-router-dom';
import { Card, Button, Badge } from 'react-bootstrap';
import { getAvatarUrl, getInitials } from '../../utils/avatar';

function AvatarFrame({
  src, label, initials, variant = 'class', title,
}) {
  const resolved = src ? getAvatarUrl(src) : null;
  return (
    <div className={`class-card-avatar class-card-avatar--${variant}`} title={title}>
      <div className="class-card-avatar-ring">
        {resolved ? (
          <img src={resolved} alt={title || label} className="class-card-avatar-img" />
        ) : (
          <div className="class-card-avatar-fallback">
            {initials || <i className={`bi bi-${variant === 'class' ? 'mortarboard' : 'person-badge'}`} />}
          </div>
        )}
      </div>
      <span className="class-card-avatar-label">{label}</span>
    </div>
  );
}

export default function ClassCard({ cls, canManage, onEdit, onDelete }) {
  const teacherInitials = getInitials((cls.teacher_names || 'GV').split(',')[0].trim());

  return (
    <Card className="class-card h-100 border-0 shadow-sm">
      <Card.Body className="class-card-body">
        <div className="class-card-main">
          <div className="class-card-info">
            <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
              <h5 className="class-card-title text-break mb-0">{cls.name}</h5>
              {canManage && (
                <div className="d-flex gap-1 flex-shrink-0">
                  <Button variant="outline-secondary" size="sm" title="Sửa lớp học" onClick={() => onEdit(cls)}>
                    <i className="bi bi-pencil" />
                  </Button>
                  <Button variant="outline-danger" size="sm" title="Xóa lớp học" onClick={() => onDelete(cls)}>
                    <i className="bi bi-trash" />
                  </Button>
                </div>
              )}
            </div>
            {cls.code && (
              <Badge bg="secondary" className="bg-opacity-10 text-secondary mb-2">{cls.code}</Badge>
            )}
            <p className="class-card-desc text-muted mb-2">{cls.description || '—'}</p>
            {cls.teacher_names && (
              <p className="small text-muted mb-2 class-card-teacher">
                <i className="bi bi-person-workspace me-1" />
                GV: {cls.teacher_names}
              </p>
            )}
            <Badge bg="primary" className="bg-opacity-10 text-primary class-card-members">
              {cls.member_count} thành viên
            </Badge>
          </div>

          <div className="class-card-visual">
            <AvatarFrame
              src={cls.avatar_url}
              label="Lớp học"
              initials={getInitials(cls.name)}
              variant="class"
              title={cls.name}
            />
            <AvatarFrame
              src={cls.teacher_avatar_url}
              label="Giáo viên"
              initials={teacherInitials}
              variant="teacher"
              title={cls.teacher_names?.split(',')[0]?.trim() || 'Giáo viên'}
            />
          </div>
        </div>
      </Card.Body>
      <Card.Footer className="class-card-footer bg-white border-0">
        <Button as={Link} to={`/classes/${cls.id}`} variant="outline-primary" size="sm" className="class-card-enter">
          Vào lớp học
          <i className="bi bi-arrow-right-short ms-1" />
        </Button>
      </Card.Footer>
    </Card>
  );
}

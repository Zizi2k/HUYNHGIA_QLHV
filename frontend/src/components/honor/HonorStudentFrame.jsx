import { getAvatarUrl, getInitials } from '../../utils/avatar';

const RANK_LABELS = { 1: 'TOP 1', 2: 'TOP 2', 3: 'TOP 3' };

export default function HonorStudentFrame({ student, rank, size = 'md' }) {
  if (!student) {
    return (
      <div className={`honor-frame honor-frame--${size} honor-frame--empty`}>
        <div className="honor-frame-ring">
          <div className="honor-frame-placeholder">—</div>
        </div>
        <div className="honor-frame-ribbon">
          <span>Chưa có</span>
        </div>
      </div>
    );
  }

  const avatarSrc = getAvatarUrl(student.avatar_url);
  const initials = getInitials(student.fullname);
  const rankLabel = RANK_LABELS[rank] || `#${rank}`;

  return (
    <article className={`honor-frame honor-frame--${size}${rank === 1 ? ' honor-frame--champion' : ''}`}>
      {rank <= 3 && (
        <div className="honor-frame-crown" aria-hidden="true">
          <i className="bi bi-award-fill" />
        </div>
      )}
      <div className="honor-frame-ring">
        {avatarSrc ? (
          <img src={avatarSrc} alt={student.fullname} className="honor-frame-avatar" />
        ) : (
          <div className="honor-frame-avatar honor-frame-avatar--fallback">
            {initials}
          </div>
        )}
      </div>
      <div className="honor-frame-ribbon">
        <span className="honor-frame-name">{student.fullname}</span>
        {rank <= 3 && <small className="honor-frame-rank">{rankLabel}</small>}
      </div>
      <div className="honor-frame-score">
        <strong>{student.avg_score}</strong>
        <span> điểm</span>
      </div>
    </article>
  );
}

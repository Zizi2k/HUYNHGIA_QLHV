import { Link } from 'react-router-dom';
import { profilePath } from '../../utils/profilePath';

export default function ProfileNameLink({
  userId,
  children,
  className = 'profile-name-link',
}) {
  const to = profilePath(userId);
  if (!to) {
    return <span className={className}>{children}</span>;
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

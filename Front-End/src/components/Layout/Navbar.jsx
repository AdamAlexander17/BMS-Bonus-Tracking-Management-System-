import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { user } = useAuth();

  return (
    <header className="navbar">
      {user && (
        <div className="navbar__user">
          <div className="navbar__user-info">
            <span className="navbar__user-name">{user.username}</span>
            <span className="navbar__user-role">{user.role}</span>
          </div>
          <div className="navbar__user-avatar">
            {user.username?.[0]?.toUpperCase()}
          </div>
        </div>
      )}
    </header>
  );
}

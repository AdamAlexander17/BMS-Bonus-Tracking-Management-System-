import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import './Sidebar.css';

const NAV_ITEMS = [
  { path: '/',        label: 'Dashboard', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
  )},
  { path: '/users',   label: 'Users', perm: 'user:view', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
  )},
  { path: '/roles',   label: 'Roles', perm: 'role:view', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
  )},
  { path: '/brokers', label: 'Brokers', perm: 'broker:view', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
  )},
  { path: '/brands',  label: 'Brands', perm: 'brand:view', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>
  )},
  { path: '/reports', label: 'Reports', perm: 'report:view', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  )},
  { path: '/audit',   label: 'Audit Log', perm: 'auditlog:view', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
  )},
];

export default function Sidebar({ collapsed, setCollapsed }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      {/* Brand */}
      <div className="sidebar__brand">
        <div className="sidebar__brand-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12 L12 4 L21 12" />
            <path d="M3 12 L12 20 L21 12" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        </div>
        {!collapsed && (
          <div className="sidebar__brand-info">
            <span className="sidebar__brand-name">BMS Admin</span>
            <span className="sidebar__brand-sub">Management Pro</span>
          </div>
        )}
        <button className={`sidebar__toggle${collapsed ? ' sidebar__toggle--active' : ''}`} onClick={() => setCollapsed(!collapsed)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
            {collapsed
              ? <polyline points="9 18 15 12 9 6"/>
              : <polyline points="15 18 9 12 15 6"/>}
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar__nav">
        {(() => {
          // Pure permission-driven visibility. Items without a `perm` key
          // (e.g. Dashboard) are always visible to any authenticated user.
          // Items with a `perm` key only appear when the user holds that
          // permission — so granting `auditlog:view`, `brand:view`, etc.
          // to any role immediately surfaces the matching menu item.
          const perms = user?.permissions || [];
          const hasPerm = (key) => perms.includes(key);
          return NAV_ITEMS.filter(item => !item.perm || hasPerm(item.perm));
        })().map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
            }
          >
            <span className="sidebar__icon">{icon}</span>
            {!collapsed && <span className="sidebar__label">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer – logged-in user card */}
      <div className="sidebar__footer">
        {/* Theme toggle */}
        <button
          className={`sidebar__theme-toggle${collapsed ? ' sidebar__theme-toggle--collapsed' : ''}`}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
          {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        <div className="sidebar__user">
          <div className="sidebar__user-avatar">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          {!collapsed && (
            <>
              <div className="sidebar__user-info">
                <span className="sidebar__user-name">{user?.username || 'User'}</span>
                <span className="sidebar__user-role">{(user?.roles || []).join(', ') || 'Admin'}</span>
              </div>
              <button className="sidebar__signout-btn" onClick={handleLogout} title="Sign Out">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </>
          )}
        </div>
        {collapsed && (
          <button className="sidebar__logout" onClick={handleLogout} title="Sign Out">
            <span className="sidebar__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}

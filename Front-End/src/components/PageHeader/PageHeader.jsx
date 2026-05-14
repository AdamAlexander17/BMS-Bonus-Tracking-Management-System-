import './PageHeader.css';

/**
 * Reusable page header card used across all modules (Dashboard, Users, Roles, etc.)
 * Provides a consistent transparent + bordered header with:
 *   - Icon
 *   - Title + subtitle
 *   - Right-side actions slot
 */
export default function PageHeader({ icon, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-header__left">
        {icon && <div className="page-header__icon">{icon}</div>}
        <div>
          <h2 className="page-header__title">{title}</h2>
          {subtitle && <p className="page-header__sub">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

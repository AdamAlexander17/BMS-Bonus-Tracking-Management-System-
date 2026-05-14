import PageHeader from '../components/PageHeader/PageHeader';
import './Users.css';

export default function Reports() {
  return (
    <div className="um">
      <PageHeader
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        }
        title="Reports"
        subtitle="View bonus calculation and performance reports"
      />
      <div className="um__card">
        <div className="um__empty" style={{ padding: 64 }}>
          <p>Reports module coming soon.</p>
        </div>
      </div>
    </div>
  );
}

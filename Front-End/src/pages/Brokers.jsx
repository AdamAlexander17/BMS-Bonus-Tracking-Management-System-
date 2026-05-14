import PageHeader from '../components/PageHeader/PageHeader';
import './Users.css';

export default function Brokers() {
  return (
    <div className="um">
      <PageHeader
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="16"/>
            <line x1="10" y1="14" x2="14" y2="14"/>
          </svg>
        }
        title="Broker Management"
        subtitle="Manage brokers and their client portfolios"
      />
      <div className="um__card">
        <div className="um__empty" style={{ padding: 64 }}>
          <p>Broker module coming soon.</p>
        </div>
      </div>
    </div>
  );
}

import PageHeader from '../components/PageHeader/PageHeader';
import './Dashboard.css';

const BAR_DATA = [
  { day: 'Mon', h: 55 }, { day: 'Tue', h: 65 }, { day: 'Wed', h: 60 },
  { day: 'Thu', h: 62 }, { day: 'Fri', h: 85 }, { day: 'Sat', h: 90 }, { day: 'Sun', h: 88 },
];

const RECENT = [
  { icon: '📋', text: 'New broker registered', time: '2 min ago', color: '#3b82f6' },
  { icon: '👤', text: 'User account updated',  time: '15 min ago', color: '#10b981' },
  { icon: '🛡', text: 'Role permissions changed', time: '1 hr ago', color: '#f59e0b' },
  { icon: '🏷', text: 'New brand added',        time: '3 hrs ago', color: '#8b5cf6' },
];

export default function Dashboard() {
  return (
    <div className="dashboard">
      <PageHeader
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
          </svg>
        }
        title="Dashboard Overview"
        subtitle="Welcome back, here's what's happening today"
      />

      {/* Stat cards */}
      <div className="dashboard__stats">
        <div className="stat-card">
          <div className="stat-card__left">
            <p className="stat-card__label">Total Brokers</p>
            <h3 className="stat-card__value">1,247</h3>
            <span className="stat-card__change stat-card__change--up">↑ +12.5%</span>
          </div>
          <div className="stat-card__icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__left">
            <p className="stat-card__label">Active Users</p>
            <h3 className="stat-card__value">3,892</h3>
            <span className="stat-card__change stat-card__change--up">↑ +8.2%</span>
          </div>
          <div className="stat-card__icon" style={{ background: '#f0fdf4', color: '#10b981' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__left">
            <p className="stat-card__label">Total Brands</p>
            <h3 className="stat-card__value">156</h3>
            <span className="stat-card__change stat-card__change--down">↓ -2.1%</span>
          </div>
          <div className="stat-card__icon" style={{ background: '#faf5ff', color: '#8b5cf6' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__left">
            <p className="stat-card__label">System Health</p>
            <h3 className="stat-card__value">98.5%</h3>
            <span className="stat-card__change stat-card__change--up" style={{ color: '#10b981' }}>● All systems operational</span>
          </div>
          <div className="stat-card__icon" style={{ background: '#fff7ed', color: '#f59e0b' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="dashboard__charts">
        {/* Bar chart */}
        <div className="chart-card">
          <div className="chart-card__header">
            <h4>User Activity</h4>
            <select className="chart-card__select">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
            </select>
          </div>
          <div className="bar-chart">
            {BAR_DATA.map(({ day, h }) => (
              <div className="bar-chart__col" key={day}>
                <div
                  className="bar-chart__bar"
                  style={{ height: `${h}%` }}
                />
                <span className="bar-chart__label">{day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Line chart */}
        <div className="chart-card">
          <div className="chart-card__header">
            <h4>System Performance</h4>
            <div className="chart-legend">
              <span className="legend-dot" style={{ background: '#1e3a5f' }}></span><span>CPU</span>
              <span className="legend-dot" style={{ background: '#93c5fd' }}></span><span>Memory</span>
            </div>
          </div>
          <svg className="line-chart" viewBox="0 0 300 120" preserveAspectRatio="none">
            <polyline fill="none" stroke="#1e3a5f" strokeWidth="2.5"
              points="0,60 50,50 100,55 150,35 200,45 250,48 300,46" />
            <polyline fill="none" stroke="#93c5fd" strokeWidth="2.5"
              points="0,80 50,72 100,75 150,58 200,65 250,68 300,65" />
          </svg>
        </div>
      </div>

      {/* Bottom row */}
      <div className="dashboard__bottom">
        {/* Recent Activity */}
        <div className="activity-card">
          <div className="activity-card__header">
            <h4>Recent Activity</h4>
            <button className="link-btn">View All</button>
          </div>
          <ul className="activity-list">
            {RECENT.map((item, i) => (
              <li className="activity-item" key={i}>
                <div className="activity-item__dot" style={{ background: item.color }}></div>
                <div className="activity-item__body">
                  <span>{item.text}</span>
                  <span className="activity-item__time">{item.time}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick Actions */}
        <div className="activity-card">
          <div className="activity-card__header">
            <h4>Quick Actions</h4>
          </div>
          <div className="quick-actions">
            <button className="quick-btn" style={{ '--c': '#3b82f6' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              Add User
            </button>
            <button className="quick-btn" style={{ '--c': '#10b981' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
              New Broker
            </button>
            <button className="quick-btn" style={{ '--c': '#8b5cf6' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>
              Add Brand
            </button>
            <button className="quick-btn" style={{ '--c': '#f59e0b' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              View Reports
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

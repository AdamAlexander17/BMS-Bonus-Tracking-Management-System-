import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader/PageHeader';
import { getRmJrmUsers } from '../api/users';
import './Users.css';

export const formatINR = (val) => {
  const n = Number(val);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
};

const BrokerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="12" y1="12" x2="12" y2="16"/>
    <line x1="10" y1="14" x2="14" y2="14"/>
  </svg>
);

export default function Brokers() {
  const navigate = useNavigate();
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getRmJrmUsers();
      setUsers(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const allBrands = [...new Set(users.map(u => u.brand).filter(Boolean))].sort();

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch =
      u.username.toLowerCase().includes(q) ||
      (u.roles || []).some(r => r.toLowerCase().includes(q)) ||
      (u.brand || '').toLowerCase().includes(q);
    const matchRole   = roleFilter   === 'all' || (u.roles || []).includes(roleFilter);
    const matchStatus = statusFilter === 'all' || u.status === statusFilter;
    const matchBrand  = brandFilter  === 'all' || u.brand === brandFilter;
    return matchSearch && matchRole && matchStatus && matchBrand;
  });

  const formatDate = (str) => {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="um">
      <PageHeader
        icon={<BrokerIcon />}
        title="Broker Management"
        subtitle={`${users.length} broker${users.length !== 1 ? 's' : ''} • Relationship Managers & Junior Relationship Managers`}
        actions={
          <>
            <select
              className="um__select"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              <option value="RM">RM</option>
              <option value="JRM">JRM</option>
            </select>
            <select
              className="um__select"
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
            >
              <option value="all">All Brands</option>
              {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select
              className="um__select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <button className="ph-btn ph-btn--ghost" onClick={fetchAll}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Refresh
            </button>
          </>
        }
      />

      <div className="um__card">
        <div className="um__toolbar">
          <div className="um__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              placeholder="Search by name, role or brand"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="um__entries">
            Show <select defaultValue="10"><option>10</option><option>25</option><option>50</option></select> entries
          </div>
        </div>

        {loading && <div className="um__loading">Loading...</div>}
        {error   && <div className="um__error">{error}</div>}

        {!loading && !error && (
          <table className="um__table">
            <thead>
              <tr>
                <th>USER</th>
                <th>BRANDS</th>
                <th>ROLE</th>
                <th>BROKER MANAGED</th>
                <th>STATUS</th>
                <th>CREATED ↓</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="6" className="um__empty">No RM / JRM users found.</td></tr>
              ) : filtered.map(u => (
                <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/brokers/rm/${u.id}`)}>
                  <td>
                    <div className="um__user-cell">
                      <div className="um__avatar">{u.username[0]?.toUpperCase() || 'U'}</div>
                      <div>
                        <div className="um__username">{u.username}</div>
                        <div className="um__handle">by {u.created_by || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {u.brand
                      ? <span className="um__role-badge" style={{ marginRight: 4 }}>{u.brand}</span>
                      : <span className="um__handle">—</span>
                    }
                  </td>
                  <td>
                    <span
                      className="um__role-badge"
                      style={{ background: (u.roles || []).includes('RM') ? '#dbeafe' : '#fef3c7', color: (u.roles || []).includes('RM') ? '#1d4ed8' : '#92400e' }}
                    >
                      {(u.roles || []).join('/')}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{u.broker_count ?? 0}</span>
                  </td>
                  <td>
                    <span className={`um__status-badge ${u.status === 'Active' ? 'um__status-badge--active' : 'um__status-badge--inactive'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td>
                    <span className="um__date">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                        <rect x="3" y="4" width="18" height="18" rx="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      {formatDate(u.created_at)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

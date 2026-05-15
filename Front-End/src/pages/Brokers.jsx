import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader/PageHeader';
import {
  getBrokers, createBroker, updateBroker, deleteBroker,
} from '../api/brokers';
import { getBrands } from '../api/brands';
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
  const [brokers, setBrokers]       = useState([]);
  const [brands, setBrands]         = useState([]);
  const [rmUsers, setRmUsers]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd]       = useState(false);
  const [editBroker, setEditBroker] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [brokersRes, brandsRes] = await Promise.all([getBrokers(), getBrands()]);
      setBrokers(brokersRes.data.data || []);
      setBrands(brandsRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load brokers.');
    } finally {
      setLoading(false);
    }
    // Fetch RM/JRM users independently so their failure never blocks the main table
    try {
      const rmRes = await getRmJrmUsers();
      setRmUsers(rmRes.data.data || []);
    } catch {
      setRmUsers([]);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleToggleStatus = async (b) => {
    const newStatus = b.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await updateBroker(b.id, { status: newStatus });
      setBrokers(prev => prev.map(x => x.id === b.id ? { ...x, status: newStatus } : x));
    } catch (err) {
      alert(err.response?.data?.message || 'Update failed.');
    }
  };

  const handleDelete = async (broker) => {
    if (!window.confirm(`Delete broker "${broker.name}" (${broker.arc_id})?`)) return;
    try {
      await deleteBroker(broker.id);
      setBrokers(prev => prev.filter(b => b.id !== broker.id));
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed.');
    }
  };

  const filtered = brokers.filter(b => {
    const q = search.toLowerCase();
    const matchSearch =
      b.name.toLowerCase().includes(q) ||
      b.arc_id.toLowerCase().includes(q) ||
      (b.brand?.name || '').toLowerCase().includes(q);
    const matchBrand  = brandFilter  === 'all' || b.brand?.name === brandFilter;
    const matchStatus = statusFilter === 'all' || b.status      === statusFilter;
    return matchSearch && matchBrand && matchStatus;
  });

  const formatDate = (str) => {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatMoney = (val) => {
    const n = Number(val);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  return (
    <div className="um">
      <PageHeader
        icon={<BrokerIcon />}
        title="Broker Management"
        subtitle={`${brokers.length} broker${brokers.length !== 1 ? 's' : ''} • Manage brokers and their client portfolios`}
        actions={
          <>
            <select
              className="um__select"
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
            >
              <option value="all">All Brands</option>
              {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
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
            <button className="ph-btn ph-btn--primary" onClick={() => setShowAdd(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Broker
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
              placeholder="Search brokers by name, ARC ID or brand"
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
                <th>BROKER</th>
                <th>ARC ID</th>
                <th>BRAND</th>
                <th>RM / JRM</th>
                <th>CLIENTS</th>
                <th>EARNED</th>
                <th>STATUS</th>
                <th>CREATED ↓</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="8" className="um__empty">No brokers found.</td></tr>
              ) : filtered.map(b => (
                <tr key={b.id}>
                  <td>
                    <div className="um__user-cell">
                      <div className="um__avatar">{b.name[0]?.toUpperCase() || 'B'}</div>
                      <div>
                        <div className="um__username">{b.name}</div>
                        <div className="um__handle">by {b.created_by || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td><code className="um__handle">{b.arc_id}</code></td>
                  <td><span className="um__role-badge">{b.brand?.name || '—'}</span></td>
                  <td>
                    {b.rm_user ? (
                      <div className="um__user-cell" style={{ gap: 6 }}>
                        <div className="um__avatar" style={{ width: 26, height: 26, fontSize: 11 }}>
                          {b.rm_user.username[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="um__username" style={{ fontSize: 13 }}>{b.rm_user.username}</div>
                          <div className="um__handle">{b.rm_user.role}</div>
                        </div>
                      </div>
                    ) : <span className="um__handle">—</span>}
                  </td>
                  <td>{b.client_count ?? 0}</td>
                  <td>{formatMoney(b.amount_earned)}</td>
                  <td>
                    <button
                      className={`um__toggle ${b.status === 'Active' ? 'um__toggle--on' : ''}`}
                      onClick={() => handleToggleStatus(b)}
                      title={b.status}
                    >
                      <span className="um__toggle-thumb" />
                    </button>
                  </td>
                  <td>
                    <span className="um__date">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                        <rect x="3" y="4" width="18" height="18" rx="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      {formatDate(b.created_at)}
                    </span>
                  </td>
                  <td>
                    <div className="um__actions">
                      <button className="um__action-btn um__action-btn--edit" title="Edit" onClick={() => setEditBroker(b)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        className="um__action-btn um__action-btn--delete"
                        title="Delete"
                        onClick={() => handleDelete(b)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14H6L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
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

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader/PageHeader';
import CustomSelect from '../components/CustomSelect/CustomSelect';
import { getRmJrmUsers } from '../api/users';
import './Users.css';

const sortButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: 0,
  border: 'none',
  background: 'none',
  color: 'inherit',
  font: 'inherit',
  letterSpacing: 'inherit',
  textTransform: 'inherit',
  cursor: 'pointer',
};

function compareValues(left, right, direction) {
  const leftEmpty = left === null || left === undefined || left === '';
  const rightEmpty = right === null || right === undefined || right === '';

  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  if (typeof left === 'string' && typeof right === 'string') {
    const result = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? result : -result;
  }

  if (left < right) return direction === 'asc' ? -1 : 1;
  if (left > right) return direction === 'asc' ? 1 : -1;
  return 0;
}

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
  const [pageSize, setPageSize]        = useState(10);
  const [page, setPage]                = useState(1);
  const [sortConfig, setSortConfig]    = useState({ key: 'created_at', direction: 'desc' });

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

  const availableRoles = [...new Set(users.flatMap(u => u.roles || []).filter(Boolean))].sort();
  const allBrands = [...new Set(users.map(u => u.brand).filter(Boolean))].sort();

  useEffect(() => {
    if (roleFilter !== 'all' && !availableRoles.includes(roleFilter)) {
      setRoleFilter('all');
      setPage(1);
    }
  }, [availableRoles, roleFilter]);

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

  const sorted = useMemo(() => {
    const getSortValue = (user, key) => {
      switch (key) {
        case 'username':
          return user.username || '';
        case 'brand':
          return user.brand || '';
        case 'role':
          return (user.roles || []).join('/');
        case 'broker_count':
          return Number(user.broker_count ?? 0);
        case 'status':
          return user.status || '';
        case 'created_at':
          return user.created_at ? new Date(user.created_at).getTime() : null;
        default:
          return '';
      }
    };

    return [...filtered].sort((left, right) => (
      compareValues(
        getSortValue(left, sortConfig.key),
        getSortValue(right, sortConfig.key),
        sortConfig.direction,
      )
    ));
  }, [filtered, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged      = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key) => {
    setSortConfig((current) => (
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'created_at' ? 'desc' : 'asc' }
    ));
    setPage(1);
  };

  const getSortIndicator = (key) => (sortConfig.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕');

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
            <CustomSelect
              value={roleFilter}
              onChange={(value) => { setRoleFilter(value); setPage(1); }}
              placeholder="All Roles"
              options={availableRoles.map(role => ({ value: role, label: role }))}
            />
            <CustomSelect
              value={brandFilter}
              onChange={setBrandFilter}
              placeholder="All Brands"
              options={allBrands.map(b => ({ value: b, label: b }))}
            />
            <CustomSelect
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="All Status"
              options={[
                { value: 'Active',   label: 'Active'   },
                { value: 'Inactive', label: 'Inactive' },
              ]}
            />
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
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="um__entries">
            Show <CustomSelect
              variant="form"
              value={String(pageSize)}
              onChange={v => { setPageSize(Number(v)); setPage(1); }}
              options={[{value:'10',label:'10'},{value:'25',label:'25'},{value:'50',label:'50'}]}
            /> entries
          </div>
        </div>

        {loading && <div className="um__loading">Loading...</div>}
        {error   && <div className="um__error">{error}</div>}

        {!loading && !error && (
          <table className="um__table">
            <colgroup>
              <col style={{ width: '24%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '12%' }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('username')}>USER <span>{getSortIndicator('username')}</span></button></th>
                <th style={{ textAlign: 'center' }}><button type="button" style={sortButtonStyle} onClick={() => handleSort('brand')}>BRANDS <span>{getSortIndicator('brand')}</span></button></th>
                <th style={{ textAlign: 'center' }}><button type="button" style={sortButtonStyle} onClick={() => handleSort('role')}>ROLE <span>{getSortIndicator('role')}</span></button></th>
                <th style={{ textAlign: 'center' }}><button type="button" style={sortButtonStyle} onClick={() => handleSort('broker_count')}>BROKER MANAGED <span>{getSortIndicator('broker_count')}</span></button></th>
                <th style={{ textAlign: 'center' }}><button type="button" style={sortButtonStyle} onClick={() => handleSort('status')}>STATUS <span>{getSortIndicator('status')}</span></button></th>
                <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('created_at')}>CREATED <span>{getSortIndicator('created_at')}</span></button></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="6" className="um__empty">No RM / JRM users found.</td></tr>
              ) : paged.map(u => (
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
                  <td style={{ textAlign: 'center' }}>
                    {u.brand
                      ? <span className="um__role-badge bk__chip--brand">{u.brand}</span>
                      : <span className="um__handle">—</span>
                    }
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="um__role-badge bk__chip--role">
                      {(u.roles || []).join('/')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{u.broker_count ?? 0}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
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
        {!loading && !error && (
          <div className="um__footer">
            <span className="um__footer-info">
              {sorted.length === 0
                ? 'No results'
                : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, sorted.length)} of ${sorted.length}`}
            </span>
            <div className="um__footer-nav">
              <button className="ph-btn ph-btn--ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span className="um__footer-page">{page} / {totalPages}</span>
              <button className="ph-btn ph-btn--ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

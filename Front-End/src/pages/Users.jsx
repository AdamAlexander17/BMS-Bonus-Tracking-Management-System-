import { useEffect, useState } from 'react';
import { getUsers, deleteUser, updateUser } from '../api/users';
import { getRoles } from '../api/roles';
import PageHeader from '../components/PageHeader/PageHeader';
import './Users.css';

export default function Users() {
  const [users, setUsers]       = useState([]);
  const [roles, setRoles]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showAdd, setShowAdd]   = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([getUsers(), getRoles()]);
      setUsers(usersRes.data.data);
      setRoles(rolesRes.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleToggleStatus = async (u) => {
    const newStatus = u.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await updateUser(u.id, { status: newStatus });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: newStatus } : x));
    } catch (err) {
      alert(err.response?.data?.message || 'Update failed.');
    }
  };

  const handleDelete = async (id, username) => {
    if (!window.confirm(`Delete user "${username}"?`)) return;
    try {
      await deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed.');
    }
  };

  const filtered = users.filter(u => {
    const matchSearch = u.username.toLowerCase().includes(search.toLowerCase());
    const matchRole   = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const formatDate = (str) => {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="um">
      <PageHeader
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        }
        title="User Management"
        subtitle={`${users.length} user${users.length !== 1 ? 's' : ''} • Manage roles and permissions`}
        actions={
          <>
            <select
              className="um__select"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
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
              Add User
            </button>
          </>
        }
      />

      {/* Table card */}
      <div className="um__card">
        {/* Search + show entries */}
        <div className="um__toolbar">
          <div className="um__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              placeholder="Search users by name or role"
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
                <th>ROLES</th>
                <th>STATUS</th>
                <th>CREATED ↓</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="6" className="um__empty">No users found.</td></tr>
              ) : filtered.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="um__user-cell">
                      <div className="um__avatar">{u.username[0].toUpperCase()}</div>
                      <div>
                        <div className="um__username">{u.username}</div>
                        <div className="um__handle">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="um__brands">{u.brands?.join(', ') || '—'}</td>
                  <td><span className="um__role-badge">{u.role}</span></td>
                  <td>
                    <button
                      className={`um__toggle ${u.status === 'Active' ? 'um__toggle--on' : ''}`}
                      onClick={() => handleToggleStatus(u)}
                      title={u.status}
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
                      {formatDate(u.created_at)}
                    </span>
                  </td>
                  <td>
                    <div className="um__actions">
                      <button className="um__action-btn um__action-btn--edit" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        className="um__action-btn um__action-btn--delete"
                        title="Delete"
                        onClick={() => handleDelete(u.id, u.username)}
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

      {/* Add User Modal placeholder */}
      {showAdd && (
        <div className="um__modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="um__modal" onClick={e => e.stopPropagation()}>
            <div className="um__modal-header">
              <h3>Add User</h3>
              <button className="um__modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <AddUserForm roles={roles} onSuccess={() => { setShowAdd(false); fetchAll(); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function AddUserForm({ roles, onSuccess }) {
  const [form, setForm]     = useState({ username: '', password: '', role: '', brands: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const brands = form.brands ? form.brands.split(',').map(b => b.trim()).filter(Boolean) : [];
      const { createUser } = await import('../api/users');
      await createUser({ username: form.username, password: form.password, role: form.role, brands });
      onSuccess();
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="um__form" onSubmit={handleSubmit}>
      {err && <div className="um__form-error">{err}</div>}
      <div className="um__form-group">
        <label>Username</label>
        <input required placeholder="e.g. john" value={form.username} onChange={e => setForm(p => ({...p, username: e.target.value}))} />
      </div>
      <div className="um__form-group">
        <label>Password</label>
        <input required type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} />
      </div>
      <div className="um__form-group">
        <label>Role</label>
        <select required value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}>
          <option value="">Select role</option>
          {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
        </select>
      </div>
      <div className="um__form-group">
        <label>Brands <span style={{color:'#8a94a6',fontWeight:400}}>(comma-separated)</span></label>
        <input placeholder="e.g. TK, TB" value={form.brands} onChange={e => setForm(p => ({...p, brands: e.target.value}))} />
      </div>
      <button type="submit" className="um__form-submit" disabled={saving}>
        {saving ? 'Creating...' : 'Create User'}
      </button>
    </form>
  );
}




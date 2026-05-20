import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUsers, deleteUser, updateUser, bulkUploadUsers } from '../api/users';

function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
      }}>
        <div style={{ padding: '28px 24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" width="22" height="22">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#111827' }}>{title}</h3>
              <p style={{ margin: 0, fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{message}</p>
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 10,
          padding: '16px 24px', borderTop: '1px solid #f1f5f9',
        }}>
          <button className="ph-btn ph-btn--ghost" onClick={onCancel}>No, Keep It</button>
          <button
            style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            onClick={onConfirm}
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  );
}
import { getRoles } from '../api/roles';
import PageHeader from '../components/PageHeader/PageHeader';
import CustomSelect from '../components/CustomSelect/CustomSelect';
import './Users.css';

export default function Users() {
  const { user } = useAuth();
  const hasPerm    = (key) => !user?.permissions || user.permissions.includes(key);
  const canCreate  = hasPerm('user:create');
  const canUpdate  = hasPerm('user:update');
  const canDelete  = hasPerm('user:delete');
  const canActions = canUpdate || canDelete;

  const [users, setUsers]         = useState([]);
  const [roles, setRoles]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showAdd, setShowAdd]             = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [editUser, setEditUser]           = useState(null);
  const [confirmState, setConfirmState] = useState(null);

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

  const handleDelete = (id, username) => {
    setConfirmState({
      title: 'Delete User',
      message: `You are about to permanently delete "${username}" and all their data. This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteUser(id);
          setUsers(prev => prev.filter(u => u.id !== id));
        } catch (err) {
          alert(err.response?.data?.message || 'Delete failed.');
        }
      },
    });
  };

  const filtered = users.filter(u => {
    const matchSearch = u.username.toLowerCase().includes(search.toLowerCase());
    const matchRole   = roleFilter === 'all' || (u.roles || []).includes(roleFilter);
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
            <CustomSelect
              value={roleFilter}
              onChange={setRoleFilter}
              options={roles.map(r => ({ value: r.name, label: r.name }))}
            />
            <button className="ph-btn ph-btn--ghost" onClick={fetchAll}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Refresh
            </button>
            {canCreate && (
              <button className="ph-btn ph-btn--ghost" onClick={() => setShowBulkUpload(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Bulk Upload
              </button>
            )}
            {canCreate && (
              <button className="ph-btn ph-btn--primary" onClick={() => setShowAdd(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add User
              </button>
            )}
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
            <colgroup>
              <col style={{ width: '25%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col />
              {canActions && <col style={{ width: '13%' }} />}
            </colgroup>
            <thead>
              <tr>
                <th>USER</th>
                <th>BRAND</th>
                <th>ROLES</th>
                <th>STATUS</th>
                <th>CREATED ↓</th>
                {canActions && <th style={{ textAlign: 'right' }}>ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={canActions ? 6 : 5} className="um__empty">No users found.</td></tr>
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
                  <td className="um__brands">{u.brand || '—'}</td>
                  <td>
                    <div className="um__role-badges">
                      {(u.roles || []).length === 0
                        ? <span className="um__role-badge">—</span>
                        : (u.roles || []).map(r => (
                            <span key={r} className="um__role-badge">{r}</span>
                          ))}
                    </div>
                  </td>
                  <td>
                    {canUpdate ? (
                      <button
                        className={`um__toggle ${u.status === 'Active' ? 'um__toggle--on' : ''}`}
                        onClick={() => handleToggleStatus(u)}
                        title={u.status}
                      >
                        <span className="um__toggle-thumb" />
                      </button>
                    ) : (
                      <span className={`um__status-badge ${u.status === 'Active' ? 'um__status-badge--active' : 'um__status-badge--inactive'}`}>
                        {u.status}
                      </span>
                    )}
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
                  {canActions && (
                    <td style={{ textAlign: 'right' }}>
                      <div className="um__actions" style={{ justifyContent: 'flex-end' }}>
                        {canUpdate && (
                          <button className="um__action-btn um__action-btn--edit" title="Edit" onClick={() => setEditUser(u)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                        )}
                        {canDelete && (
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
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <BulkUploadModal
          onClose={() => setShowBulkUpload(false)}
          onSuccess={() => { setShowBulkUpload(false); fetchAll(); }}
        />
      )}

      {/* Add User Modal */}
      {showAdd && (
        <div className="um__modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="um__modal um__modal--wide" onClick={e => e.stopPropagation()}>
            <div className="um__modal-header um__modal-header--teal">
              <div>
                <h3>Add User</h3>
                <p className="um__modal-subtitle">Fill in the details to create a new user account</p>
              </div>
              <button className="um__modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <AddUserForm roles={roles} onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); fetchAll(); }} />
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="um__modal-overlay" onClick={() => setEditUser(null)}>
          <div className="um__modal um__modal--wide" onClick={e => e.stopPropagation()}>
            <div className="um__modal-header um__modal-header--teal">
              <div>
                <h3>Edit User</h3>
                <p className="um__modal-subtitle">Update user details and assign roles</p>
              </div>
              <button className="um__modal-close" onClick={() => setEditUser(null)}>✕</button>
            </div>
            <EditUserForm
              user={editUser}
              roles={roles}
              onClose={() => setEditUser(null)}
              onSuccess={() => { setEditUser(null); fetchAll(); }}
            />
          </div>
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

function AddUserForm({ roles, onClose, onSuccess }) {
  const [form, setForm]       = useState({ username: '', password: '', brand: '', roleNames: [] });
  const [brands, setBrands]   = useState([]);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  useEffect(() => {
    import('../api/brands').then(m => {
      m.getBrands().then(res => setBrands(res.data.data || []));
    });
  }, []);

  const selectRole = (name) =>
    setForm(p => ({ ...p, roleNames: [name] }));

  // Roles are global — show all available role names.
  const availableRoleNames = Array.from(new Set(roles.map(r => r.name)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.brand)              { setErr('Please select a brand.'); return; }
    if (form.roleNames.length === 0) { setErr('Please select a role.'); return; }
    setSaving(true); setErr('');
    try {
      const { createUser } = await import('../api/users');
      await createUser({
        username: form.username,
        password: form.password,
        brand:    form.brand,
        roles:    form.roleNames,
      });
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
      <div className="um__form-row">
        <div className="um__form-group">
          <label>Username <span className="um__required">*</span></label>
          <input required placeholder=" Name " value={form.username} onChange={e => setForm(p => ({...p, username: e.target.value}))} />
        </div>
        <div className="um__form-group">
          <label>Password <span className="um__required">*</span></label>
          <input required type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} />
        </div>
      </div>

      <div className="um__form-group">
        <label>Brand <span className="um__required">*</span></label>
        <CustomSelect
          options={brands.map(b => ({ value: b.name, label: b.name }))}
          value={form.brand}
          onChange={val => setForm(p => ({ ...p, brand: val }))}
          placeholder="— Select a brand —"
        />
      </div>

      <div className="um__form-section">Role <span className="um__required">*</span></div>
      <div className="um__role-pills">
        {availableRoleNames.length === 0 && (
          <span className="um__label-hint">No roles available. Create one from the Roles page.</span>
        )}
        {availableRoleNames.map(name => (
          <button
            key={name}
            type="button"
            className={`um__role-pill${form.roleNames.includes(name) ? ' um__role-pill--active' : ''}`}
            onClick={() => selectRole(name)}
          >
            {form.roleNames.includes(name) && <span className="um__pill-check">✓</span>}
            {name}
          </button>
        ))}
      </div>

      <div className="um__form-footer">
        <button type="button" className="um__btn-cancel" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="um__btn-save" disabled={saving}>
          {saving ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function EditUserForm({ user, roles, onClose, onSuccess }) {
  const [form, setForm]       = useState({
    username:  user.username || '',
    brand:     user.brand || '',
    roleNames: (user.roles || []).slice(0, 1),
    password:  '',
    isActive:  user.status === 'Active',
  });
  const [brands, setBrands]   = useState([]);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    import('../api/brands').then(m => {
      m.getBrands().then(res => setBrands(res.data.data || []));
    });
  }, []);

  const selectRole = (name) =>
    setForm(p => ({ ...p, roleNames: [name] }));

  const availableRoleNames = Array.from(new Set(roles.map(r => r.name)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.brand)                 { setErr('Please select a brand.'); return; }
    if (form.roleNames.length === 0) { setErr('Please select a role.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        username: form.username,
        brand:    form.brand,
        roles:    form.roleNames,
        status:   form.isActive ? 'Active' : 'Inactive',
      };
      if (form.password) payload.password = form.password;
      await updateUser(user.id, payload);
      onSuccess();
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="um__form" onSubmit={handleSubmit}>
      {err && <div className="um__form-error">{err}</div>}

      <div className="um__form-section">Basic Information</div>

      <div className="um__form-row">
        <div className="um__form-group">
          <label>Username <span className="um__required">*</span></label>
          <input
            required
            placeholder=" Name "
            value={form.username}
            onChange={e => setForm(p => ({...p, username: e.target.value}))}
          />
        </div>
        <div className="um__form-group">
          <label>Brand <span className="um__required">*</span></label>
          <CustomSelect
            options={brands.map(b => ({ value: b.name, label: b.name }))}
            value={form.brand}
            onChange={val => setForm(p => ({ ...p, brand: val }))}
            placeholder="— Select a brand —"
          />
        </div>
      </div>

      <div className="um__form-group">
        <label>Password <span className="um__label-hint">(leave blank to keep current)</span></label>
        <div className="um__pwd-wrap">
          <input
            type={showPwd ? 'text' : 'password'}
            placeholder="••••••••"
            value={form.password}
            onChange={e => setForm(p => ({...p, password: e.target.value}))}
          />
          <button type="button" className="um__pwd-eye" onClick={() => setShowPwd(v => !v)}>
            {showPwd ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      <div className="um__form-section">Role <span className="um__required">*</span></div>

      <div className="um__role-pills">
        {availableRoleNames.length === 0 && (
          <span className="um__label-hint">No roles available.</span>
        )}
        {availableRoleNames.map(name => (
          <button
            key={name}
            type="button"
            className={`um__role-pill${form.roleNames.includes(name) ? ' um__role-pill--active' : ''}`}
            onClick={() => selectRole(name)}
          >
            {form.roleNames.includes(name) && <span className="um__pill-check">✓</span>}
            {name}
          </button>
        ))}
      </div>

      <label className="um__checkbox-row">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={e => setForm(p => ({...p, isActive: e.target.checked}))}
        />
        User is active
      </label>

      <div className="um__form-footer">
        <button type="button" className="um__btn-cancel" onClick={onClose}>Cancel</button>
        <button type="submit" className="um__btn-save" disabled={saving}>
          {saving ? 'Saving...' : 'Update User'}
        </button>
      </div>
    </form>
  );
}

function BulkUploadModal({ onClose, onSuccess }) {
  const [file, setFile]       = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]   = useState(null); // { created, failed, message }
  const [err, setErr]         = useState('');

  const downloadTemplate = () => {
    const csv = 'username,password,brand,role\njohn_doe,Pass123!,BrandA,RM\njane_doe,Pass456!,BrandB,JRM\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'users_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setErr('Please select a CSV file.'); return; }
    setErr(''); setResult(null); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await bulkUploadUsers(fd);
      setResult(res.data);
      if (res.data.created > 0) onSuccess();
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: '#004B4E',
          padding: '22px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>Bulk Upload Users</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
              Upload a CSV file to create multiple users at once
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Format guide */}
          <div style={{
            background: '#e0f5f5', border: '1px solid #b2dfdf', borderRadius: 10,
            padding: '14px 16px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#004B4E' }}>Required CSV Format</span>
              <button
                type="button"
                onClick={downloadTemplate}
                style={{
                  background: '#004B4E', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download Template
              </button>
            </div>
            <code style={{
              display: 'block', fontSize: 12, color: '#004B4E',
              background: 'rgba(0,75,78,0.08)', borderRadius: 6, padding: '8px 12px', lineHeight: 1.7,
            }}>
              username, password, brand, role<br/>
              john_doe, Pass123!, BrandA, RM<br/>
              jane_doe, Pass456!, BrandB, JRM
            </code>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#006467' }}>
              Max 500 rows per file. Brand and role names must match exactly.
            </p>
          </div>

          {/* File input */}
          <form onSubmit={handleSubmit}>
            {err && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626',
              }}>{err}</div>
            )}

            <div style={{
              border: `2px dashed ${file ? '#004B4E' : '#e2e8f0'}`,
              borderRadius: 10, padding: '28px 20px',
              textAlign: 'center', marginBottom: 16, cursor: 'pointer',
              background: file ? '#e0f5f5' : '#fafafa',
              transition: 'all 0.2s',
            }}
              onClick={() => document.getElementById('bulk-csv-input').click()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke={file ? '#004B4E' : '#94a3b8'} strokeWidth="1.8" width="36" height="36" style={{ margin: '0 auto 10px', display: 'block' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
              {file
                ? <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#004B4E' }}>{file.name}</p>
                : <>
                    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Click to select CSV file</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Only .csv files accepted</p>
                  </>
              }
              <input
                id="bulk-csv-input"
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={e => { setFile(e.target.files[0] || null); setResult(null); setErr(''); }}
              />
            </div>

            {/* Result */}
            {result && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  background: result.created > 0 ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${result.created > 0 ? '#bbf7d0' : '#fecaca'}`,
                  borderRadius: 8, padding: '10px 14px', fontSize: 13,
                  color: result.created > 0 ? '#166534' : '#dc2626', fontWeight: 600,
                  marginBottom: result.failed?.length ? 10 : 0,
                }}>
                  {result.message}
                </div>
                {result.failed?.length > 0 && (
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #fee2e2', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#fef2f2' }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left', color: '#7f1d1d', fontWeight: 600 }}>Row</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left', color: '#7f1d1d', fontWeight: 600 }}>Username</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left', color: '#7f1d1d', fontWeight: 600 }}>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.failed.map((f, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #fee2e2' }}>
                            <td style={{ padding: '6px 10px', color: '#991b1b' }}>{f.row}</td>
                            <td style={{ padding: '6px 10px', color: '#991b1b' }}>{f.username}</td>
                            <td style={{ padding: '6px 10px', color: '#6b7280' }}>{f.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <button type="button" className="um__btn-cancel" onClick={onClose}>Close</button>
              <button type="submit" className="um__btn-save" disabled={uploading || !file}>
                {uploading ? 'Uploading...' : 'Upload & Create Users'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}




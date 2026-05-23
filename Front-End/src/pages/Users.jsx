import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getUsers, deleteUser, updateUser, bulkUploadUsers } from '../api/users';
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';
import Toast from '../components/Toast/Toast';
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
  const [toast, setToast] = useState(null);
  const [pageSize, setPageSize]         = useState(10);
  const [page, setPage]                 = useState(1);

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
      setToast(err.response?.data?.message || 'Update failed.');
    }
  };

  const handleDelete = (id, username) => {
    setConfirmState({
      title: 'Delete User?',
      itemName: username,
      bullets: ['Account & login access', 'Assigned roles & permissions', 'All activity history'],
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteUser(id);
          setUsers(prev => prev.filter(u => u.id !== id));
        } catch (err) {
          setToast(err.response?.data?.message || 'Delete failed.');
        }
      },
    });
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = u.username.toLowerCase().includes(q)
      || (u.roles || []).some(r => r.toLowerCase().includes(q));
    const matchRole   = roleFilter === 'all' || (u.roles || []).includes(roleFilter);
    return matchSearch && matchRole;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged      = filtered.slice((page - 1) * pageSize, page * pageSize);

  const formatDate = (str) => {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (str) => {
    if (!str) return 'Never';
    return new Date(str).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
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
              onChange={v => { setRoleFilter(v); setPage(1); }}
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
              <col style={{ width: '22%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '15%' }} />
              <col />
              {canActions && <col style={{ width: '12%' }} />}
            </colgroup>
            <thead>
              <tr>
                <th>USER</th>
                <th>BRAND</th>
                <th style={{ textAlign: 'center' }}>ROLES</th>
                <th style={{ textAlign: 'center' }}>STATUS</th>
                <th>LAST LOGIN</th>
                <th>CREATED ↓</th>
                {canActions && <th style={{ textAlign: 'right' }}>ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={canActions ? 7 : 6} className="um__empty">No users found.</td></tr>
              ) : paged.map(u => (                <tr key={u.id}>
                  <td>
                    <div className="um__user-cell">
                      <div className="um__avatar">{u.username[0].toUpperCase()}</div>
                      <div>
                        <div className="um__username">{u.username}</div>
                        <div className="um__handle">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="um__brands">{(u.brands && u.brands.length) ? u.brands.join(', ') : (u.brand || '—')}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="um__role-badges">
                      {(u.roles || []).length === 0
                        ? <span className="um__role-badge">—</span>
                        : (u.roles || []).map(r => (
                            <span key={r} className="um__role-badge">{r}</span>
                          ))}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
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
                    <span className="um__date" title={u.last_login ? new Date(u.last_login).toString() : 'Never logged in'}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      {formatDateTime(u.last_login)}
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
        {!loading && !error && (
          <div className="um__footer">
            <span className="um__footer-info">
              {filtered.length === 0
                ? 'No results'
                : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
            </span>
            <div className="um__footer-nav">
              <button className="ph-btn ph-btn--ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span className="um__footer-page">{page} / {totalPages}</span>
              <button className="ph-btn ph-btn--ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          </div>
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
            <AddUserForm roles={roles} currentUser={user} onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); fetchAll(); }} />
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
              currentUser={user}
              onClose={() => setEditUser(null)}
              onSuccess={() => { setEditUser(null); fetchAll(); }}
            />
          </div>
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          itemName={confirmState.itemName}
          bullets={confirmState.bullets}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function AddUserForm({ roles, currentUser, onClose, onSuccess }) {
  // Backend now scopes /brands/ to the current user's brand set for every role,
  // so we just present whatever the API returns and let the user pick any subset.
  const initialBrandIds = (currentUser?.brand_ids && currentUser.brand_ids.length === 1)
    ? [currentUser.brand_ids[0]]
    : [];
  const [form, setForm]       = useState({
    username: '',
    brandIds: initialBrandIds,
    roleNames: [],
  });
  const [brands, setBrands]   = useState([]);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  useEffect(() => {
    import('../api/brands').then(m => {
      m.getBrands({ scope: 'all' }).then(res => setBrands(res.data.data || []));
    });
  }, []);

  const selectRole = (name) =>
    setForm(p => ({ ...p, roleNames: [name] }));

  const toggleBrand = (id) =>
    setForm(p => ({
      ...p,
      brandIds: p.brandIds.includes(id)
        ? p.brandIds.filter(x => x !== id)
        : [...p.brandIds, id],
    }));

  // Roles are global — show all available role names.
  const availableRoleNames = Array.from(new Set(roles.map(r => r.name)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.brandIds.length === 0) { setErr('Please select at least one brand.'); return; }
    if (form.roleNames.length === 0) { setErr('Please select a role.'); return; }
    setSaving(true); setErr('');
    try {
      const { createUser } = await import('../api/users');
      await createUser({
        username:  form.username,
        brand_ids: form.brandIds,
        roles:     form.roleNames,
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
          <input required maxLength={30} placeholder=" Name " value={form.username} onChange={e => setForm(p => ({...p, username: e.target.value}))} />
        </div>
        <div className="um__form-group">
          <label>Default Password</label>
          <input value="123456" readOnly />
        </div>
      </div>
      <div className="um__label-hint" style={{ marginTop: -4, marginBottom: 8 }}>
        New users are created with password 123456 and must change it on first login.
      </div>

      <div className="um__form-group">
        <label>Brands <span className="um__required">*</span></label>
        <div className="um__role-pills">
          {brands.length === 0 && (
            <span className="um__label-hint">No brands available in your scope.</span>
          )}
          {brands.map(b => (
            <button
              key={b.id}
              type="button"
              className={`um__role-pill${form.brandIds.includes(b.id) ? ' um__role-pill--active' : ''}`}
              onClick={() => toggleBrand(b.id)}
            >
              {form.brandIds.includes(b.id) && <span className="um__pill-check">✓</span>}
              {b.name}
            </button>
          ))}
        </div>
        <div className="um__label-hint" style={{ marginTop: 6 }}>
          The new user will only see data belonging to the selected brand(s).
        </div>
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

function EditUserForm({ user, roles, currentUser, onClose, onSuccess }) {
  const passwordLocked = !user.last_login;
  const [form, setForm]       = useState({
    username:  user.username || '',
    brandIds:  Array.isArray(user.brand_ids) ? [...user.brand_ids] : (user.brand_id ? [user.brand_id] : []),
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
      m.getBrands({ scope: 'all' }).then(res => setBrands(res.data.data || []));
    });
  }, []);

  const selectRole = (name) =>
    setForm(p => ({ ...p, roleNames: [name] }));

  const toggleBrand = (id) =>
    setForm(p => ({
      ...p,
      brandIds: p.brandIds.includes(id)
        ? p.brandIds.filter(x => x !== id)
        : [...p.brandIds, id],
    }));

  const availableRoleNames = Array.from(new Set(roles.map(r => r.name)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.brandIds.length === 0)  { setErr('Please select at least one brand.'); return; }
    if (form.roleNames.length === 0) { setErr('Please select a role.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        username:  form.username,
        brand_ids: form.brandIds,
        roles:     form.roleNames,
        status:    form.isActive ? 'Active' : 'Inactive',
      };
      if (!passwordLocked && form.password) payload.password = form.password;
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
            maxLength={30}
            placeholder=" Name "
            value={form.username}
            onChange={e => setForm(p => ({...p, username: e.target.value}))}
          />
        </div>
      </div>

      <div className="um__form-group">
        <label>Brands <span className="um__required">*</span></label>
        <div className="um__role-pills">
          {brands.length === 0 && (
            <span className="um__label-hint">No brands available in your scope.</span>
          )}
          {brands.map(b => (
            <button
              key={b.id}
              type="button"
              className={`um__role-pill${form.brandIds.includes(b.id) ? ' um__role-pill--active' : ''}`}
              onClick={() => toggleBrand(b.id)}
            >
              {form.brandIds.includes(b.id) && <span className="um__pill-check">✓</span>}
              {b.name}
            </button>
          ))}
        </div>
      </div>

      <div className="um__form-group">
        <label>
          Password{' '}
          <span className="um__label-hint">
            {passwordLocked ? '(disabled until the user logs in once)' : '(leave blank to keep current)'}
          </span>
        </label>
        <div className="um__pwd-wrap">
          <input
            type={showPwd ? 'text' : 'password'}
            placeholder={passwordLocked ? 'Disabled for never-logged-in users' : '••••••••'}
            value={form.password}
            disabled={passwordLocked}
            onChange={e => setForm(p => ({...p, password: e.target.value}))}
          />
          <button type="button" className="um__pwd-eye" disabled={passwordLocked} onClick={() => setShowPwd(v => !v)}>
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
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const T = {
    overlay:          isDark ? 'rgba(0,0,0,0.65)'        : 'rgba(15,23,42,0.5)',
    surface:          isDark ? '#0a1a14'                 : '#fff',
    headerBg:         isDark ? '#0a1a14'                 : '#004B4E',
    headerBorder:     isDark ? '1px solid #1e3a31'       : '1px solid transparent',
    text:             isDark ? '#e7f0ec'                 : '#374151',
    textMuted:        isDark ? '#9ab3aa'                 : '#9ca3af',
    accent:           isDark ? '#4ade80'                 : '#004B4E',
    accentBtnBg:      isDark ? '#4ade80'                 : '#004B4E',
    accentBtnText:    isDark ? '#03110c'                 : '#fff',
    closeBtnBg:       isDark ? 'rgba(255,255,255,0.08)'  : 'rgba(255,255,255,0.15)',
    headerSubText:    isDark ? '#9ab3aa'                 : 'rgba(255,255,255,0.8)',
    headerTitle:      isDark ? '#e7f0ec'                 : '#fff',
    cardBg:           isDark ? '#0f241c'                 : '#e0f5f5',
    cardBorder:       isDark ? '1px solid #1e3a31'       : '1px solid #b2dfdf',
    cardLabel:        isDark ? '#86efac'                 : '#004B4E',
    codeBg:           isDark ? 'rgba(74,222,128,0.10)'   : 'rgba(0,75,78,0.08)',
    codeText:         isDark ? '#d1fae5'                 : '#004B4E',
    captionText:      isDark ? '#86efac'                 : '#006467',
    dropBg:           isDark ? '#0f241c'                 : '#fafafa',
    dropBgActive:     isDark ? 'rgba(74,222,128,0.14)'   : '#e0f5f5',
    dropBorder:       isDark ? '#1e3a31'                 : '#e2e8f0',
    dropBorderActive: isDark ? '#4ade80'                 : '#004B4E',
    dropText:         isDark ? '#e7f0ec'                 : '#374151',
    dropTextMuted:    isDark ? '#6b857c'                 : '#9ca3af',
    fileNameColor:    isDark ? '#4ade80'                 : '#004B4E',
    iconIdle:         isDark ? '#6b857c'                 : '#94a3b8',
    iconActive:       isDark ? '#4ade80'                 : '#004B4E',
    errBg:            isDark ? 'rgba(220,38,38,0.12)'    : '#fef2f2',
    errBorder:        isDark ? 'rgba(220,38,38,0.4)'     : '#fecaca',
    errText:          isDark ? '#fca5a5'                 : '#dc2626',
    successBg:        isDark ? 'rgba(74,222,128,0.12)'   : '#f0fdf4',
    successBorder:    isDark ? 'rgba(74,222,128,0.4)'    : '#bbf7d0',
    successText:      isDark ? '#86efac'                 : '#166534',
    failTableBg:      isDark ? '#0a1a14'                 : '#fff',
    failTableHead:    isDark ? 'rgba(220,38,38,0.15)'    : '#fef2f2',
    failTableBorder:  isDark ? 'rgba(220,38,38,0.35)'    : '#fee2e2',
    failTextHead:     isDark ? '#fca5a5'                 : '#7f1d1d',
    failTextBody:     isDark ? '#fecaca'                 : '#991b1b',
    failTextReason:   isDark ? '#9ab3aa'                 : '#6b7280',
    progressTrack:    isDark ? 'rgba(74,222,128,0.15)'   : '#e2e8f0',
    progressFill:     isDark ? '#4ade80'                 : '#004B4E',
  };

  const CHUNK_SIZE = 100;

  const [file, setFile]       = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]   = useState(null); // { created, failed, message }
  const [err, setErr]         = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0, chunk: 0, totalChunks: 0 });

  const downloadTemplate = () => {
    const csv = 'username,brand,role\njohn_doe,BrandA,RM\njane_doe,BrandB,JRM\n';
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
    setProgress({ done: 0, total: 0, chunk: 0, totalChunks: 0 });

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      // Trim trailing empty lines but keep order
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

      if (lines.length < 2) {
        setErr('CSV must have a header row and at least one data row.');
        setUploading(false);
        return;
      }

      const header = lines[0];
      const dataLines = lines.slice(1).filter(l => l.trim().length > 0);
      const totalChunks = Math.ceil(dataLines.length / CHUNK_SIZE);
      setProgress({ done: 0, total: dataLines.length, chunk: 0, totalChunks });

      let totalCreated = 0;
      const allFailed = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunkRows = dataLines.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunkCsv  = [header, ...chunkRows].join('\n') + '\n';
        const chunkBlob = new Blob([chunkCsv], { type: 'text/csv' });
        const fd = new FormData();
        fd.append('file', new File([chunkBlob], file.name || 'chunk.csv', { type: 'text/csv' }));

        try {
          const res = await bulkUploadUsers(fd);
          totalCreated += res.data?.created || 0;
          if (Array.isArray(res.data?.failed)) {
            const offset = i * CHUNK_SIZE;
            res.data.failed.forEach(f => {
              // Backend numbers rows starting at 2 within each chunk; remap to global file row
              const globalRow = (typeof f.row === 'number') ? f.row + offset : f.row;
              allFailed.push({ ...f, row: globalRow });
            });
          }
        } catch (ex) {
          const reason = ex.response?.data?.message || ex.message || 'chunk upload failed';
          chunkRows.forEach((_, j) => {
            allFailed.push({
              row: i * CHUNK_SIZE + j + 2,
              username: '(unknown)',
              reason,
            });
          });
        }

        setProgress({
          done: Math.min((i + 1) * CHUNK_SIZE, dataLines.length),
          total: dataLines.length,
          chunk: i + 1,
          totalChunks,
        });
      }

      setResult({
        created: totalCreated,
        failed:  allFailed,
        message: `${totalCreated} user(s) created, ${allFailed.length} failed (processed in ${totalChunks} chunk${totalChunks === 1 ? '' : 's'} of up to ${CHUNK_SIZE}).`,
      });
      if (totalCreated > 0) onSuccess();
    } catch (ex) {
      setErr(ex.response?.data?.message || ex.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: T.overlay,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.surface, borderRadius: 14, width: '100%', maxWidth: 520,
        boxShadow: isDark ? '0 20px 60px rgba(0,0,0,0.6)' : '0 20px 60px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        border: isDark ? '1px solid #1e3a31' : '1px solid transparent',
      }}>
        {/* Header */}
        <div style={{
          background: T.headerBg,
          borderBottom: T.headerBorder,
          padding: '22px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.headerTitle }}>Bulk Upload Users</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: T.headerSubText }}>
              Upload a CSV file to create multiple users at once
            </p>
          </div>
          <button onClick={onClose} style={{
            background: T.closeBtnBg, border: 'none', color: T.headerTitle,
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Format guide */}
          <div style={{
            background: T.cardBg, border: T.cardBorder, borderRadius: 10,
            padding: '14px 16px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.cardLabel }}>Required CSV Format</span>
              <button
                type="button"
                onClick={downloadTemplate}
                style={{
                  background: T.accentBtnBg, color: T.accentBtnText, border: 'none', borderRadius: 6,
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
              display: 'block', fontSize: 12, color: T.codeText,
              background: T.codeBg, borderRadius: 6, padding: '8px 12px', lineHeight: 1.7,
            }}>
              username, brand, role<br/>
              john_doe, BrandA, RM<br/>
              jane_doe, BrandB, JRM
            </code>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: T.captionText }}>
              No row limit. File is uploaded in chunks of {CHUNK_SIZE}. Default password is <strong>123456</strong> and each user must change it on first login.
            </p>
          </div>

          {/* File input */}
          <form onSubmit={handleSubmit}>
            {err && (
              <div style={{
                background: T.errBg, border: `1px solid ${T.errBorder}`, borderRadius: 8,
                padding: '10px 14px', marginBottom: 16, fontSize: 13, color: T.errText,
              }}>{err}</div>
            )}

            <div style={{
              border: `2px dashed ${file ? T.dropBorderActive : T.dropBorder}`,
              borderRadius: 10, padding: '28px 20px',
              textAlign: 'center', marginBottom: 16, cursor: 'pointer',
              background: file ? T.dropBgActive : T.dropBg,
              transition: 'all 0.2s',
            }}
              onClick={() => document.getElementById('bulk-csv-input').click()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke={file ? T.iconActive : T.iconIdle} strokeWidth="1.8" width="36" height="36" style={{ margin: '0 auto 10px', display: 'block' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
              {file
                ? <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.fileNameColor }}>{file.name}</p>
                : <>
                    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: T.dropText }}>Click to select CSV file</p>
                    <p style={{ margin: 0, fontSize: 12, color: T.dropTextMuted }}>Only .csv files accepted</p>
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

            {/* Progress */}
            {uploading && progress.total > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.text, marginBottom: 6 }}>
                  <span>Uploading chunk {progress.chunk} of {progress.totalChunks}</span>
                  <span>{progress.done} / {progress.total} rows ({pct}%)</span>
                </div>
                <div style={{ background: T.progressTrack, borderRadius: 999, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    background: T.progressFill, height: '100%', width: `${pct}%`,
                    transition: 'width 0.25s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  background: result.created > 0 ? T.successBg : T.errBg,
                  border: `1px solid ${result.created > 0 ? T.successBorder : T.errBorder}`,
                  borderRadius: 8, padding: '10px 14px', fontSize: 13,
                  color: result.created > 0 ? T.successText : T.errText, fontWeight: 600,
                  marginBottom: result.failed?.length ? 10 : 0,
                }}>
                  {result.message}
                </div>
                {result.failed?.length > 0 && (
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${T.failTableBorder}`, borderRadius: 8, background: T.failTableBg }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: T.failTableHead }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left', color: T.failTextHead, fontWeight: 600 }}>Row</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left', color: T.failTextHead, fontWeight: 600 }}>Username</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left', color: T.failTextHead, fontWeight: 600 }}>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.failed.map((f, i) => (
                          <tr key={i} style={{ borderTop: `1px solid ${T.failTableBorder}` }}>
                            <td style={{ padding: '6px 10px', color: T.failTextBody }}>{f.row}</td>
                            <td style={{ padding: '6px 10px', color: T.failTextBody }}>{f.username}</td>
                            <td style={{ padding: '6px 10px', color: T.failTextReason }}>{f.reason}</td>
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
                {uploading ? `Uploading ${pct}%...` : 'Upload & Create Users'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}




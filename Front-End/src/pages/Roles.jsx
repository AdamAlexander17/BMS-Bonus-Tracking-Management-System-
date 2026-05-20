import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getRoles, deleteRole } from '../api/roles';
import CustomSelect from '../components/CustomSelect/CustomSelect';

import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';
import PageHeader from '../components/PageHeader/PageHeader';
import RoleModal from '../components/RoleModal/RoleModal';
import './Users.css';

export default function Roles() {
  const { user } = useAuth();
  const hasPerm    = (key) => !user?.permissions || user.permissions.includes(key);
  const canCreate  = hasPerm('role:create');
  const canUpdate  = hasPerm('role:update');
  const canDelete  = hasPerm('role:delete');
  const canActions = canUpdate || canDelete;

  const [roles, setRoles]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editRole, setEditRole]   = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [pageSize, setPageSize]         = useState(10);
  const [page, setPage]                 = useState(1);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const { data } = await getRoles();
      setRoles(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load roles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRoles(); }, []);

  const handleDelete = (id, name) => {
    setConfirmState({
      title: 'Delete Role?',
      itemName: name,
      bullets: ['Role record & permission set', 'Role assignments from all users'],
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteRole(id);
          fetchRoles();
        } catch (err) {
          alert(err.response?.data?.message || 'Delete failed.');
        }
      },
    });
  };

  const filtered = roles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged      = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="um">
      <PageHeader
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        }
        title="Role Management"
        subtitle={`${roles.length} role${roles.length !== 1 ? 's' : ''} • Manage permissions per role`}
        actions={
          <>
            <button className="ph-btn ph-btn--ghost" onClick={fetchRoles}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Refresh
            </button>
            {canCreate && (
              <button className="ph-btn ph-btn--primary" onClick={() => setShowModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Role
              </button>
            )}
          </>
        }
      />

      <RoleModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={fetchRoles}
      />

      <RoleModal
        open={!!editRole}
        role={editRole}
        onClose={() => setEditRole(null)}
        onSuccess={() => { setEditRole(null); fetchRoles(); }}
      />

      <div className="um__card">
        <div className="um__toolbar">
          <div className="um__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input placeholder="Search roles by name" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
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
              <col style={{ width: '18%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '14%' }} />
              {canActions && <col style={{ width: '20%' }} />}
            </colgroup>
            <thead>
              <tr>
                <th>ROLE</th>
                <th>DESCRIPTION</th>
                <th style={{ textAlign: 'center' }}>PERMISSIONS</th>
                <th style={{ textAlign: 'center' }}>STATUS</th>
                {canActions && <th style={{ textAlign: 'right' }}>ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={canActions ? 5 : 4} className="um__empty">No roles found.</td></tr>
              ) : paged.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="um__user-cell">
                      <div className="um__avatar um__avatar--role">{r.name[0].toUpperCase()}</div>
                      <div className="um__username">{r.name}</div>
                    </div>
                  </td>
                  <td className="um__desc-cell">{r.description || <span style={{ color: '#c0c8d8' }}>—</span>}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="um__perm-count-badge">
                      {r.permission_count ?? r.permissions?.length ?? 0} permissions
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`um__status-badge ${r.status === 'Active' ? 'um__status-badge--active' : 'um__status-badge--inactive'}`}>
                      {r.status || 'Active'}
                    </span>
                  </td>
                  {canActions && (
                    <td style={{ textAlign: 'right' }}>
                      <div className="um__actions" style={{ justifyContent: 'flex-end' }}>
                        {canUpdate && (
                          <button className="um__action-btn um__action-btn--edit" title="Edit" onClick={() => setEditRole(r)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                        )}
                        {canDelete && (
                          <button className="um__action-btn um__action-btn--delete" title="Delete" onClick={() => handleDelete(r.id, r.name)}>
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
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          itemName={confirmState.itemName}
          bullets={confirmState.bullets}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

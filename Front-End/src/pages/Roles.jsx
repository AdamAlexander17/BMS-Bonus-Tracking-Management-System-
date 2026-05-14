import { useEffect, useState } from 'react';
import { getRoles, deleteRole } from '../api/roles';
import PageHeader from '../components/PageHeader/PageHeader';
import './Users.css';

export default function Roles() {
  const [roles, setRoles]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');

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

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete role "${name}"?`)) return;
    try {
      await deleteRole(id);
      fetchRoles();
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed.');
    }
  };

  const filtered = roles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

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
            <button className="ph-btn ph-btn--primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Role
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
            <input placeholder="Search roles by name" value={search} onChange={e => setSearch(e.target.value)} />
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
                <th>ROLE</th>
                <th>PERMISSIONS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="3" className="um__empty">No roles found.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="um__user-cell">
                      <div className="um__avatar">{r.name[0].toUpperCase()}</div>
                      <div>
                        <div className="um__username">{r.name}</div>
                        <div className="um__handle">{r.permissions?.length || 0} permission{(r.permissions?.length || 0) !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {r.permissions?.slice(0, 6).map(p => (
                        <span key={p.id} className="um__role-badge" style={{ background: '#eef2ff', color: '#4285f4' }}>{p.key}</span>
                      ))}
                      {r.permissions?.length > 6 && (
                        <span className="um__role-badge" style={{ background: '#f4f6fb', color: '#5a6478' }}>+{r.permissions.length - 6} more</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="um__actions">
                      <button className="um__action-btn um__action-btn--edit" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className="um__action-btn um__action-btn--delete" title="Delete" onClick={() => handleDelete(r.id, r.name)}>
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

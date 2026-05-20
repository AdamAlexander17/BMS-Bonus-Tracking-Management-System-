import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getBrands, deleteBrand, createBrand, updateBrand } from '../api/brands';
import CustomSelect from '../components/CustomSelect/CustomSelect';

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
import PageHeader from '../components/PageHeader/PageHeader';
import './Users.css';

export default function Brands() {
  const { user } = useAuth();
  const hasPerm    = (key) => !user?.permissions || user.permissions.includes(key);
  const canCreate  = hasPerm('brand:create');
  const canUpdate  = hasPerm('brand:update');
  const canDelete  = hasPerm('brand:delete');
  const canActions = canUpdate || canDelete;

  const [brands, setBrands]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [editBrand, setEditBrand] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [newName, setNewName]     = useState('');
  const [newCode, setNewCode]     = useState('');
  const [creating, setCreating]   = useState(false);
  const [pageSize, setPageSize]   = useState(10);
  const [page, setPage]           = useState(1);

  const fetchBrands = async () => {
    setLoading(true);
    try {
      const { data } = await getBrands();
      setBrands(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load brands.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBrands(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createBrand({ name: newName.trim(), code: newCode.trim().toUpperCase() });
      setNewName('');
      setNewCode('');
      setShowAdd(false);
      fetchBrands();
    } catch (err) {
      alert(err.response?.data?.message || 'Create failed.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id, name) => {
    setConfirmState({
      title: 'Delete Brand',
      message: `You are about to permanently delete "${name}" and all its associated data. This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteBrand(id);
          fetchBrands();
        } catch (err) {
          alert(err.response?.data?.message || 'Delete failed.');
        }
      },
    });
  };

  const filtered = brands.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged      = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="um">
      <PageHeader
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <circle cx="7" cy="7" r="1.5" fill="currentColor"/>
          </svg>
        }
        title="Brand Management"
        subtitle={`${brands.length} brand${brands.length !== 1 ? 's' : ''} • Manage available brands`}
        actions={
          <>
            <button className="ph-btn ph-btn--ghost" onClick={fetchBrands}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Refresh
            </button>
            {canCreate && (
              <button className="ph-btn ph-btn--primary" onClick={() => { setNewName(''); setNewCode(''); setShowAdd(true); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Brand
              </button>
            )}
          </>
        }
      />

      <div className="um__card">
        <div className="um__toolbar">
          <div className="um__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input placeholder="Search brands by name" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
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
              <col style={{ width: '45%' }} />
              <col />
              {canActions && <col style={{ width: '20%' }} />}
            </colgroup>
            <thead>
              <tr>
                <th>BRAND</th>
                <th style={{ textAlign: 'center' }}>CODE</th>
                {canActions && <th style={{ textAlign: 'right' }}>ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={canActions ? 3 : 2} className="um__empty">No brands found.</td></tr>
              ) : paged.map(b => (
                <tr key={b.id}>
                  <td>
                    <div className="um__user-cell">
                      <div className="um__avatar">{b.name[0].toUpperCase()}</div>
                      <div>
                        <div className="um__username">{b.name}</div>
                        <div className="um__handle">Brand #{b.id}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}><span className="um__role-badge" style={{ background: '#e0f5f5', color: '#004B4E', border: 'none', minWidth: 48, textAlign: 'center', display: 'inline-block' }}>{b.code || '—'}</span></td>
                  {canActions && (
                    <td style={{ textAlign: 'right' }}>
                      <div className="um__actions" style={{ justifyContent: 'flex-end' }}>
                        {canUpdate && (
                          <button className="um__action-btn um__action-btn--edit" title="Edit" onClick={() => setEditBrand(b)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                        )}
                        {canDelete && (
                          <button className="um__action-btn um__action-btn--delete" title="Delete" onClick={() => handleDelete(b.id, b.name)}>
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

      {/* Add Brand Modal */}
      {showAdd && (
        <div className="um__modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="um__modal" onClick={e => e.stopPropagation()}>
            <div className="um__modal-header um__modal-header--teal">
              <div>
                <h3>Add Brand</h3>
                <p className="um__modal-subtitle">Create a new brand in the system</p>
              </div>
              <button className="um__modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <form className="um__form" onSubmit={handleCreate}>
              <div className="um__form-row">
                <div className="um__form-group">
                  <label>Brand Name <span className="um__required">*</span></label>
                  <input required placeholder="e.g. Trade Karo" value={newName} onChange={e => setNewName(e.target.value)} />
                </div>
                <div className="um__form-group">
                  <label>Code <span className="um__required">*</span></label>
                  <input required placeholder="e.g. TK" maxLength={10} value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} />
                </div>
              </div>
              <div className="um__form-footer">
                <button type="button" className="um__btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="um__btn-save" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Brand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Brand Modal */}
      {editBrand && (
        <EditBrandModal
          brand={editBrand}
          onClose={() => setEditBrand(null)}
          onSuccess={() => { setEditBrand(null); fetchBrands(); }}
        />
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

function EditBrandModal({ brand, onClose, onSuccess }) {
  const [name, setName]       = useState(brand.name);
  const [code, setCode]       = useState(brand.code || '');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setSaving(true); setErr('');
    try {
      await updateBrand(brand.id, { name: name.trim(), code: code.trim().toUpperCase() });
      onSuccess();
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Failed to update brand.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="um__modal-overlay" onClick={onClose}>
      <div className="um__modal" onClick={e => e.stopPropagation()}>
        <div className="um__modal-header um__modal-header--teal">
          <div>
            <h3>Edit Brand</h3>
            <p className="um__modal-subtitle">Update brand name and code</p>
          </div>
          <button className="um__modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="um__form" onSubmit={handleSubmit}>
          {err && <div className="um__form-error">{err}</div>}
          <div className="um__form-row">
            <div className="um__form-group">
              <label>Brand Name <span className="um__required">*</span></label>
              <input required placeholder="e.g. Trade Karo" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="um__form-group">
              <label>Code <span className="um__required">*</span></label>
              <input required placeholder="e.g. TK" maxLength={10} value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="um__form-footer">
            <button type="button" className="um__btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="um__btn-save" disabled={saving}>
              {saving ? 'Saving...' : 'Update Brand'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


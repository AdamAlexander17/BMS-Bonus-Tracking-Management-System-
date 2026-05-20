import { useEffect, useState } from 'react';
import { getBrands, deleteBrand, createBrand, updateBrand } from '../api/brands';
import PageHeader from '../components/PageHeader/PageHeader';
import './Users.css';

export default function Brands() {
  const [brands, setBrands]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [editBrand, setEditBrand] = useState(null);
  const [newName, setNewName]     = useState('');
  const [newCode, setNewCode]     = useState('');
  const [creating, setCreating]   = useState(false);

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

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete brand "${name}"?`)) return;
    try {
      await deleteBrand(id);
      fetchBrands();
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed.');
    }
  };

  const filtered = brands.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));

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
            <button className="ph-btn ph-btn--primary" onClick={() => { setNewName(''); setNewCode(''); setShowAdd(true); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Brand
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
            <input placeholder="Search brands by name" value={search} onChange={e => setSearch(e.target.value)} />
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
              <col style={{ width: '45%' }} />
              <col style={{ width: '35%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>BRAND</th>
                <th>CODE</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="3" className="um__empty">No brands found.</td></tr>
              ) : filtered.map(b => (
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
                  <td><span className="um__role-badge" style={{ background: '#e0f5f5', color: '#004B4E', border: 'none', minWidth: 48, textAlign: 'center', display: 'inline-block' }}>{b.code || '—'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="um__actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="um__action-btn um__action-btn--edit" title="Edit" onClick={() => setEditBrand(b)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className="um__action-btn um__action-btn--delete" title="Delete" onClick={() => handleDelete(b.id, b.name)}>
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


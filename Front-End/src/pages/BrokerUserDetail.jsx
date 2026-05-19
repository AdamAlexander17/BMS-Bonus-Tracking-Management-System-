import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader/PageHeader';
import { getBrokersByRmUser, createBroker, updateBroker, deleteBroker } from '../api/brokers';
import { createClient } from '../api/clients';
import './Users.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const formatDate = (str) => {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
};

/* ── Field component ─────────────────────────────────────────── */
function Field({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  color: '#111827',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

/* ── Confirm Dialog ─────────────────────────────────────────── */
function ConfirmDialog({ title, message, confirmLabel = 'Yes, Delete', onConfirm, onCancel }) {
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
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '16px 24px', borderTop: '1px solid #f1f5f9',
        }}>
          <button className="ph-btn ph-btn--ghost" onClick={onCancel}>No, Keep It</button>
          <button
            style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal ───────────────────────────────────────────────────── */
function AddBrokerModal({ rmUser, userId, onClose, onCreated }) {
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [form, setForm]       = useState({ name: '', arc_id: '', status: 'Active' });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{5}$/.test(form.arc_id.trim())) {
      setError('ARC ID must be exactly 5 digits (e.g. 12345).');
      return;
    }
    setSaving(true);
    try {
      await createBroker({
        name:       form.name.trim(),
        arc_id:     form.arc_id.trim(),
        brand:      rmUser.brands?.[0] || '',
        rm_user_id: Number(userId),
        status:     form.status,
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create broker.');
      setSaving(false);
    }
  };

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Dialog */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 14,
          width: '100%',
          maxWidth: 580,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 18px',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
              Create New Broker
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6b7280' }}>
              Assigned to <strong>{rmUser.username}</strong> · {(rmUser.roles || []).join('/')}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              color: '#9ca3af', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18,
              }}>
                {error}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 20px' }}>
              <Field label="Broker Name" required>
                <input
                  style={inputStyle}
                  value={form.name}
                  onChange={set('name')}
                  required
                  placeholder="Enter full broker name"
                  onFocus={e => e.target.style.borderColor = '#004B4E'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </Field>

              <Field label="ARC ID" required>
                <input
                  style={inputStyle}
                  value={form.arc_id}
                  onChange={set('arc_id')}
                  required
                  maxLength={5}
                  placeholder="12345"
                  onFocus={e => e.target.style.borderColor = '#004B4E'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </Field>

              <Field label="Status">
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={form.status}
                  onChange={set('status')}
                  onFocus={e => e.target.style.borderColor = '#004B4E'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '20px 24px',
            borderTop: '1px solid #f1f5f9',
            marginTop: 16,
          }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create Broker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Edit Broker Modal ───────────────────────────────────────── */
function EditBrokerModal({ broker, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [form, setForm]     = useState({
    name:   broker.name   || '',
    arc_id: broker.arc_id || '',
    status: broker.status || 'Active',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{5}$/.test(form.arc_id.trim())) {
      setError('ARC ID must be exactly 5 digits (e.g. 12345).');
      return;
    }
    setSaving(true);
    try {
      await updateBroker(broker.id, {
        name:   form.name.trim(),
        arc_id: form.arc_id.trim(),
        status: form.status,
      });
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update broker.');
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 580,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 18px', borderBottom: '1px solid #f1f5f9',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>Edit Broker</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6b7280' }}>Update details for <strong>{broker.name}</strong></p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 6, display: 'flex' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 20px' }}>
              <Field label="Broker Name" required>
                <input style={inputStyle} value={form.name} onChange={set('name')} required placeholder="e.g. ABC Brokers Pvt Ltd"
                  onFocus={e => e.target.style.borderColor='#004B4E'} onBlur={e => e.target.style.borderColor='#d1d5db'} />
              </Field>
              <Field label="ARC ID" required>
                <input style={inputStyle} value={form.arc_id} onChange={set('arc_id')} required maxLength={5} placeholder="12345"
                  onFocus={e => e.target.style.borderColor='#004B4E'} onBlur={e => e.target.style.borderColor='#d1d5db'} />
              </Field>
              <Field label="Status">
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.status} onChange={set('status')}
                  onFocus={e => e.target.style.borderColor='#004B4E'} onBlur={e => e.target.style.borderColor='#d1d5db'}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </Field>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Saving...' : 'Update Broker'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Add Client Modal ────────────────────────────────────────── */
function AddClientModal({ broker, onClose, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [form, setForm]     = useState({ arc_id: '', deposited_amount: '', withdrawal_amount: '' });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{5}$/.test(form.arc_id.trim())) {
      setError('ARC ID must be exactly 5 digits (e.g. 12345).');
      return;
    }
    setSaving(true);
    try {
      await createClient(broker.id, {
        arc_id:            form.arc_id.trim(),
        deposited_amount:  form.deposited_amount  || 0,
        withdrawal_amount: form.withdrawal_amount || 0,
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create client.');
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 14,
          width: '100%',
          maxWidth: 580,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 18px',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
              Add Client
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6b7280' }}>
              Adding to <strong>{broker.name}</strong> · {broker.arc_id}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              color: '#9ca3af', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18,
              }}>
                {error}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 20px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="ARC ID" required>
                  <input
                    style={inputStyle}
                    value={form.arc_id}
                    onChange={set('arc_id')}
                    required
                    maxLength={5}
                    placeholder="12345"
                    onFocus={e => e.target.style.borderColor = '#004B4E'}
                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  />
                </Field>
              </div>
              <Field label="Deposited Amount (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  style={inputStyle}
                  value={form.deposited_amount}
                  onChange={set('deposited_amount')}
                  placeholder="0.00"
                  onFocus={e => e.target.style.borderColor = '#004B4E'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </Field>
              <Field label="Withdrawal Amount (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  style={inputStyle}
                  value={form.withdrawal_amount}
                  onChange={set('withdrawal_amount')}
                  placeholder="0.00"
                  onFocus={e => e.target.style.borderColor = '#004B4E'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </Field>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '20px 24px',
            borderTop: '1px solid #f1f5f9',
            marginTop: 16,
          }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
              {saving ? 'Adding...' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────── */
export default function BrokerUserDetail() {
  const { userId } = useParams();
  const navigate   = useNavigate();

  const [rmUser, setRmUser]   = useState(null);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [selectedBroker, setSelectedBroker]   = useState(null);
  const [editBroker, setEditBroker]           = useState(null);
  const [confirmState, setConfirmState]       = useState(null);
  const [pageError, setPageError]             = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getBrokersByRmUser(userId);
      setRmUser(res.data.rm_user);
      setBrokers(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [userId]);

  const handleDeleteBroker = (b) => {
    setPageError('');
    setConfirmState({
      title: 'Delete Broker',
      message: `You are about to permanently delete "${b.name}" and all its associated data. This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteBroker(b.id);
          fetchAll();
        } catch {
          setPageError('Could not delete this broker. Please try again.');
        }
      },
    });
  };

  if (loading) return <div className="um"><div className="um__loading">Loading...</div></div>;
  if (error)   return <div className="um"><div className="um__error">{error}</div></div>;
  if (!rmUser) return null;

  const totalClients = brokers.reduce((s, b) => s + (b.client_count || 0), 0);

  return (
    <div className="um">
      <PageHeader
        icon={<UserIcon />}
        title={rmUser.username}
        subtitle={`${(rmUser.roles || []).join('/')} • ${brokers.length} broker compan${brokers.length !== 1 ? 'ies' : 'y'} • ${totalClients} client${totalClients !== 1 ? 's' : ''}`}
        actions={
          <>
            <button className="ph-btn ph-btn--ghost" onClick={() => navigate('/brokers')}>
              <BackIcon /> Back to Brokers
            </button>
            <button className="ph-btn ph-btn--primary" onClick={() => setShowModal(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Broker
            </button>
          </>
        }
      />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <InfoCard label="Role"             value={(rmUser.roles || []).join('/')} accent={(rmUser.roles || []).includes('RM') ? '#1d4ed8' : '#92400e'} />
        <InfoCard label="Broker Companies" value={brokers.length} />
        <InfoCard label="Total Clients"    value={totalClients} />
      </div>

      {/* Broker companies table */}
      <div className="um__card">
        <div className="um__toolbar">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            Broker Companies assigned to {rmUser.username}
          </h3>
        </div>

        <table className="um__table">
          <thead>
            <tr>
              <th>BROKER</th>
              <th>ARC ID</th>
              <th>BRAND</th>
              <th>CLIENTS</th>
              <th>STATUS</th>
              <th>CREATED</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {brokers.length === 0 ? (
              <tr>
                <td colSpan="7" className="um__empty">
                  No broker companies assigned yet. Click "Add Broker" to get started.
                </td>
              </tr>
            ) : brokers.map(b => (
              <tr
                key={b.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/brokers/${b.id}`)}
              >
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
                <td><span style={{ fontWeight: 600 }}>{b.client_count ?? 0}</span></td>
                <td>
                  <span className={`um__status-badge ${b.status === 'Active' ? 'um__status-badge--active' : 'um__status-badge--inactive'}`}>
                    {b.status}
                  </span>
                </td>
                <td><span className="um__date">{formatDate(b.created_at)}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  <div className="um__actions">
                    <button
                      className="um__action-btn um__action-btn--edit"
                      title="Edit broker"
                      onClick={() => setEditBroker(b)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      className="um__action-btn um__action-btn--delete"
                      title="Delete broker"
                      onClick={() => handleDeleteBroker(b)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showModal && (
        <AddBrokerModal
          rmUser={rmUser}
          userId={userId}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); fetchAll(); }}
        />
      )}
      {showClientModal && selectedBroker && (
        <AddClientModal
          broker={selectedBroker}
          onClose={() => { setShowClientModal(false); setSelectedBroker(null); }}
          onCreated={() => { setShowClientModal(false); setSelectedBroker(null); fetchAll(); }}
        />
      )}
      {editBroker && (
        <EditBrokerModal
          broker={editBroker}
          onClose={() => setEditBroker(null)}
          onUpdated={() => { setEditBroker(null); fetchAll(); }}
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
      {pageError && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
          borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 3000,
          display: 'flex', alignItems: 'center', gap: 12, minWidth: 320,
        }}>
          <span style={{ flex: 1 }}>{pageError}</span>
          <button onClick={() => setPageError('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, accent }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb',
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: accent || '#111827' }}>
        {value}
      </div>
    </div>
  );
}
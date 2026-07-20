import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader/PageHeader';
import CustomSelect from '../components/CustomSelect/CustomSelect';
import { getBrokersByRmUser, createBroker, updateBroker, deleteBroker } from '../api/brokers';
import { createClient } from '../api/clients';
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
  return new Date(str).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const formatDateTime = (str) => {
  if (!str) return '—';
  const parsed = new Date(str.includes('T') ? str : str.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-IN', {
    month: 'short', year: 'numeric'
  });
};

const formatINR = (value) => `₹${Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

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
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';

/* ── Modal ───────────────────────────────────────────────────── */
function AddBrokerModal({ rmUser, userId, onClose, onCreated }) {
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [form, setForm]       = useState({ name: '', arc_id: '', status: 'Active' });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{1,6}$/.test(form.arc_id.trim())) {
      setError('ARK ID must be up to 6 digits.');
      return;
    }
    setSaving(true);
    try {
      await createBroker({
        name:       form.name.trim(),
        arc_id:     form.arc_id.trim(),
        brand:      rmUser.brand || '',
        rm_user_id: Number(userId),
        status:     form.status,
      });
      onCreated();
    } catch (err) {
      setSaving(false);
    }
  };

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      className="bd-modal-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Dialog */}
      <div
        className="bms-dialog"
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
          borderBottom: 'none',
          background: '#004B4E',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>
              Create New Broker
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>
              Assigned to <strong>{rmUser.username}</strong> · {(rmUser.roles || []).join('/')}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6,
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

              <Field label="ARK ID" required>
                <input
                  style={inputStyle}
                  value={form.arc_id}
                  onChange={(e) => setForm(f => ({ ...f, arc_id: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  required
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={6}
                  placeholder="123456"
                  onFocus={e => e.target.style.borderColor = '#004B4E'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </Field>

              <Field label="Status">
                <CustomSelect
                  variant="form"
                  value={form.status}
                  onChange={(value) => setForm((current) => ({ ...current, status: value }))}
                  options={[
                    { value: 'Active', label: 'Active' },
                    { value: 'Inactive', label: 'Inactive' },
                  ]}
                  placeholder="Select status"
                  style={{ width: '100%' }}
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
    if (!/^\d{1,6}$/.test(form.arc_id.trim())) {
      setError('ARK ID must be up to 6 digits.');
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
      className="bd-modal-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="bms-dialog"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 580,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 18px', borderBottom: 'none', background: '#004B4E',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Edit Broker</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Update details for <strong>{broker.name}</strong></p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6, display: 'flex' }}>
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
              <Field label="ARK ID" required>
                <input style={inputStyle} value={form.arc_id} onChange={(e) => setForm(f => ({ ...f, arc_id: e.target.value.replace(/\D/g, '').slice(0, 6) }))} required maxLength={6} placeholder="12345"
                  onFocus={e => e.target.style.borderColor='#004B4E'} onBlur={e => e.target.style.borderColor='#d1d5db'} />
              </Field>
              <Field label="Status">
                <CustomSelect
                  variant="form"
                  value={form.status}
                  onChange={(value) => setForm((current) => ({ ...current, status: value }))}
                  options={[
                    { value: 'Active', label: 'Active' },
                    { value: 'Inactive', label: 'Inactive' },
                  ]}
                  placeholder="Select status"
                  style={{ width: '100%' }}
                />
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
    if (!/^\d{1,6}$/.test(form.arc_id.trim())) {
      setError('ARK ID must be up to 6 digits.');
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
      className="bd-modal-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bd-modal" style={{
          background: '#fff',
          borderRadius: 14,
          width: '100%',
          maxWidth: 580,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="bd-modal__header" style={{
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
                <Field label="ARK ID" required>
                  <input
                    style={inputStyle}
                    value={form.arc_id}
                    onChange={(e) => setForm(f => ({ ...f, arc_id: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    required
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    placeholder="123456"
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

function SuccessChip({ message, onClose }) {
  if (!message) return null;

  return (
    <div style={{ marginLeft: 'auto', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10, maxWidth: '100%' }}>
      <span>{message}</span>
      <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────── */
export default function BrokerUserDetail() {
  const { userId } = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const hasPerm    = (key) => !user?.permissions || user.permissions.includes(key);
  const canCreate  = hasPerm('broker:create');
  const canUpdate  = hasPerm('broker:update');
  const canDelete  = hasPerm('broker:delete');
  const canActions = canUpdate || canDelete;

  const [rmUser, setRmUser]   = useState(null);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [selectedBroker, setSelectedBroker]   = useState(null);
  const [editBroker, setEditBroker]           = useState(null);
  const [confirmState, setConfirmState]       = useState(null);
  const [pageSuccess, setPageSuccess]         = useState('');
  const [pageError, setPageError]             = useState('');
  const [sortConfig, setSortConfig]           = useState({ key: null, direction: 'asc' });

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

  useEffect(() => {
    if (!pageSuccess) return undefined;
    const timeoutId = window.setTimeout(() => setPageSuccess(''), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [pageSuccess]);

  const handleDeleteBroker = (b) => {
    setPageSuccess('');
    setPageError('');
    setConfirmState({
      title: 'Delete Broker?',
      itemName: b.name,
      bullets: ['Broker company & ARK ID', 'All associated clients', 'Commission & bonus history'],
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteBroker(b.id);
          setPageSuccess('Broker deleted successfully.');
          fetchAll();
        } catch {
          setPageError('Could not delete this broker. Please try again.');
        }
      },
    });
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredBrokers = brokers.filter((broker) => {
    if (monthFilter && (broker.created_at || '').slice(0, 7) !== monthFilter) return false;
    if (!normalizedSearch) return true;
    return [broker.name, broker.arc_id, broker.brand?.name, broker.created_by, broker.status]
      .some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
  });

  const sortedBrokers = useMemo(() => {
    if (!sortConfig.key) return filteredBrokers;

    const getSortValue = (broker, key) => {
      switch (key) {
        case 'name':
          return broker.name || '';
        case 'arc_id':
          return broker.arc_id || '';
        case 'brand':
          return broker.brand?.name || '';
        case 'client_count':
          return Number(broker.client_count ?? 0);
        case 'amount_earned':
          return Number(broker.amount_earned ?? 0);
        case 'amount_paid':
          return Number(broker.amount_paid ?? 0);
        case 'pending_payout':
          return Number(broker.pending_payout ?? 0);
        case 'last_paid_at':
          return broker.last_paid_at ? new Date(broker.last_paid_at).getTime() : null;
        case 'status':
          return broker.status || '';
        case 'created_at':
          return broker.created_at ? new Date(broker.created_at).getTime() : null;
        default:
          return '';
      }
    };

    return [...filteredBrokers].sort((left, right) => (
      compareValues(
        getSortValue(left, sortConfig.key),
        getSortValue(right, sortConfig.key),
        sortConfig.direction,
      )
    ));
  }, [filteredBrokers, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((current) => (
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'created_at' || key === 'last_paid_at' ? 'desc' : 'asc' }
    ));
  };

  const getSortIndicator = (key) => (sortConfig.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕');

  const totalClients = filteredBrokers.reduce((s, b) => s + (b.client_count || 0), 0);
  const totalEarned = filteredBrokers.reduce((sum, broker) => sum + Number(broker.amount_earned || 0), 0);
  const totalPaid = filteredBrokers.reduce((sum, broker) => sum + Number(broker.amount_paid || 0), 0);
  const totalPending = filteredBrokers.reduce((sum, broker) => sum + Number(broker.pending_payout || 0), 0);

  if (loading) return <div className="um"><div className="um__loading">Loading...</div></div>;
  if (error)   return <div className="um"><div className="um__error">{error}</div></div>;
  if (!rmUser) return null;

  return (
    <div className="um">
      <PageHeader
        icon={<UserIcon />}
        title={rmUser.username}
        subtitle={`${(rmUser.roles || []).join('/')} • ${filteredBrokers.length} broker compan${filteredBrokers.length !== 1 ? 'ies' : 'y'} • ${totalClients} client${totalClients !== 1 ? 's' : ''}`}
        actions={
          <>
            <button className="ph-btn ph-btn--ghost" onClick={() => navigate('/brokers')}>
              <BackIcon /> Back to Brokers
            </button>
            {canCreate && (
              <button className="ph-btn ph-btn--primary" onClick={() => setShowModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Broker
              </button>
            )}
          </>
        }
      />

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ flex: '1 0 180px' }}><InfoCard label="Role" value={(rmUser.roles || []).join('/')} /></div>
        <div style={{ flex: '1 0 180px' }}><InfoCard label="Broker Count" value={brokers.length} /></div>
        <div style={{ flex: '1 0 180px' }}><InfoCard label="Total Clients" value={totalClients} /></div>
        <div style={{ flex: '1 0 180px' }}><InfoCard label="Total Earned" value={formatINR(totalEarned)} /></div>
        <div style={{ flex: '1 0 180px' }}><InfoCard label="Total Paid" value={formatINR(totalPaid)} /></div>
        <div style={{ flex: '1 0 180px' }}><InfoCard label="Pending Payout" value={formatINR(totalPending)} /></div>
      </div>

      {/* Broker companies table */}
      <div className="um__card">
        <div className="um__toolbar" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="um__search" style={{ maxWidth: 360 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.65" y1="16.65" x2="21" y2="21" />
            </svg>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search broker, ARK ID, brand, creator, or status"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Month</label>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              style={{ height: 36, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#111827', background: '#fff', outline: 'none' }}
            />
            {monthFilter && (
              <button type="button" className="ph-btn ph-btn--ghost" style={{ height: 36, padding: '0 10px', fontSize: 12 }} onClick={() => setMonthFilter('')}>Clear</button>
            )}
          </div>
          <SuccessChip message={pageSuccess} onClose={() => setPageSuccess('')} />
        </div>

        <table className="um__table">
          <thead>
            <tr>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('name')}>BROKER <span>{getSortIndicator('name')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('arc_id')}>ARK ID <span>{getSortIndicator('arc_id')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('brand')}>BRAND <span>{getSortIndicator('brand')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('client_count')}>CLIENTS <span>{getSortIndicator('client_count')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('amount_earned')}>EARNED <span>{getSortIndicator('amount_earned')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('amount_paid')}>PAID <span>{getSortIndicator('amount_paid')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('pending_payout')}>PENDING <span>{getSortIndicator('pending_payout')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('last_paid_at')}>LAST PAID <span>{getSortIndicator('last_paid_at')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('status')}>STATUS <span>{getSortIndicator('status')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('created_at')}>CREATED <span>{getSortIndicator('created_at')}</span></button></th>
              {canActions && <th>ACTIONS</th>}
            </tr>
          </thead>
          <tbody>
            {sortedBrokers.length === 0 ? (
              <tr>
                <td colSpan={canActions ? 11 : 10} className="um__empty">
                  No broker companies assigned yet. Click "Add Broker" to get started.
                </td>
              </tr>
            ) : sortedBrokers.map(b => (
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
                <td><span style={{ fontWeight: 600 }}>{formatINR(b.amount_earned)}</span></td>
                <td><span style={{ fontWeight: 600 }}>{formatINR(b.amount_paid)}</span></td>
                <td><span style={{ fontWeight: 600 }}>{formatINR(b.pending_payout)}</span></td>
                <td><span className="um__date">{formatDateTime(b.last_paid_at)}</span></td>
                <td>
                  <span className={`um__status-badge ${b.status === 'Active' ? 'um__status-badge--active' : 'um__status-badge--inactive'}`}>
                    {b.status}
                  </span>
                </td>
                <td><span className="um__date">{formatDate(b.created_at)}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  {canActions && (
                    <div className="um__actions">
                      {canUpdate && (
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
                      )}
                      {canDelete && (
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
                      )}
                    </div>
                  )}
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
          onCreated={() => { setShowModal(false); setPageError(''); setPageSuccess('Broker created successfully.'); fetchAll(); }}
        />
      )}
      {showClientModal && selectedBroker && (
        <AddClientModal
          broker={selectedBroker}
          onClose={() => { setShowClientModal(false); setSelectedBroker(null); }}
          onCreated={() => { setShowClientModal(false); setSelectedBroker(null); setPageError(''); setPageSuccess('Client added successfully.'); fetchAll(); }}
        />
      )}
      {editBroker && (
        <EditBrokerModal
          broker={editBroker}
          onClose={() => setEditBroker(null)}
          onUpdated={() => { setEditBroker(null); setPageError(''); setPageSuccess('Broker updated successfully.'); fetchAll(); }}
        />
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
    <div className="um__card info-card">
      <div className="info-card__label">{label}</div>
      <div className="info-card__value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

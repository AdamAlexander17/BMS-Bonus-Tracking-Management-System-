import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader/PageHeader';
import { getBroker } from '../api/brokers';
import { getClientsByBroker, createClient, updateClient, deleteClient } from '../api/clients';
import { formatINR } from './Brokers';
import './Users.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

const BrokerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const formatDate = (str) => {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
};

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
};

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

function AddClientModal({ broker, onClose, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [form, setForm]     = useState({ arc_id: '', deposited_amount: '', withdrawal_amount: '' });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createClient(broker.id, {
        arc_id:            form.arc_id.trim(),
        deposited_amount:  form.deposited_amount  || 0,
        withdrawal_amount: form.withdrawal_amount || 0,
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add client.');
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>Add Client</h2>
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
              }}>{error}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 20px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="ARC ID" required>
                  <input
                    style={inputStyle}
                    value={form.arc_id}
                    onChange={set('arc_id')}
                    required
                    placeholder="e.g. CLIENT-001"
                    onFocus={e => e.target.style.borderColor = '#004B4E'}
                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  />
                </Field>
              </div>
              <Field label="Deposited Amount (₹)">
                <input
                  type="number" min="0" step="0.01"
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
                  type="number" min="0" step="0.01"
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
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
              {saving ? 'Adding...' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BrokerDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [broker, setBroker]   = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [showModal, setShowModal] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [bRes, cRes] = await Promise.all([getBroker(id), getClientsByBroker(id)]);
      setBroker(bRes.data.data);
      setClients(cRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load broker.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [id]);

  const handleToggleClient = async (c) => {
    const newStatus = c.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await updateClient(c.id, { status: newStatus });
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, status: newStatus } : x));
    } catch (err) {
      alert(err.response?.data?.message || 'Update failed.');
    }
  };

  const handleDeleteClient = async (c) => {
    if (!window.confirm(`Delete client "${c.arc_id}"?`)) return;
    try {
      await deleteClient(c.id);
      setClients(prev => prev.filter(x => x.id !== c.id));
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed.');
    }
  };

  if (loading) return <div className="um"><div className="um__loading">Loading...</div></div>;
  if (error)   return <div className="um"><div className="um__error">{error}</div></div>;
  if (!broker) return null;

  const totalDeposited  = clients.reduce((s, c) => s + Number(c.deposited_amount  || 0), 0);
  const totalWithdrawn  = clients.reduce((s, c) => s + Number(c.withdrawal_amount || 0), 0);
  const totalEarned     = clients.reduce((s, c) => s + Number(c.earned_amount     || 0), 0);

  return (
    <div className="um">
      <PageHeader
        icon={<BrokerIcon />}
        title={broker.name}
        subtitle={`ARC ID: ${broker.arc_id} • ${broker.brand?.name || 'No brand'} • ${clients.length} client${clients.length !== 1 ? 's' : ''}`}
        actions={
          <>
            <button className="ph-btn ph-btn--ghost" onClick={() => navigate('/brokers')}>
              <BackIcon /> Back
            </button>
            <button className="ph-btn ph-btn--ghost" onClick={() => navigate(`/brokers/${id}/edit`)}>
              Edit Broker
            </button>
            <button className="ph-btn ph-btn--primary" onClick={() => setShowModal(true)}>
              <PlusIcon /> Add Client
            </button>
          </>
        }
      />

      {/* Broker info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <InfoCard label="Designation" value={broker.rm_user ? `${broker.rm_user.username} (${broker.rm_user.role})` : 'Unassigned'} />
        <InfoCard label="Status"      value={broker.status} accent={broker.status === 'Active' ? '#10b981' : '#9ca3af'} />
        <InfoCard label="Total Deposited"  value={formatINR(totalDeposited)} />
        <InfoCard label="Total Withdrawn"  value={formatINR(totalWithdrawn)} />
        <InfoCard label="Total Earned"     value={formatINR(totalEarned)} accent="#3b82f6" />
      </div>

      {/* Modal */}
      {showModal && (
        <AddClientModal
          broker={broker}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); fetchAll(); }}
        />
      )}

      {/* Clients table */}
      <div className="um__card">
        <div className="um__toolbar">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Clients ({clients.length})</h3>
        </div>

        <table className="um__table">
          <thead>
            <tr>
              <th>ARC ID</th>
              <th>DEPOSITED</th>
              <th>WITHDRAWN</th>
              <th>NET TOTAL</th>
              <th>EARNED (1%)</th>
              <th>STATUS</th>
              <th>CREATED</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan="8" className="um__empty">No clients yet. Click "Add Client" to create the first one.</td></tr>
            ) : clients.map(c => (
              <tr key={c.id}>
                <td><code className="um__handle">{c.arc_id}</code></td>
                <td>{formatINR(c.deposited_amount)}</td>
                <td>{formatINR(c.withdrawal_amount)}</td>
                <td>{formatINR(c.net_total)}</td>
                <td style={{ color: '#3b82f6', fontWeight: 600 }}>{formatINR(c.earned_amount)}</td>
                <td>
                  <button
                    className={`um__toggle ${c.status === 'Active' ? 'um__toggle--on' : ''}`}
                    onClick={() => handleToggleClient(c)}
                    title={c.status}
                  >
                    <span className="um__toggle-thumb" />
                  </button>
                </td>
                <td><span className="um__date">{formatDate(c.created_at)}</span></td>
                <td>
                  <div className="um__actions">
                    <button
                      className="um__action-btn um__action-btn--delete"
                      title="Delete"
                      onClick={() => handleDeleteClient(c)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14H6L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfoCard({ label, value, accent }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: '14px 16px',
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

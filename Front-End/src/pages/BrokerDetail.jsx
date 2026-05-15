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

export default function BrokerDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [broker, setBroker]   = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    arc_id: '',
    deposited_amount: '',
    withdrawal_amount: '',
  });

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

  const handleAddClient = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await createClient(id, {
        arc_id: form.arc_id.trim(),
        deposited_amount: form.deposited_amount || 0,
        withdrawal_amount: form.withdrawal_amount || 0,
      });
      setForm({ arc_id: '', deposited_amount: '', withdrawal_amount: '' });
      setShowForm(false);
      fetchAll();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to add client.');
    } finally {
      setSaving(false);
    }
  };

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
            <button className="ph-btn ph-btn--primary" onClick={() => setShowForm(s => !s)}>
              <PlusIcon /> {showForm ? 'Close' : 'Add Client'}
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

      {/* Add client inline form */}
      {showForm && (
        <div className="um__card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>Add Client to {broker.name}</h3>
          {formError && <div className="um__error" style={{ marginBottom: 12 }}>{formError}</div>}
          <form onSubmit={handleAddClient} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: 12, alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>ARC ID *</span>
              <input
                className="um__input"
                value={form.arc_id}
                onChange={e => setForm({ ...form, arc_id: e.target.value })}
                required
                placeholder="e.g. CLIENT-001"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Deposited Amount (₹)</span>
              <input
                className="um__input"
                type="number"
                min="0"
                step="0.01"
                value={form.deposited_amount}
                onChange={e => setForm({ ...form, deposited_amount: e.target.value })}
                placeholder="0.00"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Withdrawal Amount (₹)</span>
              <input
                className="um__input"
                type="number"
                min="0"
                step="0.01"
                value={form.withdrawal_amount}
                onChange={e => setForm({ ...form, withdrawal_amount: e.target.value })}
                placeholder="0.00"
              />
            </label>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Add Client'}
            </button>
          </form>
        </div>
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

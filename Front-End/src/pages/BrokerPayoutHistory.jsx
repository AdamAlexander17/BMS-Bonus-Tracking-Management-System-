import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader/PageHeader';
import { getBrokerPayouts, createBrokerPayout } from '../api/brokers';
import { formatINR } from './Brokers';
import './Users.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

const ExpenseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="16" rx="2"/>
    <path d="M7 8h10"/>
    <path d="M7 12h7"/>
    <path d="M7 16h5"/>
  </svg>
);

const formatDateTime = (str) => {
  if (!str) return '—';
  const parsed = new Date(str.includes('T') ? str : str.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
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

function InfoCard({ label, value, accent }) {
  return (
    <div className="um__card info-card">
      <div className="info-card__label">{label}</div>
      <div className="info-card__value" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

function PayBrokerModal({ broker, onClose, onPaid }) {
  const pendingAmount = Number(broker.pending_payout || 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState(pendingAmount > 0 ? pendingAmount.toFixed(2) : '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError('Enter a valid payout amount.');
      return;
    }
    if (numericAmount > pendingAmount) {
      setError('Payout amount cannot be greater than pending payout.');
      return;
    }
    setSaving(true);
    try {
      await createBrokerPayout(broker.id, { amount: numericAmount });
      onPaid();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record broker payout.');
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} className="bd-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="bms-dialog" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div className="bms-dialog__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 18px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Pay Broker Earned Amount</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>{broker.name} · Pending {formatINR(broker.pending_payout)}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: 18 }}>
              <div className="um__card info-card info-card--sm"><div className="info-card__label">Earned</div><div className="info-card__value">{formatINR(broker.amount_earned)}</div></div>
              <div className="um__card info-card info-card--sm"><div className="info-card__label">Paid</div><div className="info-card__value">{formatINR(broker.amount_paid)}</div></div>
              <div className="um__card info-card info-card--sm"><div className="info-card__label">Pending</div><div className="info-card__value">{formatINR(broker.pending_payout)}</div></div>
            </div>
            <Field label="Payout Amount" required>
              <input type="number" min="0.01" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.style.borderColor = '#004B4E'} onBlur={(e) => e.target.style.borderColor = '#d1d5db'} required />
            </Field>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>Last paid: {formatDateTime(broker.last_paid_at)}</div>
          </div>
          <div className="bms-dialog__footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Recording...' : 'Record Payout'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BrokerPayoutHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const hasPerm = (key) => !user?.permissions || user.permissions.includes(key);
  const canBrokerUpdate = hasPerm('broker:update');

  const [broker, setBroker] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getBrokerPayouts(id);
      setBroker(res.data.broker || null);
      setPayouts(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load broker payout history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [id]);

  const filteredPayouts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return payouts.filter((payout) => {
      const payoutDate = String(payout.created_at || '').slice(0, 10);
      const matchesSearch = !normalizedSearch || [payout.amount, payout.paid_by, payout.created_at].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      const matchesFrom = !fromDate || payoutDate >= fromDate;
      const matchesTo = !toDate || payoutDate <= toDate;
      return matchesSearch && matchesFrom && matchesTo;
    });
  }, [payouts, search, fromDate, toDate]);

  if (loading) return <div className="um"><div className="um__loading">Loading...</div></div>;
  if (error) return <div className="um"><div className="um__error">{error}</div></div>;
  if (!broker) return null;

  return (
    <div className="um">
      <PageHeader
        icon={<ExpenseIcon />}
        title={`${broker.name} Expense History`}
        subtitle={`ARC ID: ${broker.arc_id} • ${broker.brand?.name || 'No brand'} • ${filteredPayouts.length} payout record${filteredPayouts.length !== 1 ? 's' : ''}`}
        actions={
          <>
            <button className="ph-btn ph-btn--ghost" onClick={() => navigate(`/brokers/${broker.id}`)}>
              <BackIcon /> Back to Broker
            </button>
            {canBrokerUpdate && (
              <button className="ph-btn ph-btn--primary" onClick={() => setShowPayModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <path d="M3 7h18v10H3z"/>
                  <path d="M7 12h10"/>
                  <path d="M12 9v6"/>
                </svg>
                Record Payout
              </button>
            )}
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}>
        <InfoCard label="Broker Earned" value={formatINR(broker.amount_earned)} />
        <InfoCard label="Paid to Broker" value={formatINR(broker.amount_paid)} />
        <InfoCard label="Pending Payout" value={formatINR(broker.pending_payout)} />
        <InfoCard label="Last Paid" value={formatDateTime(broker.last_paid_at)} />
        <InfoCard label="Payout Entries" value={filteredPayouts.length} />
      </div>

      <div className="um__card" style={{ marginBottom: 20 }}>
        <div className="um__toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Paid Amount History</h3>
          <div className="bph-filters">
            <div className="bph-filters__group">
              <input
                className="bph-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by amount, user, or date"
              />
            </div>
            <div className="bph-filters__group">
              <label className="bph-filters__label">From</label>
              <input
                type="date"
                className="bph-input bph-input--date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="bph-filters__group">
              <label className="bph-filters__label">To</label>
              <input
                type="date"
                className="bph-input bph-input--date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <table className="um__table">
          <thead>
            <tr>
              <th>AMOUNT</th>
              <th>PAID BY</th>
              <th>DATE & TIME</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayouts.length === 0 ? (
              <tr>
                <td colSpan="3" className="um__empty">No payout history found for the current filters.</td>
              </tr>
            ) : filteredPayouts.map((payout) => (
              <tr key={payout.id}>
                <td style={{ fontWeight: 700 }}>{formatINR(payout.amount)}</td>
                <td>{payout.paid_by || 'Unknown'}</td>
                <td>{formatDateTime(payout.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPayModal && (
        <PayBrokerModal
          broker={broker}
          onClose={() => setShowPayModal(false)}
          onPaid={() => { setShowPayModal(false); fetchAll(); }}
        />
      )}
    </div>
  );
}
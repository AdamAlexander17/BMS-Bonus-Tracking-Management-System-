import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';
import { getBrokerPayouts, createBrokerPayout, updateBrokerPayout, deleteBrokerPayout } from '../api/brokers';
import { getClientsByBroker, getClientTransactions } from '../api/clients';
import { formatINR } from './Brokers';
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
    month: 'short', year: 'numeric'
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

function SuccessChip({ message, onClose }) {
  if (!message) return null;

  return (
    <div style={{ marginLeft: 'auto', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10, maxWidth: '100%' }}>
      <span>{message}</span>
      <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  );
}

function PayBrokerModal({ broker, onClose, onPaid }) {
  const pendingAmount = Number(broker.pending_payout || 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [declineAmount, setDeclineAmount] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const numericAmount = Number(amount || 0);
    const numericDecline = Number(declineAmount || 0);
    if (Number.isNaN(numericAmount) || Number.isNaN(numericDecline) || numericAmount < 0 || numericDecline < 0) {
      setError('Enter valid payout and decline amounts.');
      return;
    }
    if (numericAmount + numericDecline <= 0) {
      setError('Enter a payout amount or a decline amount greater than zero.');
      return;
    }
    if (numericAmount + numericDecline > pendingAmount) {
      setError('Payout amount plus decline cannot be greater than pending payout.');
      return;
    }
    setSaving(true);
    try {
      await createBrokerPayout(broker.id, { amount: numericAmount, decline_amount: numericDecline });
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: 18 }}>
              <div className="um__card info-card info-card--sm"><div className="info-card__label">Earned</div><div className="info-card__value">{formatINR(broker.amount_earned)}</div></div>
              <div className="um__card info-card info-card--sm"><div className="info-card__label">Paid</div><div className="info-card__value">{formatINR(broker.amount_paid)}</div></div>
              <div className="um__card info-card info-card--sm"><div className="info-card__label">Declined</div><div className="info-card__value">{formatINR(broker.amount_declined || 0)}</div></div>
              <div className="um__card info-card info-card--sm"><div className="info-card__label">Pending</div><div className="info-card__value">{formatINR(broker.pending_payout)}</div></div>
            </div>
            <Field label="Payout Amount">
              <input type="number" min="0" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" onFocus={(e) => e.target.style.borderColor = '#004B4E'} onBlur={(e) => e.target.style.borderColor = '#d1d5db'} />
            </Field>
            <div style={{ height: 14 }} />
            <Field label="Decline Amount (deducted from pending)">
              <input type="number" min="0" step="0.01" style={inputStyle} value={declineAmount} onChange={(e) => setDeclineAmount(e.target.value)} placeholder="0.00" onFocus={(e) => e.target.style.borderColor = '#004B4E'} onBlur={(e) => e.target.style.borderColor = '#d1d5db'} />
            </Field>
            <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>Use Decline Amount to subtract from the broker’s pending payout when a client wasn’t doing fair trading. You can use either field, or both together.</div>
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

function EditPayoutModal({ broker, payout, onClose, onUpdated }) {
  const currentDecline = Number(payout.decline_amount || 0);
  const allowedMax = Number(broker.pending_payout || 0) + Number(payout.amount || 0) + currentDecline;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState(Number(payout.amount || 0) > 0 ? Number(payout.amount).toFixed(2) : '');
  const [declineAmount, setDeclineAmount] = useState(currentDecline > 0 ? currentDecline.toFixed(2) : '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const numericAmount = Number(amount || 0);
    const numericDecline = Number(declineAmount || 0);
    if (Number.isNaN(numericAmount) || Number.isNaN(numericDecline) || numericAmount < 0 || numericDecline < 0) {
      setError('Enter valid payout and decline amounts.');
      return;
    }
    if (numericAmount + numericDecline <= 0) {
      setError('Enter a payout amount or a decline amount greater than zero.');
      return;
    }
    if (numericAmount + numericDecline > allowedMax) {
      setError('Payout amount plus decline cannot be greater than pending payout.');
      return;
    }
    setSaving(true);
    try {
      await updateBrokerPayout(broker.id, payout.id, { amount: numericAmount, decline_amount: numericDecline });
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update broker payout.');
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} className="bd-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="bms-dialog" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div className="bms-dialog__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 18px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Edit Payout</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>{broker.name} · Recorded by {payout.paid_by || 'Unknown'}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: 18 }}>
              <div className="um__card info-card info-card--sm"><div className="info-card__label">Current Amount</div><div className="info-card__value">{formatINR(payout.amount)}</div></div>
              <div className="um__card info-card info-card--sm"><div className="info-card__label">Pending</div><div className="info-card__value">{formatINR(broker.pending_payout)}</div></div>
              <div className="um__card info-card info-card--sm"><div className="info-card__label">Allowed Max</div><div className="info-card__value">{formatINR(allowedMax)}</div></div>
            </div>
            <Field label="Payout Amount">
              <input type="number" min="0" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.style.borderColor = '#004B4E'} onBlur={(e) => e.target.style.borderColor = '#d1d5db'} />
            </Field>
            <div style={{ height: 14 }} />
            <Field label="Decline Amount (deducted from pending)">
              <input type="number" min="0" step="0.01" style={inputStyle} value={declineAmount} onChange={(e) => setDeclineAmount(e.target.value)} placeholder="0.00" onFocus={(e) => e.target.style.borderColor = '#004B4E'} onBlur={(e) => e.target.style.borderColor = '#d1d5db'} />
            </Field>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>Recorded: {formatDateTime(payout.created_at)}</div>
          </div>
          <div className="bms-dialog__footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Saving...' : 'Update Payout'}</button>
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
  const canPayBonus      = hasPerm('bonus:pay');
  const canManageBonus   = hasPerm('bonus:manage');
  const canBrokerActions = canBrokerUpdate || canPayBonus || canManageBonus;

  const [broker, setBroker] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [clientTxns, setClientTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showPayModal, setShowPayModal] = useState(false);
  const [editPayout, setEditPayout] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [pageSuccess, setPageSuccess] = useState('');
  const [pageError, setPageError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getBrokerPayouts(id);
      setBroker(res.data.broker || null);
      setPayouts(res.data.data || []);
      try {
        const cRes = await getClientsByBroker(id);
        const clients = cRes.data.data || [];
        const txLists = await Promise.all(
          clients.map((c) => getClientTransactions(c.id).then((r) => (r.data.data || []).map((t) => ({ ...t, _legit: c.legitimacy_status === 'approved' }))).catch(() => []))
        );
        setClientTxns(txLists.flat());
      } catch {
        setClientTxns([]);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load broker payout history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [id]);

  useEffect(() => {
    if (!pageSuccess) return undefined;
    const timeoutId = window.setTimeout(() => setPageSuccess(''), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [pageSuccess]);

  const filteredPayouts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return payouts.filter((payout) => {
      const payoutDate = String(payout.created_at || '').slice(0, 10);
      const payoutMonth = String(payout.created_at || '').slice(0, 7);
      const matchesSearch = !normalizedSearch || [payout.amount, payout.paid_by, payout.created_at].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      const matchesFrom = !fromDate || payoutDate >= fromDate;
      const matchesTo = !toDate || payoutDate <= toDate;
      const matchesMonth = !monthFilter || payoutMonth === monthFilter;
      return matchesSearch && matchesFrom && matchesTo && matchesMonth;
    });
  }, [payouts, search, fromDate, toDate, monthFilter]);

  const sortedPayouts = useMemo(() => {
    if (!sortConfig.key) return filteredPayouts;

    const getSortValue = (payout, key) => {
      switch (key) {
        case 'amount':
          return Number(payout.amount ?? 0);
        case 'paid_by':
          return payout.paid_by || '';
        case 'created_at':
          return payout.created_at ? new Date(payout.created_at).getTime() : null;
        default:
          return '';
      }
    };

    return [...filteredPayouts].sort((left, right) => (
      compareValues(
        getSortValue(left, sortConfig.key),
        getSortValue(right, sortConfig.key),
        sortConfig.direction,
      )
    ));
  }, [filteredPayouts, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((current) => (
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'created_at' ? 'desc' : 'asc' }
    ));
  };

  const getSortIndicator = (key) => (sortConfig.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕');

  const handleDeletePayout = (payout) => {
    setPageSuccess('');
    setPageError('');
    setConfirmState({
      title: 'Delete Payout?',
      itemName: formatINR(payout.amount),
      bullets: ['Recorded payout amount', `Entered by ${payout.paid_by || 'Unknown'}`, 'Broker payout history entry'],
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteBrokerPayout(broker.id, payout.id);
          setPageSuccess('Payout deleted successfully.');
          fetchAll();
        } catch (err) {
          setPageError(err.response?.data?.message || 'Could not delete this payout. Please try again.');
        }
      },
    });
  };

  if (loading) return <div className="um"><div className="um__loading">Loading...</div></div>;
  if (error) return <div className="um"><div className="um__error">{error}</div></div>;
  if (!broker) return null;

  return (
    <div className="um">
      <PageHeader
        icon={<ExpenseIcon />}
        title={`${broker.name} Expense History`}
        subtitle={`ARK ID: ${broker.arc_id} • ${broker.brand?.name || 'No brand'} • ${filteredPayouts.length} payout record${filteredPayouts.length !== 1 ? 's' : ''}`}
        actions={
          <>
            <button className="ph-btn ph-btn--ghost" onClick={() => navigate(`/brokers/${broker.id}`)}>
              <BackIcon /> Back to Broker
            </button>
            {canPayBonus && (
              <button className="ph-btn ph-btn--primary" onClick={() => setShowPayModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <path d="M3 7h18v10H3z"/>
                  <path d="M7 12h10"/>
                  <path d="M12 9v6"/>
                </svg>
                Pay Bonus
              </button>
            )}
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}>
        {(() => {
          const monthPaid   = filteredPayouts.reduce((s, p) => s + Number(p.amount || 0), 0);
          const monthDeclined = filteredPayouts.reduce((s, p) => s + Number(p.decline_amount || 0), 0);
          const lastInMonth = filteredPayouts.length > 0 ? filteredPayouts[0].created_at : null;
          const monthDeposits = clientTxns
            .filter((t) => t._legit && t.transaction_type === 'deposit' && String(t.created_at || '').slice(0, 7) === monthFilter)
            .reduce((s, t) => s + Number(t.amount || 0), 0);
          const monthEarned   = Math.round(monthDeposits * 0.01 * 100) / 100;
          const monthPending  = Math.max(monthEarned - monthPaid - monthDeclined, 0);
          return (
            <>
              <InfoCard
                label={monthFilter ? 'Earned This Month' : 'Broker Earned'}
                value={formatINR(monthFilter ? monthEarned : broker.amount_earned)}
              />
              <InfoCard
                label={monthFilter ? 'Paid This Month' : 'Paid to Broker'}
                value={formatINR(monthFilter ? monthPaid : broker.amount_paid)}
              />
              <InfoCard
                label={monthFilter ? 'Declined (Month)' : 'Declined Amount'}
                value={formatINR(monthFilter ? monthDeclined : broker.amount_declined)}
              />
              <InfoCard
                label={monthFilter ? 'Pending (Month)' : 'Pending Payout'}
                value={formatINR(monthFilter ? monthPending : broker.pending_payout)}
              />
              <InfoCard
                label={monthFilter ? 'Last Paid (Month)' : 'Last Paid'}
                value={monthFilter ? (lastInMonth ? formatDateTime(lastInMonth) : '—') : formatDateTime(broker.last_paid_at)}
              />
              <InfoCard label="Payout Entries" value={filteredPayouts.length} />
            </>
          );
        })()}
      </div>

      <div className="um__card" style={{ marginBottom: 20 }}>
        <div className="um__toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
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
              <label className="bph-filters__label">Month</label>
              <input
                type="month"
                className="bph-input bph-input--date"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              />
            </div>
            {monthFilter && (
              <div className="bph-filters__group">
                <button type="button" className="ph-btn ph-btn--ghost" onClick={() => setMonthFilter('')}>Clear</button>
              </div>
            )}
          </div>
          <SuccessChip message={pageSuccess} onClose={() => setPageSuccess('')} />
        </div>
        {pageError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 16px', fontSize: 13, margin: '0 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{pageError}</span>
            <button onClick={() => setPageError('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
        )}
        <table className="um__table">
          <thead>
            <tr>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('amount')}>AMOUNT <span>{getSortIndicator('amount')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('paid_by')}>PAID BY <span>{getSortIndicator('paid_by')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('created_at')}>DATE & TIME <span>{getSortIndicator('created_at')}</span></button></th>
              {canBrokerActions && <th style={{ minWidth: 124 }}>ACTIONS</th>}
            </tr>
          </thead>
          <tbody>
            {sortedPayouts.length === 0 ? (
              <tr>
                <td colSpan={canBrokerActions ? 4 : 3} className="um__empty">No payout history found for the current filters.</td>
              </tr>
            ) : sortedPayouts.map((payout) => (
              <tr key={payout.id}>
                <td style={{ fontWeight: 700 }}>{formatINR(payout.amount)}</td>
                <td>{payout.paid_by || 'Unknown'}</td>
                <td>{formatDateTime(payout.created_at)}</td>
                {canBrokerActions && (
                  <td>
                    <div className="um__actions">
                      <button
                        className="um__action-btn um__action-btn--edit"
                        title="Edit payout"
                        onClick={() => setEditPayout(payout)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        className="um__action-btn um__action-btn--delete"
                        title="Delete payout"
                        onClick={() => handleDeletePayout(payout)}
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
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPayModal && (
        <PayBrokerModal
          broker={broker}
          onClose={() => setShowPayModal(false)}
          onPaid={() => { setShowPayModal(false); setPageError(''); setPageSuccess('Payout recorded successfully.'); fetchAll(); }}
        />
      )}
      {editPayout && (
        <EditPayoutModal
          broker={broker}
          payout={editPayout}
          onClose={() => setEditPayout(null)}
          onUpdated={() => { setEditPayout(null); setPageError(''); setPageSuccess('Payout updated successfully.'); fetchAll(); }}
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
    </div>
  );
}
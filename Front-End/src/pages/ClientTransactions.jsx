import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';
import { getClient, getClientTransactions, updateClientTransaction, deleteClientTransaction } from '../api/clients';
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

const HistoryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12h18"/>
    <path d="M3 6h18"/>
    <path d="M3 18h18"/>
  </svg>
);

const formatDateTime = (str) => {
  if (!str) return '—';
  return new Date(str.replace(' ', 'T')).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

function SuccessChip({ message, onClose }) {
  if (!message) return null;

  return (
    <div style={{ marginLeft: 'auto', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10, maxWidth: '100%' }}>
      <span>{message}</span>
      <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  );
}

function EditTransactionModal({ transaction, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    transaction_type: transaction.transaction_type || 'deposit',
    amount: Number(transaction.amount || 0) > 0 ? Number(transaction.amount).toFixed(2) : '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const numericAmount = Number(form.amount);
    if (!numericAmount || numericAmount <= 0) {
      setError('Enter a valid transaction amount.');
      return;
    }
    setSaving(true);
    try {
      await updateClientTransaction(transaction.client_id, transaction.id, {
        transaction_type: form.transaction_type,
        amount: numericAmount,
      });
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update transaction.');
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} className="bd-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="bms-dialog" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div className="bms-dialog__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 18px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Edit Transaction</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Recorded by {transaction.entered_by || 'Unknown'} on {formatDateTime(transaction.created_at)}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 20px' }}>
              <Field label="Transaction Type" required>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.transaction_type} onChange={(e) => setForm((current) => ({ ...current, transaction_type: e.target.value }))}>
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                </select>
              </Field>
              <Field label="Amount" required>
                <input type="number" min="0.01" step="0.01" style={inputStyle} value={form.amount} onChange={(e) => setForm((current) => ({ ...current, amount: e.target.value }))} required />
              </Field>
            </div>
          </div>
          <div className="bms-dialog__footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Saving...' : 'Update Transaction'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClientTransactions() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const hasPerm = (key) => !user?.permissions || user.permissions.includes(key);
  const canClientUpdate = hasPerm('client:update');
  const canViewTxns     = hasPerm('transactions:view');

  const [client, setClient] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [editTransaction, setEditTransaction] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [pageSuccess, setPageSuccess] = useState('');
  const [pageError, setPageError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const load = async (isActive = () => true) => {
    setLoading(true);
    setError('');
    try {
      const [clientRes, transactionsRes] = await Promise.all([
        getClient(clientId),
        getClientTransactions(clientId),
      ]);

      if (!isActive()) return;
      setClient(clientRes.data.data);
      setTransactions((transactionsRes.data.data || []).map((transaction) => ({ ...transaction, client_id: Number(clientId) })));
    } catch (err) {
      if (!isActive()) return;
      setError(err.response?.data?.message || 'Failed to load client transactions.');
    } finally {
      if (isActive()) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    load(() => active);
    return () => {
      active = false;
    };
  }, [clientId]);

  useEffect(() => {
    if (!pageSuccess) return undefined;
    const timeoutId = window.setTimeout(() => setPageSuccess(''), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [pageSuccess]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredTransactions = transactions.filter((transaction) => {
    const entryDate = (transaction.created_at || '').slice(0, 10);
    const matchesSearch = !normalizedSearch || [
      transaction.transaction_type,
      transaction.entered_by,
      transaction.amount,
      transaction.created_at,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    const matchesFrom = !fromDate || entryDate >= fromDate;
    const matchesTo = !toDate || entryDate <= toDate;
    return matchesSearch && matchesFrom && matchesTo;
  });

  const sortedTransactions = useMemo(() => {
    if (!sortConfig.key) return filteredTransactions;

    const getSortValue = (transaction, key) => {
      switch (key) {
        case 'transaction_type':
          return transaction.transaction_type || '';
        case 'amount':
          return Number(transaction.amount ?? 0);
        case 'entered_by':
          return transaction.entered_by || '';
        case 'created_at':
          return transaction.created_at ? new Date(transaction.created_at.replace(' ', 'T')).getTime() : null;
        default:
          return '';
      }
    };

    return [...filteredTransactions].sort((left, right) => (
      compareValues(
        getSortValue(left, sortConfig.key),
        getSortValue(right, sortConfig.key),
        sortConfig.direction,
      )
    ));
  }, [filteredTransactions, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((current) => (
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'created_at' ? 'desc' : 'asc' }
    ));
  };

  const getSortIndicator = (key) => (sortConfig.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕');

  const handleDeleteTransaction = (transaction) => {
    setPageSuccess('');
    setPageError('');
    setConfirmState({
      title: 'Delete Transaction?',
      itemName: `${transaction.transaction_type} ${formatINR(transaction.amount)}`,
      bullets: ['Recorded transaction entry', `Entered by ${transaction.entered_by || 'Unknown'}`, 'Client totals will be recalculated'],
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteClientTransaction(clientId, transaction.id);
          await load();
          setPageSuccess('Transaction deleted successfully.');
        } catch (err) {
          setPageError(err.response?.data?.message || 'Could not delete this transaction. Please try again.');
        }
      },
    });
  };

  if (loading) return <div className="um"><div className="um__loading">Loading...</div></div>;
  if (error) return <div className="um"><div className="um__error">{error}</div></div>;
  if (!canViewTxns) return <div className="um"><div className="um__error">You do not have permission to view transactions.</div></div>;
  if (!client) return null;

  return (
    <div className="um">
      <PageHeader
        icon={<HistoryIcon />}
        title={`${client.name} Transactions`}
        subtitle={`ARC ID: ${client.arc_id} • ${client.broker?.name || 'Broker'} • ${sortedTransactions.length} record${sortedTransactions.length !== 1 ? 's' : ''}`}
        actions={
          <button className="ph-btn ph-btn--ghost" onClick={() => navigate(`/brokers/${client.broker.id}`)}>
            <BackIcon /> Back to Broker
          </button>
        }
      />

      <div className="um__card">
        <div className="um__toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div className="bph-filters">
            <div className="bph-filters__group">
              <input
                className="bph-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by type, amount, user, or date"
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
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('transaction_type')}>TYPE <span>{getSortIndicator('transaction_type')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('amount')}>AMOUNT <span>{getSortIndicator('amount')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('entered_by')}>ENTERED BY <span>{getSortIndicator('entered_by')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleSort('created_at')}>DATE & TIME <span>{getSortIndicator('created_at')}</span></button></th>
              {canClientUpdate && <th style={{ minWidth: 124 }}>ACTIONS</th>}
            </tr>
          </thead>
          <tbody>
            {sortedTransactions.length === 0 ? (
              <tr>
                <td colSpan={canClientUpdate ? 5 : 4} className="um__empty">No transactions match the current search or date filters.</td>
              </tr>
            ) : sortedTransactions.map((transaction) => (
              <tr key={transaction.id}>
                <td style={{ textTransform: 'capitalize' }}>{transaction.transaction_type}</td>
                <td>{formatINR(transaction.amount)}</td>
                <td>{transaction.entered_by || 'Unknown'}</td>
                <td>{formatDateTime(transaction.created_at)}</td>
                {canClientUpdate && (
                  <td>
                    <div className="um__actions">
                      <button
                        className="um__action-btn um__action-btn--edit"
                        title="Edit transaction"
                        onClick={() => setEditTransaction(transaction)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        className="um__action-btn um__action-btn--delete"
                        title="Delete transaction"
                        onClick={() => handleDeleteTransaction(transaction)}
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
      {editTransaction && (
        <EditTransactionModal
          transaction={editTransaction}
          onClose={() => setEditTransaction(null)}
          onUpdated={async () => {
            setEditTransaction(null);
            setPageError('');
            setPageSuccess('Transaction updated successfully.');
            await load();
          }}
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

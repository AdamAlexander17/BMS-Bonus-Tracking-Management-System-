import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader/PageHeader';
import { getClient, getClientTransactions } from '../api/clients';
import { formatINR } from './Brokers';
import './Users.css';

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

export default function ClientTransactions() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [clientRes, transactionsRes] = await Promise.all([
          getClient(clientId),
          getClientTransactions(clientId),
        ]);

        if (!active) return;
        setClient(clientRes.data.data);
        setTransactions(transactionsRes.data.data || []);
      } catch (err) {
        if (!active) return;
        setError(err.response?.data?.message || 'Failed to load client transactions.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [clientId]);

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

  if (loading) return <div className="um"><div className="um__loading">Loading...</div></div>;
  if (error) return <div className="um"><div className="um__error">{error}</div></div>;
  if (!client) return null;

  return (
    <div className="um">
      <PageHeader
        icon={<HistoryIcon />}
        title={`${client.name} Transactions`}
        subtitle={`ARC ID: ${client.arc_id} • ${client.broker?.name || 'Broker'} • ${filteredTransactions.length} record${filteredTransactions.length !== 1 ? 's' : ''}`}
        actions={
          <button className="ph-btn ph-btn--ghost" onClick={() => navigate(`/brokers/${client.broker.id}`)}>
            <BackIcon /> Back to Broker
          </button>
        }
      />

      <div className="um__card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) repeat(2, minmax(180px, 1fr))', gap: 16, padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by type, amount, user, or date"
              style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>

      <div className="um__card">
        <div className="um__toolbar">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Transaction History</h3>
        </div>
        <table className="um__table">
          <thead>
            <tr>
              <th>TYPE</th>
              <th>AMOUNT</th>
              <th>ENTERED BY</th>
              <th>DATE & TIME</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan="4" className="um__empty">No transactions match the current search or date filters.</td>
              </tr>
            ) : filteredTransactions.map((transaction) => (
              <tr key={transaction.id}>
                <td style={{ textTransform: 'capitalize' }}>{transaction.transaction_type}</td>
                <td>{formatINR(transaction.amount)}</td>
                <td>{transaction.entered_by || 'Unknown'}</td>
                <td>{formatDateTime(transaction.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

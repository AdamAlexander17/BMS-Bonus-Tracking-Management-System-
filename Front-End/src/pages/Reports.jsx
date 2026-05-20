import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader/PageHeader';
import { getBrokers } from '../api/brokers';
import { getBrands } from '../api/brands';
import { getClientsByBroker, getClientTransactions } from '../api/clients';
import './Users.css';

const controlStyle = {
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

function formatMoney(value) {
  if (value == null) return '—';
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value.replace(' ', 'T')).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateOnly(value) {
  if (!value) return '—';
  return new Date(value.replace(' ', 'T')).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function FilterField({ label, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function StatCard({ label, value, helper }) {
  return (
    <div className="um__card" style={{ padding: '18px 20px', minHeight: 124, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1.2, wordBreak: 'break-word', margin: '10px 0 8px' }}>{value}</div>
      {helper ? <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{helper}</div> : null}
    </div>
  );
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [brokers, setBrokers] = useState([]);
  const [brands, setBrands] = useState([]);
  const [clients, setClients] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [search, setSearch] = useState('');
  const [brandId, setBrandId] = useState('all');
  const [brokerId, setBrokerId] = useState('all');
  const [status, setStatus] = useState('all');
  const [tradingState, setTradingState] = useState('all');
  const [transactionType, setTransactionType] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [brokersRes, brandsRes] = await Promise.all([getBrokers(), getBrands()]);
        const brokersList = brokersRes.data?.data || [];
        const brandsList = brandsRes.data?.data || [];

        const clientResponses = await Promise.allSettled(
          brokersList.map((broker) => getClientsByBroker(broker.id))
        );

        const allClients = [];
        clientResponses.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          const broker = brokersList[index];
          const list = result.value.data?.data || [];
          list.forEach((client) => {
            allClients.push({
              ...client,
              broker_id: broker.id,
              broker_name: broker.name,
              brand_id: broker.brand?.id,
              brand_name: broker.brand?.name || 'Unassigned',
              broker_status: broker.status,
              rm_user_name: broker.rm_user?.username || 'Unassigned',
            });
          });
        });

        const transactionResponses = await Promise.allSettled(
          allClients.map((client) => getClientTransactions(client.id))
        );

        const allTransactions = [];
        transactionResponses.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          const client = allClients[index];
          const list = result.value.data?.data || [];
          list.forEach((transaction) => {
            allTransactions.push({
              ...transaction,
              client_id: client.id,
              client_name: client.name,
              client_arc_id: client.arc_id,
              client_status: client.status,
              is_legitimate: client.is_legitimate,
              broker_id: client.broker_id,
              broker_name: client.broker_name,
              brand_id: client.brand_id,
              brand_name: client.brand_name,
            });
          });
        });

        if (!active) return;
        setBrokers(brokersList);
        setBrands(brandsList);
        setClients(allClients);
        setTransactions(allTransactions);
      } catch (err) {
        if (!active) return;
        setError(err.response?.data?.message || 'Failed to load reports data.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const createdDate = (client.created_at || '').slice(0, 10);
      const matchesSearch = !normalizedSearch || [
        client.name,
        client.arc_id,
        client.broker_name,
        client.brand_name,
        client.rm_user_name,
        client.created_by,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      const matchesBrand = brandId === 'all' || String(client.brand_id) === brandId;
      const matchesBroker = brokerId === 'all' || String(client.broker_id) === brokerId;
      const matchesStatus = status === 'all' || client.status === status;
      const matchesTrading = tradingState === 'all'
        || (tradingState === 'yes' && client.is_legitimate)
        || (tradingState === 'no' && !client.is_legitimate);
      const matchesFrom = !fromDate || createdDate >= fromDate;
      const matchesTo = !toDate || createdDate <= toDate;
      return matchesSearch && matchesBrand && matchesBroker && matchesStatus && matchesTrading && matchesFrom && matchesTo;
    });
  }, [clients, normalizedSearch, brandId, brokerId, status, tradingState, fromDate, toDate]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const transactionDate = (transaction.created_at || '').slice(0, 10);
      const matchesSearch = !normalizedSearch || [
        transaction.client_name,
        transaction.client_arc_id,
        transaction.broker_name,
        transaction.brand_name,
        transaction.transaction_type,
        transaction.entered_by,
        transaction.amount,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      const matchesBrand = brandId === 'all' || String(transaction.brand_id) === brandId;
      const matchesBroker = brokerId === 'all' || String(transaction.broker_id) === brokerId;
      const matchesStatus = status === 'all' || transaction.client_status === status;
      const matchesTrading = tradingState === 'all'
        || (tradingState === 'yes' && transaction.is_legitimate)
        || (tradingState === 'no' && !transaction.is_legitimate);
      const matchesType = transactionType === 'all' || transaction.transaction_type === transactionType;
      const matchesFrom = !fromDate || transactionDate >= fromDate;
      const matchesTo = !toDate || transactionDate <= toDate;
      return matchesSearch && matchesBrand && matchesBroker && matchesStatus && matchesTrading && matchesType && matchesFrom && matchesTo;
    });
  }, [transactions, normalizedSearch, brandId, brokerId, status, tradingState, transactionType, fromDate, toDate]);

  const brokerSummary = useMemo(() => {
    const grouped = new Map();
    filteredClients.forEach((client) => {
      const key = client.broker_id;
      if (!grouped.has(key)) {
        grouped.set(key, {
          broker_id: client.broker_id,
          broker_name: client.broker_name,
          brand_name: client.brand_name,
          rm_user_name: client.rm_user_name,
          client_count: 0,
          legitimate_count: 0,
          deposited_amount: 0,
          withdrawal_amount: 0,
          earned_amount: 0,
        });
      }

      const item = grouped.get(key);
      item.client_count += 1;
      item.legitimate_count += client.is_legitimate ? 1 : 0;
      item.deposited_amount += Number(client.deposited_amount || 0);
      item.withdrawal_amount += Number(client.withdrawal_amount || 0);
      item.earned_amount += Number(client.earned_amount || 0);
    });

    return Array.from(grouped.values()).sort((left, right) => right.earned_amount - left.earned_amount);
  }, [filteredClients]);

  const summary = useMemo(() => {
    const depositTransactions = filteredTransactions
      .filter((transaction) => transaction.transaction_type === 'deposit')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    const withdrawalTransactions = filteredTransactions
      .filter((transaction) => transaction.transaction_type === 'withdrawal')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);

    return {
      brokerCount: new Set(filteredClients.map((client) => client.broker_id)).size,
      clientCount: filteredClients.length,
      legitimateCount: filteredClients.filter((client) => client.is_legitimate).length,
      totalEarned: filteredClients.reduce((total, client) => total + Number(client.earned_amount || 0), 0),
      totalDeposited: filteredClients.reduce((total, client) => total + Number(client.deposited_amount || 0), 0),
      totalWithdrawn: filteredClients.reduce((total, client) => total + Number(client.withdrawal_amount || 0), 0),
      periodDeposits: depositTransactions,
      periodWithdrawals: withdrawalTransactions,
    };
  }, [filteredClients, filteredTransactions]);

  const resetFilters = () => {
    setSearch('');
    setBrandId('all');
    setBrokerId('all');
    setStatus('all');
    setTradingState('all');
    setTransactionType('all');
    setFromDate('');
    setToDate('');
  };

  if (loading) return <div className="um"><div className="um__loading">Loading reports...</div></div>;
  if (error) return <div className="um"><div className="um__error">{error}</div></div>;

  return (
    <div className="um">
      <PageHeader
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        }
        title="Reports"
        subtitle="Operational reporting across brokers, clients, trading status, and transaction history"
      />

      <div className="um__card" style={{ marginBottom: 20 }}>
        <div style={{ padding: 20, borderBottom: '1px solid #e8ecf0' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Report Filters</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Narrow the report by broker, client state, transaction type, and date range.</div>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'end' }}>
          <FilterField label="Search" span={2}>
            <input
              style={controlStyle}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search broker, client, ARC ID, user, type, or amount"
            />
          </FilterField>
          <FilterField label="Brand">
            <select style={controlStyle} value={brandId} onChange={(event) => setBrandId(event.target.value)}>
              <option value="all">All brands</option>
              {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Broker">
            <select style={controlStyle} value={brokerId} onChange={(event) => setBrokerId(event.target.value)}>
              <option value="all">All brokers</option>
              {brokers.map((broker) => <option key={broker.id} value={broker.id}>{broker.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Client Status">
            <select style={controlStyle} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </FilterField>
          <FilterField label="Trading OK">
            <select style={controlStyle} value={tradingState} onChange={(event) => setTradingState(event.target.value)}>
              <option value="all">All clients</option>
              <option value="yes">Checked only</option>
              <option value="no">Unchecked only</option>
            </select>
          </FilterField>
          <FilterField label="Transaction Type">
            <select style={controlStyle} value={transactionType} onChange={(event) => setTransactionType(event.target.value)}>
              <option value="all">All types</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </FilterField>
          <FilterField label="From Date">
            <input type="date" style={controlStyle} value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </FilterField>
          <FilterField label="To Date">
            <input type="date" style={controlStyle} value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </FilterField>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, minHeight: 40 }}>
            <button className="ph-btn ph-btn--ghost" type="button" onClick={resetFilters}>Reset Filters</button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12, fontSize: 15, fontWeight: 700, color: '#111827' }}>Key Metrics</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard label="Brokers In Report" value={formatCount(summary.brokerCount)}  />
        <StatCard label="Clients In Report" value={formatCount(summary.clientCount)}  />
        <StatCard label="Legitimate Clients" value={formatCount(summary.legitimateCount)}  />
        <StatCard label="Total Earned" value={formatMoney(summary.totalEarned)}  />
        <StatCard label="Client Deposits" value={formatMoney(summary.totalDeposited)}  />
        <StatCard label="Client Withdrawals" value={formatMoney(summary.totalWithdrawn)}/>
      </div>

      <div className="um__card" style={{ marginBottom: 20 }}>
        <div className="um__toolbar">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Broker Performance Summary</h3>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{brokerSummary.length} broker record{brokerSummary.length !== 1 ? 's' : ''}</span>
        </div>
        <table className="um__table">
          <thead>
            <tr>
              <th>Broker</th>
              <th>Brand</th>
              <th>RM</th>
              <th>Clients</th>
              <th>Trading OK</th>
              <th>Deposited</th>
              <th>Withdrawn</th>
              <th>Earned</th>
            </tr>
          </thead>
          <tbody>
            {brokerSummary.length === 0 ? (
              <tr><td colSpan="8" className="um__empty">No brokers match the current report filters.</td></tr>
            ) : brokerSummary.map((broker) => (
              <tr key={broker.broker_id}>
                <td>{broker.broker_name}</td>
                <td>{broker.brand_name}</td>
                <td>{broker.rm_user_name}</td>
                <td>{formatCount(broker.client_count)}</td>
                <td>{formatCount(broker.legitimate_count)}</td>
                <td>{formatMoney(broker.deposited_amount)}</td>
                <td>{formatMoney(broker.withdrawal_amount)}</td>
                <td style={{ fontWeight: 600, color: '#111827' }}>{formatMoney(broker.earned_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="um__card" style={{ marginBottom: 20 }}>
        <div className="um__toolbar">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Client Bonus Report</h3>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{filteredClients.length} client record{filteredClients.length !== 1 ? 's' : ''}</span>
        </div>
        <table className="um__table">
          <thead>
            <tr>
              <th>Client</th>
              <th>ARC ID</th>
              <th>Broker</th>
              <th>Brand</th>
              <th>Status</th>
              <th>Trading OK</th>
              <th>Deposited</th>
              <th>Withdrawn</th>
              <th>Earned</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr><td colSpan="10" className="um__empty">No clients match the current report filters.</td></tr>
            ) : filteredClients.map((client) => (
              <tr key={client.id}>
                <td>{client.name}</td>
                <td>{client.arc_id}</td>
                <td>{client.broker_name}</td>
                <td>{client.brand_name}</td>
                <td>{client.status}</td>
                <td>{client.is_legitimate ? 'Yes' : 'No'}</td>
                <td>{formatMoney(client.deposited_amount)}</td>
                <td>{formatMoney(client.withdrawal_amount)}</td>
                <td style={{ fontWeight: 600, color: '#111827' }}>{formatMoney(client.earned_amount)}</td>
                <td>{formatDateOnly(client.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="um__card">
        <div className="um__toolbar">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Transaction Ledger</h3>
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''} · Deposits {formatMoney(summary.periodDeposits)} · Withdrawals {formatMoney(summary.periodWithdrawals)}
          </span>
        </div>
        <table className="um__table">
          <thead>
            <tr>
              <th>Client</th>
              <th>ARC ID</th>
              <th>Broker</th>
              <th>Brand</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Entered By</th>
              <th>Date & Time</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr><td colSpan="8" className="um__empty">No transactions match the current report filters.</td></tr>
            ) : filteredTransactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.client_name}</td>
                <td>{transaction.client_arc_id}</td>
                <td>{transaction.broker_name}</td>
                <td>{transaction.brand_name}</td>
                <td style={{ textTransform: 'capitalize' }}>{transaction.transaction_type}</td>
                <td>{formatMoney(transaction.amount)}</td>
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

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader/PageHeader';
import { getBrokers } from '../api/brokers';
import { getBrands } from '../api/brands';
import { getClientsByBroker, getClientTransactions } from '../api/clients';
import './Users.css';

const inputControlStyle = {
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

const selectControlStyle = {
  width: '100%',
  height: 40,
  padding: '0 12px',
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

function escapeCsvValue(value) {
  const normalized = String(value ?? '');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function exportRowsToCsv(fileName, columns, rows) {
  const header = columns.map((column) => escapeCsvValue(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(column.value(row))).join(',')).join('\n');
  const csv = [header, body].filter(Boolean).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function paginateRows(rows, page, pageSize) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
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
    <div className="um__card" style={{ padding: '10px 12px', minHeight: 78, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.45 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.2, wordBreak: 'break-word', margin: '5px 0 4px' }}>{value}</div>
      {helper ? <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.3 }}>{helper}</div> : null}
    </div>
  );
}

function ReportToolbar({ title, subtitle, rowCount, pageSize, onPageSizeChange, onExport, children }) {
  return (
    <div className="um__toolbar">
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
        {subtitle ? <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{subtitle}</div> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>{rowCount} record{rowCount !== 1 ? 's' : ''}</span>
        <select className="app-report-select" style={{ ...selectControlStyle, width: 92, height: 36, fontSize: 13 }} value={String(pageSize)} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          <option value="5">5 rows</option>
          <option value="10">10 rows</option>
          <option value="25">25 rows</option>
          <option value="50">50 rows</option>
        </select>
        {onExport && <button className="ph-btn ph-btn--ghost" type="button" onClick={onExport}>Export CSV</button>}
        {children}
      </div>
    </div>
  );
}

function PaginationControls({ page, pageSize, totalRows, onChange }) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid #e8ecf0', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: '#6b7280' }}>
        Showing {totalRows === 0 ? 0 : ((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalRows)} of {totalRows}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="ph-btn ph-btn--ghost" type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
        <span style={{ fontSize: 13, color: '#374151' }}>Page {page} of {totalPages}</span>
        <button className="ph-btn ph-btn--ghost" type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const canExport = !user?.permissions || user.permissions.includes('report:export');

  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
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
  const [showFilters, setShowFilters] = useState(false);
  const [brokerPage, setBrokerPage] = useState(1);
  const [clientPage, setClientPage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);
  const [brokerPageSize, setBrokerPageSize] = useState(10);
  const [clientPageSize, setClientPageSize] = useState(10);
  const [transactionPageSize, setTransactionPageSize] = useState(10);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setTransactionsLoading(true);
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

        if (!active) return;
        setBrokers(brokersList);
        setBrands(brandsList);
        setClients(allClients);

        setLoading(false);

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
        setTransactions(allTransactions);
      } catch (err) {
        if (!active) return;
        setError(err.response?.data?.message || 'Failed to load reports data.');
      } finally {
        if (active) {
          setLoading(false);
          setTransactionsLoading(false);
        }
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

  const brokerColumns = useMemo(() => [
    { label: 'Broker', value: (row) => row.broker_name },
    { label: 'Brand', value: (row) => row.brand_name },
    { label: 'RM', value: (row) => row.rm_user_name },
    { label: 'Clients', value: (row) => row.client_count },
    { label: 'Trading OK', value: (row) => row.legitimate_count },
    { label: 'Deposited', value: (row) => row.deposited_amount },
    { label: 'Withdrawn', value: (row) => row.withdrawal_amount },
    { label: 'Earned', value: (row) => row.earned_amount },
  ], []);

  const clientColumns = useMemo(() => [
    { label: 'Client', value: (row) => row.name },
    { label: 'ARC ID', value: (row) => row.arc_id },
    { label: 'Broker', value: (row) => row.broker_name },
    { label: 'Brand', value: (row) => row.brand_name },
    { label: 'Status', value: (row) => row.status },
    { label: 'Trading OK', value: (row) => row.is_legitimate ? 'Yes' : 'No' },
    { label: 'Deposited', value: (row) => row.deposited_amount },
    { label: 'Withdrawn', value: (row) => row.withdrawal_amount },
    { label: 'Earned', value: (row) => row.earned_amount },
    { label: 'Created', value: (row) => row.created_at },
  ], []);

  const transactionColumns = useMemo(() => [
    { label: 'Client', value: (row) => row.client_name },
    { label: 'ARC ID', value: (row) => row.client_arc_id },
    { label: 'Broker', value: (row) => row.broker_name },
    { label: 'Brand', value: (row) => row.brand_name },
    { label: 'Type', value: (row) => row.transaction_type },
    { label: 'Amount', value: (row) => row.amount },
    { label: 'Entered By', value: (row) => row.entered_by || 'Unknown' },
    { label: 'Date Time', value: (row) => row.created_at },
  ], []);

  useEffect(() => { setBrokerPage(1); }, [brokerSummary.length, brokerPageSize]);
  useEffect(() => { setClientPage(1); }, [filteredClients.length, clientPageSize]);
  useEffect(() => { setTransactionPage(1); }, [filteredTransactions.length, transactionPageSize]);

  const pagedBrokerSummary = useMemo(() => paginateRows(brokerSummary, brokerPage, brokerPageSize), [brokerSummary, brokerPage, brokerPageSize]);
  const pagedClients = useMemo(() => paginateRows(filteredClients, clientPage, clientPageSize), [filteredClients, clientPage, clientPageSize]);
  const pagedTransactions = useMemo(() => paginateRows(filteredTransactions, transactionPage, transactionPageSize), [filteredTransactions, transactionPage, transactionPageSize]);

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
        actions={(
          <button className="ph-btn ph-btn--ghost" type="button" onClick={() => setShowFilters((current) => !current)}>
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        )}
      />

      {error ? <div className="um__error" style={{ marginBottom: 20 }}>{error}</div> : null}

      {loading ? (
        <div className="um__card">
          <div className="um__toolbar">
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Report Overview</h3>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                Fetching brokers, clients, and transaction data.
              </div>
            </div>
          </div>
          <div className="um__loading">Loading...</div>
        </div>
      ) : (
        <>

      {showFilters && (
        <div className="um__card" style={{ marginBottom: 20 }}>
          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'end' }}>
            <FilterField label="Search" span={2}>
              <input
                style={inputControlStyle}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search broker, client, ARC ID, user, type, or amount"
              />
            </FilterField>
            <FilterField label="Brand">
              <select className="app-report-select" style={selectControlStyle} value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                <option value="all">All brands</option>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </FilterField>
            <FilterField label="Broker">
              <select className="app-report-select" style={selectControlStyle} value={brokerId} onChange={(event) => setBrokerId(event.target.value)}>
                <option value="all">All brokers</option>
                {brokers.map((broker) => <option key={broker.id} value={broker.id}>{broker.name}</option>)}
              </select>
            </FilterField>
            <FilterField label="Client Status">
              <select className="app-report-select" style={selectControlStyle} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </FilterField>
            <FilterField label="Trading OK">
              <select className="app-report-select" style={selectControlStyle} value={tradingState} onChange={(event) => setTradingState(event.target.value)}>
                <option value="all">All clients</option>
                <option value="yes">Checked only</option>
                <option value="no">Unchecked only</option>
              </select>
            </FilterField>
            <FilterField label="Transaction Type">
              <select className="app-report-select" style={selectControlStyle} value={transactionType} onChange={(event) => setTransactionType(event.target.value)}>
                <option value="all">All types</option>
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </FilterField>
            <FilterField label="From Date">
              <input type="date" style={inputControlStyle} value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </FilterField>
            <FilterField label="To Date">
              <input type="date" style={inputControlStyle} value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </FilterField>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, minHeight: 40 }}>
              <button className="ph-btn ph-btn--ghost" type="button" onClick={resetFilters}>Reset Filters</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12, fontSize: 15, fontWeight: 700, color: '#111827' }}>Key Metrics</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Brokers In Report" value={formatCount(summary.brokerCount)} />
        <StatCard label="Clients In Report" value={formatCount(summary.clientCount)} />
        <StatCard label="Legitimate Clients" value={formatCount(summary.legitimateCount)} />
        <StatCard label="Total Earned" value={formatMoney(summary.totalEarned)} />
        <StatCard label="Client Deposits" value={formatMoney(summary.totalDeposited)} />
        <StatCard label="Client Withdrawals" value={formatMoney(summary.totalWithdrawn)} />
      </div>

      <div className="um__card" style={{ marginBottom: 20 }}>
        <ReportToolbar
          title="Broker Performance Summary"
          rowCount={brokerSummary.length}
          pageSize={brokerPageSize}
          onPageSizeChange={setBrokerPageSize}
          onExport={canExport ? () => exportRowsToCsv('broker-performance-summary.csv', brokerColumns, brokerSummary) : undefined}
        />
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
            {pagedBrokerSummary.length === 0 ? (
              <tr><td colSpan="8" className="um__empty">No brokers match the current report filters.</td></tr>
            ) : pagedBrokerSummary.map((broker) => (
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
        <PaginationControls page={brokerPage} pageSize={brokerPageSize} totalRows={brokerSummary.length} onChange={setBrokerPage} />
      </div>

      <div className="um__card" style={{ marginBottom: 20 }}>
        <ReportToolbar
          title="Client Bonus Report"
          rowCount={filteredClients.length}
          pageSize={clientPageSize}
          onPageSizeChange={setClientPageSize}
          onExport={canExport ? () => exportRowsToCsv('client-bonus-report.csv', clientColumns, filteredClients) : undefined}
        />
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
            {pagedClients.length === 0 ? (
              <tr><td colSpan="10" className="um__empty">No clients match the current report filters.</td></tr>
            ) : pagedClients.map((client) => (
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
        <PaginationControls page={clientPage} pageSize={clientPageSize} totalRows={filteredClients.length} onChange={setClientPage} />
      </div>

      <div className="um__card">
        <ReportToolbar
          title="Transaction Ledger"
          subtitle={transactionsLoading
            ? 'Loading transaction history...'
            : `Deposits ${formatMoney(summary.periodDeposits)} · Withdrawals ${formatMoney(summary.periodWithdrawals)}`}
          rowCount={filteredTransactions.length}
          pageSize={transactionPageSize}
          onPageSizeChange={setTransactionPageSize}
          onExport={canExport ? () => exportRowsToCsv('transaction-ledger.csv', transactionColumns, filteredTransactions) : undefined}
        />
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
            {transactionsLoading ? (
              <tr><td colSpan="8" className="um__empty">Loading transaction ledger...</td></tr>
            ) : pagedTransactions.length === 0 ? (
              <tr><td colSpan="8" className="um__empty">No transactions match the current report filters.</td></tr>
            ) : pagedTransactions.map((transaction) => (
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
        <PaginationControls page={transactionPage} pageSize={transactionPageSize} totalRows={filteredTransactions.length} onChange={setTransactionPage} />
      </div>
        </>
      )}
    </div>
  );
}

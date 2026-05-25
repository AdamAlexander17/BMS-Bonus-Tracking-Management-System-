import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader/PageHeader';
import CustomSelect from '../components/CustomSelect/CustomSelect';
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

function formatMoney(value) {
  if (value == null) return '—';
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAmountForCsv(value) {
  if (value == null || value === '') return '';
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return String(value);
  return numericValue.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(String(value).includes('T') ? value : String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-IN', {
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
  const body = rows
    .map((row) => columns.map((column) => escapeCsvValue((column.exportValue || column.value)(row))).join(','))
    .join('\n');
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
    <div className="um__card report-stat" style={{ padding: '10px 12px', minHeight: 78, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div className="report-stat__label">{label}</div>
      <div className="report-stat__value">{value}</div>
      {helper ? <div className="report-stat__helper">{helper}</div> : null}
    </div>
  );
}

function ReportToolbar({ title, subtitle, rowCount, pageSize, onPageSizeChange, onExport, leftContent, children }) {
  return (
    <div className="um__toolbar">
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        {leftContent || (
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
            {subtitle ? <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{subtitle}</div> : null}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
        <CustomSelect
          variant="form"
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          options={[{value:'5',label:'5'},{value:'10',label:'10'},{value:'25',label:'25'},{value:'50',label:'50'}]}
        />
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

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
    <path d="M3 12a8.5 8.5 0 0 1 14.5-6"/>
    <polyline points="17 2 17 6 13 6"/>
    <path d="M21 12a8.5 8.5 0 0 1-14.5 6"/>
    <polyline points="7 22 7 18 11 18"/>
  </svg>
);

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
  const [refreshKey, setRefreshKey] = useState(0);

  const [brokerSortConfig, setBrokerSortConfig] = useState({ key: null, direction: 'asc' });
  const [clientSortConfig, setClientSortConfig] = useState({ key: null, direction: 'asc' });
  const [txSortConfig, setTxSortConfig] = useState({ key: null, direction: 'asc' });

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
  }, [refreshKey]);

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

  const brokerLookup = useMemo(() => {
    const lookup = new Map();
    brokers.forEach((broker) => {
      lookup.set(broker.id, broker);
    });
    return lookup;
  }, [brokers]);

  const brokerSummary = useMemo(() => {
    const grouped = new Map();
    filteredClients.forEach((client) => {
      const key = client.broker_id;
      const brokerMeta = brokerLookup.get(key);
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
          amount_paid: Number(brokerMeta?.amount_paid || 0),
          pending_payout: Number(brokerMeta?.pending_payout || 0),
          last_paid_at: brokerMeta?.last_paid_at || null,
        });
      }

      const item = grouped.get(key);
      item.client_count += 1;
      item.legitimate_count += client.is_legitimate ? 1 : 0;
      item.deposited_amount += Number(client.deposited_amount || 0);
      item.withdrawal_amount += Number(client.withdrawal_amount || 0);
      item.earned_amount += Number(client.earned_amount || 0);
      item.amount_paid = Number(brokerMeta?.amount_paid || item.amount_paid || 0);
      item.pending_payout = Number(brokerMeta?.pending_payout || item.pending_payout || 0);
      item.last_paid_at = brokerMeta?.last_paid_at || item.last_paid_at || null;
    });

    return Array.from(grouped.values()).sort((left, right) => right.earned_amount - left.earned_amount);
  }, [filteredClients, brokerLookup]);

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
      totalPaid: brokerSummary.reduce((total, broker) => total + Number(broker.amount_paid || 0), 0),
      totalPending: brokerSummary.reduce((total, broker) => total + Number(broker.pending_payout || 0), 0),
      totalDeposited: filteredClients.reduce((total, client) => total + Number(client.deposited_amount || 0), 0),
      totalWithdrawn: filteredClients.reduce((total, client) => total + Number(client.withdrawal_amount || 0), 0),
      periodDeposits: depositTransactions,
      periodWithdrawals: withdrawalTransactions,
    };
  }, [filteredClients, filteredTransactions, brokerSummary]);

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
    { label: 'LEGITIMATE CLIENT', value: (row) => row.legitimate_count },
    { label: 'Deposited', value: (row) => row.deposited_amount, exportValue: (row) => formatAmountForCsv(row.deposited_amount) },
    { label: 'Withdrawn', value: (row) => row.withdrawal_amount, exportValue: (row) => formatAmountForCsv(row.withdrawal_amount) },
    { label: 'Earned', value: (row) => row.earned_amount, exportValue: (row) => formatAmountForCsv(row.earned_amount) },
    { label: 'Paid', value: (row) => row.amount_paid, exportValue: (row) => formatAmountForCsv(row.amount_paid) },
    { label: 'Pending Payout', value: (row) => row.pending_payout, exportValue: (row) => formatAmountForCsv(row.pending_payout) },
    { label: 'Last Paid', value: (row) => row.last_paid_at, exportValue: (row) => row.last_paid_at ? formatDateTime(row.last_paid_at) : '' },
  ], []);

  const clientColumns = useMemo(() => [
    { label: 'Client', value: (row) => row.name },
    { label: 'ARC ID', value: (row) => row.arc_id },
    { label: 'Broker', value: (row) => row.broker_name },
    { label: 'Brand', value: (row) => row.brand_name },
    { label: 'Status', value: (row) => row.status },
    { label: 'LEGITIMATE CLIENT', value: (row) => row.is_legitimate ? 'Yes' : 'No' },
    { label: 'Deposited', value: (row) => row.deposited_amount, exportValue: (row) => formatAmountForCsv(row.deposited_amount) },
    { label: 'Withdrawn', value: (row) => row.withdrawal_amount, exportValue: (row) => formatAmountForCsv(row.withdrawal_amount) },
    { label: 'Earned', value: (row) => row.earned_amount, exportValue: (row) => formatAmountForCsv(row.earned_amount) },
    { label: 'Created', value: (row) => row.created_at, exportValue: (row) => formatDateTime(row.created_at) },
  ], []);

  const transactionColumns = useMemo(() => [
    { label: 'Client', value: (row) => row.client_name },
    { label: 'ARC ID', value: (row) => row.client_arc_id },
    { label: 'Broker', value: (row) => row.broker_name },
    { label: 'Brand', value: (row) => row.brand_name },
    { label: 'Type', value: (row) => row.transaction_type },
    { label: 'Amount', value: (row) => row.amount, exportValue: (row) => formatAmountForCsv(row.amount) },
    { label: 'Entered By', value: (row) => row.entered_by || 'Unknown' },
    { label: 'Date Time', value: (row) => row.created_at, exportValue: (row) => formatDateTime(row.created_at) },
  ], []);

  useEffect(() => { setBrokerPage(1); }, [brokerSummary.length, brokerPageSize, brokerSortConfig]);
  useEffect(() => { setClientPage(1); }, [filteredClients.length, clientPageSize, clientSortConfig]);
  useEffect(() => { setTransactionPage(1); }, [filteredTransactions.length, transactionPageSize, txSortConfig]);

  const sortedBrokerSummary = useMemo(() => {
    if (!brokerSortConfig.key) return brokerSummary;
    return [...brokerSummary].sort((a, b) => compareValues(a[brokerSortConfig.key], b[brokerSortConfig.key], brokerSortConfig.direction));
  }, [brokerSummary, brokerSortConfig]);

  const sortedClients = useMemo(() => {
    if (!clientSortConfig.key) return filteredClients;
    return [...filteredClients].sort((a, b) => compareValues(a[clientSortConfig.key], b[clientSortConfig.key], clientSortConfig.direction));
  }, [filteredClients, clientSortConfig]);

  const sortedTransactions = useMemo(() => {
    if (!txSortConfig.key) return filteredTransactions;
    return [...filteredTransactions].sort((a, b) => compareValues(a[txSortConfig.key], b[txSortConfig.key], txSortConfig.direction));
  }, [filteredTransactions, txSortConfig]);

  const pagedBrokerSummary = useMemo(() => paginateRows(sortedBrokerSummary, brokerPage, brokerPageSize), [sortedBrokerSummary, brokerPage, brokerPageSize]);
  const pagedClients = useMemo(() => paginateRows(sortedClients, clientPage, clientPageSize), [sortedClients, clientPage, clientPageSize]);
  const pagedTransactions = useMemo(() => paginateRows(sortedTransactions, transactionPage, transactionPageSize), [sortedTransactions, transactionPage, transactionPageSize]);

  const handleBrokerSort = (key) => setBrokerSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  const handleClientSort = (key) => setClientSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  const handleTxSort = (key) => setTxSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));

  const getBrokerIndicator = (key) => brokerSortConfig.key !== key ? '↕' : brokerSortConfig.direction === 'asc' ? '↑' : '↓';
  const getClientIndicator = (key) => clientSortConfig.key !== key ? '↕' : clientSortConfig.direction === 'asc' ? '↑' : '↓';
  const getTxIndicator = (key) => txSortConfig.key !== key ? '↕' : txSortConfig.direction === 'asc' ? '↑' : '↓';

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="ph-btn ph-btn--ghost" type="button" onClick={() => setShowFilters((current) => !current)}>
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            <button className="ph-btn ph-btn--ghost ph-btn--refresh" type="button" onClick={() => setRefreshKey((current) => current + 1)}>
              <RefreshIcon />
              Refresh
            </button>
          </div>
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
        <div className="um__card" style={{ marginBottom: 20, overflow: 'visible', position: 'relative', zIndex: 5 }}>
          <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', columnGap: 12, rowGap: 10, alignItems: 'end', overflow: 'visible' }}>
            <FilterField label="Brand">
              <CustomSelect
                value={brandId}
                onChange={setBrandId}
                options={brands.map((brand) => ({ value: String(brand.id), label: brand.name }))}
                placeholder="All brands"
                style={{ width: '100%' }}
              />
            </FilterField>
            <FilterField label="Broker">
              <CustomSelect
                value={brokerId}
                onChange={setBrokerId}
                options={brokers.map((broker) => ({ value: String(broker.id), label: broker.name }))}
                placeholder="All brokers"
                style={{ width: '100%' }}
              />
            </FilterField>
            <FilterField label="Client Status">
              <CustomSelect
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'Active', label: 'Active' },
                  { value: 'Inactive', label: 'Inactive' },
                ]}
                placeholder="All statuses"
                style={{ width: '100%' }}
              />
            </FilterField>
            <FilterField label="LEGITIMATE CLIENT">
              <CustomSelect
                value={tradingState}
                onChange={setTradingState}
                options={[
                  { value: 'yes', label: 'Checked only' },
                  { value: 'no', label: 'Unchecked only' },
                ]}
                placeholder="All clients"
                style={{ width: '100%' }}
              />
            </FilterField>
            <FilterField label="Transaction Type">
              <CustomSelect
                value={transactionType}
                onChange={setTransactionType}
                options={[
                  { value: 'deposit', label: 'Deposit' },
                  { value: 'withdrawal', label: 'Withdrawal' },
                ]}
                placeholder="All types"
                style={{ width: '100%' }}
              />
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

      <div className="report-section-title" style={{ marginBottom: 12, fontSize: 15, fontWeight: 700 }}>Key Metrics</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Brokers In Report" value={formatCount(summary.brokerCount)} />
        <StatCard label="Clients In Report" value={formatCount(summary.clientCount)} />
        <StatCard label="Legitimate Clients" value={formatCount(summary.legitimateCount)} />
        <StatCard label="Total Earned" value={formatMoney(summary.totalEarned)} />
        <StatCard label="Total Paid" value={formatMoney(summary.totalPaid)} />
        <StatCard label="Pending Payout" value={formatMoney(summary.totalPending)} />
        <StatCard label="Client Deposits" value={formatMoney(summary.totalDeposited)} />
        <StatCard label="Client Withdrawals" value={formatMoney(summary.totalWithdrawn)} />
      </div>

      <div className="um__card" style={{ marginBottom: 20 }}>
        <ReportToolbar
          title="Broker Performance Summary"
          rowCount={brokerSummary.length}
          pageSize={brokerPageSize}
          onPageSizeChange={setBrokerPageSize}
          onExport={canExport ? () => exportRowsToCsv('broker-performance-summary.csv', brokerColumns, sortedBrokerSummary) : undefined}
          leftContent={(
            <div className="um__search" style={{ maxWidth: 360 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.65" y1="16.65" x2="21" y2="21" />
              </svg>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search broker, client, ARC ID, user, type, or amount"
              />
            </div>
          )}
        />
        <table className="um__table">
          <thead>
            <tr>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('broker_name')}>Broker <span>{getBrokerIndicator('broker_name')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('brand_name')}>Brand <span>{getBrokerIndicator('brand_name')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('rm_user_name')}>RM <span>{getBrokerIndicator('rm_user_name')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('client_count')}>Clients <span>{getBrokerIndicator('client_count')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('legitimate_count')}>LEGITIMATE CLIENT <span>{getBrokerIndicator('legitimate_count')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('deposited_amount')}>Deposited <span>{getBrokerIndicator('deposited_amount')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('withdrawal_amount')}>Withdrawn <span>{getBrokerIndicator('withdrawal_amount')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('earned_amount')}>Earned <span>{getBrokerIndicator('earned_amount')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('amount_paid')}>Paid <span>{getBrokerIndicator('amount_paid')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('pending_payout')}>Pending <span>{getBrokerIndicator('pending_payout')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleBrokerSort('last_paid_at')}>Last Paid <span>{getBrokerIndicator('last_paid_at')}</span></button></th>
            </tr>
          </thead>
          <tbody>
            {pagedBrokerSummary.length === 0 ? (
              <tr><td colSpan="11" className="um__empty">No brokers match the current report filters.</td></tr>
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
                <td style={{ fontWeight: 600, color: '#111827' }}>{formatMoney(broker.amount_paid)}</td>
                <td style={{ fontWeight: 600, color: '#111827' }}>{formatMoney(broker.pending_payout)}</td>
                <td>{formatDateTime(broker.last_paid_at)}</td>
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
          onExport={canExport ? () => exportRowsToCsv('client-bonus-report.csv', clientColumns, sortedClients) : undefined}
        />
        <table className="um__table">
          <thead>
            <tr>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleClientSort('name')}>Client <span>{getClientIndicator('name')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleClientSort('arc_id')}>ARC ID <span>{getClientIndicator('arc_id')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleClientSort('broker_name')}>Broker <span>{getClientIndicator('broker_name')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleClientSort('brand_name')}>Brand <span>{getClientIndicator('brand_name')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleClientSort('status')}>Status <span>{getClientIndicator('status')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleClientSort('is_legitimate')}>LEGITIMATE CLIENT <span>{getClientIndicator('is_legitimate')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleClientSort('deposited_amount')}>Deposited <span>{getClientIndicator('deposited_amount')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleClientSort('withdrawal_amount')}>Withdrawn <span>{getClientIndicator('withdrawal_amount')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleClientSort('earned_amount')}>Earned <span>{getClientIndicator('earned_amount')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleClientSort('created_at')}>Created <span>{getClientIndicator('created_at')}</span></button></th>
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
          onExport={canExport ? () => exportRowsToCsv('transaction-ledger.csv', transactionColumns, sortedTransactions) : undefined}
        />
        <table className="um__table">
          <thead>
            <tr>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleTxSort('client_name')}>Client <span>{getTxIndicator('client_name')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleTxSort('client_arc_id')}>ARC ID <span>{getTxIndicator('client_arc_id')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleTxSort('broker_name')}>Broker <span>{getTxIndicator('broker_name')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleTxSort('brand_name')}>Brand <span>{getTxIndicator('brand_name')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleTxSort('transaction_type')}>Type <span>{getTxIndicator('transaction_type')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleTxSort('amount')}>Amount <span>{getTxIndicator('amount')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleTxSort('entered_by')}>Entered By <span>{getTxIndicator('entered_by')}</span></button></th>
              <th><button type="button" style={sortButtonStyle} onClick={() => handleTxSort('created_at')}>Date &amp; Time <span>{getTxIndicator('created_at')}</span></button></th>
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

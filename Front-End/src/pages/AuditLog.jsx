import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader/PageHeader';
import { getAuditLogs } from '../api/auditLogs';
import CustomSelect from '../components/CustomSelect/CustomSelect';
import './AuditLog.css';

const moduleOptions = [
  { label: 'All Modules', value: '' },
  { label: 'Auth', value: 'auth' },
  { label: 'Users', value: 'user' },
  { label: 'Brands', value: 'brand' },
  { label: 'Roles', value: 'role' },
  { label: 'Brokers', value: 'broker' },
  { label: 'Clients', value: 'client' },
];

const actionOptions = [
  { label: 'All Actions', value: '' },
  { label: 'Login', value: 'login' },
  { label: 'Logout', value: 'logout' },
  { label: 'Create', value: 'create' },
  { label: 'Update', value: 'update' },
  { label: 'Delete', value: 'delete' },
  { label: 'Transaction', value: 'transaction' },
  { label: 'Assign Permissions', value: 'assign_permissions' },
  { label: 'Remove Permissions', value: 'remove_permissions' },
  { label: 'Set Permissions', value: 'set_permissions' },
];

const pageSizeOptions = [10, 20, 50, 100];

function formatDateTime(value) {
  if (!value) return '-';

  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) return value;

  const [, year, month, day, hours, minutes, seconds = '00'] = match;
  const utcDate = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  ));

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(utcDate);
}

function formatLabel(value) {
  if (!value) return '-';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDetailValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '-';
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${formatLabel(key)}: ${formatDetailValue(item)}`)
      .join(', ');
  }
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return String(value);
}

function formatChangeEntries(changes) {
  const entries = Object.entries(changes || {}).filter(([, value]) => value && typeof value === 'object');
  if (!entries.length) return [];

  return entries.map(([key, value]) => {
    const fromValue = formatDetailValue(value.from);
    const toValue = formatDetailValue(value.to);
    return `${formatLabel(key)}: ${fromValue} -> ${toValue}`;
  });
}

function formatDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return '-';
  }

  const changeEntries = formatChangeEntries(details.changes);
  const otherEntries = Object.entries(details)
    .filter(([key, value]) => key !== 'changes' && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${formatLabel(key)}: ${formatDetailValue(value)}`);

  const entries = [...changeEntries, ...otherEntries];
  if (!entries.length) return '-';

  return entries
    .slice(0, 4)
    .join(' | ');
}

function countActiveFilters({ search, moduleFilter, actionFilter, fromDate, toDate }) {
  return [search.trim(), moduleFilter, actionFilter, fromDate, toDate].filter(Boolean).length;
}

function getActionTone(action) {
  if (['delete', 'remove_permissions'].includes(action)) return 'danger';
  if (['update', 'set_permissions', 'assign_permissions', 'transaction'].includes(action)) return 'warning';
  if (['login', 'logout'].includes(action)) return 'neutral';
  return 'success';
}

function buildCsv(rows) {
  const headers = ['Timestamp', 'User', 'Module', 'Action', 'Entity Type', 'Entity', 'Description', 'Details', 'IP Address'];
  const escapeCell = (value) => {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  return [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => [
      row.created_at,
      row.username,
      row.module,
      row.action,
      row.entity_type,
      row.entity_label || row.entity_id,
      row.description,
      formatDetails(row.details),
      row.ip_address,
    ].map(escapeCell).join(',')),
  ].join('\n');
}

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
    <path d="M3 12a8.5 8.5 0 0 1 14.5-6"/>
    <polyline points="17 2 17 6 13 6"/>
    <path d="M21 12a8.5 8.5 0 0 1-14.5 6"/>
    <polyline points="7 22 7 18 11 18"/>
  </svg>
);

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total_rows: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadAuditLogs() {
      setLoading(true);
      setError('');

      try {
        const { data } = await getAuditLogs({
          search: search.trim(),
          module: moduleFilter,
          action: actionFilter,
          from_date: fromDate,
          to_date: toDate,
          page,
          page_size: pageSize,
        });

        if (cancelled) return;

        setRows(data.data || []);
        setPagination(data.pagination || { page: 1, page_size: pageSize, total_rows: 0, total_pages: 1 });
      } catch (requestError) {
        if (cancelled) return;

        setRows([]);
        setPagination({ page: 1, page_size: pageSize, total_rows: 0, total_pages: 1 });
        setError(requestError.response?.data?.message || 'Unable to load audit logs.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAuditLogs();
    return () => {
      cancelled = true;
    };
  }, [search, moduleFilter, actionFilter, fromDate, toDate, page, pageSize, refreshKey]);

  function resetPage(update) {
    setPage(1);
    update();
  }

  function handleExport() {
    if (!rows.length) return;

    const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-page-${pagination.page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const totalRows = pagination.total_rows || 0;
  const totalPages = Math.max(pagination.total_pages || 1, 1);
  const activeFilterCount = countActiveFilters({ search, moduleFilter, actionFilter, fromDate, toDate });
  const pageLabel = totalRows
    ? `${(pagination.page - 1) * pagination.page_size + 1}-${Math.min(pagination.page * pagination.page_size, totalRows)} of ${totalRows}`
    : '0 records';
  const footerLabel = totalRows ? `Showing ${pageLabel}` : 'Showing 0-0 of 0';

  return (
    <div className="audit-log-page">
      <PageHeader
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </svg>
        }
        title="Audit Log"
        subtitle="Track application activity across logins, data changes, and financial transactions"
        actions={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={() => setShowFilters((current) => !current)}>
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            <button type="button" className="ph-btn ph-btn--ghost ph-btn--refresh" onClick={() => setRefreshKey((current) => current + 1)}>
              <RefreshIcon />
              Refresh
            </button>
          </div>
        )}
      />

      {showFilters ? (
        <section className="audit-log-panel audit-log-panel--filters">
          <div className="audit-log-filters-wrap audit-log-filters-wrap--standalone">
            <div className="audit-log-filters">
              <label className="audit-log-field">
                <span className="audit-log-field__label">Module</span>
                <select className="audit-log-control" value={moduleFilter} onChange={(event) => resetPage(() => setModuleFilter(event.target.value))}>
                  {moduleOptions.map((option) => (
                    <option key={option.value || 'all-modules'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="audit-log-field">
                <span className="audit-log-field__label">Action</span>
                <select className="audit-log-control" value={actionFilter} onChange={(event) => resetPage(() => setActionFilter(event.target.value))}>
                  {actionOptions.map((option) => (
                    <option key={option.value || 'all-actions'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="audit-log-field">
                <span className="audit-log-field__label">From</span>
                <input className="audit-log-control" type="date" value={fromDate} onChange={(event) => resetPage(() => setFromDate(event.target.value))} />
              </label>

              <label className="audit-log-field">
                <span className="audit-log-field__label">To</span>
                <input className="audit-log-control" type="date" value={toDate} onChange={(event) => resetPage(() => setToDate(event.target.value))} />
              </label>
            </div>
          </div>
        </section>
      ) : null}

      <section className="audit-log-panel audit-log-panel--table">
        <div className="audit-log-toolbar">
          <div className="audit-log-toolbar__search">
            <input
              className="audit-log-control audit-log-control--search"
              type="search"
              value={search}
              onChange={(event) => resetPage(() => setSearch(event.target.value))}
              placeholder="Search user, module, action, target, description"
            />
          </div>

          <div className="audit-log-actions">
            <CustomSelect
              variant="form"
              value={String(pageSize)}
              onChange={v => { setPage(1); setPageSize(Number(v)); }}
              options={pageSizeOptions.map(s => ({ value: String(s), label: `${s} rows` }))}
            />
            <button type="button" className="ph-btn ph-btn--ghost" onClick={handleExport} disabled={!rows.length}>
              Export CSV
            </button>
          </div>
        </div>

        {error ? (
          <div className="audit-log-state audit-log-state--error">
            <p>{error}</p>
          </div>
        ) : loading ? (
          <div className="audit-log-state">
            <p>Loading audit log...</p>
          </div>
        ) : rows.length ? (
          <div className="audit-log-table-wrap">
            <table className="audit-log-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Module</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Description</th>
                  <th>Details</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="audit-log-meta">
                        <strong>{formatDateTime(row.created_at)}</strong>
                        <span>{row.ip_address || 'No IP recorded'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="audit-log-meta">
                        <strong>{row.username || '-'}</strong>
                        <span>{row.username ? 'Authenticated action' : 'System event'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="audit-log-badge audit-log-badge--module">{formatLabel(row.module)}</span>
                    </td>
                    <td>
                      <span className={`audit-log-badge audit-log-badge--${getActionTone(row.action)}`}>{formatLabel(row.action)}</span>
                    </td>
                    <td>
                      <div className="audit-log-meta audit-log-meta--target">
                        <strong>{row.entity_label || '-'}</strong>
                        <span>
                          {row.entity_type ? `${formatLabel(row.entity_type)}${row.entity_id ? ` #${row.entity_id}` : ''}` : row.entity_id || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="audit-log-description">{row.description}</td>
                    <td className="audit-log-details">{formatDetails(row.details)}</td>
                    <td className="audit-log-ip">{row.ip_address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="audit-log-state">
            <p>No audit events found for the current filters.</p>
          </div>
        )}

        <div className="audit-log-pagination">
          <span className="audit-log-pagination__summary">{footerLabel}</span>

          <div className="audit-log-pagination__controls">
          <button
            type="button"
            className="ph-btn ph-btn--ghost"
            disabled={pagination.page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
          >
            Previous
          </button>
          <span className="audit-log-pagination__label">{`Page ${pagination.page} of ${totalPages}`}</span>
          <button
            type="button"
            className="ph-btn ph-btn--ghost"
            disabled={pagination.page >= totalPages || loading}
            onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
          >
            Next
          </button>
          </div>
        </div>
      </section>
    </div>
  );
}

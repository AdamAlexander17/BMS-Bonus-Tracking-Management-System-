import { useEffect, useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import PageHeader from '../components/PageHeader/PageHeader';
import { useTheme } from '../context/ThemeContext';
import { getBrokers } from '../api/brokers';
import { getBrands } from '../api/brands';
import { getClientsByBroker } from '../api/clients';
import './Dashboard.css';

const LIGHT_PALETTE = {
  primary:    '#004B4E',
  primary2:   '#006467',
  accent1:    '#4ecdc4',
  accent2:    '#a8d8d8',
  accent3:    '#b2dfdb',
  amber:      '#f59e0b',
  red:        '#ef4444',
  green:      '#10b981',
  grid:       '#eef2f6',
  tooltip:    'light',
  stroke:     '#fff',
};

const DARK_PALETTE = {
  primary:    '#4ade80',
  primary2:   '#22c55e',
  accent1:    '#86efac',
  accent2:    '#16a34a',
  accent3:    '#bbf7d0',
  amber:      '#fbbf24',
  red:        '#f87171',
  green:      '#4ade80',
  grid:       '#1e3a31',
  tooltip:    'dark',
  stroke:     '#03110c',
};

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatMoney(n) {
  if (n == null) return '—';
  const v = Number(n);
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatCount(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

export default function Dashboard() {
  const { theme } = useTheme();
  const P = theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  const TEAL       = P.primary;
  const TEAL_HOVER = P.primary2;
  const TEAL_LIGHT = P.accent1;
  const TEAL_PALE  = P.accent2;
  const AMBER      = P.amber;
  const RED        = P.red;
  const GREEN      = P.green;

  const [brokers, setBrokers] = useState([]);
  const [brands, setBrands]   = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState('monthly');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [brokersRes, brandsRes] = await Promise.all([getBrokers(), getBrands()]);
        const brokersList = brokersRes.data?.data || [];
        const brandsList  = brandsRes.data?.data  || [];

        const clientResponses = await Promise.allSettled(
          brokersList.map(b => getClientsByBroker(b.id))
        );
        const allClients = [];
        clientResponses.forEach((res, idx) => {
          if (res.status === 'fulfilled') {
            const list = res.value.data?.data || [];
            const broker = brokersList[idx];
            list.forEach(c => allClients.push({
              ...c,
              broker_id: broker.id,
              broker_name: broker.name,
              brand_name: broker.brand?.name || broker.brand_name || null,
              rm_user: broker.rm_user_name || broker.rm_user,
            }));
          }
        });

        if (cancelled) return;
        setBrokers(brokersList);
        setBrands(brandsList);
        setClients(allClients);
      } catch (e) {
        console.error('Dashboard fetch failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Period filter date range ──────────────────────────────── */
  const dateRange = useMemo(() => {
    const now   = new Date();
    const end   = new Date(now);
    let   start;
    if (period === 'weekly') {
      start = new Date(now);
      const day = start.getDay();                          // 0=Sun
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1)); // back to Mon
      start.setHours(0, 0, 0, 0);
    } else if (period === 'monthly') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      start = new Date(now.getFullYear(), 0, 1);
    }
    return { start, end };
  }, [period]);

  const filteredClients = useMemo(() =>
    clients.filter(c => {
      const d = c.created_at ? new Date(c.created_at) : null;
      return d && d >= dateRange.start && d <= dateRange.end;
    }), [clients, dateRange]);

  const filteredBrokers = useMemo(() =>
    brokers.filter(b => {
      const d = b.created_at ? new Date(b.created_at) : null;
      return d && d >= dateRange.start && d <= dateRange.end;
    }), [brokers, dateRange]);

  /* ── Dynamic time axis ──────────────────────────────────────── */
  const timeLabels = useMemo(() => {
    if (period === 'weekly')  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    if (period === 'monthly') return ['W1', 'W2', 'W3', 'W4', 'W5'];
    return MONTHS_SHORT;
  }, [period]);

  const timeBuckets = useMemo(() => timeLabels.length, [timeLabels]);

  const getTimeBucket = (date) => {
    if (period === 'weekly') {
      const d = date.getDay();
      return d === 0 ? 6 : d - 1;                         // Mon=0 … Sun=6
    }
    if (period === 'monthly') return Math.min(Math.floor((date.getDate() - 1) / 7), 4);
    return date.getMonth();
  };

  /* ── Stat totals ───────────────────────────────────────────── */
  // Bonus is counted ONLY after the Admin actually pays the broker
  // (BrokerPayout). Checker approval alone does NOT mark bonus as released.
  const stats = useMemo(() => {
    const totalClients   = filteredClients.length;
    const totalReferred  = filteredBrokers.length;
    const totalDeposits  = filteredClients.reduce((s, c) => s + Number(c.deposited_amount || 0), 0);
    const totalWithdraws = filteredClients.reduce((s, c) => s + Number(c.withdrawal_amount || 0), 0);
    const totalBonus     = filteredBrokers.reduce((s, b) => s + Number(b.amount_paid || 0), 0);
    return { totalClients, totalReferred, totalBonus, totalDeposits, totalWithdraws };
  }, [filteredClients, filteredBrokers]);

  /* ── A) Bonus distribution by brand (DONUT) ────────────────── */
  // Shows released bonus per brand (= sum of BrokerPayout.amount grouped
  // by brand). A checker-approved-but-not-yet-paid client contributes 0.
  const bonusByBrand = useMemo(() => {
    const map = {};
    filteredBrokers.forEach(b => {
      const paid = Number(b.amount_paid || 0);
      if (paid <= 0) return;
      const key = b.brand?.name || b.brand_name || 'Other';
      map[key] = (map[key] || 0) + paid;
    });
    const labels = Object.keys(map);
    const series = labels.map(l => Number(map[l].toFixed(2)));
    return { labels, series };
  }, [filteredBrokers]);

  /* ── B) Deposit vs Withdrawal over time (BAR) ──────────────── */
  const monthlyDepWith = useMemo(() => {
    const dep = new Array(timeBuckets).fill(0);
    const wd  = new Array(timeBuckets).fill(0);
    filteredClients.forEach(c => {
      const d = c.created_at ? new Date(c.created_at) : null;
      if (!d || isNaN(d)) return;
      const bucket = getTimeBucket(d);
      dep[bucket] += Number(c.deposited_amount || 0);
      wd[bucket]  += Number(c.withdrawal_amount || 0);
    });
    return { dep, wd };
  }, [filteredClients, timeBuckets, period]);

  /* ── C) Client Growth Over Time (LINE / AREA) ──────────────── */
  const clientGrowth = useMemo(() => {
    const monthly = new Array(timeBuckets).fill(0);
    filteredClients.forEach(c => {
      const d = c.created_at ? new Date(c.created_at) : null;
      if (!d || isNaN(d)) return;
      monthly[getTimeBucket(d)] += 1;
    });
    const cum = [];
    let acc = 0;
    monthly.forEach(n => { acc += n; cum.push(acc); });
    return { monthly, cumulative: cum };
  }, [filteredClients, timeBuckets, period]);

  /* ── D) Genuine vs Pending vs Rejected (DONUT) ─────────────── */
  // Verification flow: broker adds client → 'pending' → checker either
  // approves (legitimacy_status='approved') or declines ('declined').
  const genuineRejected = useMemo(() => {
    let genuine = 0, pending = 0, rejected = 0;
    filteredClients.forEach(c => {
      const ls = String(c.legitimacy_status || 'pending').toLowerCase();
      if (ls === 'approved')      genuine  += 1;
      else if (ls === 'declined') rejected += 1;
      else                        pending  += 1;
    });
    return { genuine, pending, rejected };
  }, [filteredClients]);

  /* ── E) Top performing brokers (HORIZONTAL BAR) ────────────── */
  // Bonus column = amount actually paid to the broker (released).
  const topBrokers = useMemo(() => {
    const map = {};
    filteredClients.forEach(c => {
      const k = c.broker_id;
      if (!map[k]) map[k] = { name: c.broker_name, total: 0, genuine: 0, bonus: 0 };
      map[k].total += 1;
      if (String(c.legitimacy_status || '').toLowerCase() === 'approved') {
        map[k].genuine += 1;
      }
    });
    filteredBrokers.forEach(b => {
      if (!map[b.id]) map[b.id] = { name: b.name, total: 0, genuine: 0, bonus: 0 };
      map[b.id].bonus = Number(b.amount_paid || 0);
    });
    return Object.values(map).sort((a, b) => b.bonus - a.bonus).slice(0, 6);
  }, [filteredClients, filteredBrokers]);

  /* ── F) Brand wise Deposits vs Withdrawals (STACKED) ───────── */
  const brandWise = useMemo(() => {
    const dep = {}, wd = {};
    filteredClients.forEach(c => {
      const k = c.brand_name || 'Other';
      dep[k] = (dep[k] || 0) + Number(c.deposited_amount || 0);
      wd[k]  = (wd[k]  || 0) + Number(c.withdrawal_amount || 0);
    });
    const labels = Array.from(new Set([...Object.keys(dep), ...Object.keys(wd)]));
    return {
      labels,
      deposit:  labels.map(l => Number((dep[l] || 0).toFixed(2))),
      withdraw: labels.map(l => Number((wd[l]  || 0).toFixed(2))),
    };
  }, [filteredClients]);

  /* ── G) Approval workflow funnel ───────────────────────────── */
  // Stage-by-stage progression of a client through the bonus pipeline.
  //   1) Client Added      → client record exists
  //   2) Trading Verified  → client has actually deposited (> 0)
  //   3) Checker Approval  → legitimacy_status === 'approved'
  //   4) Bonus Released    → approved AND broker's pending payout is
  //                          cleared (Admin has paid the bonus)
  const funnel = useMemo(() => {
    const added = filteredClients.length;
    const verified = filteredClients.filter(
      c => Number(c.deposited_amount || 0) > 0,
    ).length;
    const approved = filteredClients.filter(
      c => String(c.legitimacy_status || '').toLowerCase() === 'approved',
    ).length;
    const settledBrokerIds = new Set(
      filteredBrokers
        .filter(b => Number(b.amount_paid || 0) > 0 && Number(b.pending_payout || 0) === 0)
        .map(b => b.id),
    );
    const released = filteredClients.filter(
      c =>
        String(c.legitimacy_status || '').toLowerCase() === 'approved' &&
        settledBrokerIds.has(c.broker_id),
    ).length;
    return [
      { label: 'Client Added',     value: added },
      { label: 'Trading Verified', value: verified },
      { label: 'Checker Approval', value: approved },
      { label: 'Bonus Released',   value: released },
    ];
  }, [filteredClients, filteredBrokers]);

  /* ── Chart common config ───────────────────────────────────── */
  const baseChart = {
    chart:   { fontFamily: 'inherit', toolbar: { show: false }, animations: { easing: 'easeinout', speed: 500 } },
    tooltip: { theme: P.tooltip },
    grid:    { borderColor: P.grid, strokeDashArray: 4 },
  };
  const axisColor    = theme === 'dark' ? '#9ca3af' : '#64748b';
  const axisColorStr = theme === 'dark' ? '#e7e9ed' : '#0f172a';

  const periodLabel = { weekly: 'This Week', monthly: 'This Month', yearly: 'This Year' }[period];

  return (
    <div className="dashboard">
      <div className="dashboard__sticky-top">
        <PageHeader
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
            </svg>
          }
          title="Dashboard Overview"
          subtitle={loading ? 'Loading…' : `Showing data for: ${periodLabel}`}
        />

        {/* ─── Period filter ─── */}
        <div className="dashboard__period-filter">
          {['weekly', 'monthly', 'yearly'].map(p => (
            <button
              key={p}
              className={`dashboard__period-btn${period === p ? ' dashboard__period-btn--active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Stat cards ─── */}
      <div className="dashboard__stats">
        <StatCard label="Total Clients"     value={formatCount(stats.totalClients)}   accent={TEAL}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
        <StatCard label="Total Brokers"     value={formatCount(stats.totalReferred)}  accent={TEAL_HOVER}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>} />
        <StatCard label="Total Bonus"       value={formatMoney(stats.totalBonus)}     accent={AMBER}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>} />
        <StatCard label="Total Deposits"    value={formatMoney(stats.totalDeposits)}  accent={GREEN}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>} />
        <StatCard label="Total Withdrawals" value={formatMoney(stats.totalWithdraws)} accent={RED}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>} />
      </div>

      {/* Row 1: Donut (A) + Bar (B) */}
      <div className="dashboard__grid dashboard__grid--2">
        <div className="chart-card">
          <ChartHeader title="Bonus Distribution by Brand" subtitle="Share of bonus earned across brands" />
          {bonusByBrand.labels.length === 0 ? <EmptyState /> : (
            <Chart
              type="donut"
              height={310}
              series={bonusByBrand.series}
              options={{
                ...baseChart,
                labels: bonusByBrand.labels,
                colors: [TEAL, TEAL_HOVER, TEAL_LIGHT, TEAL_PALE, P.accent3],
                legend: { position: 'bottom', fontSize: '13px', markers: { width: 10, height: 10 } },
                stroke: { width: 2, colors: [P.stroke] },
                dataLabels: { enabled: true, style: { fontSize: '12px', fontWeight: 600 } },
                tooltip: { theme: P.tooltip, y: { formatter: v => formatMoney(v) } },
                plotOptions: {
                  pie: {
                    donut: {
                      size: '68%',
                      labels: {
                        show: true,
                        name:  { fontSize: '13px', color: theme === 'dark' ? '#9ca3af' : '#64748b' },
                        value: { fontSize: '22px', fontWeight: 700, color: theme === 'dark' ? '#e7e9ed' : '#0f172a', formatter: v => formatMoney(v) },
                        total: {
                          show: true, label: 'Total Bonus', color: theme === 'dark' ? '#9ca3af' : '#64748b',
                          formatter: w => formatMoney(w.globals.seriesTotals.reduce((a, b) => a + b, 0)),
                        },
                      },
                    },
                  },
                },
              }}
            />
          )}
        </div>

        <div className="chart-card">
          <ChartHeader title=" Deposit vs Withdrawal" subtitle="Compare cash flow across months" />
          <Chart
            type="bar"
            height={310}
            series={[
              { name: 'Deposit',    data: monthlyDepWith.dep },
              { name: 'Withdrawal', data: monthlyDepWith.wd  },
            ]}
            options={{
              ...baseChart,
              colors: [TEAL, AMBER],
              plotOptions: { bar: { borderRadius: 6, columnWidth: '55%' } },
              dataLabels: { enabled: false },
              xaxis: { categories: timeLabels, labels: { style: { colors: axisColor } } },
              yaxis: { labels: { style: { colors: axisColor }, formatter: v => formatMoney(v) } },
              legend: { position: 'top', horizontalAlign: 'right', markers: { width: 10, height: 10 } },
              tooltip: { theme: P.tooltip, y: { formatter: v => formatMoney(v) } },
            }}
          />
        </div>
      </div>

      {/* Row 2: Line (C) + Donut (D) */}
      <div className="dashboard__grid dashboard__grid--2">
        <div className="chart-card">
          <ChartHeader title="Client Growth Over Time" subtitle="New and cumulative registrations by month" />
          <Chart
            type="area"
            height={310}
            series={[
              { name: 'New Clients',        data: clientGrowth.monthly },
              { name: 'Cumulative Clients', data: clientGrowth.cumulative },
            ]}
            options={{
              ...baseChart,
              colors: [TEAL, TEAL_LIGHT],
              stroke: { curve: 'smooth', width: 3 },
              fill: {
                type: 'gradient',
                gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 100] },
              },
              dataLabels: { enabled: false },
              xaxis: { categories: timeLabels, labels: { style: { colors: axisColor } } },
              yaxis: { labels: { style: { colors: axisColor } } },
              legend: { position: 'top', horizontalAlign: 'right', markers: { width: 10, height: 10 } },
              markers: { size: 4, strokeWidth: 2, hover: { size: 6 } },
            }}
          />
        </div>

        <div className="chart-card">
          <ChartHeader title="Client Verification Status" subtitle="Genuine vs Pending vs Rejected" />
          {clients.length === 0 ? <EmptyState /> : (
            <Chart
              type="donut"
              height={300}
              series={[genuineRejected.genuine, genuineRejected.pending, genuineRejected.rejected]}
              options={{
                ...baseChart,
                labels: ['Genuine', 'Pending', 'Rejected'],
                colors: [TEAL, P.accent1, P.accent2],
                legend: {
                  position: 'bottom',
                  horizontalAlign: 'center',
                  fontSize: '13px',
                  markers: { width: 10, height: 10 },
                  itemMargin: { horizontal: 10, vertical: 4 },
                },
                stroke: { width: 2, colors: [P.stroke] },
                dataLabels: {
                  enabled: true,
                  formatter: v => `${v.toFixed(1)}%`,
                  style: { fontSize: '12px', fontWeight: 600 },
                  dropShadow: { enabled: false },
                },
                plotOptions: {
                  pie: {
                    donut: {
                      size: '68%',
                      labels: {
                        show: true,
                        name:  { fontSize: '13px', color: theme === 'dark' ? '#9ca3af' : '#64748b' },
                        value: { fontSize: '22px', fontWeight: 700, color: theme === 'dark' ? '#e7e9ed' : '#0f172a' },
                        total: {
                          show: true, label: 'Total Clients', color: theme === 'dark' ? '#9ca3af' : '#64748b',
                          formatter: w => formatCount(w.globals.seriesTotals.reduce((a, b) => a + b, 0)),
                        },
                      },
                    },
                  },
                },
                tooltip: { theme: P.tooltip, y: { formatter: v => `${v} clients` } },
              }}
            />
          )}
        </div>
      </div>

      {/* Row 3: Horizontal bar (E) */}
      <div className="dashboard__grid dashboard__grid--1">
        <div className="chart-card">
          <ChartHeader title="Top Performing Brokers" subtitle="Ranked by total bonus earned (RM / JRM)" />
          {topBrokers.length === 0 ? <EmptyState /> : (
            <Chart
              type="bar"
              height={Math.max(320, topBrokers.length * 60)}
              series={[
                { name: 'Total Clients',   data: topBrokers.map(b => b.total) },
                { name: 'Genuine Clients', data: topBrokers.map(b => b.genuine) },
                { name: 'Total Bonus',     data: topBrokers.map(b => Number(b.bonus.toFixed(2))) },
              ]}
              options={{
                ...baseChart,
                colors: [TEAL, TEAL_LIGHT, AMBER],
                plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '70%' } },
                dataLabels: { enabled: false },
                xaxis: { categories: topBrokers.map(b => b.name), labels: { style: { colors: axisColor } } },
                yaxis: { labels: { style: { colors: axisColorStr, fontSize: '13px', fontWeight: 600 } } },
                legend: { position: 'top', horizontalAlign: 'right', markers: { width: 10, height: 10 } },
                tooltip: {
                  theme: P.tooltip,
                  y: { formatter: (v, opts) => (opts.seriesIndex === 2 ? formatMoney(v) : formatCount(v)) },
                },
              }}
            />
          )}
        </div>
      </div>

      {/* Row 4: Stacked bar (F) + Funnel (G) */}
      <div className="dashboard__grid dashboard__grid--2">
        <div className="chart-card">
          <ChartHeader title="Brand Wise Deposits vs Withdrawals" subtitle="Stacked view of cash flow per brand" />
          {brandWise.labels.length === 0 ? <EmptyState /> : (
            <Chart
              type="bar"
              height={320}
              series={[
                { name: 'Deposit',    data: brandWise.deposit },
                { name: 'Withdrawal', data: brandWise.withdraw },
              ]}
              options={{
                ...baseChart,
                chart: { ...baseChart.chart, stacked: true },
                colors: [TEAL, AMBER],
                plotOptions: { bar: { borderRadius: 6, columnWidth: '45%' } },
                dataLabels: { enabled: false },
                xaxis: { categories: brandWise.labels, labels: { style: { colors: '#64748b' } } },
                yaxis: { labels: { style: { colors: '#64748b' }, formatter: v => formatMoney(v) } },
                legend: { position: 'top', horizontalAlign: 'right', markers: { width: 10, height: 10 } },
tooltip: { theme: P.tooltip, y: { formatter: v => formatMoney(v) } },
              }}
            />
          )}
        </div>

        <div className="chart-card">
          <ChartHeader title="Approval Workflow Status" subtitle="Conversion through each approval stage" />
          <FunnelChart data={funnel} palette={P} />
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */
function StatCard({ label, value, icon, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-card__left">
        <p className="stat-card__label">{label}</p>
        <h3 className="stat-card__value">{value}</h3>
      </div>
      <div className="stat-card__icon" style={{ background: hexToTint(accent), color: accent }}>
        {icon}
      </div>
    </div>
  );
}

function ChartHeader({ title, subtitle }) {
  return (
    <div className="chart-card__header chart-card__header--block">
      <h4>{title}</h4>
      {subtitle && <p className="chart-card__sub">{subtitle}</p>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="chart-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 4 4 5-7" />
      </svg>
      <span>No data available yet</span>
    </div>
  );
}

function FunnelChart({ data, palette }) {
  const TEAL       = palette?.primary  || '#004B4E';
  const TEAL_HOVER = palette?.primary2 || '#006467';
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="funnel">
      {data.map((stage, i) => {
        const pct = (stage.value / max) * 100;
        const drop = i > 0 ? data[i - 1].value - stage.value : 0;
        const dropPct = i > 0 && data[i - 1].value > 0 ? (drop / data[i - 1].value) * 100 : 0;
        return (
          <div className="funnel__row" key={stage.label}>
            <div className="funnel__label">
              <span className="funnel__index">{i + 1}</span>
              <span>{stage.label}</span>
            </div>
            <div className="funnel__bar-wrap">
              <div
                className="funnel__bar"
                style={{
                  width: `${Math.max(pct, 8)}%`,
                  background: `linear-gradient(90deg, ${TEAL} 0%, ${TEAL_HOVER} 100%)`,
                  opacity: 1 - i * 0.12,
                }}
              >
                <span className="funnel__value">{formatCount(stage.value)}</span>
              </div>
              {i > 0 && drop > 0 && (
                <span className="funnel__drop">↓ {dropPct.toFixed(1)}% drop-off</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function hexToTint(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

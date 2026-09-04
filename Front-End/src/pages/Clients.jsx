import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader/PageHeader';
import CustomSelect from '../components/CustomSelect/CustomSelect';
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';
import Toast from '../components/Toast/Toast';
import { getAllClients, updateClient, deleteClient, createClientTransaction, updateClientMonthlyLegitimacy, updateClientPaid } from '../api/clients';
import { getExternalTransactionRows } from '../api/externalTransactions';
import { formatINR } from './Brokers';
import * as XLSX from 'xlsx';
import './Users.css';

const sortButtonStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0,
  border: 'none', background: 'none', color: 'inherit', font: 'inherit',
  letterSpacing: 'inherit', textTransform: 'inherit', cursor: 'pointer',
  whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.2,
};

const thWrapStyle = { whiteSpace: 'normal', lineHeight: 1.2, verticalAlign: 'middle' };

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

const formatINRSigned = (val) => {
  const n = Number(val);
  if (Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
  return n < 0 ? `-${formatted}` : formatted;
};

const ClientIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const legitimacyFilterOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
];
const legitimacyOptions = [
  { value: 'pending', label: 'Pending', shortLabel: 'P' },
  { value: 'approved', label: 'Approved', shortLabel: 'A' },
  { value: 'declined', label: 'Declined', shortLabel: 'D' },
];

function normalizeLegitimacyStatus(clientOrValue) {
  if (typeof clientOrValue === 'string') {
    const normalized = clientOrValue.trim().toLowerCase();
    return ['pending', 'approved', 'declined'].includes(normalized) ? normalized : 'pending';
  }
  if (clientOrValue?.legitimacy_status) return normalizeLegitimacyStatus(clientOrValue.legitimacy_status);
  return clientOrValue?.is_legitimate ? 'approved' : 'pending';
}

function LegitimacyCheckboxGroup({ value, onChange, disabled = false }) {
  const selectedValue = normalizeLegitimacyStatus(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
      {legitimacyOptions.map((option) => {
        const isChecked = selectedValue === option.value;
        return (
          <label key={option.value} title={option.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: isChecked ? '#2563eb' : '#6b7280', cursor: disabled ? 'default' : 'pointer', fontWeight: isChecked ? 700 : 500, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${isChecked ? '#2563eb' : '#d1d5db'}`, background: isChecked ? '#2563eb' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', transition: 'background 120ms, border-color 120ms' }}>
              {isChecked && <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </span>
            <input type="checkbox" checked={isChecked} disabled={disabled} onChange={() => onChange(option.value)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
            {option.shortLabel}
          </label>
        );
      })}
    </div>
  );
}

const inputStyle = { width: '100%', height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box' };

const MONTH_SELECTION_STORAGE_KEY = 'bms-selected-month';

function getDefaultMonthSelection() {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
}

function getPersistedMonthSelection() {
  if (typeof window === 'undefined') return getDefaultMonthSelection();
  const value = window.localStorage.getItem(MONTH_SELECTION_STORAGE_KEY);
  return value || getDefaultMonthSelection();
}

function Field({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}</label>
      {children}
    </div>
  );
}

function EditClientModal({ client, canTradingOk, selectedMonth, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const clientApproved = normalizeLegitimacyStatus(client) === 'approved';
  const earnedAmount = Number(client.earned_amount || 0);
  const initialPaid = !!client.is_paid;
  const initialPaidAmount = client.is_paid ? Number(client.paid_amount || 0) : null;
  const [form, setForm]     = useState({
    name: client.name ?? '',
    arc_id: client.arc_id,
    equity_amount: client.equity_amount ?? '',
    legitimacy_status: normalizeLegitimacyStatus(client),
    is_paid: initialPaid,
    paid_amount: client.is_paid && client.paid_amount != null && client.paid_amount !== '' ? String(client.paid_amount) : '',
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const togglePaid = (checked) => {
    setForm(f => ({
      ...f,
      is_paid: checked,
      // Default to the earned amount when marking paid without an existing value.
      paid_amount: checked ? (f.paid_amount !== '' ? f.paid_amount : String(earnedAmount)) : '',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!/^\d{1,6}$/.test(form.arc_id.trim())) { setError('ARK ID must be up to 6 digits.'); return; }

    // Detect whether the paid section changed.
    const paidChanged = form.is_paid !== initialPaid
      || (form.is_paid && Number(form.paid_amount || 0) !== (initialPaidAmount ?? -1));
    if (paidChanged) {
      if (!selectedMonth) { setError('Select a month (top of the page) before updating the paid status.'); return; }
      if (form.is_paid && !clientApproved) { setError('Client must be Approved for this month before it can be marked as paid.'); return; }
      if (form.is_paid && (form.paid_amount === '' || Number(form.paid_amount) < 0 || Number.isNaN(Number(form.paid_amount)))) {
        setError('Enter a valid paid amount (0 or greater).'); return;
      }
    }

    setSaving(true);
    try {
      const payload = { name: form.name.trim(), arc_id: form.arc_id.trim(), equity_amount: form.equity_amount === '' ? 0 : form.equity_amount };
      if (canTradingOk) payload.legitimacy_status = form.legitimacy_status;
      await updateClient(client.id, payload);
      if (paidChanged) {
        const paidPayload = { month: selectedMonth, is_paid: form.is_paid };
        if (form.is_paid) paidPayload.paid_amount = Number(form.paid_amount);
        await updateClientPaid(client.id, paidPayload);
      }
      onUpdated();
    } catch (err) { setError(err.response?.data?.message || 'Failed to update client.'); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="bd-modal" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 580, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div className="bms-dialog__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 18px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Edit Client</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Editing <strong>{client.arc_id}</strong> · {client.broker?.name}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 20px' }}>
              <div style={{ gridColumn: '1 / -1' }}><Field label="Client Name" required><input style={inputStyle} value={form.name} onChange={set('name')} required placeholder="Enter client name" /></Field></div>
              <div style={{ gridColumn: '1 / -1' }}><Field label="ARK ID" required><input style={inputStyle} value={form.arc_id} onChange={(e) => setForm(f => ({ ...f, arc_id: e.target.value.replace(/\D/g, '').slice(0, 6) }))} required inputMode="numeric" pattern="\d*" maxLength={6} placeholder="123456" /></Field></div>
              {canTradingOk && <div style={{ gridColumn: '1 / -1' }}><Field label="Legitimate Client Status"><LegitimacyCheckboxGroup value={form.legitimacy_status} onChange={(v) => setForm(f => ({ ...f, legitimacy_status: v }))} /></Field></div>}
              <div style={{ gridColumn: '1 / -1' }}><Field label="Equity (₹)"><input type="number" min="0" step="0.01" style={inputStyle} value={form.equity_amount} onChange={set('equity_amount')} placeholder="0.00" /></Field></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Paid">
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: clientApproved ? '#111827' : '#9ca3af', cursor: clientApproved ? 'pointer' : 'not-allowed', fontWeight: 500 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${form.is_paid ? '#059669' : '#d1d5db'}`, background: form.is_paid ? '#059669' : !clientApproved ? '#f3f4f6' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', transition: 'background 120ms, border-color 120ms' }}>
                      {form.is_paid && <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    </span>
                    <input type="checkbox" checked={form.is_paid} disabled={!clientApproved} onChange={(e) => togglePaid(e.target.checked)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
                    Mark as paid
                  </label>
                  {form.is_paid && (
                    <input type="number" min="0" step="0.01" style={{ ...inputStyle, marginTop: 10 }} value={form.paid_amount} onChange={set('paid_amount')} placeholder="0.00" />
                  )}
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>
                    {!clientApproved
                      ? 'Client must be Approved for the selected month before it can be marked as paid.'
                      : form.is_paid
                        ? `Defaults to the earned amount (${formatINR(earnedAmount)}). Adjust if a different amount was paid.`
                        : 'Check to mark this client as paid for the selected month.'}
                  </p>
                </Field>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Saving...' : 'Update Client'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddAmountModal({ client, mode, selectedMonth, onMonthChange, onClose, onUpdated }) {
  const isDeposit = mode === 'deposit';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const currentAmount = Number(isDeposit ? client.deposited_amount : client.withdrawal_amount) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!selectedMonth) { setError('Please select month and year.'); return; }
    if (!amount || Number(amount) === 0) { setError('Enter a valid amount.'); return; }
    const numAmount = Number(amount);
    // If negative, check it doesn't exceed current total
    if (numAmount < 0 && Math.abs(numAmount) > currentAmount) {
      setError(`Cannot deduct ₹${Math.abs(numAmount).toLocaleString('en-IN')} — current ${isDeposit ? 'deposit' : 'withdrawal'} is only ₹${currentAmount.toLocaleString('en-IN')}.`);
      return;
    }
    setSaving(true);
    try {
      const payload = { transaction_type: isDeposit ? 'deposit' : 'withdrawal', amount: numAmount, month: selectedMonth };
      await createClientTransaction(client.id, payload);
      onUpdated();
    }
    catch (err) { setError(err.response?.data?.message || `Failed to add ${mode}.`); setSaving(false); }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="bd-modal" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div className="bd-modal__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>{isDeposit ? 'Add Deposit' : 'Add Withdrawal'}</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6b7280' }}>Client <strong>{client.arc_id}</strong> · Current {isDeposit ? 'deposit' : 'withdrawal'}: <strong>{formatINR(currentAmount)}</strong></p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 6, display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>}
            <Field label="Month & Year" required>
              <input type="month" style={inputStyle} value={selectedMonth} onChange={(e) => onMonthChange(e.target.value)} required />
            </Field>
            <div style={{ height: 14 }} />
            <Field label={`${isDeposit ? 'Deposit' : 'Withdrawal'} Amount (₹)`}>
              <input type="number" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount (negative to deduct)" autoFocus />
            </Field>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>Use a negative value to deduct from the current {isDeposit ? 'deposit' : 'withdrawal'} total.</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Saving...' : isDeposit ? 'Add Deposit' : 'Add Withdrawal'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditPaidModal({ client, selectedMonth, onMonthChange, onClose, onUpdated }) {
  const earned = Number(client.earned_amount || 0);
  const currentPaid = client.is_paid ? Number(client.paid_amount || 0) : earned;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState(currentPaid ? String(currentPaid) : '');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!selectedMonth) { setError('Please select month and year.'); return; }
    if (amount === '' || Number(amount) < 0 || Number.isNaN(Number(amount))) { setError('Enter a valid paid amount (0 or greater).'); return; }
    setSaving(true);
    try {
      const res = await updateClientPaid(client.id, { month: selectedMonth, is_paid: true, paid_amount: Number(amount) });
      onUpdated(res.data?.data);
    }
    catch (err) { setError(err.response?.data?.message || 'Failed to update paid amount.'); setSaving(false); }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="bd-modal" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div className="bms-dialog__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 18px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Update Paid Amount</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>{client.name} · <strong>{client.arc_id}</strong> · Earned: <strong>{formatINR(earned)}</strong></p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6, display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>}
            <Field label="Month & Year" required><input type="month" style={inputStyle} value={selectedMonth} onChange={(e) => onMonthChange(e.target.value)} required /></Field>
            <div style={{ height: 14 }} />
            <Field label="Paid Amount (₹)"><input type="number" min="0" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus /></Field>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>Defaults to the earned amount. Adjust if a different amount was paid.</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Saving...' : 'Update Paid Amount'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManageEquityModal({ client, selectedMonth, onMonthChange, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState(
    client.equity_amount != null && client.equity_amount !== '' ? String(client.equity_amount) : ''
  );

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!selectedMonth) { setError('Please select month and year.'); return; }
    if (amount === '' || Number(amount) < 0 || Number.isNaN(Number(amount))) { setError('Enter a valid equity amount (0 or greater).'); return; }
    setSaving(true);
    try { await updateClient(client.id, { equity_amount: Number(amount), month: selectedMonth }); onUpdated(); }
    catch (err) { setError(err.response?.data?.message || 'Failed to update equity.'); setSaving(false); }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="bd-modal" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div className="bms-dialog__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 18px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Update Equity</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>{client.name} · <strong>{client.arc_id}</strong> · Current: <strong>{formatINR(client.equity_amount)}</strong></p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6, display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>}
            <Field label="Month & Year" required><input type="month" style={inputStyle} value={selectedMonth} onChange={(e) => onMonthChange(e.target.value)} required /></Field>
            <div style={{ height: 14 }} />
            <Field label="Equity Amount (₹)"><input type="number" min="0" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus /></Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Saving...' : 'Update Equity'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Clients() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const hasPerm = (key) => !user?.permissions || user.permissions.includes(key);
  const canUpdate = hasPerm('client:update');
  const canTradingOk = hasPerm('client:trading_ok');
  const canDelete = hasPerm('client:delete');
  const canSetLegitimacy = canTradingOk;
  const canShowLegitimacy = hasPerm('client:view');

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [legitimacyFilter, setLegitimacyFilter] = useState('all');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [editClient, setEditClient] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);
  const [amountAction, setAmountAction] = useState(null);
  const [equityAction, setEquityAction] = useState(null);
  const [paidAction, setPaidAction] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [importing, setImporting] = useState(false);
  const [monthFilter, setMonthFilter] = useState(() => getPersistedMonthSelection());
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (monthFilter) {
      window.localStorage.setItem(MONTH_SELECTION_STORAGE_KEY, monthFilter);
    }
  }, [monthFilter]);

  const fetchClients = async () => {
    setLoading(true); setError('');
    try {
      const params = {}; if (monthFilter) params.month = monthFilter;
      const res = await getAllClients(params);
      const clientRows = res.data.data || [];
      let transactions = [];
      try {
        transactions = await getExternalTransactionRows(clientRows.map((client) => ({
          accountId: client.arc_id,
          brandName: client.brand || client.broker?.brand,
        })), monthFilter, 100);
      } catch (externalError) {
        console.warn('External transaction enrichment unavailable:', externalError);
      }
      const totalsByAccount = new Map();
      transactions.forEach((transaction) => {
        const key = String(transaction.accountId);
        const current = totalsByAccount.get(key) || { deposited: 0, withdrawn: 0, latestDate: '' };
        if (transaction.transaction_type === 'deposit') current.deposited += transaction.amount;
        if (transaction.transaction_type === 'withdrawal') current.withdrawn += transaction.amount;
        if (!current.latestDate || new Date(transaction.createdDate) > new Date(current.latestDate)) current.latestDate = transaction.createdDate;
        totalsByAccount.set(key, current);
      });
      setClients(clientRows.map((client) => {
        const totals = totalsByAccount.get(String(client.arc_id)) || {
          deposited: Number(client.deposited_amount || 0),
          withdrawn: Number(client.withdrawal_amount || 0),
          latestDate: client.created_at || '',
        };
        return { ...client, deposited_amount: totals.deposited, withdrawal_amount: totals.withdrawn, transaction_date: totals.latestDate };
      }));
    }
    catch (err) { setError(err.response?.data?.message || 'Failed to load clients.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchClients(); }, [monthFilter, pageSize]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = () => { setShowImportMenu(false); setShowExportMenu(false); };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Sync page to URL
  useEffect(() => {
    setSearchParams(prev => { const p = new URLSearchParams(prev); if (page > 1) p.set('page', String(page)); else p.delete('page'); return p; }, { replace: true });
  }, [page]);

  const allBrokers = useMemo(() => {
    const brokerMap = {};
    clients.forEach(c => { if (c.broker) brokerMap[c.broker.id] = c.broker.name; });
    return Object.entries(brokerMap).map(([id, name]) => ({ value: id, label: name })).sort((a, b) => a.label.localeCompare(b.label));
  }, [clients]);

  const filtered = useMemo(() => {
    return clients.filter(c => {
      const q = search.toLowerCase();
      const matchSearch = !q || (c.name || '').toLowerCase().includes(q) || (c.arc_id || '').toLowerCase().includes(q) || (c.broker?.name || '').toLowerCase().includes(q) || (c.broker?.arc_id || '').toLowerCase().includes(q) || (c.created_by || '').toLowerCase().includes(q) || (c.brand || '').toLowerCase().includes(q);
      const matchBroker = brokerFilter === 'all' || String(c.broker?.id) === brokerFilter;
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchLegitimacy = legitimacyFilter === 'all' || c.legitimacy_status === legitimacyFilter;
      return matchSearch && matchBroker && matchStatus && matchLegitimacy;
    });
  }, [clients, search, brokerFilter, statusFilter, legitimacyFilter]);

  const sorted = useMemo(() => {
    const getSortValue = (client, key) => {
      switch (key) {
        case 'name': return client.name || '';
        case 'arc_id': return client.arc_id || '';
        case 'broker': return client.broker?.name || '';
        case 'broker_arc_id': return client.broker?.arc_id || '';
        case 'brand': return client.brand || client.broker?.brand || '';
        case 'deposited_amount': return Number(client.deposited_amount || 0);
        case 'withdrawal_amount': return Number(client.withdrawal_amount || 0);
        case 'equity_amount': return Number(client.equity_amount || 0);
        case 'net_dwe': return Number(client.net_dwe || 0);
        case 'earned_amount': return Number(client.earned_amount || 0);
        case 'paid_amount': return client.is_paid ? Number(client.paid_amount || 0) : -1;
        case 'legitimacy_status': return client.legitimacy_status || '';
        case 'status': return client.status || '';
        case 'transaction_date': return client.transaction_date ? new Date(client.transaction_date).getTime() : 0;
        case 'created_at': return client.created_at ? new Date(client.created_at).getTime() : 0;
        default: return '';
      }
    };
    return [...filtered].sort((a, b) => compareValues(getSortValue(a, sortConfig.key), getSortValue(b, sortConfig.key), sortConfig.direction));
  }, [filtered, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => { if (!loading && clients.length > 0 && page > totalPages) setPage(totalPages); }, [totalPages, loading, clients.length]);
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key) => { setSortConfig((cur) => cur.key === key ? { key, direction: cur.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: key === 'created_at' ? 'desc' : 'asc' }); setPage(1); };
  const getSortIndicator = (key) => sortConfig.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕';

  const handleDelete = (client) => {
    setConfirmState({ title: 'Delete Client?', itemName: client.arc_id, bullets: ['Client record & ARK ID', 'Deposited & withdrawal data', 'Commission & bonus history'],
      onConfirm: async () => { try { await deleteClient(client.id); setToast({ type: 'success', message: `Client "${client.name}" deleted.` }); fetchClients(); } catch (err) { setToast({ type: 'error', message: err.response?.data?.message || 'Failed to delete client.' }); } setConfirmState(null); },
    });
  };

  const handleSetLegitimacy = async (c, legitimacyStatus) => {
    if (normalizeLegitimacyStatus(c) === legitimacyStatus) return;
    if (!monthFilter) {
      setToast({ type: 'error', message: 'Please select month and year before updating legitimacy.' });
      return;
    }
    try {
      await updateClientMonthlyLegitimacy(c.id, { month: monthFilter, legitimacy_status: legitimacyStatus });
      // Recalculate earned locally based on new legitimacy and the brand's earning rate
      const rate = Number(c.earning_rate || 1) / 100;
      const newEarned = legitimacyStatus === 'approved' ? (Number(c.deposited_amount || 0) * rate).toFixed(2) : '0';
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, legitimacy_status: legitimacyStatus, is_legitimate: legitimacyStatus === 'approved', earned_amount: newEarned } : x));
      setToast({ type: 'success', message: 'Legitimacy status updated.' });
    }
    catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'Could not update legitimacy status.' });
      // Re-fetch to get correct state if save failed
      fetchClients();
    }
  };

  const handleToggleStatus = async (c) => {
    if (!canUpdate) return;
    const newStatus = c.status === 'Active' ? 'Inactive' : 'Active';
    try { const res = await updateClient(c.id, { status: newStatus }); const updated = res.data?.data; setClients(prev => prev.map(x => x.id === c.id ? { ...x, ...updated } : x)); setToast({ type: 'success', message: `Client "${c.name}" set to ${newStatus}.` }); }
    catch (err) { setToast({ type: 'error', message: err.response?.data?.message || 'Could not update status.' }); }
  };

  const handleTogglePaid = async (c, checked) => {
    if (!canUpdate) return;
    if (!monthFilter) { setToast({ type: 'error', message: 'Please select month and year before updating paid status.' }); return; }
    if (checked && normalizeLegitimacyStatus(c) !== 'approved') { setToast({ type: 'error', message: 'Client must be Approved before it can be marked as paid.' }); return; }
    try {
      const res = await updateClientPaid(c.id, { month: monthFilter, is_paid: checked });
      const data = res.data?.data || {};
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, is_paid: data.is_paid ?? checked, paid_amount: data.paid_amount ?? x.paid_amount } : x));
      setToast({ type: 'success', message: checked ? 'Client marked as paid.' : 'Client marked as unpaid.' });
    }
    catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'Could not update paid status.' });
      fetchClients();
    }
  };

  const handlePaidUpdated = (c) => (data) => {
    setPaidAction(null);
    if (data) setClients(prev => prev.map(x => x.id === c.id ? { ...x, is_paid: data.is_paid, paid_amount: data.paid_amount } : x));
    setToast({ type: 'success', message: 'Paid amount updated.' });
  };

  const handleEditDone = () => { setEditClient(null); setToast({ type: 'success', message: 'Client updated successfully.' }); fetchClients(); };
  const canAdjust = (c) => c.status === 'Active' && normalizeLegitimacyStatus(c) !== 'declined';
  const formatDate = (str) => { if (!str) return '—'; const parsed = new Date(str.includes('T') ? str : str.replace(' ', 'T')); if (Number.isNaN(parsed.getTime())) return '—'; return parsed.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };

  // ─── Excel Export ───
  const exportToExcel = (data, filename) => {
    const rows = data.map(c => ({
      'ARK ID': c.arc_id,
      'Client Name': c.name,
      'Broker': c.broker?.name || '',
      'Brand': c.brand || c.broker?.brand || '',
      'Deposited': Number(c.deposited_amount || 0),
      'Withdrawal': Number(c.withdrawal_amount || 0),
      'Equity': Number(c.equity_amount || 0),
      'Net D-W-E': Number(c.net_dwe || 0),
      'Earned': Number(c.earned_amount || 0),
      'Paid': c.is_paid ? 'Yes' : 'No',
      'Paid Amount': c.is_paid ? Number(c.paid_amount || 0) : 0,
      'Transaction Date': c.transaction_date || '',
      'Legitimacy': c.legitimacy_status || 'pending',
      'Status': c.status || '',
      'Created': c.created_at || '',
      'Created By': c.created_by || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients');
    XLSX.writeFile(wb, filename);
  };

  const handleExportFiltered = () => { exportToExcel(sorted, 'clients_filtered.xlsx'); setShowExportMenu(false); };
  const handleExportAll = () => { exportToExcel(clients, 'clients_all.xlsx'); setShowExportMenu(false); };

  // ─── Excel Import ───
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      let updated = 0, errors = [];
      for (const row of rows) {
        const rawArkId = row['ARK ID'] ?? row['ark_id'] ?? row['arc_id'] ?? row['ARK_ID'] ?? row['Ark ID'] ?? row['Ark Id'] ?? row['ARK Id'] ?? '';
        const arkId = String(rawArkId).trim();
        if (!arkId) continue;
        const existing = clients.find(c => String(c.arc_id).trim() === arkId);
        if (!existing) { errors.push(`ARK ID "${arkId}" not found — skipped.`); continue; }
        const payload = {};
        if (row['Client Name'] != null || row['Name'] != null || row['name'] != null) payload.name = String(row['Client Name'] ?? row['Name'] ?? row['name']).trim();
        const equityVal = row['Equity'] ?? row['equity'] ?? row['equity_amount'];
        if (equityVal != null && !isNaN(Number(equityVal))) payload.equity_amount = Number(equityVal);
        const legVal = row['Legitimacy'] ?? row['legitimacy'] ?? row['legitimacy_status'] ?? row['Legitimacy Status'];
        if (legVal != null) { const leg = String(legVal).trim().toLowerCase(); if (['pending','approved','declined'].includes(leg)) payload.legitimacy_status = leg; }
        const statusVal = row['Status'] ?? row['status'];
        if (statusVal != null) { const st = String(statusVal).trim(); if (st === 'Active' || st === 'Inactive') payload.status = st; else if (st.toLowerCase() === 'active' || st.toLowerCase() === 'inactive') payload.status = st.charAt(0).toUpperCase() + st.slice(1).toLowerCase(); }

        // Handle deposits and withdrawals via transactions (not direct update)
        const depositedVal = row['Deposited'] ?? row['deposited'] ?? row['deposited_amount'];
        const withdrawalVal = row['Withdrawal'] ?? row['withdrawal'] ?? row['withdrawal_amount'];
        let hasAction = Object.keys(payload).length > 0;

        try {
          if (Object.keys(payload).length > 0) await updateClient(existing.id, payload);
          if (depositedVal != null && !isNaN(Number(depositedVal)) && Number(depositedVal) > 0) {
            await createClientTransaction(existing.id, { transaction_type: 'deposit', amount: Number(depositedVal) });
            hasAction = true;
          }
          if (withdrawalVal != null && !isNaN(Number(withdrawalVal)) && Number(withdrawalVal) > 0) {
            await createClientTransaction(existing.id, { transaction_type: 'withdrawal', amount: Number(withdrawalVal) });
            hasAction = true;``
          }
          if (hasAction) updated++;
        }
        catch (err) { errors.push(`ARK ID "${arkId}": ${err.response?.data?.message || 'update failed'}`); }
      }
      await fetchClients();
      let msg = `Import complete: ${updated} client${updated !== 1 ? 's' : ''} updated.`;
      if (errors.length) msg += ` ${errors.length} error${errors.length !== 1 ? 's' : ''}: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`;
      setToast({ type: errors.length && !updated ? 'error' : updated ? 'success' : 'error', message: msg });
    } catch (err) { setToast({ type: 'error', message: 'Failed to read Excel file.' }); }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleDownloadSample = () => {
    const sampleRows = [
      { 'ARK ID': '123456', 'Client Name': 'John Doe', 'Deposited': 50000, 'Withdrawal': 5000, 'Equity': 5000, 'Legitimacy': 'approved', 'Status': 'Active' },
      { 'ARK ID': '654321', 'Client Name': 'Jane Smith', 'Deposited': 30000, 'Withdrawal': 2000, 'Equity': 3000, 'Legitimacy': 'pending', 'Status': 'Active' },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sample');
    XLSX.writeFile(wb, 'client_import_sample.xlsx');
    setShowImportMenu(false);
  };

  return (
    <div className="um" style={{ height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}>
      <PageHeader
        icon={<ClientIcon />}
        title="Client Management"
        subtitle={`${clients.length} client${clients.length !== 1 ? 's' : ''} across all brokers`}
        actions={
          <>
            <CustomSelect value={brokerFilter} onChange={(v) => { setBrokerFilter(v); setPage(1); }} placeholder="All Brokers" options={allBrokers} />
            <CustomSelect value={legitimacyFilter} onChange={(v) => { setLegitimacyFilter(v); setPage(1); }} placeholder="All Legitimacy" options={legitimacyFilterOptions} />
            <CustomSelect value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} placeholder="All Status" options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} />
            <button className="ph-btn ph-btn--ghost" onClick={fetchClients}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Refresh
            </button>
          </>
        }
      />

      <div className="um__card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div className="um__toolbar">
          <div className="um__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search by name, ARK ID, broker, brand or creator" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Month filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Month</label>
              <input type="month" value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); }} style={{ height: 32, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#111827', background: '#fff', outline: 'none' }} />
              {monthFilter && <button type="button" className="ph-btn ph-btn--ghost" style={{ height: 32, padding: '0 10px', fontSize: 12 }} onClick={() => { setMonthFilter(''); }}>Clear</button>}
            </div>
            {/* Import */}
            <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImport} />
            <div style={{ position: 'relative' }}>
              <button className="ph-btn ph-btn--ghost" onClick={(e) => { e.stopPropagation(); setShowImportMenu(!showImportMenu); setShowExportMenu(false); }} disabled={importing} title="Import Excel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {importing ? 'Importing...' : 'Import'}
              </button>
              {showImportMenu && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 180, overflow: 'hidden' }}>
                  <button onClick={() => { fileInputRef.current?.click(); setShowImportMenu(false); }} style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#374151' }} onMouseEnter={e => e.target.style.background='#f3f4f6'} onMouseLeave={e => e.target.style.background='none'}>
                    Upload Excel
                  </button>
                  <button onClick={handleDownloadSample} style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#374151', borderTop: '1px solid #f1f5f9' }} onMouseEnter={e => e.target.style.background='#f3f4f6'} onMouseLeave={e => e.target.style.background='none'}>
                    Download Sample
                  </button>
                </div>
              )}
            </div>
            {/* Export dropdown */}
            <div style={{ position: 'relative' }}>
              <button className="ph-btn ph-btn--ghost" onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); setShowImportMenu(false); }} title="Export Excel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Export
              </button>
              {showExportMenu && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 160, overflow: 'hidden' }}>
                  <button onClick={handleExportFiltered} style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#374151' }} onMouseEnter={e => e.target.style.background='#f3f4f6'} onMouseLeave={e => e.target.style.background='none'}>Export Filtered ({sorted.length})</button>
                  <button onClick={handleExportAll} style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#374151', borderTop: '1px solid #f1f5f9' }} onMouseEnter={e => e.target.style.background='#f3f4f6'} onMouseLeave={e => e.target.style.background='none'}>Export All ({clients.length})</button>
                </div>
              )}
            </div>
            <div className="um__entries">
              Show <CustomSelect variant="form" value={String(pageSize)} onChange={v => { setPageSize(Number(v)); setPage(1); }} options={[{value:'10',label:'10'},{value:'25',label:'25'},{value:'50',label:'50'}]} /> entries
            </div>
          </div>
        </div>

        {loading && <div className="um__loading">Loading...</div>}
        {error && <div className="um__error">{error}</div>}

        {!loading && !error && (
          <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="um__table" style={{ minWidth: 1200 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('name')}>CLIENT <span>{getSortIndicator('name')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('arc_id')}>ARK ID <span>{getSortIndicator('arc_id')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('broker')}>BROKER <span>{getSortIndicator('broker')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('broker_arc_id')}>BROKER ARK ID <span>{getSortIndicator('broker_arc_id')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('brand')}>BRAND <span>{getSortIndicator('brand')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('deposited_amount')}>DEPOSITED <span>{getSortIndicator('deposited_amount')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('withdrawal_amount')}>WITHDRAWAL <span>{getSortIndicator('withdrawal_amount')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('equity_amount')}>EQUITY <span>{getSortIndicator('equity_amount')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('net_dwe')}>NET D-W-E <span>{getSortIndicator('net_dwe')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('earned_amount')}>EARNED <span>{getSortIndicator('earned_amount')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('paid_amount')}>PAID <span>{getSortIndicator('paid_amount')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('legitimacy_status')}>LEGITIMACY <span>{getSortIndicator('legitimacy_status')}</span></button></th>
                {canShowLegitimacy && <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('legitimacy_status')}>LEGITIMATE CLIENT <span>{getSortIndicator('legitimacy_status')}</span></button></th>}
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('status')}>STATUS <span>{getSortIndicator('status')}</span></button></th>
                <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('transaction_date')}>TRANSACTION DATE <span>{getSortIndicator('transaction_date')}</span></button></th>
                <th style={{ ...thWrapStyle, textAlign: 'left' }}>ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={canShowLegitimacy ? 16 : 15} className="um__empty">No clients found.</td></tr>
              ) : paged.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="um__user-cell">
                      <div className="um__avatar">{(c.name || 'C')[0].toUpperCase()}</div>
                      <div><div className="um__username">{c.name}</div><div className="um__handle">by {c.created_by || '—'}</div></div>
                    </div>
                  </td>
                  <td><code className="um__handle" style={{ fontWeight: 600 }}>{c.arc_id}</code></td>
                  <td><span style={{ cursor: 'pointer', color: '#004B4E', fontWeight: 500 }} onClick={() => navigate(`/brokers/${c.broker?.id}`)}>{c.broker?.name}</span></td>
                  <td><code className="um__handle" style={{ fontWeight: 600 }}>{c.broker?.arc_id}</code></td>
                  <td><span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: '#e0f5f5', color: '#004B4E', whiteSpace: 'nowrap' }}>{c.brand || c.broker?.brand || '—'}</span></td>
                  <td>{formatINR(c.deposited_amount)}</td>
                  <td>{formatINR(c.withdrawal_amount)}</td>
                  <td>{formatINR(c.equity_amount)}</td>
                  <td>{formatINRSigned(c.net_dwe)}</td>
                  <td style={{ fontWeight: 600 }}>{formatINR(c.earned_amount)}</td>
                  <td>
                    {(() => {
                      const approved = normalizeLegitimacyStatus(c) === 'approved';
                      const disabled = !canUpdate || !approved || c.status !== 'Active';
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                          <label title={!approved ? 'Client must be Approved before it can be marked as paid.' : (c.is_paid ? 'Paid' : 'Not paid')} style={{ display: 'inline-flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer', flex: '0 0 auto' }}>
                            <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${c.is_paid ? '#059669' : '#d1d5db'}`, background: c.is_paid ? '#059669' : disabled ? '#f3f4f6' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: disabled && !c.is_paid ? 0.6 : 1, transition: 'background 120ms, border-color 120ms' }}>
                              {c.is_paid && <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                            </span>
                            <input type="checkbox" checked={!!c.is_paid} disabled={disabled} onChange={(e) => handleTogglePaid(c, e.target.checked)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
                          </label>
                          {c.is_paid ? (
                            canUpdate ? (
                              <button type="button" onClick={() => setPaidAction(c)} title="Update paid amount" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#059669', fontWeight: 600, font: 'inherit' }}>{formatINR(c.paid_amount)}</button>
                            ) : (
                              <span style={{ color: '#059669', fontWeight: 600 }}>{formatINR(c.paid_amount)}</span>
                            )
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: 13 }}>—</span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                      background: c.legitimacy_status === 'approved' ? '#dcfce7' : c.legitimacy_status === 'declined' ? '#fee2e2' : '#fef3c7',
                      color: c.legitimacy_status === 'approved' ? '#15803d' : c.legitimacy_status === 'declined' ? '#dc2626' : '#92400e' }}>
                      {c.legitimacy_status === 'approved' ? 'Approved' : c.legitimacy_status === 'declined' ? 'Declined' : 'Pending'}
                    </span>
                  </td>
                  {canShowLegitimacy && (
                    <td>{c.status === 'Active' ? <LegitimacyCheckboxGroup value={normalizeLegitimacyStatus(c)} disabled={!canSetLegitimacy} onChange={(ls) => handleSetLegitimacy(c, ls)} /> : <span style={{ color: '#9ca3af', fontSize: 13 }}>—</span>}</td>
                  )}
                  <td>
                    {canUpdate ? (
                      <button className={`um__toggle ${c.status === 'Active' ? 'um__toggle--on' : ''}`} onClick={() => handleToggleStatus(c)} title={c.status}>
                        <span className="um__toggle-thumb" />
                      </button>
                    ) : (
                      <span className={`um__status-badge ${c.status === 'Active' ? 'um__status-badge--active' : 'um__status-badge--inactive'}`}>{c.status}</span>
                    )}
                  </td>
                  <td><span className="um__date">{formatDate(c.transaction_date)}</span></td>

                  <td>
                    <div className="um__actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 26px)', gap: 4 }}>
                      <button className="um__action-btn" title="Transaction History" style={{ color: '#2563eb' }} onClick={() => navigate(`/clients/${c.id}/transactions`)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
                      </button>
                      {canUpdate && canAdjust(c) && (
                        <>
                          <button className="um__action-btn" title="Add Deposit" style={{ color: '#10b981' }} onClick={() => { if (!monthFilter) { setToast({ type: 'error', message: 'Please select a month before adding deposit.' }); return; } setAmountAction({ client: c, mode: 'deposit' }); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                          <button className="um__action-btn" title="Add Withdrawal" style={{ color: '#f59e0b' }} onClick={() => { if (!monthFilter) { setToast({ type: 'error', message: 'Please select a month before adding withdrawal.' }); return; } setAmountAction({ client: c, mode: 'withdrawal' }); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                        </>
                      )}
                      {canUpdate && (
                        <>
                          <button className="um__action-btn" title="Manage Equity" style={{ color: '#8b5cf6' }} onClick={() => setEquityAction(c)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><path d="M16 15h2"/></svg>
                          </button>
                          <button className="um__action-btn um__action-btn--edit" title="Edit" onClick={() => setEditClient(c)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button className="um__action-btn um__action-btn--delete" title="Delete" onClick={() => handleDelete(c)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {!loading && !error && (
          <div className="um__footer">
            <span className="um__footer-info">{sorted.length === 0 ? 'No results' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, sorted.length)} of ${sorted.length}`}</span>
            <div className="um__footer-nav">
              <button className="ph-btn ph-btn--ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span className="um__footer-page">{page} / {totalPages}</span>
              <button className="ph-btn ph-btn--ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>

      {editClient && <EditClientModal client={editClient} canTradingOk={canTradingOk} selectedMonth={monthFilter} onClose={() => setEditClient(null)} onUpdated={handleEditDone} />}
      {amountAction && <AddAmountModal client={amountAction.client} mode={amountAction.mode} selectedMonth={monthFilter} onMonthChange={setMonthFilter} onClose={() => setAmountAction(null)} onUpdated={() => { setAmountAction(null); setToast({ type: 'success', message: `${amountAction.mode === 'deposit' ? 'Deposit' : 'Withdrawal'} added successfully.` }); fetchClients(); }} />}
      {equityAction && <ManageEquityModal client={equityAction} selectedMonth={monthFilter} onMonthChange={setMonthFilter} onClose={() => setEquityAction(null)} onUpdated={() => { setEquityAction(null); setToast({ type: 'success', message: 'Equity updated successfully.' }); fetchClients(); }} />}
      {paidAction && <EditPaidModal client={paidAction} selectedMonth={monthFilter} onMonthChange={setMonthFilter} onClose={() => setPaidAction(null)} onUpdated={handlePaidUpdated(paidAction)} />}
      {confirmState && <ConfirmDialog title={confirmState.title} itemName={confirmState.itemName} bullets={confirmState.bullets} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)} />}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}

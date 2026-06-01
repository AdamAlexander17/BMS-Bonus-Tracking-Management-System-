import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader/PageHeader';
import { getBroker, updateBroker } from '../api/brokers';
import { getBrands } from '../api/brands';
import { getRmJrmUsers } from '../api/users';
import { getClientsByBroker, createClient, updateClient, deleteClient, createClientTransaction } from '../api/clients';
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
  whiteSpace: 'normal',
  textAlign: 'left',
  lineHeight: 1.2,
};

const thWrapStyle = {
  whiteSpace: 'normal',
  lineHeight: 1.2,
  verticalAlign: 'middle',
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

const BrokerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const formatDate = (str) => {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

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

  if (clientOrValue?.legitimacy_status) {
    return normalizeLegitimacyStatus(clientOrValue.legitimacy_status);
  }

  return clientOrValue?.is_legitimate ? 'approved' : 'pending';
}

function LegitimacyCheckboxGroup({ value, onChange, disabled = false, compact = false }) {
  const selectedValue = normalizeLegitimacyStatus(value);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 18, flexWrap: compact ? 'nowrap' : 'wrap', flexDirection: 'row', whiteSpace: compact ? 'nowrap' : 'normal' }}>
      {legitimacyOptions.map((option) => {
        const isChecked = selectedValue === option.value;
        return (
          <label
            key={option.value}
            title={option.label}
            style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 4 : 6, fontSize: compact ? 12 : 14, color: isChecked ? '#2563eb' : '#6b7280', cursor: disabled ? 'default' : 'pointer', fontWeight: isChecked ? 700 : 500, whiteSpace: 'nowrap', flex: '0 0 auto' }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                border: `1.5px solid ${isChecked ? '#2563eb' : '#d1d5db'}`,
                background: isChecked ? '#2563eb' : 'transparent',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 auto',
                transition: 'background 120ms, border-color 120ms',
              }}
            >
              {isChecked && (
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
            />
            {compact ? option.shortLabel : option.label}
          </label>
        );
      })}
    </div>
  );
}

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

/* ── Confirm Dialog ─────────────────────────────────────────── */
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';

function AddClientModal({ broker, onClose, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [form, setForm]     = useState({ name: '', arc_id: '', deposited_amount: '', withdrawal_amount: '', equity_amount: '', legitimacy_status: 'pending' });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4,6}$/.test(form.arc_id.trim())) {
      setError('ARC ID must be 4–6 digits.');
      return;
    }
    setSaving(true);
    try {
      await createClient(broker.id, {
        name:              form.name.trim(),
        arc_id:            form.arc_id.trim(),
        deposited_amount:  form.deposited_amount  || 0,
        withdrawal_amount: form.withdrawal_amount || 0,
        equity_amount:     form.equity_amount     || 0,
        legitimacy_status: form.legitimacy_status,
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add client.');
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="bd-modal-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bd-modal" style={{
          background: '#fff',
          borderRadius: 14,
          width: '100%',
          maxWidth: 580,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        <div className="bms-dialog__header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 18px',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Add Client</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>
              Adding to <strong>{broker.name}</strong> · {broker.arc_id}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18,
              }}>{error}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 20px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Client Name" required>
                  <input
                    style={inputStyle}
                    value={form.name}
                    onChange={set('name')}
                    required
                    placeholder="Enter client name"
                    onFocus={e => e.target.style.borderColor = '#004B4E'}
                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  />
                </Field>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="ARC ID" required>
                  <input
                    style={inputStyle}
                    value={form.arc_id}
                    onChange={(e) => setForm(f => ({ ...f, arc_id: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    required
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    placeholder="123456"
                    onFocus={e => e.target.style.borderColor = '#004B4E'}
                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  />
                </Field>
              </div>
              <Field label="Deposited Amount (₹)">
                <input
                  type="number" min="0" step="0.01"
                  style={inputStyle}
                  value={form.deposited_amount}
                  onChange={set('deposited_amount')}
                  placeholder="0.00"
                  onFocus={e => e.target.style.borderColor = '#004B4E'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </Field>
              <Field label="Withdrawal Amount (₹)">
                <input
                  type="number" min="0" step="0.01"
                  style={inputStyle}
                  value={form.withdrawal_amount}
                  onChange={set('withdrawal_amount')}
                  placeholder="0.00"
                  onFocus={e => e.target.style.borderColor = '#004B4E'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </Field>
              <Field label="Equity (₹)">
                <input
                  type="number" min="0" step="0.01"
                  style={inputStyle}
                  value={form.equity_amount}
                  onChange={set('equity_amount')}
                  placeholder="0.00"
                  onFocus={e => e.target.style.borderColor = '#004B4E'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </Field>
            </div>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '20px 24px',
            borderTop: '1px solid #f1f5f9',
            marginTop: 16,
          }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
              {saving ? 'Adding...' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditClientModal({ client, broker, canTradingOk, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [form, setForm]     = useState({
    name:              client.name ?? '',
    arc_id:            client.arc_id,
    equity_amount:     client.equity_amount ?? '',
    legitimacy_status: normalizeLegitimacyStatus(client),
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4,6}$/.test(form.arc_id.trim())) {
      setError('ARC ID must be 4–6 digits.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name:              form.name.trim(),
        arc_id:            form.arc_id.trim(),
        equity_amount:     form.equity_amount === '' ? 0 : form.equity_amount,
      };
      if (canTradingOk) {
        payload.legitimacy_status = form.legitimacy_status;
      }
      await updateClient(client.id, payload);
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update client.');
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="bd-modal-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bd-modal" style={{
          background: '#fff',
          borderRadius: 14,
          width: '100%',
          maxWidth: 580,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="bms-dialog__header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 18px',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Edit Client</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>
              Editing <strong>{client.arc_id}</strong> in {broker.name}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18,
              }}>{error}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 20px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Client Name" required>
                  <input
                    style={inputStyle}
                    value={form.name}
                    onChange={set('name')}
                    required
                    placeholder="Enter client name"
                    onFocus={e => e.target.style.borderColor = '#004B4E'}
                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  />
                </Field>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="ARC ID" required>
                  <input
                    style={inputStyle}
                    value={form.arc_id}
                    onChange={(e) => setForm(f => ({ ...f, arc_id: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    required
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    placeholder="123456"
                    onFocus={e => e.target.style.borderColor = '#004B4E'}
                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  />
                </Field>
              </div>
              {canTradingOk && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Legitimate Client Status">
                    <LegitimacyCheckboxGroup
                      value={form.legitimacy_status}
                      onChange={(legitimacyStatus) => setForm((current) => ({ ...current, legitimacy_status: legitimacyStatus }))}
                    />
                  </Field>
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Equity (₹)">
                  <input
                    type="number" min="0" step="0.01"
                    style={inputStyle}
                    value={form.equity_amount}
                    onChange={set('equity_amount')}
                    placeholder="0.00"
                    onFocus={e => e.target.style.borderColor = '#004B4E'}
                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '20px 24px',
            borderTop: '1px solid #f1f5f9',
            marginTop: 16,
          }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddAmountModal({ client, mode, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [amount, setAmount] = useState('');

  const isDeposit = mode === 'deposit';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) <= 0) {
      setError(`Enter a valid ${isDeposit ? 'deposit' : 'withdrawal'} amount.`);
      return;
    }
    setSaving(true);
    try {
      await createClientTransaction(client.id, {
        transaction_type: isDeposit ? 'deposit' : 'withdrawal',
        amount: Number(amount),
      });
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update amounts.');
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="bd-modal-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bd-modal" style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 500,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="bd-modal__header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 18px', borderBottom: '1px solid #f1f5f9',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
              {isDeposit ? 'Add Deposit' : 'Add Withdrawal'}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6b7280' }}>
              Client <strong>{client.arc_id}</strong> · Current {isDeposit ? 'deposit' : 'withdrawal'}:{' '}
              <strong>{formatINR(isDeposit ? client.deposited_amount : client.withdrawal_amount)}</strong>
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 6, display: 'flex' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '18px 20px' }}>
              <Field label={`${isDeposit ? 'Add Deposit' : 'Add Withdrawal'} (₹)`}>
                <input
                  type="number" min="0" step="0.01"
                  style={inputStyle}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  onFocus={e => e.target.style.borderColor = '#004B4E'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </Field>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : isDeposit ? 'Add Deposit' : 'Withdrawal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManageEquityModal({ client, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [amount, setAmount] = useState(
    client.equity_amount != null && client.equity_amount !== ''
      ? String(client.equity_amount)
      : ''
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (amount === '' || Number(amount) < 0 || Number.isNaN(Number(amount))) {
      setError('Enter a valid equity amount (0 or greater).');
      return;
    }
    setSaving(true);
    try {
      await updateClient(client.id, { equity_amount: Number(amount) });
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update equity.');
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="bd-modal-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bd-modal" style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}
      >
        <div className="bms-dialog__header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 18px',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Manage Equity</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>
              {client.name} · <strong>{client.arc_id}</strong>
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6, display: 'flex' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>
            )}
            <Field label="Equity (₹)">
              <input
                type="number" min="0" step="0.01"
                style={inputStyle}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                onFocus={e => e.target.style.borderColor = '#004B4E'}
                onBlur={e => e.target.style.borderColor = '#d1d5db'}
              />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Equity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditBrokerModal({ broker, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [brands, setBrands] = useState([]);
  const [rmUsers, setRmUsers] = useState([]);
  const [form, setForm] = useState({
    name:       broker.name || '',
    arc_id:     broker.arc_id || '',
    brand_id:   broker.brand?.id || '',
    rm_user_id: broker.rm_user?.id || '',
    status:     broker.status || 'Active',
  });

  useEffect(() => {
    getBrands().then(r => setBrands(r.data.data || [])).catch(() => {});
    getRmJrmUsers().then(r => setRmUsers(r.data.data || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await updateBroker(broker.id, {
        name:       form.name.trim(),
        arc_id:     form.arc_id.trim(),
        brand_id:   form.brand_id   ? Number(form.brand_id)   : null,
        rm_user_id: form.rm_user_id ? Number(form.rm_user_id) : null,
        status:     form.status,
      });
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update broker.');
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="bd-modal-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bd-modal" style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 620,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="bms-dialog__header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 18px',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Edit Broker</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Update details for <strong>{broker.name}</strong></p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 6, display: 'flex' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px 24px 8px' }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>{error}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 20px' }}>
              <Field label="Broker Name" required>
                <input style={inputStyle} value={form.name} onChange={set('name')} required placeholder="e.g. ABC Brokers Pvt Ltd"
                  onFocus={e => e.target.style.borderColor='#004B4E'} onBlur={e => e.target.style.borderColor='#d1d5db'} />
              </Field>
              <Field label="ARC ID" required>
                <input style={inputStyle} value={form.arc_id} onChange={(e) => setForm(f => ({ ...f, arc_id: e.target.value.replace(/\D/g, '').slice(0, 6) }))} required maxLength={6} placeholder="12345"
                  onFocus={e => e.target.style.borderColor='#004B4E'} onBlur={e => e.target.style.borderColor='#d1d5db'} />
              </Field>
              <Field label="Brand" required>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.brand_id} onChange={set('brand_id')} required
                  onFocus={e => e.target.style.borderColor='#004B4E'} onBlur={e => e.target.style.borderColor='#d1d5db'}>
                  <option value="">Select brand</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Designation (RM / JRM)">
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.rm_user_id} onChange={set('rm_user_id')}
                  onFocus={e => e.target.style.borderColor='#004B4E'} onBlur={e => e.target.style.borderColor='#d1d5db'}>
                  <option value="">-- Unassigned --</option>
                  {rmUsers.map(u => <option key={u.id} value={u.id}>{u.username} ({(u.roles || []).join('/')})</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.status} onChange={set('status')}
                  onFocus={e => e.target.style.borderColor='#004B4E'} onBlur={e => e.target.style.borderColor='#d1d5db'}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </Field>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Saving...' : 'Update Broker'}</button>
          </div>
        </form>
      </div>
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

export default function BrokerDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const hasPerm         = (key) => !user?.permissions || user.permissions.includes(key);
  const canTradingOk    = hasPerm('client:trading_ok');
  const canShowLegitimacy = hasPerm('client:view') && canTradingOk; // must have both: client:view + client:trading_ok
  const canSetLegitimacy = canTradingOk; // owner of legitimacy approval (checker / admin)
  const canClientCreate = hasPerm('client:create');
  const canClientUpdate = hasPerm('client:update');
  const canClientDelete = hasPerm('client:delete');
  const canBrokerUpdate = hasPerm('broker:update');
  const canManageBonus  = hasPerm('bonus:manage');
  const canViewTxns     = hasPerm('transactions:view');
  const canClientActions = canClientUpdate || canClientDelete || canViewTxns;

  const [broker, setBroker]   = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [showModal, setShowModal]             = useState(false);
  const [editClient, setEditClient]           = useState(null);
  const [amountAction, setAmountAction]       = useState(null);
  const [equityAction, setEquityAction]       = useState(null);
  const [showEditBroker, setShowEditBroker]   = useState(false);
  const [confirmState, setConfirmState]       = useState(null);
  const [pageSuccess, setPageSuccess]         = useState('');
  const [pageError, setPageError]             = useState('');
  const [sortConfig, setSortConfig]           = useState({ key: null, direction: 'asc' });
  const [monthFilter, setMonthFilter]         = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [bRes, cRes] = await Promise.all([getBroker(id), getClientsByBroker(id)]);
      setBroker(bRes.data.data);
      setClients(cRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load broker.');
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

  const handleToggleClient = async (c) => {
    const newStatus = c.status === 'Active' ? 'Inactive' : 'Active';
    setPageSuccess('');
    try {
      await updateClient(c.id, { status: newStatus });
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, status: newStatus } : x));
      setPageError('');
      setPageSuccess(`Client status updated to ${newStatus}.`);
    } catch (err) {
      setPageError(err.response?.data?.message || 'Could not update client status. Please try again.');
    }
  };

  const handleSetLegitimacy = async (c, legitimacyStatus) => {
    setPageSuccess('');
    setPageError('');
    if (normalizeLegitimacyStatus(c) === legitimacyStatus) return;

    try {
      const res = await updateClient(c.id, { legitimacy_status: legitimacyStatus });
      const updated = res.data?.data;
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, ...updated } : x));
      setPageSuccess('Legitimate client status updated successfully.');
    } catch (err) {
      setPageError(err.response?.data?.message || 'Could not update trading legitimacy. Please try again.');
    }
  };

  const handleDeleteClient = (c) => {
    setPageSuccess('');
    setPageError('');
    setConfirmState({
      title: 'Delete Client?',
      itemName: c.arc_id,
      bullets: ['Client record & ARC ID', 'Deposited & withdrawal data', 'Commission & bonus history'],
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteClient(c.id);
          setClients(prev => prev.filter(x => x.id !== c.id));
          setPageSuccess('Client deleted successfully.');
        } catch (err) {
          setPageError(err.response?.data?.message || 'Could not delete this client. Please try again.');
        }
      },
    });
  };

  const totalDeposited  = clients.reduce((s, c) => s + Number(c.deposited_amount  || 0), 0);
  const totalWithdrawn  = clients.reduce((s, c) => s + Number(c.withdrawal_amount || 0), 0);
  const totalNetPnl     = totalDeposited - totalWithdrawn;
  const totalEarned     = Number(broker?.amount_earned || 0);
  const amountPaid      = Number(broker?.amount_paid || 0);
  const pendingPayout   = Number(broker?.pending_payout || 0);

  const sortedClients = useMemo(() => {
    const filtered = monthFilter
      ? clients.filter((c) => (c.created_at || '').slice(0, 7) === monthFilter)
      : clients;
    if (!sortConfig.key) return filtered;

    const getSortValue = (client, key) => {
      switch (key) {
        case 'name':
          return client.name || '';
        case 'arc_id':
          return client.arc_id || '';
        case 'deposited_amount':
          return Number(client.deposited_amount ?? 0);
        case 'withdrawal_amount':
          return Number(client.withdrawal_amount ?? 0);
        case 'equity_amount':
          return Number(client.equity_amount ?? 0);
        case 'net_total':
          return Number(client.net_total ?? 0);
        case 'net_dwe':
          return Number(
            client.net_dwe ?? (
              Number(client.deposited_amount ?? 0)
              - Number(client.withdrawal_amount ?? 0)
              - Number(client.equity_amount ?? 0)
            )
          );
        case 'earned_amount':
          return Number(client.earned_amount ?? 0);
        case 'status':
          return client.status || '';
        case 'legitimacy_status':
          return client.status === 'Active' ? normalizeLegitimacyStatus(client) : '';
        case 'created_at':
          return client.created_at ? new Date(client.created_at).getTime() : null;
        default:
          return '';
      }
    };

    return [...filtered].sort((left, right) => (
      compareValues(
        getSortValue(left, sortConfig.key),
        getSortValue(right, sortConfig.key),
        sortConfig.direction,
      )
    ));
  }, [clients, sortConfig, monthFilter]);

  const handleSort = (key) => {
    setSortConfig((current) => (
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'created_at' ? 'desc' : 'asc' }
    ));
  };

  const getSortIndicator = (key) => (sortConfig.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕');

  if (loading) return <div className="um"><div className="um__loading">Loading...</div></div>;
  if (error)   return <div className="um"><div className="um__error">{error}</div></div>;
  if (!broker) return null;

  return (
    <div className="um">
      <PageHeader
        icon={<BrokerIcon />}
        title={broker.name}
        subtitle={`ARC ID: ${broker.arc_id} • ${broker.brand?.name || 'No brand'} • ${clients.length} client${clients.length !== 1 ? 's' : ''}`}
        actions={
          <>
            <button className="ph-btn ph-btn--ghost" onClick={() => broker.rm_user ? navigate(`/brokers/rm/${broker.rm_user.id}`) : navigate('/brokers')}>
              <BackIcon /> Back
            </button>
            {canManageBonus && (
              <button className="ph-btn ph-btn--ghost" onClick={() => navigate(`/brokers/${broker.id}/payouts`)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                  <path d="M3 7h18v10H3z"/>
                  <path d="M7 12h10"/>
                  <path d="M12 9v6"/>
                </svg>
                Manage Bonus
              </button>
            )}
            {canClientCreate && (
              <button className="ph-btn ph-btn--primary" onClick={() => setShowModal(true)}>
                <PlusIcon /> Add Client
              </button>
            )}
          </>
        }
      />
      
      {/* Broker info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
        <InfoCard label="Designation" value={broker.rm_user ? `${broker.rm_user.username} (${(broker.rm_user.roles || []).join('/')})` : 'Unassigned'} />
        <InfoCard label="Broker Earned" value={formatINR(totalEarned)} />
        <InfoCard label="Paid to Broker" value={formatINR(amountPaid)} />
        <InfoCard label="Pending Payout" value={formatINR(pendingPayout)} />
        <InfoCard label="Total Deposited" value={formatINR(totalDeposited)} />
        <InfoCard label="Total Withdrawn" value={formatINR(totalWithdrawn)} />
        <InfoCard label="Net P&L" value={formatINR(totalNetPnl)} />
      </div>

      {/* Modals */}
      {showModal && (
        <AddClientModal
          broker={broker}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); setPageError(''); setPageSuccess('Client added successfully.'); fetchAll(); }}
        />
      )}
      {amountAction && (
        <AddAmountModal
          client={amountAction.client}
          mode={amountAction.mode}
          onClose={() => setAmountAction(null)}
          onUpdated={() => { setAmountAction(null); setPageError(''); setPageSuccess(`${amountAction.mode === 'deposit' ? 'Deposit' : 'Withdrawal'} added successfully.`); fetchAll(); }}
        />
      )}

      {equityAction && (
        <ManageEquityModal
          client={equityAction}
          onClose={() => setEquityAction(null)}
          onUpdated={() => { setEquityAction(null); setPageError(''); setPageSuccess('Equity updated successfully.'); fetchAll(); }}
        />
      )}
      {editClient && (
        <EditClientModal
          client={editClient}
          broker={broker}
          canTradingOk={canTradingOk}
          onClose={() => setEditClient(null)}
          onUpdated={() => { setEditClient(null); setPageError(''); setPageSuccess('Client updated successfully.'); fetchAll(); }}
        />
      )}
      {showEditBroker && (
        <EditBrokerModal
          broker={broker}
          onClose={() => setShowEditBroker(false)}
          onUpdated={() => { setShowEditBroker(false); setPageError(''); setPageSuccess('Broker updated successfully.'); fetchAll(); }}
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

      {/* Clients table */}
      <div className="um__card">
        <div className="um__toolbar" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Clients ({sortedClients.length}{monthFilter ? ` of ${clients.length}` : ''})</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Month</label>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              style={{ height: 32, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#111827', background: '#fff', outline: 'none' }}
            />
            {monthFilter && (
              <button type="button" className="ph-btn ph-btn--ghost" style={{ height: 32, padding: '0 10px', fontSize: 12 }} onClick={() => setMonthFilter('')}>Clear</button>
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
              <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('name')}>NAME <span>{getSortIndicator('name')}</span></button></th>
              <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('arc_id')}>ARC ID <span>{getSortIndicator('arc_id')}</span></button></th>
              <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('deposited_amount')}>DEPOSITED <span>{getSortIndicator('deposited_amount')}</span></button></th>
              <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('withdrawal_amount')}>WITHDRAWN <span>{getSortIndicator('withdrawal_amount')}</span></button></th>
              <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('equity_amount')}>EQUITY <span>{getSortIndicator('equity_amount')}</span></button></th>
              <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('net_total')}>NET TOTAL <span>{getSortIndicator('net_total')}</span></button></th>
              <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('net_dwe')}>NET DWE <span>{getSortIndicator('net_dwe')}</span></button></th>
              <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('earned_amount')}>EARNED (1%) <span>{getSortIndicator('earned_amount')}</span></button></th>
              <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('status')}>STATUS <span>{getSortIndicator('status')}</span></button></th>
              {canShowLegitimacy && <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('legitimacy_status')}>LEGITIMATE CLIENT <span>{getSortIndicator('legitimacy_status')}</span></button></th>}
              <th style={thWrapStyle}><button type="button" style={sortButtonStyle} onClick={() => handleSort('created_at')}>CREATED <span>{getSortIndicator('created_at')}</span></button></th>
              {canClientActions && <th style={{ ...thWrapStyle, width: 100, minWidth: 100, paddingLeft: 4, paddingRight: 8, textAlign: 'left' }}>ACTIONS</th>}
            </tr>
          </thead>
          <tbody>
            {sortedClients.length === 0 ? (
              <tr><td colSpan={11 + (canShowLegitimacy ? 1 : 0) + (canClientActions ? 1 : 0)} className="um__empty">No clients yet. Click "Add Client" to create the first one.</td></tr>
            ) : sortedClients.map((c) => {
              const canAdjustAmounts = c.status === 'Active' && normalizeLegitimacyStatus(c) !== 'declined';

              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td><code className="um__handle">{c.arc_id}</code></td>
                  <td>{formatINR(c.deposited_amount)}</td>
                  <td>{formatINR(c.withdrawal_amount)}</td>
                  <td>{formatINR(c.equity_amount)}</td>
                  <td>{formatINR(c.net_total)}</td>
                  <td>{formatINR(c.net_dwe)}</td>
                  <td style={{ fontWeight: 600 }}>{formatINR(c.earned_amount)}</td>
                  <td>
                    {canClientUpdate ? (
                      <button
                        className={`um__toggle ${c.status === 'Active' ? 'um__toggle--on' : ''}`}
                        onClick={() => handleToggleClient(c)}
                        title={c.status}
                      >
                        <span className="um__toggle-thumb" />
                      </button>
                    ) : (
                      <span className={`um__status-badge ${c.status === 'Active' ? 'um__status-badge--active' : 'um__status-badge--inactive'}`}>
                        {c.status}
                      </span>
                    )}
                  </td>
                  {canShowLegitimacy && (
                    <td>
                      {c.status === 'Active' ? (
                        <LegitimacyCheckboxGroup
                          value={normalizeLegitimacyStatus(c)}
                          compact
                          disabled={!canSetLegitimacy}
                          onChange={(legitimacyStatus) => handleSetLegitimacy(c, legitimacyStatus)}
                        />
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: 13 }}>-</span>
                      )}
                    </td>
                  )}
                  <td><span className="um__date">{formatDate(c.created_at)}</span></td>
                  {canClientActions && (
                    <td style={{ width: 100, minWidth: 100, paddingLeft: 4, paddingRight: 8, textAlign: 'left' }}>
                      <div className="um__actions" style={{ flexWrap: 'wrap', rowGap: 4, gap: 4, justifyContent: 'flex-start', maxWidth: 88, marginRight: 'auto' }}>
                        {canViewTxns && (
                          <button
                            className="um__action-btn"
                            title="Transaction History"
                            style={{ color: '#2563eb' }}
                            onClick={() => navigate(`/clients/${c.id}/transactions`)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                              <path d="M3 12h18"/>
                              <path d="M3 6h18"/>
                              <path d="M3 18h18"/>
                            </svg>
                          </button>
                        )}
                        {canClientUpdate && (
                          <>
                            {canAdjustAmounts && (
                              <>
                                <button
                                  className="um__action-btn"
                                  title="Add Deposit"
                                  style={{ color: '#10b981' }}
                                  onClick={() => setAmountAction({ client: c, mode: 'deposit' })}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                                    <line x1="12" y1="5" x2="12" y2="19"/>
                                    <line x1="5" y1="12" x2="19" y2="12"/>
                                  </svg>
                                </button>
                                <button
                                  className="um__action-btn"
                                  title="Add Withdrawal"
                                  style={{ color: '#f59e0b' }}
                                  onClick={() => setAmountAction({ client: c, mode: 'withdrawal' })}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                                    <line x1="5" y1="12" x2="19" y2="12"/>
                                  </svg>
                                </button>
                              </>
                            )}
                            <button
                              className="um__action-btn"
                              title="Manage Equity"
                              style={{ color: '#8b5cf6' }}
                              onClick={() => setEquityAction(c)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                <rect x="2" y="6" width="20" height="13" rx="2"/>
                                <path d="M2 10h20"/>
                                <path d="M16 15h2"/>
                              </svg>
                            </button>
                            <button
                              className="um__action-btn um__action-btn--edit"
                              title="Edit"
                              onClick={() => setEditClient(c)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                          </>
                        )}
                        {canClientDelete && (
                          <button
                            className="um__action-btn um__action-btn--delete"
                            title="Delete"
                            onClick={() => handleDeleteClient(c)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14H6L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                              <path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfoCard({ label, value, accent }) {
  return (
    <div className="um__card info-card info-card--sm">
      <div className="info-card__label">{label}</div>
      <div className="info-card__value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader/PageHeader';
import { getBroker, createBroker, updateBroker } from '../api/brokers';
import { getBrands } from '../api/brands';
import { getRmJrmUsers } from '../api/users';
import './Users.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

const Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
  </svg>
);

export default function BrokerForm() {
  const navigate = useNavigate();
  const { id }   = useParams();
  const [searchParams] = useSearchParams();
  const isEdit   = Boolean(id);
  const presetRmUserId = searchParams.get('rm_user_id') || '';

  const [brands, setBrands]     = useState([]);
  const [rmUsers, setRmUsers]   = useState([]);
  const [loading, setLoading]   = useState(isEdit);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const [form, setForm] = useState({
    name: '',
    arc_id: '',
    brand_id: '',
    rm_user_id: presetRmUserId,
    status: 'Active',
  });

  useEffect(() => {
    (async () => {
      try {
        const [bRes] = await Promise.all([getBrands()]);
        setBrands(bRes.data.data || []);
      } catch {
        /* ignore */
      }
      try {
        const r = await getRmJrmUsers();
        setRmUsers(r.data.data || []);
      } catch {
        setRmUsers([]);
      }

      if (isEdit) {
        try {
          const res = await getBroker(id);
          const b = res.data.data;
          setForm({
            name:       b.name || '',
            arc_id:     b.arc_id || '',
            brand_id:   b.brand?.id || '',
            rm_user_id: b.rm_user?.id || '',
            status:     b.status || 'Active',
          });
        } catch (err) {
          setError(err.response?.data?.message || 'Failed to load broker.');
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [id, isEdit]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        arc_id: form.arc_id.trim(),
        brand_id: form.brand_id ? Number(form.brand_id) : null,
        rm_user_id: form.rm_user_id ? Number(form.rm_user_id) : null,
        status: form.status,
      };
      if (isEdit) {
        await updateBroker(id, payload);
      } else {
        await createBroker(payload);
      }
      navigate('/brokers');
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="um"><div className="um__loading">Loading...</div></div>;

  return (
    <div className="um">
      <PageHeader
        icon={<Icon />}
        title={isEdit ? 'Edit Broker' : 'Add Client'}
        subtitle={isEdit ? 'Update broker details' : 'Create a new broker'}
        actions={
          <button className="ph-btn ph-btn--ghost" onClick={() => navigate('/brokers')}>
            <BackIcon /> Back to Brokers
          </button>
        }
      />

      <div className="um__card" style={{ padding: 24 }}>
        {error && <div className="um__error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 800 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Broker Name *</span>
            <input
              className="um__input"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="e.g. ABC Brokers Pvt Ltd"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>ARC ID *</span>
            <input
              className="um__input"
              name="arc_id"
              value={form.arc_id}
              onChange={handleChange}
              required
              placeholder="e.g. ARC-12345"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Brand *</span>
            <select
              className="um__select"
              name="brand_id"
              value={form.brand_id}
              onChange={handleChange}
              required
            >
              <option value="">Select brand</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
              Designation (RM / JRM)
            </span>
            <select
              className="um__select"
              name="rm_user_id"
              value={form.rm_user_id}
              onChange={handleChange}
            >
              <option value="">-- Unassigned --</option>
              {rmUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.role})
                </option>
              ))}
            </select>
            {rmUsers.length === 0 && (
              <small style={{ color: '#9ca3af' }}>No RM/JRM users available.</small>
            )}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Status</span>
            <select
              className="um__select"
              name="status"
              value={form.status}
              onChange={handleChange}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="ph-btn ph-btn--ghost" onClick={() => navigate('/brokers')}>
              Cancel
            </button>
            <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : (isEdit ? 'Update Broker' : 'Create Broker')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

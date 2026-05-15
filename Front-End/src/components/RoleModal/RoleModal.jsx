import { useEffect, useState } from 'react';
import { getPermissions } from '../../api/permissions';
import { createRole, updateRole } from '../../api/roles';
import './RoleModal.css';

/**
 * Dual-mode modal:
 *   create mode → role prop is null/undefined
 *   edit mode   → role prop is the existing role object
 */
export default function RoleModal({ open, role, onClose, onSuccess }) {
  const isEdit = !!role;

  const [roleName, setRoleName]     = useState('');
  const [description, setDescription] = useState('');
  const [roleStatus, setRoleStatus] = useState('Active');
  const [permissions, setPermissions] = useState([]);
  const [selected, setSelected]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');

  useEffect(() => {
    if (!open) return;
    // Pre-populate fields
    setRoleName(isEdit ? (role.name || '') : '');
    setDescription(isEdit ? (role.description || '') : '');
    setRoleStatus(isEdit ? (role.status || 'Active') : 'Active');
    setSelected(isEdit ? (role.permissions?.map(p => p.id) || []) : []);
    setErr('');
    setLoading(true);
    getPermissions()
      .then(res => setPermissions(res.data.data || []))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // Group permissions by module
  const grouped = permissions.reduce((acc, p) => {
    const key = (p.module || 'OTHER').toUpperCase();
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const allIds = permissions.map(p => p.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.includes(id));

  const toggleAll = () => {
    setSelected(allSelected ? [] : [...allIds]);
  };

  const toggleGroup = (groupIds) => {
    const allGroupSelected = groupIds.every(id => selected.includes(id));
    if (allGroupSelected) {
      setSelected(sel => sel.filter(id => !groupIds.includes(id)));
    } else {
      setSelected(sel => [...sel, ...groupIds.filter(id => !sel.includes(id))]);
    }
  };

  const toggleOne = (id) => {
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  };

  const formatPermLabel = (p) => {
    const action = (p.action || '').charAt(0).toUpperCase() + (p.action || '').slice(1);
    const module = (p.module || '').toLowerCase().replace(/_/g, ' ');
    return `${action} ${module}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      if (isEdit) {
        await updateRole(role.id, {
          name: roleName,
          description,
          status: roleStatus,
          permissions: selected,
        });
      } else {
        await createRole({ name: roleName, description, status: roleStatus, permissions: selected });
      }
      onSuccess();
      onClose();
    } catch (ex) {
      setErr(ex.response?.data?.message || (isEdit ? 'Failed to update role.' : 'Failed to create role.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm" onClick={e => e.stopPropagation()}>
        <div className="rm__header">
          <h2>{isEdit ? 'Edit Role' : 'Create New Role'}</h2>
          <p>{isEdit ? 'Update role details and permission assignments' : 'Define role permissions and access levels'}</p>
          <button className="rm__close" onClick={onClose} type="button">&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="rm__body">
            {err && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: '0.875rem' }}>
                {err}
              </div>
            )}

            <div>
              <div className="rm__section-title">Basic Information</div>
              <div className="rm__basic">
                <div className="rm__field">
                  <label>Role Name <span>*</span></label>
                  <input
                    required
                    placeholder="e.g. Marketing Manager"
                    value={roleName}
                    onChange={e => setRoleName(e.target.value)}
                  />
                </div>
                <div className="rm__field">
                  <label>Status</label>
                  <select
                    className="rm__select"
                    value={roleStatus}
                    onChange={e => setRoleStatus(e.target.value)}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="rm__field rm__field--full">
                  <label>Description</label>
                  <input
                    placeholder="Brief description of the role"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="rm__perms-header">
                <div className="rm__perms-header-left">
                  <h3>Permissions</h3>
                  <p>Select the permissions for this role</p>
                </div>
                <button type="button" className="rm__select-all-btn" onClick={toggleAll}>
                  <input type="checkbox" checked={allSelected} readOnly />
                  Select All
                </button>
              </div>

              {loading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#8a94a6' }}>Loading permissions...</div>
              ) : (
                <div className="rm__groups">
                  {Object.entries(grouped).map(([group, perms]) => {
                    const groupIds = perms.map(p => p.id);
                    const groupSelected = groupIds.filter(id => selected.includes(id)).length;
                    const groupAllSelected = groupSelected === groupIds.length;
                    return (
                      <div key={group} className="rm__group">
                        <div className="rm__group-header">
                          <span className="rm__group-header-left">{group.replace(/_/g, ' ')}</span>
                          <div className="rm__group-header-right">
                            <span>{groupSelected}/{groupIds.length}</span>
                            <input
                              type="checkbox"
                              checked={groupAllSelected}
                              onChange={() => toggleGroup(groupIds)}
                            />
                          </div>
                        </div>
                        <div className="rm__group-items">
                          {perms.map(p => (
                            <label key={p.id} className="rm__perm-item">
                              <input
                                type="checkbox"
                                checked={selected.includes(p.id)}
                                onChange={() => toggleOne(p.id)}
                              />
                              {formatPermLabel(p)}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rm__footer">
            <span className="rm__footer-count">{selected.length} permissions selected</span>
            <button type="button" className="rm__btn-cancel" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="rm__btn-create"
              disabled={!roleName || saving}
            >
              {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Role')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

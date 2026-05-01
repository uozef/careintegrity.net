import { useState, useEffect } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

const ROLE_COLORS = {
  admin: '#ef4444', fraud_officer: '#f97316', investigator: '#8b5cf6',
  inspector: '#06b6d4', analyst: '#3b82f6', viewer: '#6b7280',
}

export default function UserManagement() {
  const { data: users, loading } = useApi('/users', [])
  const { data: roles } = useApi('/users/roles', [])
  const { data: auditLog } = useApi('/audit-log?limit=50', [])
  const [usersData, setUsersData] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [activeTab, setActiveTab] = useState('users')
  const [saving, setSaving] = useState(false)

  const emptyUser = { username: '', password: '', full_name: '', email: '', role: 'analyst' }
  const [newUser, setNewUser] = useState({ ...emptyUser })

  useEffect(() => { if (users) setUsersData(users) }, [users])

  const handleCreate = async () => {
    setSaving(true)
    const result = await fetchApi('/users', { method: 'POST', body: JSON.stringify(newUser) })
    if (result && !result.detail) {
      setUsersData(prev => [...prev, result])
      setShowCreate(false)
      setNewUser({ ...emptyUser })
    }
    setSaving(false)
  }

  const handleToggle = async (username) => {
    const result = await fetchApi(`/users/${username}/toggle`, { method: 'POST' })
    if (result) setUsersData(prev => prev.map(u => u.username === username ? result : u))
  }

  const handleDelete = async (username) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    await fetchApi(`/users/${username}`, { method: 'DELETE' })
    setUsersData(prev => prev.filter(u => u.username !== username))
    if (selectedUser?.username === username) setSelectedUser(null)
  }

  const handleUpdateRole = async (username, newRole) => {
    const result = await fetchApi(`/users/${username}`, { method: 'PUT', body: JSON.stringify({ role: newRole }) })
    if (result) {
      setUsersData(prev => prev.map(u => u.username === username ? result : u))
      setSelectedUser(result)
    }
  }

  const handleResetPassword = async (username) => {
    const newPw = prompt(`Enter new password for ${username}:`)
    if (!newPw) return
    const result = await fetchApi(`/users/${username}`, { method: 'PUT', body: JSON.stringify({ password: newPw }) })
    if (result) alert('Password reset successfully')
  }

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading users...</div>

  const activeUsers = usersData.filter(u => !u.disabled).length
  const roleGroups = {}
  usersData.forEach(u => { roleGroups[u.role] = (roleGroups[u.role] || 0) + 1 })

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>User Management</h2>
          <p>Manage users, roles, permissions, and audit trail</p>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ Add User</button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value info">{usersData.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Users</div>
          <div className="stat-value success">{activeUsers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Disabled</div>
          <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{usersData.length - activeUsers}</div>
        </div>
        {Object.entries(roleGroups).map(([role, count]) => (
          <div className="stat-card" key={role}>
            <div className="stat-label">{roles?.[role]?.label || role}</div>
            <div className="stat-value" style={{ color: ROLE_COLORS[role] || 'var(--text-primary)' }}>{count}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <div className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>Users</div>
        <div className={`tab ${activeTab === 'roles' ? 'active' : ''}`} onClick={() => setActiveTab('roles')}>Roles &amp; Permissions</div>
        <div className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>Audit Log</div>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Create New User</div>
            {[
              ['Username', 'username', 'text', 'e.g. john.smith'],
              ['Full Name', 'full_name', 'text', 'John Smith'],
              ['Email', 'email', 'email', 'john.smith@ndis-integrity.gov.au'],
              ['Password', 'password', 'password', 'Min 8 characters'],
            ].map(([label, key, type, placeholder]) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" type={type} placeholder={placeholder}
                  value={newUser[key]} onChange={e => setNewUser(prev => ({ ...prev, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-input" value={newUser.role} onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}>
                {Object.entries(roles || {}).map(([key, info]) => (
                  <option key={key} value={key}>{info.label} — {info.description?.slice(0, 50)}</option>
                ))}
              </select>
            </div>
            {newUser.role && roles?.[newUser.role] && (
              <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: ROLE_COLORS[newUser.role], marginBottom: 4 }}>{roles[newUser.role].label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{roles[newUser.role].description}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{roles[newUser.role].permission_count} permissions</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={handleCreate} disabled={saving || !newUser.username || !newUser.password || !newUser.full_name}>
                {saving ? 'Creating...' : 'Create User'}
              </button>
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== USERS TAB ===== */}
      {activeTab === 'users' && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div className="card" style={{ flex: 1 }}>
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>User</th><th>Role</th><th>Email</th><th>Status</th><th>Last Login</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {usersData.map(u => (
                    <tr key={u.username} onClick={() => setSelectedUser(u)}
                      style={{ cursor: 'pointer', background: selectedUser?.username === u.username ? 'rgba(59,130,246,0.06)' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{u.full_name}</div>
                        <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{u.username}</div>
                      </td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: `${ROLE_COLORS[u.role] || '#666'}15`, color: ROLE_COLORS[u.role] || '#666' }}>
                          {u.role_label || u.role}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td>
                        <span className={`status-badge ${u.disabled ? 'overdue' : 'paid'}`}>
                          {u.disabled ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.last_login?.slice(0, 16) || 'Never'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                          <button className="btn sm" onClick={() => handleToggle(u.username)}>
                            {u.disabled ? 'Enable' : 'Disable'}
                          </button>
                          {u.username !== 'admin' && (
                            <button className="btn sm danger" onClick={() => handleDelete(u.username)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* User Detail Panel */}
          {selectedUser && (
            <div className="card slide-in" style={{ flex: '0 0 360px', maxHeight: 600, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: ROLE_COLORS[selectedUser.role], marginBottom: 4 }}>
                    {selectedUser.role_label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedUser.full_name}</div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 2 }}>@{selectedUser.username}</div>
                </div>
                <button className="btn sm" onClick={() => setSelectedUser(null)}>&times;</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Status</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: selectedUser.disabled ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                    {selectedUser.disabled ? 'Disabled' : 'Active'}
                  </div>
                </div>
                <div style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Permissions</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-blue)' }}>{selectedUser.permissions?.length || 0}</div>
                </div>
              </div>

              <div style={{ marginBottom: 12, fontSize: 12 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Email: <span style={{ color: 'var(--text-primary)' }}>{selectedUser.email}</span></div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Created: <span style={{ color: 'var(--text-primary)' }}>{selectedUser.created_at?.slice(0, 10)}</span></div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Last login: <span style={{ color: 'var(--text-primary)' }}>{selectedUser.last_login?.slice(0, 16) || 'Never'}</span></div>
              </div>

              {/* Change Role */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>CHANGE ROLE</div>
                <select className="form-input" value={selectedUser.role} style={{ fontSize: 12 }}
                  onChange={e => handleUpdateRole(selectedUser.username, e.target.value)}>
                  {Object.entries(roles || {}).map(([key, info]) => (
                    <option key={key} value={key}>{info.label}</option>
                  ))}
                </select>
              </div>

              {/* Permissions */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
                  PERMISSIONS ({selectedUser.permissions?.length || 0})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {(selectedUser.permissions || []).map(p => {
                    const [area, action] = p.split('.')
                    const actionColor = action === 'manage' ? 'var(--accent-red)' :
                      action === 'issue' || action === 'approve' ? 'var(--accent-orange)' :
                      action === 'conduct' || action === 'reject' ? 'var(--accent-purple)' :
                      action === 'analyse' ? 'var(--accent-cyan)' : 'var(--accent-blue)'
                    return (
                      <span key={p} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: `${actionColor}12`, color: actionColor, fontFamily: 'monospace' }}>
                        {p}
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={() => handleResetPassword(selectedUser.username)}>Reset Password</button>
                <button className="btn sm" onClick={() => handleToggle(selectedUser.username)}>
                  {selectedUser.disabled ? 'Enable' : 'Disable'}
                </button>
                {selectedUser.username !== 'admin' && (
                  <button className="btn sm danger" onClick={() => handleDelete(selectedUser.username)}>Delete</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== ROLES TAB ===== */}
      {activeTab === 'roles' && (
        <div className="engine-grid">
          {Object.entries(roles || {}).map(([key, info]) => (
            <div key={key} className="engine-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${ROLE_COLORS[key]}20`, color: ROLE_COLORS[key],
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                  {key[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{info.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{key}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>{info.description}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>PERMISSIONS ({info.permission_count})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {info.permissions?.map(p => {
                  const [, action] = p.split('.')
                  const ac = action === 'manage' ? '#ef4444' : action === 'issue' || action === 'approve' ? '#f97316' :
                    action === 'conduct' || action === 'reject' ? '#8b5cf6' : action === 'analyse' ? '#06b6d4' : '#3b82f6'
                  return <span key={p} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${ac}10`, color: ac, fontFamily: 'monospace' }}>{p}</span>
                })}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                {usersData.filter(u => u.role === key).length} user(s) assigned
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== AUDIT LOG TAB ===== */}
      {activeTab === 'audit' && (
        <div className="card">
          <div className="card-title">Activity Audit Log</div>
          {(!auditLog || auditLog.length === 0) ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No audit entries yet — actions will appear here</div>
          ) : (
            <div className="table-container" style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
                <tbody>
                  {auditLog.map((entry, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{entry.timestamp?.slice(0, 19)}</td>
                      <td style={{ fontWeight: 600, fontSize: 12 }}>{entry.username}</td>
                      <td><span className="alert-tag">{entry.action}</span></td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.target}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{entry.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

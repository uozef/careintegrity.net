import { useState, useEffect } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

export default function FineCodes() {
  const { data: codes, loading } = useApi('/fines/codes', [])
  const [editingCode, setEditingCode] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editMultipliers, setEditMultipliers] = useState({})
  const [showCreate, setShowCreate] = useState(false)
  const [newCode, setNewCode] = useState({ code: '', name: '', description: '', base_amount: 0, category: '', severity_multiplier: { critical: 3, high: 2, medium: 1, low: 0.5 } })
  const [codesData, setCodesData] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (codes) setCodesData(codes)
  }, [codes])

  const handleEdit = (fc) => {
    setEditingCode(fc.code)
    setEditAmount(fc.base_amount)
    setEditMultipliers({ ...fc.severity_multiplier })
  }

  const handleSave = async (code) => {
    setSaving(true)
    const result = await fetchApi(`/fines/codes/${code}`, {
      method: 'PUT',
      body: JSON.stringify({ base_amount: parseFloat(editAmount), severity_multiplier: editMultipliers }),
    })
    if (result) {
      setCodesData(prev => prev.map(c => c.code === code ? { ...c, base_amount: parseFloat(editAmount), severity_multiplier: editMultipliers } : c))
    }
    setEditingCode(null)
    setSaving(false)
  }

  const handleCreate = async () => {
    setSaving(true)
    const result = await fetchApi('/fines/codes', {
      method: 'POST',
      body: JSON.stringify({ ...newCode, base_amount: parseFloat(newCode.base_amount), active: true }),
    })
    if (result && !result.detail) {
      setCodesData(prev => [...prev, result])
      setShowCreate(false)
      setNewCode({ code: '', name: '', description: '', base_amount: 0, category: '', severity_multiplier: { critical: 3, high: 2, medium: 1, low: 0.5 } })
    }
    setSaving(false)
  }

  const handleDelete = async (code) => {
    if (!confirm(`Delete fine code ${code}?`)) return
    await fetchApi(`/fines/codes/${code}`, { method: 'DELETE' })
    setCodesData(prev => prev.filter(c => c.code !== code))
  }

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading fine codes...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Fine Codes</h2>
          <p>Define penalty amounts and severity multipliers for each fraud type</p>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ New Fine Code</button>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Create Fine Code</div>
            {[
              ['Code', 'code', 'text', 'FC-011'],
              ['Name', 'name', 'text', 'Violation Name'],
              ['Description', 'description', 'text', 'Description of the violation'],
              ['Category', 'category', 'text', 'e.g. Billing Fraud'],
              ['Base Amount ($)', 'base_amount', 'number', '25000'],
            ].map(([label, key, type, placeholder]) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" type={type} placeholder={placeholder}
                  value={newCode[key]} onChange={e => setNewCode(prev => ({ ...prev, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">Severity Multipliers</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['critical', 'high', 'medium', 'low'].map(sev => (
                  <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 60 }}>{sev}</span>
                    <input className="form-input" type="number" step="0.5" style={{ width: 80 }}
                      value={newCode.severity_multiplier[sev]}
                      onChange={e => setNewCode(prev => ({ ...prev, severity_multiplier: { ...prev.severity_multiplier, [sev]: parseFloat(e.target.value) } }))} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="btn primary" onClick={handleCreate} disabled={saving}>{saving ? 'Saving...' : 'Create'}</button>
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Base Amount</th>
                <th>Critical</th>
                <th>High</th>
                <th>Medium</th>
                <th>Low</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {codesData.map(fc => (
                <tr key={fc.code}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-blue)' }}>{fc.code}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)', maxWidth: 200 }}>{fc.name}</td>
                  <td><span className="alert-tag">{fc.category}</span></td>
                  <td>
                    {editingCode === fc.code ? (
                      <input className="form-input" type="number" style={{ width: 110, padding: '4px 8px', fontSize: 13 }}
                        value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                    ) : (
                      <span style={{ fontWeight: 700, color: 'var(--accent-green)' }}>${fc.base_amount?.toLocaleString()}</span>
                    )}
                  </td>
                  {['critical', 'high', 'medium', 'low'].map(sev => (
                    <td key={sev}>
                      {editingCode === fc.code ? (
                        <input className="form-input" type="number" step="0.5" style={{ width: 60, padding: '4px 8px', fontSize: 13 }}
                          value={editMultipliers[sev] || 1}
                          onChange={e => setEditMultipliers(prev => ({ ...prev, [sev]: parseFloat(e.target.value) }))} />
                      ) : (
                        <span style={{ fontSize: 12 }}>
                          {fc.severity_multiplier?.[sev]}x
                          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                            (${(fc.base_amount * (fc.severity_multiplier?.[sev] || 1)).toLocaleString()})
                          </span>
                        </span>
                      )}
                    </td>
                  ))}
                  <td>
                    {editingCode === fc.code ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn sm success" onClick={() => handleSave(fc.code)} disabled={saving}>Save</button>
                        <button className="btn sm" onClick={() => setEditingCode(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn sm" onClick={() => handleEdit(fc)}>Edit</button>
                        <button className="btn sm danger" onClick={() => handleDelete(fc.code)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

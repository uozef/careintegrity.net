import { useState, useEffect } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }

const SEVERITY_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6' }
const CATEGORY_COLORS = { Billing: '#3b82f6', Time: '#8b5cf6', Pattern: '#ec4899', Custom: '#06b6d4' }

export default function RuleEngine() {
  const { data: rules, loading } = useApi('/rules', [])
  const { data: stats } = useApi('/rules/stats', [])
  const { data: fields } = useApi('/rules/fields', [])
  const [rulesData, setRulesData] = useState([])
  const [statsData, setStatsData] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [expandedRule, setExpandedRule] = useState(null)
  const [ruleResults, setRuleResults] = useState(null)
  const [saving, setSaving] = useState(false)

  const emptyRule = {
    name: '', description: '', category: 'Custom', enabled: true,
    priority: 2, conditions: [{ field: 'hours', operator: '>', value: '' }],
    logic: 'ALL', action: 'flag', severity: 'medium',
  }
  const [newRule, setNewRule] = useState({ ...emptyRule })

  useEffect(() => { if (rules) setRulesData(rules) }, [rules])
  useEffect(() => { if (stats) setStatsData(stats) }, [stats])

  const handleToggle = async (ruleId) => {
    const result = await fetchApi(`/rules/${ruleId}/toggle`, { method: 'POST' })
    if (result) {
      setRulesData(prev => prev.map(r => r.id === ruleId ? { ...r, enabled: result.enabled } : r))
      refreshStats()
    }
  }

  const handleCreate = async () => {
    setSaving(true)
    const payload = { ...newRule, conditions: newRule.conditions.map(c => ({ ...c, value: parseValue(c.value) })) }
    const result = await fetchApi('/rules', { method: 'POST', body: JSON.stringify(payload) })
    if (result && !result.detail) {
      setRulesData(prev => [...prev, result])
      setShowCreate(false)
      setNewRule({ ...emptyRule })
      refreshStats()
    }
    setSaving(false)
  }

  const handleDelete = async (ruleId) => {
    if (!confirm(`Delete rule ${ruleId}?`)) return
    await fetchApi(`/rules/${ruleId}`, { method: 'DELETE' })
    setRulesData(prev => prev.filter(r => r.id !== ruleId))
    refreshStats()
  }

  const handleViewResults = async (ruleId) => {
    const data = await fetchApi(`/rules/results?rule_id=${ruleId}&limit=20`)
    setRuleResults({ ruleId, ...data })
    setExpandedRule(ruleId)
  }

  const refreshStats = async () => {
    const data = await fetchApi('/rules/stats')
    if (data) setStatsData(data)
  }

  function parseValue(v) {
    if (v === 'true' || v === true) return true
    if (v === 'false' || v === false) return false
    const n = Number(v)
    return isNaN(n) ? v : n
  }

  const addCondition = () => {
    setNewRule(prev => ({ ...prev, conditions: [...prev.conditions, { field: 'hours', operator: '>', value: '' }] }))
  }

  const removeCondition = (idx) => {
    setNewRule(prev => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== idx) }))
  }

  const updateCondition = (idx, key, val) => {
    setNewRule(prev => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => i === idx ? { ...c, [key]: val } : c)
    }))
  }

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading rule engine...</div>

  const chartData = statsData.filter(s => s.matches > 0).slice(0, 10).map(s => ({
    name: s.rule_name.length > 20 ? s.rule_name.slice(0, 20) + '...' : s.rule_name,
    matches: s.matches,
    severity: s.severity,
  }))

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Rule Engine</h2>
          <p>Define custom fraud detection rules with conditions, operators, and actions</p>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ Create Rule</button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Rules</div>
          <div className="stat-value info">{rulesData.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Rules</div>
          <div className="stat-value success">{rulesData.filter(r => r.enabled).length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Matches</div>
          <div className="stat-value warning">{statsData.reduce((s, r) => s + r.matches, 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Flagged Amount</div>
          <div className="stat-value critical">${(statsData.reduce((s, r) => s + r.total_amount, 0) / 1000).toFixed(0)}K</div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">Matches by Rule</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 140 }}>
              <XAxis type="number" stroke="var(--text-muted)" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={11} width={130} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }} />
              <Bar dataKey="matches" radius={[0, 6, 6, 0]} animationDuration={800}>
                {chartData.map((e, i) => <Cell key={i} fill={SEVERITY_COLORS[e.severity] || '#3b82f6'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 600 }}>
            <div className="modal-title">Create Detection Rule</div>

            <div className="form-group">
              <label className="form-label">Rule Name</label>
              <input className="form-input" value={newRule.name}
                onChange={e => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Excessive billing rate" />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" value={newRule.description}
                onChange={e => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What this rule detects" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-input" value={newRule.category}
                  onChange={e => setNewRule(prev => ({ ...prev, category: e.target.value }))}>
                  <option>Billing</option><option>Time</option><option>Pattern</option><option>Custom</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Severity</label>
                <select className="form-input" value={newRule.severity}
                  onChange={e => setNewRule(prev => ({ ...prev, severity: e.target.value }))}>
                  <option value="critical">Critical</option><option value="high">High</option>
                  <option value="medium">Medium</option><option value="low">Low</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Logic</label>
                <select className="form-input" value={newRule.logic}
                  onChange={e => setNewRule(prev => ({ ...prev, logic: e.target.value }))}>
                  <option value="ALL">ALL conditions (AND)</option>
                  <option value="ANY">ANY condition (OR)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Conditions</label>
                <button className="btn sm" onClick={addCondition}>+ Add Condition</button>
              </div>
              {newRule.conditions.map((cond, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <select className="form-input" style={{ flex: 2 }} value={cond.field}
                    onChange={e => updateCondition(idx, 'field', e.target.value)}>
                    {(fields || []).map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                  </select>
                  <select className="form-input" style={{ flex: 1 }} value={cond.operator}
                    onChange={e => updateCondition(idx, 'operator', e.target.value)}>
                    <option value=">">&gt;</option><option value=">=">&gt;=</option>
                    <option value="<">&lt;</option><option value="<=">&lt;=</option>
                    <option value="==">==</option><option value="!=">!=</option>
                    <option value="contains">contains</option>
                  </select>
                  <input className="form-input" style={{ flex: 1 }} value={cond.value}
                    onChange={e => updateCondition(idx, 'value', e.target.value)}
                    placeholder="Value" />
                  {newRule.conditions.length > 1 && (
                    <button className="btn sm danger" onClick={() => removeCondition(idx)}>&times;</button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={handleCreate} disabled={saving || !newRule.name}>
                {saving ? 'Creating...' : 'Create Rule'}
              </button>
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Rule Results Modal */}
      {ruleResults && (
        <div className="modal-overlay" onClick={() => { setRuleResults(null); setExpandedRule(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 650 }}>
            <div className="modal-title">Rule Results &mdash; {ruleResults.ruleId}</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{ruleResults.total} claims matched</p>
            <div className="table-container" style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Claim</th><th>Provider</th><th>Amount</th><th>Hours</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {(ruleResults.results || []).map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.claim_id}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.provider_id}</td>
                      <td style={{ fontWeight: 700, color: 'var(--accent-red)' }}>${r.amount?.toFixed(0)}</td>
                      <td>{r.hours}h</td>
                      <td style={{ fontSize: 12 }}>{r.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn" style={{ marginTop: 16 }} onClick={() => { setRuleResults(null); setExpandedRule(null) }}>Close</button>
          </div>
        </div>
      )}

      {/* Rules Table */}
      <div className="card">
        <div className="card-title">Detection Rules</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Rule</th>
                <th>Category</th>
                <th>Conditions</th>
                <th>Logic</th>
                <th>Severity</th>
                <th>Matches</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rulesData.map(rule => {
                const stat = statsData.find(s => s.rule_id === rule.id) || {}
                return (
                  <tr key={rule.id}>
                    <td>
                      <div
                        onClick={() => handleToggle(rule.id)}
                        style={{
                          width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                          background: rule.enabled ? 'var(--accent-green)' : 'var(--border)',
                          position: 'relative', transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: 2,
                          left: rule.enabled ? 18 : 2, transition: 'left 0.2s',
                        }} />
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>{rule.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{rule.id}</div>
                    </td>
                    <td>
                      <span className="alert-tag" style={{
                        background: `${CATEGORY_COLORS[rule.category] || '#666'}20`,
                        color: CATEGORY_COLORS[rule.category] || '#666',
                      }}>{rule.category}</span>
                    </td>
                    <td style={{ maxWidth: 250 }}>
                      {rule.conditions?.map((c, i) => (
                        <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', padding: '1px 0' }}>
                          <span style={{ color: 'var(--accent-blue)' }}>{c.field}</span>
                          {' '}<span style={{ color: 'var(--accent-orange)' }}>{c.operator}</span>
                          {' '}<span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{String(c.value)}</span>
                        </div>
                      ))}
                    </td>
                    <td style={{ fontSize: 11, fontWeight: 600 }}>
                      <span style={{ color: rule.logic === 'ALL' ? 'var(--accent-purple)' : 'var(--accent-cyan)' }}>{rule.logic}</span>
                    </td>
                    <td><span className={`risk-badge ${rule.severity}`}>{rule.severity}</span></td>
                    <td style={{ fontWeight: 700, color: (stat.matches || 0) > 0 ? 'var(--accent-orange)' : 'var(--text-muted)' }}>
                      {(stat.matches || 0).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--accent-red)', fontSize: 12 }}>
                      ${((stat.total_amount || 0) / 1000).toFixed(0)}K
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn sm" onClick={() => handleViewResults(rule.id)}>Results</button>
                        <button className="btn sm danger" onClick={() => handleDelete(rule.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

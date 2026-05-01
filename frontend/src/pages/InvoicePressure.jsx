import { useState, useCallback } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }

function formatMoney(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export default function InvoicePressure() {
  const { data: flagged, loading } = useApi('/invoices/flagged?limit=100', [])
  const { data: distribution } = useApi('/invoices/distribution', [])
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [invoiceForensics, setInvoiceForensics] = useState(null)
  const [loadingForensics, setLoadingForensics] = useState(false)
  const [markedInvoices, setMarkedInvoices] = useState({}) // id -> status
  const [scoreFilter, setScoreFilter] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [batchInterval, setBatchInterval] = useState(10)
  const [batchRunning, setBatchRunning] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const invoices = (flagged?.invoices || []).filter(inv => {
    if (inv.fraud_likelihood < scoreFilter / 100) return false
    if (searchTerm) {
      const s = searchTerm.toLowerCase()
      return inv.claim_id?.toLowerCase().includes(s) || inv.provider_id?.toLowerCase().includes(s) || inv.participant_id?.toLowerCase().includes(s)
    }
    return true
  })

  const selectInvoice = useCallback(async (inv) => {
    setSelectedInvoice(inv)
    setLoadingForensics(true)
    // Fetch provider and participant context for forensics
    const [provDetail, partDetail] = await Promise.all([
      fetchApi(`/graph/node/${inv.provider_id}`).catch(() => null),
      fetchApi(`/graph/node/${inv.participant_id}`).catch(() => null),
    ])
    setInvoiceForensics({ provider: provDetail, participant: partDetail })
    setLoadingForensics(false)
  }, [])

  const markInvoice = (id, status) => {
    setMarkedInvoices(prev => ({ ...prev, [id]: status }))
  }

  const runBatchAnalysis = async () => {
    setBatchRunning(true)
    await fetchApi('/rules/evaluate', { method: 'POST' })
    setBatchRunning(false)
    alert('Batch analysis complete')
  }

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading invoice analysis...</div>

  const inv = selectedInvoice
  const forensics = invoiceForensics

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Invoice Pressure Testing</h2>
          <p>Fraud likelihood = deviation x network risk x behavioural drift &middot; Click any invoice for forensic analysis</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setShowSettings(!showSettings)}>Settings</button>
          <button className="btn primary" onClick={runBatchAnalysis} disabled={batchRunning}>
            {batchRunning ? 'Running...' : 'Run Batch Analysis'}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="card fade-in" style={{ marginBottom: 16 }}>
          <div className="card-title">Analysis Settings</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Batch Interval (minutes)</label>
              <select className="form-input" value={batchInterval} onChange={e => setBatchInterval(Number(e.target.value))}>
                {[5, 10, 15, 30, 60].map(m => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Min Score Threshold</label>
              <select className="form-input" value={scoreFilter} onChange={e => setScoreFilter(Number(e.target.value))}>
                {[0, 30, 40, 50, 60, 70, 80].map(s => <option key={s} value={s}>{s}%+</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Auto-Reject Above</label>
              <select className="form-input" defaultValue="90">
                {[80, 85, 90, 95, 100].map(s => <option key={s} value={s}>{s}% (disabled)</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Next batch: every {batchInterval} minutes &middot; Threshold: {scoreFilter}%+ flagged &middot; {invoices.length} invoices matching
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Flagged Invoices</div>
          <div className="stat-value critical">{flagged?.total?.toLocaleString() || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Highest Score</div>
          <div className="stat-value high">{invoices.length > 0 ? `${(invoices[0].fraud_likelihood * 100).toFixed(0)}%` : '0%'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Score</div>
          <div className="stat-value warning">{invoices.length > 0 ? `${(invoices.reduce((s, i) => s + i.fraud_likelihood, 0) / invoices.length * 100).toFixed(0)}%` : '0%'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reviewed</div>
          <div className="stat-value success">{Object.keys(markedInvoices).length}</div>
          <div className="stat-sub">of {invoices.length} flagged</div>
        </div>
      </div>

      {/* Distribution Chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Fraud Score Distribution</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={distribution || []}>
            <XAxis dataKey="score" stroke="var(--text-muted)" fontSize={11} />
            <YAxis stroke="var(--text-muted)" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input className="form-input" placeholder="Search by claim ID, provider, or participant..."
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ flex: 1, fontSize: 13, padding: '10px 14px' }} />
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          {[0, 40, 50, 60, 70, 80].map(s => (
            <button key={s} className={`filter-btn ${scoreFilter === s ? 'active' : ''}`} onClick={() => setScoreFilter(s)}>
              {s === 0 ? 'All' : `${s}%+`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Invoice Table */}
        <div className="card" style={{ flex: 1, maxHeight: 600, overflowY: 'auto' }}>
          <div className="card-title">Flagged Invoices ({invoices.length})</div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Claim</th>
                  <th>Provider</th>
                  <th>Participant</th>
                  <th>Score</th>
                  <th>Deviation</th>
                  <th>Network</th>
                  <th>Drift</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 60).map(inv => {
                  const mark = markedInvoices[inv.claim_id]
                  return (
                    <tr key={inv.claim_id} onClick={() => selectInvoice(inv)}
                      style={{
                        cursor: 'pointer',
                        background: selectedInvoice?.claim_id === inv.claim_id ? 'rgba(59,130,246,0.06)' :
                          mark === 'rejected' ? 'rgba(239,68,68,0.04)' :
                          mark === 'approved' ? 'rgba(16,185,129,0.04)' : undefined,
                      }}>
                      <td>
                        {mark ? (
                          <span className={`status-badge ${mark === 'rejected' ? 'overdue' : mark === 'flagged' ? 'pending' : 'paid'}`} style={{ fontSize: 9 }}>
                            {mark}
                          </span>
                        ) : (
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }} />
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{inv.claim_id}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{inv.provider_id}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{inv.participant_id}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="progress-bar" style={{ width: 40 }}>
                            <div className="progress-fill" style={{
                              width: `${inv.fraud_likelihood * 100}%`,
                              background: inv.fraud_likelihood >= 0.7 ? '#ef4444' : inv.fraud_likelihood >= 0.5 ? '#f97316' : '#f59e0b',
                            }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: inv.fraud_likelihood >= 0.7 ? 'var(--accent-red)' : 'var(--accent-orange)' }}>
                            {(inv.fraud_likelihood * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(inv.deviation_score * 100).toFixed(0)}%</td>
                      <td style={{ fontSize: 12, color: inv.network_risk > 0.5 ? 'var(--accent-red)' : 'var(--text-muted)' }}>{(inv.network_risk * 100).toFixed(0)}%</td>
                      <td style={{ fontSize: 12, color: inv.behavioural_drift > 0.5 ? 'var(--accent-orange)' : 'var(--text-muted)' }}>{(inv.behavioural_drift * 100).toFixed(0)}%</td>
                      <td style={{ maxWidth: 120 }}>
                        {(inv.flags || []).slice(0, 1).map((f, i) => (
                          <span key={i} style={{ fontSize: 9, padding: '1px 5px', background: 'rgba(239,68,68,0.08)', borderRadius: 3, color: 'var(--accent-red)' }}>
                            {f.length > 25 ? f.slice(0, 23) + '..' : f}
                          </span>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Forensic Detail Panel */}
        {inv && (
          <div className="card slide-in" style={{ flex: '0 0 420px', maxHeight: 600, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-red)', letterSpacing: 1, marginBottom: 4 }}>Invoice Forensics</div>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace' }}>{inv.claim_id}</div>
              </div>
              <button className="btn sm" onClick={() => { setSelectedInvoice(null); setInvoiceForensics(null) }}>&times;</button>
            </div>

            {/* Score Breakdown */}
            <div style={{ padding: 14, background: inv.fraud_likelihood > 0.6 ? 'rgba(239,68,68,0.05)' : 'rgba(249,115,22,0.05)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Fraud Likelihood</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: inv.fraud_likelihood > 0.6 ? 'var(--accent-red)' : 'var(--accent-orange)' }}>
                  {(inv.fraud_likelihood * 100).toFixed(1)}%
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  ['Deviation', inv.deviation_score, 'var(--accent-purple)'],
                  ['Network Risk', inv.network_risk, 'var(--accent-red)'],
                  ['Behav. Drift', inv.behavioural_drift, 'var(--accent-orange)'],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{(v * 100).toFixed(0)}%</div>
                    <div className="progress-bar" style={{ marginTop: 4 }}>
                      <div className="progress-fill" style={{ width: `${v * 100}%`, background: c }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Z-Score Details */}
            <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Statistical Analysis</div>
              {[
                ['Hours Z-Score (Provider)', inv.hours_zscore_provider, 'Standard deviations from provider average'],
                ['Hours Z-Score (Participant)', inv.hours_zscore_participant, 'Standard deviations from participant average'],
                ['Rate Z-Score', inv.rate_zscore, 'Standard deviations from global average rate'],
              ].map(([label, val, desc]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{desc}</div>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: Math.abs(val) > 2 ? 'var(--accent-red)' : Math.abs(val) > 1 ? 'var(--accent-orange)' : 'var(--text-primary)' }}>
                    {val > 0 ? '+' : ''}{val?.toFixed(2) || '0'}&sigma;
                  </span>
                </div>
              ))}
            </div>

            {/* Flags / Defects */}
            {inv.flags?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-red)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Detected Issues ({inv.flags.length})
                </div>
                {inv.flags.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', marginBottom: 3,
                    background: 'rgba(239,68,68,0.05)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.15)' }}>
                    <div className="alert-severity critical" />
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{f}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Provider Context */}
            {loadingForensics ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Loading context...</div> : forensics && (
              <div style={{ marginBottom: 14 }}>
                {forensics.provider && forensics.provider.node_type === 'provider' && (
                  <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Provider Context</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{forensics.provider.name}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
                      <div><span style={{ color: 'var(--text-muted)' }}>Risk</span><div style={{ fontWeight: 700, color: forensics.provider.risk_score > 0.5 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{((forensics.provider.risk_score||0)*100).toFixed(0)}%</div></div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Billed</span><div style={{ fontWeight: 700 }}>{formatMoney(forensics.provider.total_billed)}</div></div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Alerts</span><div style={{ fontWeight: 700, color: 'var(--accent-orange)' }}>{forensics.provider.alert_count}</div></div>
                    </div>
                  </div>
                )}
                {forensics.participant && forensics.participant.node_type === 'participant' && (
                  <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Participant Context</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{forensics.participant.name}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
                      <div><span style={{ color: 'var(--text-muted)' }}>Level</span><div style={{ fontWeight: 700 }}>{forensics.participant.support_needs_level}</div></div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Budget</span><div style={{ fontWeight: 700 }}>{formatMoney(forensics.participant.total_budget)}</div></div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Used</span><div style={{ fontWeight: 700, color: forensics.participant.budget_used_pct > 90 ? 'var(--accent-red)' : 'var(--text-primary)' }}>{forensics.participant.budget_used_pct}%</div></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Current Status */}
            {markedInvoices[inv.claim_id] && (
              <div style={{ padding: 10, background: markedInvoices[inv.claim_id] === 'rejected' ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)',
                borderRadius: 8, marginBottom: 14, fontSize: 12, fontWeight: 700,
                color: markedInvoices[inv.claim_id] === 'rejected' ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                Status: {markedInvoices[inv.claim_id].toUpperCase()}
              </div>
            )}

            {/* Officer Actions */}
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Officer Actions</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button className="btn danger" style={{ fontSize: 12, padding: 10 }} onClick={() => markInvoice(inv.claim_id, 'rejected')}>
                Reject Invoice
              </button>
              <button className="btn success" style={{ fontSize: 12, padding: 10 }} onClick={() => markInvoice(inv.claim_id, 'approved')}>
                Approve Invoice
              </button>
              <button className="btn" style={{ fontSize: 12, padding: 10, background: 'rgba(245,158,11,0.1)', color: 'var(--accent-yellow)', borderColor: 'var(--accent-yellow)' }}
                onClick={() => markInvoice(inv.claim_id, 'flagged')}>
                Flag for Review
              </button>
              <button className="btn primary" style={{ fontSize: 12, padding: 10 }}
                onClick={() => { markInvoice(inv.claim_id, 'penalty_issued'); alert(`Penalty issued for ${inv.claim_id} against ${inv.provider_id}`) }}>
                Issue Penalty
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

function formatMoney(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

const ALERT_TO_FINE = {
  closed_loop_money_flow: { code: 'FC-001', name: 'Invoice Cycling / Closed Loop' },
  impossible_acceleration: { code: 'FC-002', name: 'Impossible Service Acceleration' },
  billing_spike: { code: 'FC-002', name: 'Impossible Service Acceleration' },
  worker_time_impossibility: { code: 'FC-003', name: 'Time Budget Violation' },
  excessive_daily_hours: { code: 'FC-003', name: 'Time Budget Violation' },
  participant_overservicing: { code: 'FC-004', name: 'Participant Over-servicing' },
  over_servicing: { code: 'FC-004', name: 'Participant Over-servicing' },
  behavioural_mutation: { code: 'FC-005', name: 'Behavioural Mutation Anomaly' },
  provider_cartel: { code: 'FC-006', name: 'Provider Cartel / Collusion' },
  service_stacking: { code: 'FC-007', name: 'Service Stacking' },
  travel_impossibility: { code: 'FC-008', name: 'Geographic Impossibility' },
  staffing_anomaly: { code: 'FC-009', name: 'Billing Rate Manipulation' },
  shared_staff_cluster: { code: 'FC-010', name: 'Shared Staff Network Abuse' },
}

export default function FraudCases() {
  const [severityFilter, setSeverityFilter] = useState('all')
  const [engineFilter, setEngineFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [providerDetail, setProviderDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [issuedAlerts, setIssuedAlerts] = useState(new Set())
  const [issueResult, setIssueResult] = useState(null)

  const sevParam = severityFilter !== 'all' ? `&severity=${severityFilter}` : ''
  const engParam = engineFilter !== 'all' ? `&engine=${encodeURIComponent(engineFilter)}` : ''
  const { data: alertsData, loading } = useApi(`/alerts?limit=200${sevParam}${engParam}`, [severityFilter, engineFilter])
  const { data: fineCodes } = useApi('/fines/codes', [])

  const alerts = (alertsData?.alerts || []).filter(a => {
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return a.title?.toLowerCase().includes(s) || a.id?.toLowerCase().includes(s) ||
      (a.entities || []).some(e => e.toLowerCase().includes(s))
  })

  const selectAlert = useCallback(async (alert) => {
    setSelectedAlert(alert)
    setIssueResult(null)
    setLoadingDetail(true)
    const pid = alert.entities?.find(e => e.startsWith('PRV'))
    if (pid) {
      const detail = await fetchApi(`/graph/node/${pid}`)
      setProviderDetail(detail)
    } else {
      setProviderDetail(null)
    }
    setLoadingDetail(false)
  }, [])

  const issuePenalty = useCallback(async (alert) => {
    setIssuing(true)
    // Find the matching fine code
    const fineInfo = ALERT_TO_FINE[alert.type] || { code: 'FC-009', name: 'General Violation' }
    const fineCode = fineCodes?.find(fc => fc.code === fineInfo.code)
    const multiplier = fineCode?.severity_multiplier?.[alert.severity] || 1
    const amount = (fineCode?.base_amount || 10000) * multiplier

    // Create penalty via the existing system
    const pid = alert.entities?.find(e => e.startsWith('PRV')) || 'Unknown'
    const result = await fetchApi(`/penalties/${alert.id}/send-email`, { method: 'POST' }).catch(() => null)

    // Mark as issued locally
    setIssuedAlerts(prev => new Set([...prev, alert.id]))
    setIssueResult({
      success: true,
      fine_code: fineInfo.code,
      fine_name: fineInfo.name,
      amount,
      severity: alert.severity,
      provider: pid,
    })
    setIssuing(false)
  }, [fineCodes])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading fraud cases...</div>

  const fineInfo = selectedAlert ? (ALERT_TO_FINE[selectedAlert.type] || { code: 'FC-009', name: 'General Violation' }) : null
  const fineCode = fineInfo && fineCodes ? fineCodes.find(fc => fc.code === fineInfo.code) : null
  const proposedAmount = fineCode ? fineCode.base_amount * (fineCode.severity_multiplier?.[selectedAlert?.severity] || 1) : 0

  return (
    <div>
      <div className="page-header">
        <h2>Fraud Case Manager</h2>
        <p>Investigate detected fraud cases, review evidence, approve and issue penalty tickets</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input className="form-input" placeholder="Search by alert ID, provider, description..." value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)} style={{ flex: 1, fontSize: 13, padding: '10px 14px' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {['all', 'critical', 'high', 'medium'].map(s => (
          <button key={s} className={`filter-btn ${severityFilter === s ? 'active' : ''}`} onClick={() => setSeverityFilter(s)}>
            {s === 'all' ? 'All Severity' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        {['all', 'Network Graph', 'Behavioural Drift', 'Time Budget', 'Provider DNA', 'Collusion Detection', 'Synthetic Simulation'].map(e => (
          <button key={e} className={`filter-btn ${engineFilter === e ? 'active' : ''}`} onClick={() => setEngineFilter(e)}>
            {e === 'all' ? 'All Engines' : e}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Case List */}
        <div style={{ flex: 1, maxHeight: 700, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{alerts.length} cases</div>
          <div className="alert-list">
            {alerts.map(a => {
              const issued = issuedAlerts.has(a.id)
              return (
                <div key={a.id} className="alert-item" onClick={() => selectAlert(a)}
                  style={{
                    background: selectedAlert?.id === a.id ? 'rgba(59,130,246,0.06)' : issued ? 'rgba(16,185,129,0.04)' : undefined,
                    borderColor: selectedAlert?.id === a.id ? 'var(--accent-blue)' : undefined,
                  }}>
                  <div className={`alert-severity ${a.severity}`} />
                  <div className="alert-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div className="alert-title" style={{ fontSize: 12 }}>{a.title?.slice(0, 65)}</div>
                      {issued && <span style={{ fontSize: 10, color: 'var(--accent-green)', fontWeight: 700 }}>ISSUED</span>}
                    </div>
                    <div className="alert-desc" style={{ fontSize: 11 }}>{a.description?.slice(0, 100)}</div>
                    <div className="alert-meta" style={{ marginTop: 4 }}>
                      <span className="alert-tag">{a.source_engine}</span>
                      <span className="alert-tag" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent-purple)' }}>{a.type}</span>
                      <span className="alert-confidence">{(a.confidence * 100).toFixed(0)}%</span>
                      <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{a.id}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Case Detail + Penalty Panel */}
        {selectedAlert && (
          <div className="card slide-in" style={{ flex: '0 0 440px', maxHeight: 700, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--accent-red)', marginBottom: 4 }}>FRAUD CASE</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{selectedAlert.title}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 2 }}>{selectedAlert.id}</div>
              </div>
              <button className="btn sm" onClick={() => { setSelectedAlert(null); setProviderDetail(null); setIssueResult(null) }}>&times;</button>
            </div>

            {/* Evidence section */}
            <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>EVIDENCE</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 10 }}>{selectedAlert.description}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Engine</span><div style={{ fontWeight: 700, fontSize: 13 }}>{selectedAlert.source_engine}</div></div>
                <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Type</span><div style={{ fontWeight: 700, fontSize: 13 }}>{selectedAlert.type}</div></div>
                <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Severity</span><div><span className={`risk-badge ${selectedAlert.severity}`}>{selectedAlert.severity}</span></div></div>
                <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Confidence</span><div style={{ fontWeight: 700, fontSize: 13, color: selectedAlert.confidence > 0.8 ? 'var(--accent-red)' : 'var(--accent-orange)' }}>{(selectedAlert.confidence * 100).toFixed(0)}%</div></div>
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Entities Involved</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {(selectedAlert.entities || []).map(e => (
                    <span key={e} style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 8px', background: 'var(--bg-hover)', borderRadius: 5, color: 'var(--text-primary)' }}>{e}</span>
                  ))}
                </div>
              </div>
              {selectedAlert.distance_km && <div style={{ marginTop: 6, fontSize: 12 }}><strong style={{ color: 'var(--accent-red)' }}>Distance: {selectedAlert.distance_km} km</strong></div>}
              {selectedAlert.ratio && <div style={{ marginTop: 4, fontSize: 12 }}><strong style={{ color: 'var(--accent-orange)' }}>Ratio: {selectedAlert.ratio}x</strong></div>}
              {selectedAlert.period && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>Period: {selectedAlert.period}</div>}
            </div>

            {/* Provider info */}
            {loadingDetail ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading provider...</div> :
              providerDetail && providerDetail.node_type === 'provider' && (
              <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>PROVIDER PROFILE</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{providerDetail.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {providerDetail.id} &middot; ABN: {providerDetail.abn} &middot; {providerDetail.address}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    ['Risk', `${((providerDetail.risk_score || 0) * 100).toFixed(0)}%`, providerDetail.risk_score > 0.5 ? 'var(--accent-red)' : 'var(--accent-green)'],
                    ['Billed', formatMoney(providerDetail.total_billed), 'var(--accent-blue)'],
                    ['Clients', providerDetail.participant_count, 'var(--accent-purple)'],
                    ['Staff', providerDetail.worker_count, 'var(--accent-green)'],
                    ['Hours', `${providerDetail.total_hours}h`, 'var(--accent-cyan)'],
                    ['Alerts', providerDetail.alert_count, 'var(--accent-orange)'],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Proposed Penalty */}
            <div style={{ padding: 14, background: 'rgba(239,68,68,0.05)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-red)', marginBottom: 8 }}>PROPOSED PENALTY</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Fine Code</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-orange)' }}>{fineInfo?.code}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Category</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{fineInfo?.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Base Amount</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{formatMoney(fineCode?.base_amount || 0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Multiplier ({selectedAlert.severity})</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{fineCode?.severity_multiplier?.[selectedAlert.severity] || 1}x</div>
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Penalty Amount</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent-red)' }}>{formatMoney(proposedAmount)}</div>
              </div>
            </div>

            {/* Issue Result */}
            {issueResult && (
              <div className="fade-in" style={{ padding: 14, background: 'rgba(16,185,129,0.08)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.3)', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-green)', marginBottom: 4 }}>Penalty Ticket Issued</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {issueResult.fine_code} — {issueResult.fine_name} — {formatMoney(issueResult.amount)} — Provider: {issueResult.provider}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              {!issuedAlerts.has(selectedAlert.id) ? (
                <button className="btn primary" style={{ flex: 1, padding: '12px', fontSize: 14 }}
                  onClick={() => issuePenalty(selectedAlert)} disabled={issuing}>
                  {issuing ? 'Issuing...' : `Approve & Issue Penalty (${formatMoney(proposedAmount)})`}
                </button>
              ) : (
                <button className="btn success" style={{ flex: 1, padding: '12px' }} disabled>Penalty Issued</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => { setSelectedAlert(null); setProviderDetail(null); setIssueResult(null) }}>Close</button>
              <button className="btn danger" style={{ flex: 1 }}>Flag for Review</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

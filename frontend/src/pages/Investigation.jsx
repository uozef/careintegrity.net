import { useRef, useEffect, useState, useCallback } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }

function formatMoney(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function layoutBubbles(items, width, height, sizeKey) {
  const maxVal = Math.max(...items.map(i => i[sizeKey] || 1))
  const bubbles = items.map((item) => {
    const r = 20 + (Math.sqrt((item[sizeKey] || 1) / maxVal)) * 50
    return { ...item, r, x: width / 2, y: height / 2 }
  })
  bubbles.forEach((b, i) => {
    const angle = i * 0.8, dist = 40 + i * 12
    b.x = width / 2 + Math.cos(angle) * dist
    b.y = height / 2 + Math.sin(angle) * dist
  })
  for (let iter = 0; iter < 120; iter++) {
    const alpha = 0.3 * (1 - iter / 120)
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i], b = bubbles[j]
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const minDist = a.r + b.r + 6
        if (dist < minDist) {
          const force = (minDist - dist) * 0.5 * alpha
          const fx = (dx / dist) * force, fy = (dy / dist) * force
          a.x -= fx; a.y -= fy; b.x += fx; b.y += fy
        }
      }
    }
    for (const b of bubbles) {
      b.x += (width / 2 - b.x) * 0.02 * alpha
      b.y += (height / 2 - b.y) * 0.02 * alpha
      b.x = Math.max(b.r + 5, Math.min(width - b.r - 5, b.x))
      b.y = Math.max(b.r + 5, Math.min(height - b.r - 5, b.y))
    }
  }
  return bubbles
}

function getRiskColor(rs) {
  if (rs < 0.15) return { main: '#10b981', light: '#6ee7b7', dark: '#065f46' }
  if (rs < 0.3) return { main: '#22c55e', light: '#86efac', dark: '#166534' }
  if (rs < 0.45) return { main: '#84cc16', light: '#bef264', dark: '#3f6212' }
  if (rs < 0.6) return { main: '#eab308', light: '#fde047', dark: '#854d0e' }
  if (rs < 0.75) return { main: '#f97316', light: '#fdba74', dark: '#9a3412' }
  if (rs < 0.9) return { main: '#ef4444', light: '#fca5a5', dark: '#991b1b' }
  return { main: '#dc2626', light: '#f87171', dark: '#7f1d1d' }
}

export default function Investigation() {
  const canvasRef = useRef(null)
  const bubblesRef = useRef([])

  const [viewMode, setViewMode] = useState('list') // 'list' or 'graph'
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [participants, setParticipants] = useState(null)
  const [selectedParticipant, setSelectedParticipant] = useState(null)
  const [serviceData, setServiceData] = useState(null)
  const [hoveredBubble, setHoveredBubble] = useState(null)
  const [loadingParts, setLoadingParts] = useState(false)
  const [loadingServices, setLoadingServices] = useState(false)
  const [expandedService, setExpandedService] = useState(null)
  const [providerSearch, setProviderSearch] = useState('')
  const [participantSearch, setParticipantSearch] = useState('')
  const [providerDetail, setProviderDetail] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysing, setAnalysing] = useState(false)

  const { data: providers, loading } = useApi('/investigation/providers', [])

  const selectProvider = useCallback(async (prov) => {
    setSelectedProvider(prov)
    setSelectedParticipant(null)
    setServiceData(null)
    setParticipantSearch('')
    setAnalysisResult(null)
    setLoadingParts(true)
    const [parts, detail] = await Promise.all([
      fetchApi(`/investigation/provider/${prov.id}/participants`),
      fetchApi(`/graph/node/${prov.id}`),
    ])
    setParticipants(parts)
    setProviderDetail(detail)
    setLoadingParts(false)
  }, [])

  const selectParticipant = useCallback(async (part) => {
    if (selectedParticipant?.id === part?.id) {
      setSelectedParticipant(null); setServiceData(null); return
    }
    setSelectedParticipant(part)
    setExpandedService(null)
    setLoadingServices(true)
    const svc = await fetchApi(`/investigation/participant/${part.id}/services?provider_id=${selectedProvider.id}`)
    setServiceData(svc)
    setLoadingServices(false)
  }, [selectedProvider, selectedParticipant])

  const runAnalysis = useCallback(async (providerId) => {
    setAnalysing(true)
    const result = await fetchApi(`/analyse/${providerId}`)
    setAnalysisResult(result)
    setAnalysing(false)
  }, [])

  // Bubble chart drawing
  useEffect(() => {
    if (viewMode !== 'graph' || !providers || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width; canvas.height = 480
    const bubbles = layoutBubbles(providers, canvas.width, canvas.height, 'total_billed')
    bubblesRef.current = bubbles

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const b of bubbles) {
        const isSelected = selectedProvider?.id === b.id
        const isHovered = hoveredBubble === b.id
        const { main, light, dark } = getRiskColor(b.risk_score || 0)
        if (isSelected || isHovered) {
          const g = ctx.createRadialGradient(b.x, b.y, b.r, b.x, b.y, b.r + 18)
          g.addColorStop(0, main + '40'); g.addColorStop(1, main + '00')
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 18, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
        }
        if (isSelected) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke() }
        const grad = ctx.createRadialGradient(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.1, b.x, b.y, b.r)
        grad.addColorStop(0, light); grad.addColorStop(0.7, main); grad.addColorStop(1, dark)
        ctx.globalAlpha = (selectedProvider && !isSelected) ? 0.25 : 0.9
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill()
        ctx.globalAlpha = (selectedProvider && !isSelected) ? 0.15 : 1
        if (b.r > 25) {
          ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.min(12, b.r * 0.28)}px sans-serif`; ctx.textAlign = 'center'
          ctx.fillText(b.name.length > 14 ? b.name.slice(0, 12) + '..' : b.name, b.x, b.y - 2)
          ctx.font = `${Math.min(10, b.r * 0.22)}px sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.8)'
          ctx.fillText(formatMoney(b.total_billed), b.x, b.y + 12)
          ctx.fillText(`${b.participant_count} pts`, b.x, b.y + 24)
        }
        ctx.textAlign = 'left'; ctx.globalAlpha = 1
      }
    }
    draw()
    function getBubbleAt(mx, my) { for (const b of [...bubbles].reverse()) { const dx = mx - b.x, dy = my - b.y; if (dx * dx + dy * dy <= b.r * b.r) return b } return null }
    function onMove(e) { const r = canvas.getBoundingClientRect(); const b = getBubbleAt(e.clientX - r.left, e.clientY - r.top); setHoveredBubble(b ? b.id : null); canvas.style.cursor = b ? 'pointer' : 'default' }
    function onClick(e) { const r = canvas.getBoundingClientRect(); const b = getBubbleAt(e.clientX - r.left, e.clientY - r.top); if (b) selectProvider(b); else { setSelectedProvider(null); setParticipants(null) } }
    canvas.addEventListener('mousemove', onMove); canvas.addEventListener('click', onClick)
    return () => { canvas.removeEventListener('mousemove', onMove); canvas.removeEventListener('click', onClick) }
  }, [providers, selectedProvider, hoveredBubble, viewMode])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading...</div>

  const filteredProviders = (providers || []).filter(p => {
    if (!providerSearch) return true
    const s = providerSearch.toLowerCase()
    return p.name.toLowerCase().includes(s) || p.id.toLowerCase().includes(s)
  })

  const filteredParticipants = (participants || []).filter(p => {
    if (!participantSearch) return true
    const s = participantSearch.toLowerCase()
    return p.name?.toLowerCase().includes(s) || p.id?.toLowerCase().includes(s) || p.ndis_number?.includes(s)
  })

  const d = providerDetail // shorthand

  return (
    <div>
      <div className="page-header">
        <h2>Fraud Investigation Explorer</h2>
        <p>Drill from providers to participants to individual service claims</p>
      </div>

      {/* TABS */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <div className={`tab ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>List View</div>
        <div className={`tab ${viewMode === 'graph' ? 'active' : ''}`} onClick={() => setViewMode('graph')}>Graph View</div>
      </div>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 13, color: 'var(--text-secondary)' }}>
        <span onClick={() => { setSelectedProvider(null); setParticipants(null); setSelectedParticipant(null); setServiceData(null); setAnalysisResult(null) }}
          style={{ cursor: 'pointer', color: 'var(--accent-blue)', fontWeight: 700 }}>All Providers</span>
        {selectedProvider && <>
          <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>
          <span onClick={() => { setSelectedParticipant(null); setServiceData(null) }}
            style={{ cursor: 'pointer', color: 'var(--accent-blue)', fontWeight: 700 }}>{selectedProvider.name}</span>
        </>}
        {selectedParticipant && <>
          <span style={{ color: 'var(--text-muted)' }}>&rsaquo;</span>
          <span style={{ fontWeight: 700, color: 'var(--accent-purple)' }}>{selectedParticipant.name}</span>
        </>}
      </div>

      {/* =================== GRAPH VIEW =================== */}
      {viewMode === 'graph' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ height: 480, background: 'var(--canvas-bg)', position: 'relative' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      )}

      {/* =================== LIST VIEW (no provider selected) =================== */}
      {viewMode === 'list' && !selectedProvider && (
        <div>
          <input className="form-input" placeholder="Search providers by name or ID..."
            value={providerSearch} onChange={e => setProviderSearch(e.target.value)}
            style={{ marginBottom: 14, fontSize: 14, padding: '12px 16px', maxWidth: 500 }} autoFocus />

          <div className="card">
            <div className="table-container" style={{ maxHeight: 600, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Services</th>
                    <th>Participants</th>
                    <th>Total Billed</th>
                    <th>Hours</th>
                    <th>Claims</th>
                    <th>Risk</th>
                    <th>Alerts</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProviders.map(p => {
                    const { main } = getRiskColor(p.risk_score || 0)
                    return (
                      <tr key={p.id} onClick={() => selectProvider(p)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>{p.name}</div>
                          <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.id}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {p.services?.slice(0, 3).map(s => <span key={s} className="alert-tag" style={{ fontSize: 9 }}>{s}</span>)}
                            {p.services?.length > 3 && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>+{p.services.length - 3}</span>}
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{p.participant_count}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{formatMoney(p.total_billed)}</td>
                        <td>{p.total_hours?.toLocaleString()}h</td>
                        <td>{p.claim_count?.toLocaleString()}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div className="progress-bar" style={{ width: 40 }}>
                              <div className="progress-fill" style={{ width: `${(p.risk_score || 0) * 100}%`, background: main }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: main }}>{((p.risk_score || 0) * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 700, color: p.alert_count > 0 ? 'var(--accent-orange)' : 'var(--text-muted)' }}>{p.alert_count}</td>
                        <td><span className={`risk-badge ${p.max_severity === 'none' ? 'low' : p.max_severity}`}>{p.max_severity}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================== PROVIDER DETAIL VIEW =================== */}
      {selectedProvider && (
        <div className="fade-in">
          {/* Provider Header Card */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{selectedProvider.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span style={{ fontFamily: 'monospace' }}>{selectedProvider.id}</span>
                  {d && <> &middot; ABN: {d.abn} &middot; {d.address}</>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn sm primary" onClick={() => runAnalysis(selectedProvider.id)} disabled={analysing}>
                  {analysing ? 'Analysing...' : 'Run Analysis'}
                </button>
                <button className="btn sm" onClick={() => { setSelectedProvider(null); setParticipants(null); setProviderDetail(null); setAnalysisResult(null) }}>Back</button>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              {[
                ['Risk Score', `${((selectedProvider.risk_score || 0) * 100).toFixed(0)}%`, getRiskColor(selectedProvider.risk_score).main],
                ['Total Billed', formatMoney(selectedProvider.total_billed), 'var(--accent-blue)'],
                ['Participants', selectedProvider.participant_count, 'var(--accent-purple)'],
                ['Claims', selectedProvider.claim_count?.toLocaleString(), 'var(--text-primary)'],
                ['Hours', `${selectedProvider.total_hours}h`, 'var(--accent-cyan)'],
                ['Alerts', selectedProvider.alert_count, 'var(--accent-orange)'],
                ...(d?.worker_count ? [['Staff', d.worker_count, 'var(--accent-green)']] : []),
                ...(d?.avg_rate ? [['Avg Rate', `$${d.avg_rate}/h`, d.avg_rate > 90 ? 'var(--accent-red)' : 'var(--text-primary)']] : []),
                ...(d?.penalties?.total ? [['Penalties', d.penalties.total, 'var(--accent-red)']] : []),
              ].map(([l, v, c]) => (
                <div key={l} style={{ padding: '8px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', minWidth: 90 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: c, marginTop: 1 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Services + Staff */}
            <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>SERVICES</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(selectedProvider.services || []).map(s => <span key={s} className="alert-tag">{s}</span>)}
                </div>
              </div>
              {d?.workers?.length > 0 && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>CARE SUPPORT TEAM ({d.workers.length})</div>
                  {d.workers.slice(0, 5).map(w => (
                    <div key={w.id} style={{ fontSize: 11, padding: '2px 0', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                      <span><span style={{ color: 'var(--accent-green)', marginRight: 4 }}>&bull;</span>{w.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{w.role}</span>
                    </div>
                  ))}
                  {d.workers.length > 5 && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>+{d.workers.length - 5} more</div>}
                </div>
              )}
            </div>

            {/* Billing Chart */}
            {d?.monthly_billing?.length > 1 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>MONTHLY BILLING</div>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={d.monthly_billing}>
                    <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={9} tickFormatter={v => v.slice(5)} />
                    <YAxis stroke="var(--text-muted)" fontSize={9} tickFormatter={v => formatMoney(v)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => formatMoney(v)} />
                    <Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="rgba(59,130,246,0.15)" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Analysis Results */}
          {analysisResult && (
            <div className="card fade-in" style={{ marginBottom: 16,}}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>Analysis Result</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: analysisResult.risk_score > 0.6 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                  {(analysisResult.risk_score * 100).toFixed(0)}% Risk
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {Object.entries(analysisResult.findings_by_severity || {}).filter(([,v]) => v > 0).map(([sev, count]) => (
                  <span key={sev} className={`risk-badge ${sev}`}>{count} {sev}</span>
                ))}
              </div>
              {(analysisResult.findings || []).map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className={`alert-severity ${f.severity}`} style={{ marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{f.title}</span>
                      <span className="alert-tag" style={{ fontSize: 9 }}>{f.category}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{f.detail}</div>
                  </div>
                </div>
              ))}
              {analysisResult.findings?.length === 0 && (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--accent-green)', fontWeight: 700 }}>No anomalies detected</div>
              )}
            </div>
          )}

          {/* Alerts */}
          {d?.alerts?.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">Red Flags &amp; Alerts ({d.alerts.length})</div>
              <div className="alert-list" style={{ maxHeight: 250, overflowY: 'auto' }}>
                {d.alerts.slice(0, 10).map((a, i) => (
                  <div key={i} className="alert-item" style={{ padding: '8px 12px' }}>
                    <div className={`alert-severity ${a.severity}`} />
                    <div className="alert-content">
                      <div className="alert-title" style={{ fontSize: 12 }}>{a.title}</div>
                      <div className="alert-desc" style={{ fontSize: 11 }}>{a.description?.slice(0, 120)}</div>
                      <div className="alert-meta" style={{ marginTop: 4 }}>
                        <span className="alert-tag">{a.source_engine}</span>
                        <span className="alert-confidence">{(a.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Penalties */}
          {d?.penalties?.total > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">Penalties ({d.penalties.total})</div>
              <div className="table-container" style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Penalty ID</th><th>Fine Code</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {(d.penalties.penalties || []).map(p => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.id}</td>
                        <td><span className="alert-tag">{p.fine_code}</span></td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-red)' }}>${p.amount?.toLocaleString()}</td>
                        <td><span className={`status-badge ${p.status}`}>{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Participants */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Participants ({participants?.length || 0})</div>
            </div>
            <input className="form-input" placeholder="Search participants by name, NDIS number, or ID..."
              value={participantSearch} onChange={e => setParticipantSearch(e.target.value)}
              style={{ width: '100%', fontSize: 13, padding: '10px 14px', marginBottom: 12 }} />

            {loadingParts ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div> : (
              <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                {filteredParticipants.map(p => {
                  const isSelected = selectedParticipant?.id === p.id
                  const overBudget = p.total_cost > p.total_budget * 0.9
                  return (
                    <div key={p.id}>
                      <div onClick={() => selectParticipant(p)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
                          background: isSelected ? 'rgba(139,92,246,0.06)' : 'transparent',
                          borderBottom: '1px solid var(--border)', 
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'rgba(139,92,246,0.06)' : 'transparent' }}
                      >
                        <div style={{ flex: '0 0 160px' }}>
                          <div style={{ fontWeight: 700, color: isSelected ? 'var(--accent-purple)' : 'var(--text-primary)', fontSize: 13 }}>{p.name}</div>
                          <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.id}</div>
                        </div>
                        <div style={{ flex: '0 0 85px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.ndis_number}</div>
                        <div style={{ flex: '0 0 80px', fontSize: 12 }}>{p.disability_type}</div>
                        <div style={{ flex: '0 0 65px' }}><span className={`risk-badge ${p.support_level === 'very_high' ? 'critical' : p.support_level === 'high' ? 'high' : 'medium'}`}>{p.support_level}</span></div>
                        <div style={{ flex: '0 0 140px', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {p.services?.slice(0, 2).map(s => <span key={s} className="alert-tag" style={{ fontSize: 9 }}>{s}</span>)}
                          {p.services?.length > 2 && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>+{p.services.length - 2}</span>}
                        </div>
                        <div style={{ flex: '0 0 55px', fontWeight: 700, fontSize: 13 }}>{p.total_hours}h</div>
                        <div style={{ flex: '0 0 75px', fontWeight: 700, color: overBudget ? 'var(--accent-red)' : 'var(--text-primary)', fontSize: 13 }}>{formatMoney(p.total_cost)}</div>
                        <div style={{ flex: 1, textAlign: 'right', color: 'var(--text-muted)', fontSize: 14 }}>{isSelected ? '\u25B2' : '\u25BC'}</div>
                      </div>

                      {/* Expanded participant detail */}
                      {isSelected && (
                        <div className="fade-in" style={{ padding: '16px 14px', background: 'var(--bg-secondary)', borderBottom: '2px solid var(--accent-purple)' }}>
                          {loadingServices ? (
                            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}><div className="loading-spinner" style={{ margin: '0 auto 8px', width: 20, height: 20 }} />Loading...</div>
                          ) : serviceData ? (
                            <div>
                              {/* Summary */}
                              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                                {[
                                  ['Cost', formatMoney(serviceData.total_cost), serviceData.total_cost > p.total_budget ? 'var(--accent-red)' : 'var(--accent-blue)'],
                                  ['Hours', `${serviceData.total_hours}h`, 'var(--accent-cyan)'],
                                  ['Claims', serviceData.total_claims, 'var(--text-primary)'],
                                  ['Services', serviceData.services?.length, 'var(--accent-purple)'],
                                  ['Budget', formatMoney(p.total_budget), 'var(--text-secondary)'],
                                  ['Used', `${p.total_budget > 0 ? (serviceData.total_cost / p.total_budget * 100).toFixed(0) : 0}%`,
                                    serviceData.total_cost > p.total_budget ? 'var(--accent-red)' : 'var(--accent-green)'],
                                ].map(([l, v, c]) => (
                                  <div key={l} style={{ padding: '6px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
                                  </div>
                                ))}
                              </div>

                              {/* Red Flags */}
                              {(() => {
                                const flags = []
                                if (serviceData.total_cost > p.total_budget) flags.push({ text: `Over budget by ${formatMoney(serviceData.total_cost - p.total_budget)}`, sev: 'critical' })
                                else if (serviceData.total_cost > p.total_budget * 0.9) flags.push({ text: `${(serviceData.total_cost/p.total_budget*100).toFixed(0)}% budget consumed`, sev: 'high' })
                                const weeklyAvg = serviceData.total_hours / Math.max(1, serviceData.monthly?.length || 1) / 4.3
                                if (weeklyAvg > p.allocated_weekly * 1.5) flags.push({ text: `Avg ${weeklyAvg.toFixed(0)}h/wk vs ${p.allocated_weekly}h allocated (${(weeklyAvg/p.allocated_weekly).toFixed(1)}x)`, sev: 'high' })
                                if (serviceData.services?.length > 5) flags.push({ text: `${serviceData.services.length} service types — possible stacking`, sev: 'medium' })
                                const highRate = (serviceData.services || []).filter(s => s.avg_rate > 90)
                                if (highRate.length > 0) flags.push({ text: `${highRate.length} service(s) above $90/h`, sev: 'medium' })
                                if (flags.length === 0) return <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.06)', borderRadius: 6, marginBottom: 12, fontSize: 12, color: 'var(--accent-green)', fontWeight: 700 }}>No red flags</div>
                                return (
                                  <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-red)', marginBottom: 6 }}>RED FLAGS ({flags.length})</div>
                                    {flags.map((f, i) => (
                                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 8px', marginBottom: 3, background: f.sev === 'critical' ? 'rgba(239,68,68,0.06)' : 'rgba(249,115,22,0.05)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                        <div className={`alert-severity ${f.sev}`} /><span style={{ fontSize: 12 }}>{f.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              })()}

                              {/* Services */}
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>SERVICES ({serviceData.services?.length})</div>
                              {serviceData.services?.map(svc => (
                                <div key={svc.service_type} style={{ marginBottom: 4, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                                  <div onClick={() => setExpandedService(expandedService === svc.service_type ? null : svc.service_type)}
                                    style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: 13, fontWeight: 700 }}>{svc.service_type}</span>
                                      <span className="alert-tag" style={{ fontSize: 9 }}>{svc.claim_count} claims</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12 }}>
                                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{svc.total_hours}h</span>
                                      <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{formatMoney(svc.total_cost)}</span>
                                      <span style={{ color: svc.avg_rate > 90 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>${svc.avg_rate}/h</span>
                                      <span style={{ color: 'var(--text-muted)' }}>{expandedService === svc.service_type ? '\u25B2' : '\u25BC'}</span>
                                    </div>
                                  </div>
                                  {expandedService === svc.service_type && (
                                    <div className="fade-in" style={{ padding: '6px 10px 10px', maxHeight: 220, overflowY: 'auto' }}>
                                      <table style={{ width: '100%' }}>
                                        <thead><tr><th style={{ fontSize: 9 }}>Date</th><th style={{ fontSize: 9 }}>Time</th><th style={{ fontSize: 9 }}>Hours</th><th style={{ fontSize: 9 }}>Rate</th><th style={{ fontSize: 9 }}>Amount</th><th style={{ fontSize: 9 }}>Worker</th></tr></thead>
                                        <tbody>
                                          {svc.claims?.map(c => (
                                            <tr key={c.id} style={{ background: (c.rate > 90 || c.hours > 6) ? 'rgba(239,68,68,0.03)' : undefined }}>
                                              <td style={{ fontSize: 11 }}>{c.date}</td>
                                              <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{c.start_time}—{c.end_time}</td>
                                              <td style={{ fontWeight: 700, fontSize: 11, color: c.hours > 6 ? 'var(--accent-red)' : 'var(--text-primary)' }}>{c.hours}h</td>
                                              <td style={{ fontSize: 11, color: c.rate > 90 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>${c.rate}/h</td>
                                              <td style={{ fontWeight: 700, fontSize: 11 }}>${c.amount}</td>
                                              <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{c.worker_id}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              ))}

                              {/* Monthly Trend */}
                              {serviceData.monthly?.length > 1 && (
                                <div style={{ marginTop: 12 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>MONTHLY TREND</div>
                                  <ResponsiveContainer width="100%" height={110}>
                                    <AreaChart data={serviceData.monthly}>
                                      <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={9} tickFormatter={v => v.slice(5)} />
                                      <YAxis stroke="var(--text-muted)" fontSize={9} tickFormatter={v => formatMoney(v)} />
                                      <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [n === 'cost' ? formatMoney(v) : v, n]} />
                                      <Area type="monotone" dataKey="cost" stroke="#8b5cf6" fill="rgba(139,92,246,0.15)" strokeWidth={1.5} name="cost" />
                                    </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

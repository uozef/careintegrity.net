import { useRef, useEffect, useState, useCallback } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

export default function ProviderDNA() {
  const canvasRef = useRef(null)
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startTx: 0, startTy: 0 })
  const pointsCacheRef = useRef({})

  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [providerDetail, setProviderDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showNavigator, setShowNavigator] = useState(true)

  const { data, loading } = useApi('/embeddings', [])
  const { data: alerts } = useApi('/alerts?limit=50&engine=Provider%20DNA', [])
  const { data: providersData } = useApi('/providers', [])

  const providerLookup = {}
  if (providersData) {
    for (const p of providersData) providerLookup[p.id] = p
  }

  const fetchDetail = useCallback(async (providerId) => {
    setLoadingDetail(true)
    try {
      const detail = await fetchApi(`/providers/${providerId}`)
      setProviderDetail(detail)
    } catch (err) { setProviderDetail(null) }
    setLoadingDetail(false)
  }, [])

  // Navigate to a provider from the list
  const navigateTo = useCallback((pid) => {
    setSelectedPoint(pid)
    fetchDetail(pid)
    // Center the view on this point
    const pos = pointsCacheRef.current[pid]
    if (pos && canvasRef.current) {
      const canvas = canvasRef.current
      const t = transformRef.current
      t.scale = 2.5
      t.x = canvas.width / 2 - pos.x * t.scale
      t.y = canvas.height / 2 - pos.y * t.scale
    }
  }, [fetchDetail])

  useEffect(() => {
    if (!data || !data.points || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 520

    const points = data.points
    const fraudSet = new Set(data.fraud_providers || [])
    if (points.length === 0) return

    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1
    const pad = 60

    function toCanvasX(x) { return pad + ((x - minX) / rangeX) * (canvas.width - pad * 2) }
    function toCanvasY(y) { return pad + ((y - minY) / rangeY) * (canvas.height - pad * 2) }

    const positions = {}
    for (const p of points) {
      positions[p.provider_id] = { x: toCanvasX(p.x), y: toCanvasY(p.y), isFraud: fraudSet.has(p.provider_id) }
    }
    pointsCacheRef.current = positions

    function draw() {
      const t = transformRef.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const bg = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#0a0c14'
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.save()
      ctx.translate(t.x, t.y)
      ctx.scale(t.scale, t.scale)

      // Grid
      const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() || '#1e2238'
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 0.5 / t.scale
      ctx.globalAlpha = 0.5
      for (let i = 0; i <= 10; i++) {
        const x = pad + (i / 10) * (canvas.width - pad * 2)
        ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, canvas.height - pad); ctx.stroke()
        const y = pad + (i / 10) * (canvas.height - pad * 2)
        ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(canvas.width - pad, y); ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Proximity lines between fraud providers
      const fraudPoints = points.filter(p => fraudSet.has(p.provider_id))
      ctx.globalAlpha = 0.15
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 1 / t.scale
      ctx.setLineDash([4 / t.scale, 4 / t.scale])
      for (let i = 0; i < fraudPoints.length; i++) {
        for (let j = i + 1; j < fraudPoints.length; j++) {
          const a = positions[fraudPoints[i].provider_id], b = positions[fraudPoints[j].provider_id]
          const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
          if (dist < 150) {
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          }
        }
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // Points
      for (const p of points) {
        const pos = positions[p.provider_id]
        const isSelected = selectedPoint === p.provider_id
        const isHovered = hoveredPoint === p.provider_id
        const isFraud = pos.isFraud
        const isDimmed = selectedPoint && !isSelected

        const prov = providerLookup[p.provider_id]
        const riskScore = prov?.risk_score || 0

        const baseR = isFraud ? 9 : 5 + riskScore * 6
        const r = isSelected ? baseR * 1.5 : isHovered ? baseR * 1.3 : baseR

        ctx.globalAlpha = isDimmed ? 0.15 : 1

        // Outer glow
        if ((isSelected || isHovered) && !isDimmed) {
          const grad = ctx.createRadialGradient(pos.x, pos.y, r, pos.x, pos.y, r + 16 / t.scale)
          grad.addColorStop(0, isFraud ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.2)')
          grad.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, r + 16 / t.scale, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
        }

        // Fraud aura
        if (isFraud && !isDimmed) {
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, r + 5 / t.scale, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(239,68,68,0.12)'
          ctx.fill()
        }

        // Selection ring
        if (isSelected) {
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, r + 3 / t.scale, 0, Math.PI * 2)
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2.5 / t.scale
          ctx.stroke()
        }

        // Main dot
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
        ctx.fillStyle = isFraud ? '#ef4444' : riskScore > 0.5 ? '#f97316' : '#3b82f6'
        ctx.fill()

        // Only show label for selected, hovered, or when zoomed in enough
        if ((isSelected || isHovered) && !isDimmed) {
          const name = prov?.name || p.provider_id
          ctx.font = `bold ${12 / t.scale}px sans-serif`
          const textWidth = ctx.measureText(name).width
          // Background pill
          ctx.fillStyle = 'rgba(0,0,0,0.7)'
          ctx.beginPath()
          ctx.fillRect(pos.x + r + 4 / t.scale, pos.y - 8 / t.scale, textWidth + 10 / t.scale, 18 / t.scale)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.fillText(name, pos.x + r + 9 / t.scale, pos.y + 4 / t.scale)
        } else if (t.scale > 2.2 && !isDimmed) {
          ctx.fillStyle = isFraud ? '#ef8888' : '#7da8e8'
          ctx.font = `${9 / t.scale}px sans-serif`
          ctx.fillText(p.provider_id, pos.x + r + 3 / t.scale, pos.y + 3 / t.scale)
        }
      }

      ctx.globalAlpha = 1

      // Axis labels
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#555a72'
      ctx.font = `${11 / t.scale}px sans-serif`
      ctx.fillText('Billing & Service Patterns \u2192', canvas.width / 2 - 60 / t.scale, canvas.height - 16 / t.scale)
      ctx.save()
      ctx.translate(18 / t.scale, canvas.height / 2 + 50 / t.scale)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText('Demographics & Geography \u2192', 0, 0)
      ctx.restore()

      ctx.restore()
    }

    draw()

    // --- Interactions ---
    function getPointAt(mx, my) {
      const t = transformRef.current
      const wx = (mx - t.x) / t.scale, wy = (my - t.y) / t.scale
      let closest = null, closestDist = Infinity
      for (const p of points) {
        const pos = positions[p.provider_id]
        const dx = wx - pos.x, dy = wy - pos.y
        const dist = dx * dx + dy * dy
        const hitR = Math.max(10, 15 / t.scale)
        if (dist < hitR * hitR && dist < closestDist) { closest = p; closestDist = dist }
      }
      return closest
    }

    function handleMouseMove(e) {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      if (dragRef.current.dragging) {
        transformRef.current.x = dragRef.current.startTx + (e.clientX - dragRef.current.startX)
        transformRef.current.y = dragRef.current.startTy + (e.clientY - dragRef.current.startY)
        draw(); return
      }
      const found = getPointAt(mx, my)
      setHoveredPoint(found ? found.provider_id : null)
      canvas.style.cursor = found ? 'pointer' : 'grab'
    }

    function handleClick(e) {
      const rect = canvas.getBoundingClientRect()
      const found = getPointAt(e.clientX - rect.left, e.clientY - rect.top)
      if (found) {
        setSelectedPoint(prev => prev === found.provider_id ? null : found.provider_id)
        if (found.provider_id !== selectedPoint) fetchDetail(found.provider_id)
        else setProviderDetail(null)
      } else { setSelectedPoint(null); setProviderDetail(null) }
    }

    function handleMouseDown(e) {
      const rect = canvas.getBoundingClientRect()
      if (!getPointAt(e.clientX - rect.left, e.clientY - rect.top)) {
        dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startTx: transformRef.current.x, startTy: transformRef.current.y }
        canvas.style.cursor = 'grabbing'
      }
    }
    function handleMouseUp() { dragRef.current.dragging = false }
    function handleWheel(e) {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const t = transformRef.current
      const zoom = e.deltaY < 0 ? 1.12 : 0.89
      const newScale = Math.max(0.3, Math.min(8, t.scale * zoom))
      t.x = mx - (mx - t.x) * (newScale / t.scale)
      t.y = my - (my - t.y) * (newScale / t.scale)
      t.scale = newScale
      draw()
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', handleMouseUp)
    canvas.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseUp)
      canvas.removeEventListener('wheel', handleWheel)
    }
  }, [data, selectedPoint, hoveredPoint, providersData])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading provider DNA...</div>

  const detail = providerDetail
  const fraudSet = new Set(data?.fraud_providers || [])

  // Build navigator list
  const navigatorList = (data?.points || []).map(p => {
    const prov = providerLookup[p.provider_id]
    return {
      id: p.provider_id,
      name: prov?.name || p.provider_id,
      risk: prov?.risk_score || 0,
      isFraud: fraudSet.has(p.provider_id),
      alerts: prov?.alert_count || 0,
    }
  }).filter(p => {
    if (!searchTerm) return true
    return p.id.toLowerCase().includes(searchTerm.toLowerCase()) || p.name.toLowerCase().includes(searchTerm.toLowerCase())
  }).sort((a, b) => b.risk - a.risk)

  return (
    <div>
      <div className="page-header">
        <h2>Provider DNA Embedding Space</h2>
        <p>Click any provider to inspect &middot; Use navigator to search &middot; Scroll to zoom &middot; Drag to pan</p>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} /> Normal
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f97316' }} /> Medium Risk
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.5)' }} /> Fraud Flagged
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn sm" onClick={() => setShowNavigator(v => !v)}>{showNavigator ? 'Hide' : 'Show'} Navigator</button>
          <button className="btn sm" onClick={() => { transformRef.current = { x: 0, y: 0, scale: 1 } }}>Reset View</button>
          {selectedPoint && <button className="btn sm" onClick={() => { setSelectedPoint(null); setProviderDetail(null) }}>Deselect</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Navigator Panel */}
        {showNavigator && (
          <div className="card" style={{ flex: '0 0 240px', maxHeight: 520, display: 'flex', flexDirection: 'column', padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8 }}>
              Node Navigator ({navigatorList.length})
            </div>
            <input
              className="form-input"
              placeholder="Search providers..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ marginBottom: 8, padding: '6px 10px', fontSize: 12 }}
            />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {navigatorList.map(p => (
                <div
                  key={p.id}
                  onClick={() => navigateTo(p.id)}
                  style={{
                    padding: '7px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                    background: selectedPoint === p.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                    border: `1px solid ${selectedPoint === p.id ? 'var(--accent-blue)' : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (selectedPoint !== p.id) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (selectedPoint !== p.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                      {p.name}
                    </div>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: p.isFraud ? '#ef4444' : p.risk > 0.5 ? '#f97316' : '#3b82f6',
                      boxShadow: p.isFraud ? '0 0 6px rgba(239,68,68,0.5)' : 'none',
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                    <span style={{ fontFamily: 'monospace' }}>{p.id}</span>
                    <span style={{ color: p.risk > 0.5 ? 'var(--accent-red)' : 'var(--text-muted)' }}>{(p.risk * 100).toFixed(0)}%</span>
                    {p.alerts > 0 && <span style={{ color: 'var(--accent-orange)' }}>{p.alerts} alerts</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, transition: 'flex 0.3s' }}>
          <div style={{ height: 520, background: 'var(--canvas-bg)', position: 'relative' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
            {hoveredPoint && hoveredPoint !== selectedPoint && (
              <div style={{ position: 'absolute', top: 12, left: 12, background: 'var(--glass)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: 12, minWidth: 220, boxShadow: 'var(--shadow)', pointerEvents: 'none' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: fraudSet.has(hoveredPoint) ? 'var(--accent-red)' : 'var(--accent-blue)', marginBottom: 2 }}>
                  {providerLookup[hoveredPoint]?.name || hoveredPoint}
                </div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginBottom: 6 }}>{hoveredPoint}</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Risk</div>
                    <div style={{ fontWeight: 700, color: (providerLookup[hoveredPoint]?.risk_score || 0) > 0.5 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      {((providerLookup[hoveredPoint]?.risk_score || 0) * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</div>
                    <div style={{ fontWeight: 700, color: fraudSet.has(hoveredPoint) ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      {fraudSet.has(hoveredPoint) ? 'FLAGGED' : 'Normal'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Click to inspect DNA profile</div>
              </div>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {detail && !detail.error && (
          <div className="card slide-in" style={{ flex: '0 0 360px', maxHeight: 520, overflowY: 'auto', alignSelf: 'flex-start', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: fraudSet.has(selectedPoint) ? 'var(--accent-red)' : 'var(--accent-blue)', marginBottom: 4 }}>
                  {fraudSet.has(selectedPoint) ? 'FRAUD FLAGGED' : 'PROVIDER DNA'}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{detail.provider?.name}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 2 }}>{selectedPoint}</div>
              </div>
              <button className="btn sm" onClick={() => { setSelectedPoint(null); setProviderDetail(null) }}>&times;</button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
            ) : (
              <div className="fade-in">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {[
                    ['Risk', `${((detail.risk_profile?.risk_score || 0) * 100).toFixed(0)}%`, detail.risk_profile?.risk_score > 0.5 ? 'var(--accent-red)' : 'var(--accent-green)'],
                    ['Alerts', detail.risk_profile?.alerts || 0, 'var(--accent-orange)'],
                    ['Severity', detail.risk_profile?.max_severity || 'none', 'var(--text-primary)'],
                    ['Penalties', detail.penalties?.total || 0, 'var(--accent-red)'],
                  ].map(([label, val, color]) => (
                    <div key={label} style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color, marginTop: 1 }}>{val}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Service DNA</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(detail.provider?.service_types || []).map(s => <span key={s} className="alert-tag">{s}</span>)}
                  </div>
                </div>

                {detail.drift_timeline?.length > 0 && (() => {
                  const latest = detail.drift_timeline[detail.drift_timeline.length - 1]
                  const first = detail.drift_timeline[0]
                  return (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Drift ({first.period} to {latest.period})</div>
                      {[
                        ['Participants', `${first.participants} to ${latest.participants}`, latest.participants > first.participants * 3 ? 'var(--accent-red)' : 'var(--text-primary)'],
                        ['Workers', `${first.workers} to ${latest.workers}`, 'var(--text-primary)'],
                        ['Staff Ratio', latest.staffing_ratio?.toFixed(1), latest.staffing_ratio > 20 ? 'var(--accent-red)' : 'var(--text-primary)'],
                        ['Session Avg', `${latest.avg_session_duration?.toFixed(1)}h`, 'var(--text-primary)'],
                      ].map(([k, v, color]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                          <span style={{ fontWeight: 700, color }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {detail.alerts?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Alerts ({detail.alerts.length})</div>
                    {detail.alerts.slice(0, 5).map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                        <div className={`alert-severity ${a.severity}`} style={{ marginTop: 4 }} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.title?.slice(0, 50)}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{a.source_engine} &middot; {(a.confidence * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">Behavioural Mutation Alerts</div>
        <div className="alert-list" style={{ maxHeight: 350, overflowY: 'auto' }}>
          {(alerts?.alerts || []).map((a, i) => (
            <div key={i} className="alert-item" onClick={() => {
              const pid = a.entities?.find(e => e.startsWith('PRV'))
              if (pid) navigateTo(pid)
            }}>
              <div className={`alert-severity ${a.severity}`} />
              <div className="alert-content">
                <div className="alert-title" style={{ fontSize: 12 }}>{a.title}</div>
                <div className="alert-desc" style={{ fontSize: 11 }}>{a.description}</div>
                <div className="alert-meta">
                  <span className="alert-tag">{a.type}</span>
                  <span className="alert-confidence">Confidence: {(a.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

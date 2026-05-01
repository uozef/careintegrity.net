import { useRef, useEffect, useState, useCallback } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const NODE_COLORS = { provider: '#3b82f6', participant: '#8b5cf6', worker: '#10b981', location: '#f59e0b' }
const NODE_LABELS = { provider: 'Provider', participant: 'Participant', worker: 'Support Worker', location: 'Location' }
const REL_COLORS = { bills: '#f97316', employs: '#10b981', serves: '#8b5cf6', registered_with: '#06b6d4', operates_at: '#f59e0b' }
const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }

function formatMoney(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export default function NetworkGraph() {
  const canvasRef = useRef(null)
  const positionsRef = useRef({})
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const adjRef = useRef({})
  const animFrameRef = useRef(null)
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startTx: 0, startTy: 0 })

  const [hoveredNode, setHoveredNode] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [nodeDetail, setNodeDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysing, setAnalysing] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)

  const { data, loading } = useApi('/graph', [])
  const { data: dashData } = useApi('/dashboard', [])
  const { data: alertsData } = useApi('/alerts?limit=50', [])
  const { data: providersData } = useApi('/providers', [])
  const [liveTime, setLiveTime] = useState(new Date())

  // Update clock every second for real-time feel
  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchNodeDetail = useCallback(async (nodeId) => {
    setLoadingDetail(true)
    try {
      const detail = await fetchApi(`/graph/node/${nodeId}`)
      setNodeDetail(detail)
    } catch (err) { setNodeDetail(null) }
    setLoadingDetail(false)
  }, [])

  const selectNode = useCallback((nodeId) => {
    setSelectedNode(nodeId)
    setShowAnalysis(false)
    setAnalysisResult(null)
    if (nodeId) fetchNodeDetail(nodeId)
    else setNodeDetail(null)
  }, [fetchNodeDetail])

  const runAnalysis = useCallback(async (nodeId) => {
    setAnalysing(true)
    setShowAnalysis(true)
    setAnalysisResult(null)
    // Simulate progressive analysis with a small delay for UX
    await new Promise(r => setTimeout(r, 800))
    try {
      const result = await fetchApi(`/analyse/${nodeId}`)
      setAnalysisResult(result)
    } catch (err) { setAnalysisResult(null) }
    setAnalysing(false)
  }, [])

  useEffect(() => {
    if (!data || !data.nodes || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    const nodes = data.nodes
    const edges = data.edges
    nodesRef.current = nodes
    edgesRef.current = edges
    const width = canvas.width, height = canvas.height

    // Build adjacency
    const adjacency = {}
    for (const e of edges) {
      if (!adjacency[e.source]) adjacency[e.source] = []
      if (!adjacency[e.target]) adjacency[e.target] = []
      adjacency[e.source].push(e)
      adjacency[e.target].push(e)
    }
    adjRef.current = adjacency

    // Initialize positions
    const positions = {}
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2
      const r = 180 + Math.random() * 80
      positions[n.id] = {
        x: width / 2 + Math.cos(angle) * r + (Math.random() - 0.5) * 80,
        y: height / 2 + Math.sin(angle) * r + (Math.random() - 0.5) * 80,
        vx: 0, vy: 0,
      }
    })

    let iteration = 0
    const maxIterations = 280

    function simulate() {
      if (iteration >= maxIterations) { draw(); return }
      iteration++
      const alpha = 1 - iteration / maxIterations

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = positions[nodes[i].id], b = positions[nodes[j].id]
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = -350 * alpha / (dist * dist)
          a.vx -= dx / dist * force; a.vy -= dy / dist * force
          b.vx += dx / dist * force; b.vy += dy / dist * force
        }
      }
      for (const edge of edges) {
        const a = positions[edge.source], b = positions[edge.target]
        if (!a || !b) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = dist * 0.004 * alpha
        a.vx += dx / dist * force; a.vy += dy / dist * force
        b.vx -= dx / dist * force; b.vy -= dy / dist * force
      }
      for (const n of nodes) {
        const p = positions[n.id]
        p.vx += (width / 2 - p.x) * 0.001 * alpha
        p.vy += (height / 2 - p.y) * 0.001 * alpha
        p.vx *= 0.82; p.vy *= 0.82
        p.x += p.vx; p.y += p.vy
        p.x = Math.max(30, Math.min(width - 30, p.x))
        p.y = Math.max(30, Math.min(height - 30, p.y))
      }
      draw()
      animFrameRef.current = requestAnimationFrame(simulate)
    }

    function draw() {
      const t = transformRef.current
      ctx.clearRect(0, 0, width, height)
      ctx.save()
      ctx.translate(t.x, t.y)
      ctx.scale(t.scale, t.scale)

      const sel = selectedNode
      const connectedIds = new Set()
      const connectedEdges = new Set()
      if (sel) {
        (adjacency[sel] || []).forEach(e => {
          connectedIds.add(e.source === sel ? e.target : e.source)
          connectedEdges.add(e)
        })
      }

      // Edges
      for (const edge of edges) {
        const a = positions[edge.source], b = positions[edge.target]
        if (!a || !b) continue
        const isHighlighted = sel && (edge.source === sel || edge.target === sel)
        const isDimmed = sel && !isHighlighted

        ctx.beginPath()
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)

        if (isHighlighted) {
          ctx.strokeStyle = REL_COLORS[edge.relationship] || '#666'
          ctx.lineWidth = 2.5 / t.scale
          ctx.globalAlpha = 0.85
          // Draw relationship label at midpoint
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          ctx.save()
          ctx.font = `${9 / t.scale}px sans-serif`
          ctx.fillStyle = REL_COLORS[edge.relationship] || '#666'
          ctx.globalAlpha = 0.7
          const label = edge.relationship + (edge.weight > 1 ? ` (${typeof edge.weight === 'number' && edge.weight > 100 ? formatMoney(edge.weight) : edge.weight.toFixed?.(0) || edge.weight})` : '')
          ctx.fillText(label, mx + 3 / t.scale, my - 3 / t.scale)
          ctx.restore()
        } else {
          ctx.strokeStyle = '#6b7280'
          ctx.lineWidth = 0.4 / t.scale
          ctx.globalAlpha = isDimmed ? 0.03 : 0.1
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Nodes
      for (const n of nodes) {
        if (filterType !== 'all' && n.type !== filterType) continue
        const p = positions[n.id]
        if (!p) continue

        const isSelected = n.id === sel
        const isConnected = connectedIds.has(n.id)
        const isHovered = n.id === hoveredNode
        const isDimmed = sel && !isSelected && !isConnected
        const color = NODE_COLORS[n.type] || '#666'

        const baseR = Math.min(3 + Math.sqrt(n.degree || 1) * 1.3, 13)
        const r = isSelected ? baseR * 1.5 : isHovered ? baseR * 1.25 : baseR

        ctx.globalAlpha = isDimmed ? 0.08 : 1

        // Glow
        if ((isSelected || isHovered) && !isDimmed) {
          const grad = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, r + 10 / t.scale)
          grad.addColorStop(0, color + '40')
          grad.addColorStop(1, color + '00')
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 10 / t.scale, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
        }

        // Selection ring
        if (isSelected) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 3 / t.scale, 0, Math.PI * 2)
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / t.scale; ctx.stroke()
        }

        // Node
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()

        // Label
        if ((isSelected || isHovered || isConnected) && !isDimmed) {
          const label = n.name || n.id
          ctx.font = `bold ${Math.max(9, 10 / t.scale)}px sans-serif`
          const tw = ctx.measureText(label).width
          ctx.fillStyle = 'rgba(0,0,0,0.7)'
          ctx.beginPath()
          ctx.fillRect(p.x + r + 3 / t.scale, p.y - 7 / t.scale, tw + 6 / t.scale, 14 / t.scale)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.fillText(label, p.x + r + 6 / t.scale, p.y + 3 / t.scale)
        }
      }

      ctx.globalAlpha = 1
      ctx.restore()
      positionsRef.current = positions
    }

    simulate()

    // Interactions
    function getNodeAt(mx, my) {
      const t = transformRef.current
      const wx = (mx - t.x) / t.scale, wy = (my - t.y) / t.scale
      let closest = null, closestDist = Infinity
      for (const n of nodes) {
        if (filterType !== 'all' && n.type !== filterType) continue
        const p = positions[n.id]
        if (!p) continue
        const dx = wx - p.x, dy = wy - p.y
        const dist = dx * dx + dy * dy
        const hitR = Math.max(10, 14 / t.scale)
        if (dist < hitR * hitR && dist < closestDist) { closest = n; closestDist = dist }
      }
      return closest
    }

    function handleMouseMove(e) {
      const rect = canvas.getBoundingClientRect()
      if (dragRef.current.dragging) {
        transformRef.current.x = dragRef.current.startTx + (e.clientX - dragRef.current.startX)
        transformRef.current.y = dragRef.current.startTy + (e.clientY - dragRef.current.startY)
        draw(); return
      }
      const found = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
      setHoveredNode(found ? found.id : null)
      canvas.style.cursor = found ? 'pointer' : 'grab'
    }
    function handleClick(e) {
      const rect = canvas.getBoundingClientRect()
      const found = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
      if (found) selectNode(found.id === selectedNode ? null : found.id)
      else selectNode(null)
    }
    function handleMouseDown(e) {
      const rect = canvas.getBoundingClientRect()
      if (!getNodeAt(e.clientX - rect.left, e.clientY - rect.top)) {
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
      const newScale = Math.max(0.2, Math.min(8, t.scale * zoom))
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
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [data, filterType, selectedNode, hoveredNode])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading network graph...</div>

  const hoveredNodeData = data?.nodes?.find(n => n.id === hoveredNode)
  const d = nodeDetail

  // Connected nodes for the detail panel
  const connectedNodes = selectedNode ? (adjRef.current[selectedNode] || []).map(e => {
    const otherId = e.source === selectedNode ? e.target : e.source
    const otherNode = data?.nodes?.find(n => n.id === otherId)
    return { ...e, otherId, otherName: otherNode?.name || otherId, otherType: otherNode?.type }
  }) : []

  // Searchable node list
  const filteredNodes = (data?.nodes || []).filter(n => {
    if (filterType !== 'all' && n.type !== filterType) return false
    if (!searchTerm) return true
    return n.id.toLowerCase().includes(searchTerm.toLowerCase()) || (n.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  }).sort((a, b) => b.degree - a.degree).slice(0, 30)

  return (
    <div>
      <div className="page-header">
        <h2>Network Integrity Graph</h2>
        <p>Click nodes to inspect &middot; {data?.nodes?.length || 0} nodes, {data?.edges?.length || 0} edges &middot; Scroll to zoom, drag to pan</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div key={type} onClick={() => setFilterType(f => f === type ? 'all' : type)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', opacity: filterType !== 'all' && filterType !== type ? 0.3 : 1, transition: 'opacity 0.2s' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
              {NODE_LABELS[type]}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {Object.entries(REL_COLORS).map(([rel, color]) => (
            <div key={rel} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
              <div style={{ width: 12, height: 2, background: color, borderRadius: 1 }} />
              {rel}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Node Navigator */}
        <div className="card" style={{ flex: '0 0 220px', maxHeight: 600, display: 'flex', flexDirection: 'column', padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>Navigator</div>
          <input className="form-input" placeholder="Search nodes..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ marginBottom: 6, padding: '5px 8px', fontSize: 11 }} />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredNodes.map(n => (
              <div key={n.id} onClick={() => selectNode(n.id)}
                style={{
                  padding: '5px 6px', borderRadius: 5, cursor: 'pointer', marginBottom: 1,
                  background: selectedNode === n.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                  border: `1px solid ${selectedNode === n.id ? 'var(--accent-blue)' : 'transparent'}`,
                  fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={e => { if (selectedNode !== n.id) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (selectedNode !== n.id) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: NODE_COLORS[n.type], flexShrink: 0 }} />
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{n.name || n.id}</span>
                </div>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>{n.degree}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="graph-container" style={{ flex: 1, height: 600 }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          {hoveredNodeData && hoveredNodeData.id !== selectedNode && (
            <div style={{ position: 'absolute', top: 12, left: 12, background: 'var(--glass)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: 12, minWidth: 220, boxShadow: 'var(--shadow)', pointerEvents: 'none' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: NODE_COLORS[hoveredNodeData.type], marginBottom: 4 }}>{hoveredNodeData.name}</div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 11 }}>
                <div>Type: <strong style={{ color: 'var(--text-primary)' }}>{NODE_LABELS[hoveredNodeData.type]}</strong></div>
                <div>ID: <span style={{ fontFamily: 'monospace' }}>{hoveredNodeData.id}</span></div>
                <div>Connections: <strong style={{ color: 'var(--accent-orange)' }}>{hoveredNodeData.degree}</strong></div>
                {hoveredNodeData.bills_total > 0 && <div>Billing: <strong>{formatMoney(hoveredNodeData.bills_total)}</strong></div>}
                {hoveredNodeData.role && <div>Role: <strong>{hoveredNodeData.role}</strong></div>}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Click to inspect</div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {d && !d.error && (
          <div className="card slide-in" style={{ flex: '0 0 380px', maxHeight: 600, overflowY: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: NODE_COLORS[d.node_type], marginBottom: 4 }}>{NODE_LABELS[d.node_type]}</div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{d.name}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 2 }}>{d.id}</div>
                {d.address && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{d.address}</div>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn sm primary" onClick={() => runAnalysis(d.id)} disabled={analysing} style={{ fontWeight: 700 }}>
                  {analysing ? 'Analysing...' : showAnalysis ? 'Re-Analyse' : 'Analyse'}
                </button>
                <button className="btn sm" onClick={() => selectNode(null)}>&times;</button>
              </div>
            </div>

            {/* ===== ANALYSIS RESULTS ===== */}
            {showAnalysis && (
              <div style={{ marginBottom: 16 }}>
                {analysing ? (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 12px', width: 24, height: 24 }} />
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Running anomaly detection across all engines...</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Checking billing patterns, time constraints, network links, behavioural drift...</div>
                  </div>
                ) : analysisResult && (
                  <div className="fade-in">
                    {/* Overall risk header */}
                    <div style={{ padding: 14, borderRadius: 10, marginBottom: 10, border: '1px solid var(--border)',
                      background: analysisResult.risk_score > 0.6 ? 'rgba(239,68,68,0.06)' : analysisResult.risk_score > 0.3 ? 'rgba(249,115,22,0.06)' : 'rgba(16,185,129,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Analysis Result</div>
                        <div style={{ fontSize: 22, fontWeight: 800,
                          color: analysisResult.risk_score > 0.6 ? 'var(--accent-red)' : analysisResult.risk_score > 0.3 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>
                          {(analysisResult.risk_score * 100).toFixed(0)}% Risk
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span>{analysisResult.total_claims?.toLocaleString()} claims</span>
                        <span>{formatMoney(analysisResult.total_amount)}</span>
                        <span>{analysisResult.total_hours}h</span>
                        <span>{analysisResult.findings?.length || 0} findings</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        {Object.entries(analysisResult.findings_by_severity || {}).filter(([,v]) => v > 0).map(([sev, count]) => (
                          <span key={sev} className={`risk-badge ${sev}`} style={{ fontSize: 10 }}>{count} {sev}</span>
                        ))}
                      </div>
                    </div>

                    {/* Findings list */}
                    {(analysisResult.findings || []).map((f, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div className={`alert-severity ${f.severity}`} style={{ marginTop: 5 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>{f.title}</div>
                            <span className="alert-tag" style={{ fontSize: 9, flexShrink: 0 }}>{f.category}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{f.detail}</div>
                          <div className="progress-bar" style={{ width: 80, marginTop: 5, height: 4 }}>
                            <div className="progress-fill" style={{
                              width: `${f.score * 100}%`,
                              background: f.severity === 'critical' ? '#ef4444' : f.severity === 'high' ? '#f97316' : '#f59e0b',
                            }} />
                          </div>
                        </div>
                      </div>
                    ))}

                    {analysisResult.findings?.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', color: 'var(--accent-green)', fontSize: 13, fontWeight: 700 }}>
                        No anomalies detected — entity appears normal
                      </div>
                    )}

                    {analysisResult.related_alert_count > 0 && (
                      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                        {analysisResult.related_alert_count} related alerts from detection engines
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {loadingDetail ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div> : (
              <div className="fade-in">

                {/* ===== PROVIDER ===== */}
                {d.node_type === 'provider' && <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    {[
                      ['Risk Score', `${((d.risk_score || 0) * 100).toFixed(0)}%`, d.risk_score > 0.5 ? 'var(--accent-red)' : 'var(--accent-green)'],
                      ['Alerts', d.alert_count || 0, 'var(--accent-orange)'],
                      ['Total Billed', formatMoney(d.total_billed), 'var(--accent-blue)'],
                      ['Total Hours', `${d.total_hours}h`, 'var(--accent-cyan)'],
                      ['Participants', d.participant_count, 'var(--accent-purple)'],
                      ['Workers', d.worker_count, 'var(--accent-green)'],
                      ['Avg Rate', `$${d.avg_rate}/h`, d.avg_rate > 90 ? 'var(--accent-red)' : 'var(--text-primary)'],
                      ['Claims', d.total_claims?.toLocaleString(), 'var(--text-primary)'],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c, marginTop: 1 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, marginBottom: 10 }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>ABN:</span> {d.abn} &middot; <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Since:</span> {d.registration_date} &middot; <span className={`risk-badge ${d.max_severity}`}>{d.max_severity}</span>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>SERVICES</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(d.service_types || []).map(s => <span key={s} className="alert-tag">{s}</span>)}
                    </div>
                  </div>
                  {d.monthly_billing?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
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
                  {d.workers?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>STAFF ({d.workers.length})</div>
                      {d.workers.slice(0, 6).map(w => (
                        <div key={w.id} onClick={() => selectNode(w.id)} style={{ fontSize: 11, padding: '3px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                          <span><span style={{ color: 'var(--accent-green)', marginRight: 4 }}>&bull;</span>{w.name}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{w.role}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {d.penalties?.total > 0 && (
                    <div style={{ padding: 8, background: 'rgba(239,68,68,0.08)', borderRadius: 8, marginBottom: 10, fontSize: 12 }}>
                      <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>{d.penalties.total} penalties issued</span>
                    </div>
                  )}
                </>}

                {/* ===== WORKER ===== */}
                {d.node_type === 'worker' && <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    {[
                      ['Role', d.role, 'var(--accent-green)'],
                      ['Total Hours', `${d.total_hours}h`, 'var(--accent-blue)'],
                      ['Total Earned', formatMoney(d.total_earned), 'var(--accent-cyan)'],
                      ['Claims', d.total_claims?.toLocaleString(), 'var(--text-primary)'],
                      ['Participants', d.participants_served, 'var(--accent-purple)'],
                      ['Max Daily Hours', `${d.max_daily_hours}h`, d.max_daily_hours > 16 ? 'var(--accent-red)' : 'var(--text-primary)'],
                      ['Days >16h', d.days_over_16h, d.days_over_16h > 0 ? 'var(--accent-red)' : 'var(--accent-green)'],
                      ['Geo Spread', `${d.geographic_spread_km}km`, d.geographic_spread_km > 50 ? 'var(--accent-orange)' : 'var(--text-primary)'],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: c, marginTop: 1 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>REGISTERED PROVIDERS ({d.registered_providers?.length})</div>
                    {d.registered_providers?.map(pid => (
                      <div key={pid} onClick={() => selectNode(pid)} style={{ fontSize: 12, fontFamily: 'monospace', padding: '3px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--accent-blue)' }}>{pid}</div>
                    ))}
                    {d.multi_provider_flag && (
                      <div style={{ fontSize: 11, color: 'var(--accent-red)', fontWeight: 700, marginTop: 6, padding: '6px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
                        Multi-provider worker — possible collusion indicator
                      </div>
                    )}
                  </div>
                  {d.days_over_16h > 0 && (
                    <div style={{ padding: 8, background: 'rgba(239,68,68,0.08)', borderRadius: 8, marginBottom: 10, fontSize: 12 }}>
                      <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>Time impossibility: {d.days_over_16h} days exceed 16 hours</span>
                    </div>
                  )}
                </>}

                {/* ===== PARTICIPANT ===== */}
                {d.node_type === 'participant' && <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    {[
                      ['Disability', d.disability_type, 'var(--accent-purple)'],
                      ['Needs Level', d.support_needs_level, 'var(--text-primary)'],
                      ['Total Budget', formatMoney(d.total_budget), 'var(--accent-blue)'],
                      ['Budget Used', `${d.budget_used_pct}%`, d.budget_used_pct > 100 ? 'var(--accent-red)' : 'var(--accent-green)'],
                      ['Total Hours', `${d.total_hours}h`, 'var(--accent-cyan)'],
                      ['Total Cost', formatMoney(d.total_cost), d.budget_used_pct > 100 ? 'var(--accent-red)' : 'var(--text-primary)'],
                      ['Providers', d.providers_count, 'var(--accent-blue)'],
                      ['Workers', d.workers_count, 'var(--accent-green)'],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: c, marginTop: 1 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
                    NDIS: {d.ndis_number} &middot; Plan: {d.plan_start} to {d.plan_end}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>HOURS: ACTUAL vs ALLOCATED</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="progress-bar" style={{ flex: 1, height: 8 }}>
                        <div className="progress-fill" style={{ width: `${Math.min(100, (d.max_weekly_hours / (d.allocated_weekly || 1)) * 100)}%`, background: d.max_weekly_hours > d.allocated_weekly * 2 ? '#ef4444' : '#10b981' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: d.max_weekly_hours > d.allocated_weekly * 2 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                        {d.max_weekly_hours}h / {d.allocated_weekly}h
                      </span>
                    </div>
                    {d.max_weekly_hours > d.allocated_weekly * 2 && (
                      <div style={{ fontSize: 11, color: 'var(--accent-red)', fontWeight: 700, marginTop: 4 }}>
                        Peak week {(d.max_weekly_hours / d.allocated_weekly).toFixed(1)}x over allocation
                      </div>
                    )}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>SERVICES RECEIVED</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(d.services || []).map(s => <span key={s} className="alert-tag">{s}</span>)}
                    </div>
                  </div>
                  {d.providers?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>PROVIDERS ({d.providers.length})</div>
                      {d.providers.map(pid => (
                        <div key={pid} onClick={() => selectNode(pid)} style={{ fontSize: 12, fontFamily: 'monospace', padding: '3px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--accent-blue)' }}>{pid}</div>
                      ))}
                    </div>
                  )}
                </>}

                {/* ===== LOCATION ===== */}
                {d.node_type === 'location' && <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    <div style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Type</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-yellow)', marginTop: 1 }}>{d.location_type}</div>
                    </div>
                    <div style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Providers</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: d.multi_provider_flag ? 'var(--accent-red)' : 'var(--accent-green)', marginTop: 1 }}>{d.associated_providers?.length}</div>
                    </div>
                  </div>
                  {d.multi_provider_flag && (
                    <div style={{ padding: 8, background: 'rgba(239,68,68,0.08)', borderRadius: 8, marginBottom: 10, fontSize: 12 }}>
                      <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>Shared address — multiple providers at this location</span>
                    </div>
                  )}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>ASSOCIATED PROVIDERS</div>
                    {(d.associated_providers || []).map(p => (
                      <div key={p.id} onClick={() => selectNode(p.id)} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--accent-blue)' }}>{p.name}</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 11 }}>{p.id}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Coordinates: {d.lat?.toFixed(4)}, {d.lng?.toFixed(4)}
                  </div>
                </>}

                {/* ALERTS — all node types */}
                {d.alerts?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>ALERTS ({d.alerts.length})</div>
                    {d.alerts.slice(0, 6).map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                        <div className={`alert-severity ${a.severity}`} style={{ marginTop: 4 }} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.title?.slice(0, 55)}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{a.source_engine} &middot; {(a.confidence * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Connected Nodes */}
                {connectedNodes.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>CONNECTIONS ({connectedNodes.length})</div>
                    {connectedNodes.slice(0, 10).map((cn, i) => (
                      <div key={i} onClick={() => selectNode(cn.otherId)} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: NODE_COLORS[cn.otherType] }} />
                          <span style={{ color: 'var(--text-primary)' }}>{cn.otherName}</span>
                        </div>
                        <span style={{ fontSize: 9, color: REL_COLORS[cn.relationship], fontWeight: 600 }}>{cn.relationship}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== REAL-TIME DASHBOARD CARDS ===== */}
      {dashData && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
              Network Intelligence — Live Metrics
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulse-dot 2s infinite' }} />
              {liveTime.toLocaleTimeString()}
            </div>
          </div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {[
              ['Network Nodes', data?.nodes?.length || 0, 'info', 'Entities monitored'],
              ['Network Edges', data?.edges?.length || 0, 'cyan', 'Active relationships'],
              ['Providers', dashData.summary?.total_providers, 'info', 'Registered providers'],
              ['Participants', dashData.summary?.total_participants, 'purple', 'Protected individuals'],
              ['Workers', dashData.summary?.total_workers, 'success', 'Support staff tracked'],
              ['Claims Scanned', dashData.summary?.total_claims?.toLocaleString(), 'info', 'Total invoices analysed'],
              ['Active Alerts', dashData.summary?.total_alerts, 'warning', 'Across 7 engines'],
              ['Critical', dashData.summary?.critical_alerts, 'critical', 'Immediate action required'],
              ['High Risk', dashData.summary?.high_alerts, 'high', 'Requires investigation'],
              ['Fraud Detected', formatMoney(dashData.financial?.total_fraud_detected_value || 0), 'critical', 'Suspicious claim value'],
              ['Penalties Issued', formatMoney(dashData.financial?.total_penalties_issued || 0), 'high', `${dashData.financial?.penalty_count || 0} penalties`],
              ['Collection Rate', `${dashData.financial?.collection_rate || 0}%`, 'success', formatMoney(dashData.financial?.total_penalties_paid || 0) + ' recovered'],
            ].map(([label, value, cls, sub]) => (
              <div className="stat-card" key={label}>
                <div className="stat-label">{label}</div>
                <div className={`stat-value ${cls}`} style={{ fontSize: 24 }}>{value}</div>
                <div className="stat-sub">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== LIVE DATA FEED ===== */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
            Live Network Activity Feed
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Showing latest alerts and high-risk entities
          </div>
        </div>

        <div className="grid-2">
          {/* Recent Alerts Stream */}
          <div className="card" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Recent Fraud Alerts</span>
              <span style={{ fontSize: 10, color: 'var(--accent-green)', fontWeight: 600 }}>{alertsData?.total || 0} total</span>
            </div>
            <div className="alert-list">
              {(alertsData?.alerts || []).slice(0, 15).map((a, i) => (
                <div key={i} className="alert-item" style={{ padding: '10px 12px', animationDelay: `${i * 0.05}s` }}
                  onClick={() => {
                    const pid = a.entities?.find(e => e.startsWith('PRV') || e.startsWith('WRK') || e.startsWith('PRT'))
                    if (pid) selectNode(pid)
                  }}>
                  <div className={`alert-severity ${a.severity}`} />
                  <div className="alert-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="alert-title" style={{ fontSize: 12 }}>{a.title?.slice(0, 60)}</div>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>{(a.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="alert-desc" style={{ fontSize: 11 }}>{a.description?.slice(0, 100)}</div>
                    <div className="alert-meta" style={{ marginTop: 4 }}>
                      <span className="alert-tag">{a.source_engine}</span>
                      <span className="alert-tag" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent-purple)' }}>{a.type}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* High-Risk Providers Table */}
          <div className="card" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>High-Risk Provider Watchlist</span>
              <span style={{ fontSize: 10, color: 'var(--accent-red)', fontWeight: 600 }}>{(providersData || []).filter(p => p.risk_score > 0.5).length} flagged</span>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Risk</th>
                    <th>Alerts</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {(providersData || []).filter(p => p.risk_score > 0).slice(0, 20).map(p => (
                    <tr key={p.id} onClick={() => selectNode(p.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>{p.name}</div>
                        <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.id}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="progress-bar" style={{ width: 40 }}>
                            <div className="progress-fill" style={{
                              width: `${(p.risk_score || 0) * 100}%`,
                              background: p.risk_score >= 0.7 ? '#ef4444' : p.risk_score >= 0.5 ? '#f97316' : '#f59e0b',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: p.risk_score >= 0.7 ? 'var(--accent-red)' : 'var(--accent-orange)' }}>
                            {((p.risk_score || 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--accent-orange)', fontSize: 13 }}>{p.alert_count || 0}</td>
                      <td><span className={`risk-badge ${p.max_severity === 'none' ? 'low' : p.max_severity}`}>{p.max_severity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Scrolling Network Nodes Data Table */}
        <div className="card" style={{ marginTop: 20, maxHeight: 400, overflowY: 'auto' }}>
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Network Entity Registry — All Nodes</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{data?.nodes?.length || 0} entities</span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Connections</th>
                  <th>Billing Volume</th>
                  <th>Serves</th>
                  <th>Employs</th>
                </tr>
              </thead>
              <tbody>
                {(data?.nodes || []).sort((a, b) => b.degree - a.degree).map(n => (
                  <tr key={n.id} onClick={() => selectNode(n.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: NODE_COLORS[n.type] }}>{n.id}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: NODE_COLORS[n.type] }} />
                        <span style={{ fontSize: 11 }}>{NODE_LABELS[n.type]}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>{n.name}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: n.degree > 100 ? 'var(--accent-red)' : n.degree > 50 ? 'var(--accent-orange)' : 'var(--text-secondary)' }}>
                        {n.degree}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: n.bills_total > 50000 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                      {n.bills_total > 0 ? formatMoney(n.bills_total) : '-'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{n.serves_count > 0 ? n.serves_count : '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{n.employs_count > 0 ? n.employs_count : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

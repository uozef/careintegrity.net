import { useRef, useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi'

const NODE_COLORS = {
  provider: '#3b82f6',
  participant: '#8b5cf6',
  worker: '#10b981',
  location: '#f59e0b',
}

export default function NetworkGraph() {
  const canvasRef = useRef(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [simulation, setSimulation] = useState(null)
  const positionsRef = useRef({})
  const animFrameRef = useRef(null)

  const { data, loading } = useApi('/graph', [])

  useEffect(() => {
    if (!data || !data.nodes || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    const nodes = data.nodes
    const edges = data.edges
    const width = canvas.width
    const height = canvas.height

    // Initialize positions using force layout simulation
    const positions = {}
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2
      const r = 150 + Math.random() * 100
      positions[n.id] = {
        x: width / 2 + Math.cos(angle) * r + (Math.random() - 0.5) * 100,
        y: height / 2 + Math.sin(angle) * r + (Math.random() - 0.5) * 100,
        vx: 0,
        vy: 0,
      }
    })

    // Build adjacency for edge lookup
    const nodeIndex = {}
    nodes.forEach((n, i) => nodeIndex[n.id] = i)

    // Simple force simulation
    let iteration = 0
    const maxIterations = 200

    function simulate() {
      if (iteration >= maxIterations) {
        draw()
        return
      }
      iteration++

      const alpha = 1 - iteration / maxIterations

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = positions[nodes[i].id]
          const b = positions[nodes[j].id]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = -300 * alpha / (dist * dist)
          const fx = dx / dist * force
          const fy = dy / dist * force
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const a = positions[edge.source]
        const b = positions[edge.target]
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = dist * 0.005 * alpha
        const fx = dx / dist * force
        const fy = dy / dist * force
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }

      // Center gravity
      for (const n of nodes) {
        const p = positions[n.id]
        p.vx += (width / 2 - p.x) * 0.001 * alpha
        p.vy += (height / 2 - p.y) * 0.001 * alpha
        p.vx *= 0.85
        p.vy *= 0.85
        p.x += p.vx
        p.y += p.vy
        // Clamp
        p.x = Math.max(30, Math.min(width - 30, p.x))
        p.y = Math.max(30, Math.min(height - 30, p.y))
      }

      draw()
      animFrameRef.current = requestAnimationFrame(simulate)
    }

    function draw() {
      ctx.clearRect(0, 0, width, height)

      // Draw edges
      ctx.globalAlpha = 0.15
      ctx.strokeStyle = '#6b7280'
      ctx.lineWidth = 0.5
      for (const edge of edges) {
        const a = positions[edge.source]
        const b = positions[edge.target]
        if (!a || !b) continue
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      // Draw nodes
      ctx.globalAlpha = 1
      for (const n of nodes) {
        const p = positions[n.id]
        if (!p) continue
        const r = Math.min(3 + Math.sqrt(n.degree || 1) * 1.5, 12)
        const color = NODE_COLORS[n.type] || '#666'

        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()

        if (hoveredNode === n.id) {
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      positionsRef.current = positions
    }

    simulate()

    // Mouse hover
    function handleMouseMove(e) {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      let found = null
      for (const n of nodes) {
        const p = positions[n.id]
        if (!p) continue
        const dx = mx - p.x
        const dy = my - p.y
        if (dx * dx + dy * dy < 100) {
          found = n
          break
        }
      }
      setHoveredNode(found ? found.id : null)
      canvas.style.cursor = found ? 'pointer' : 'default'
    }

    canvas.addEventListener('mousemove', handleMouseMove)

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [data])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading network graph...</div>

  const hoveredNodeData = data?.nodes?.find(n => n.id === hoveredNode)

  return (
    <div>
      <div className="page-header">
        <h2>Network Integrity Graph</h2>
        <p>Provider-Participant-Staff dynamic network model — {data?.nodes?.length || 0} nodes, {data?.edges?.length || 0} edges</p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b8fa3' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            {type}
          </div>
        ))}
      </div>

      <div className="graph-container">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        {hoveredNodeData && (
          <div style={{
            position: 'absolute', top: 12, right: 12, background: '#1e2130', border: '1px solid #2a2d3a',
            borderRadius: 8, padding: 12, fontSize: 12, minWidth: 180,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{hoveredNodeData.name}</div>
            <div style={{ color: '#8b8fa3' }}>Type: {hoveredNodeData.type}</div>
            <div style={{ color: '#8b8fa3' }}>ID: {hoveredNodeData.id}</div>
            <div style={{ color: '#8b8fa3' }}>Connections: {hoveredNodeData.degree}</div>
          </div>
        )}
      </div>
    </div>
  )
}

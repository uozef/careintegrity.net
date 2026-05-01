import { useRef, useEffect, useState, useCallback } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

function rotateY(x, y, z, a) { const c = Math.cos(a), s = Math.sin(a); return [x*c+z*s, y, -x*s+z*c] }
function rotateX(x, y, z, a) { const c = Math.cos(a), s = Math.sin(a); return [x, y*c-z*s, y*s+z*c] }
function project(x, y, z, w, h, fov) { const s = fov/(fov+z+300); return { x: w/2+x*s, y: h/2+y*s, scale: s, z } }

export default function CollusionMap() {
  const canvasRef = useRef(null)
  const pos3dRef = useRef({})
  const projectedRef = useRef({})
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const adjRef = useRef({})
  const animRef = useRef(null)
  const rotRef = useRef({ angleY: 0, angleX: 0.3, auto: true })
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0, startX: 0, startY: 0, moved: false })
  const zoomRef = useRef(1)

  const [hoveredNode, setHoveredNode] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [nodeDetail, setNodeDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [autoRotate, setAutoRotate] = useState(true)

  const { data, loading } = useApi('/collusion', [])

  const fetchDetail = useCallback(async (nodeId) => {
    setLoadingDetail(true)
    try {
      const detail = await fetchApi(`/providers/${nodeId}`)
      const edges = edgesRef.current.filter(e => e.source === nodeId || e.target === nodeId)
      const partners = edges.map(e => ({
        partner: e.source === nodeId ? e.target : e.source,
        weight: e.weight, shared_staff: e.shared_staff,
        shared_participants: e.shared_participants, shared_locations: e.shared_locations,
      })).sort((a, b) => b.weight - a.weight)
      setNodeDetail({ ...detail, collusionPartners: partners })
    } catch { setNodeDetail(null) }
    setLoadingDetail(false)
  }, [])

  useEffect(() => {
    if (!data?.network || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width; canvas.height = 580
    const { nodes, edges } = data.network
    if (!nodes?.length) return
    nodesRef.current = nodes; edgesRef.current = edges
    const W = canvas.width, H = canvas.height, fov = 600

    // Adjacency
    const adj = {}
    edges.forEach(e => { (adj[e.source] = adj[e.source] || []).push(e); (adj[e.target] = adj[e.target] || []).push(e) })
    adjRef.current = adj

    // 3D force layout with fibonacci sphere init
    const p3 = {}
    nodes.forEach((n, i) => {
      const phi = Math.acos(1 - 2*(i+0.5)/nodes.length)
      const theta = Math.PI*(1+Math.sqrt(5))*i
      const r = 220
      p3[n.id] = { x: r*Math.sin(phi)*Math.cos(theta), y: r*Math.sin(phi)*Math.sin(theta), z: r*Math.cos(phi), vx:0, vy:0, vz:0 }
    })
    // Force sim — more iterations, stronger repulsion
    for (let iter = 0; iter < 300; iter++) {
      const alpha = 0.6*(1-iter/300)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
          const a = p3[nodes[i].id], b = p3[nodes[j].id]
          const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z
          const dist = Math.sqrt(dx*dx+dy*dy+dz*dz)||1
          const f = -12000*alpha/(dist*dist)
          a.vx-=dx/dist*f; a.vy-=dy/dist*f; a.vz-=dz/dist*f
          b.vx+=dx/dist*f; b.vy+=dy/dist*f; b.vz+=dz/dist*f
        }
      }
      for (const e of edges) {
        const a=p3[e.source], b=p3[e.target]; if(!a||!b) continue
        const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z
        const dist=Math.sqrt(dx*dx+dy*dy+dz*dz)||1
        const str=Math.min(e.weight,12)*0.004*alpha
        a.vx+=dx*str; a.vy+=dy*str; a.vz+=dz*str
        b.vx-=dx*str; b.vy-=dy*str; b.vz-=dz*str
      }
      nodes.forEach(n => {
        const p=p3[n.id]; p.vx-=p.x*0.003*alpha; p.vy-=p.y*0.003*alpha; p.vz-=p.z*0.003*alpha
        p.vx*=0.75; p.vy*=0.75; p.vz*=0.75; p.x+=p.vx; p.y+=p.vy; p.z+=p.vz
      })
    }
    pos3dRef.current = p3
    const maxW = Math.max(...edges.map(e=>e.weight),1)
    const maxD = Math.max(...nodes.map(n=>n.weighted_degree||1))

    // Current state refs for closures
    const selRef = { current: selectedNode }
    const hovRef = { current: hoveredNode }

    function render() {
      const rot = rotRef.current, zoom = zoomRef.current
      if (rot.auto) rot.angleY += 0.003

      ctx.clearRect(0,0,W,H)
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim()||'#0a0c14'
      ctx.fillStyle = bg; ctx.fillRect(0,0,W,H)

      // Project all nodes
      const proj = {}
      nodes.forEach(n => {
        const p=p3[n.id]
        let [rx,ry,rz]=rotateY(p.x*zoom, p.y*zoom, p.z*zoom, rot.angleY)
        ;[rx,ry,rz]=rotateX(rx,ry,rz, rot.angleX)
        proj[n.id] = project(rx,ry,rz,W,H,fov)
      })
      projectedRef.current = proj

      const sel = selRef.current
      const connSet = new Set()
      if (sel) (adj[sel]||[]).forEach(e => connSet.add(e.source===sel?e.target:e.source))

      // Draw edges
      for (const e of edges) {
        const a=proj[e.source], b=proj[e.target]; if(!a||!b) continue
        const hi = sel && (e.source===sel||e.target===sel)
        const dim = sel && !hi
        const intensity = Math.min(e.weight/maxW,1)
        const avgS = (a.scale+b.scale)/2

        ctx.globalAlpha = dim ? 0.02 : hi ? 0.85 : 0.06+intensity*0.15
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y)

        if (hi) {
          ctx.strokeStyle = e.shared_staff>0&&e.shared_staff>=e.shared_participants?'#ef4444':e.shared_locations>0?'#f59e0b':'#3b82f6'
          ctx.lineWidth = Math.max(1,(1.5+intensity*3)*avgS)
          ctx.stroke()
          // Label
          const mx=(a.x+b.x)/2, my=(a.y+b.y)/2
          ctx.globalAlpha=0.8; ctx.fillStyle=ctx.strokeStyle
          ctx.font=`${Math.max(8,10*avgS)}px sans-serif`
          const parts=[]
          if(e.shared_staff>0) parts.push(`${e.shared_staff} staff`)
          if(e.shared_participants>0) parts.push(`${e.shared_participants} pts`)
          if(e.shared_locations>0) parts.push(`${e.shared_locations} loc`)
          ctx.fillText(parts.join(', '), mx+4, my-4)
        } else {
          ctx.strokeStyle = e.shared_staff>0?`rgba(239,68,68,${0.08+intensity*0.35})`:e.shared_locations>0?`rgba(245,158,11,${0.08+intensity*0.35})`:`rgba(59,130,246,${0.05+intensity*0.2})`
          ctx.lineWidth = Math.max(0.3,(0.5+intensity*1.5)*avgS)
          ctx.stroke()
        }
      }
      ctx.globalAlpha=1

      // Sort by Z (far first)
      const sorted=[...nodes].sort((a,b)=>(proj[a.id]?.z||0)-(proj[b.id]?.z||0))

      for (const n of sorted) {
        const p = proj[n.id]; if(!p) continue
        const isSel = n.id===sel, isConn = connSet.has(n.id), isHov = n.id===hovRef.current
        const dim = sel&&!isSel&&!isConn
        const dr = (n.weighted_degree||1)/maxD
        const baseR = (6+dr*16)*p.scale
        const r = isSel?baseR*1.4:isHov?baseR*1.2:baseR

        ctx.globalAlpha = dim?0.08:0.3+p.scale*0.7
        const color = dr>0.5?'#ef4444':dr>0.3?'#f97316':'#3b82f6'

        // Glow
        if((isSel||isHov)&&!dim) {
          ctx.save(); ctx.globalAlpha=0.2
          ctx.beginPath(); ctx.arc(p.x,p.y,r+12,0,Math.PI*2)
          ctx.fillStyle=color; ctx.fill(); ctx.restore()
        }

        // 3D sphere
        if(r>3&&!dim) {
          const g=ctx.createRadialGradient(p.x-r*0.3,p.y-r*0.3,r*0.05,p.x,p.y,r)
          const lt=color==='#ef4444'?'#ff8888':color==='#f97316'?'#ffbb66':'#7db8ff'
          const dk=color==='#ef4444'?'#aa2222':color==='#f97316'?'#aa5500':'#1a55aa'
          g.addColorStop(0,lt); g.addColorStop(1,dk)
          ctx.fillStyle=g
        } else ctx.fillStyle=color

        ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill()

        if(isSel) { ctx.strokeStyle='#fff'; ctx.lineWidth=Math.max(1.5,2*p.scale); ctx.stroke() }

        // Labels
        if((isSel||isHov||isConn)&&!dim) {
          ctx.save(); ctx.globalAlpha=1
          const fs=Math.max(9,12*p.scale)
          ctx.font=`bold ${fs}px sans-serif`
          const label=n.name||n.id, tw=ctx.measureText(label).width
          ctx.fillStyle='rgba(0,0,0,0.75)'
          ctx.fillRect(p.x+r+4,p.y-fs/2-2,tw+8,fs+4)
          ctx.fillStyle='#fff'; ctx.fillText(label,p.x+r+8,p.y+fs*0.15)
          ctx.restore()
        }
      }
      ctx.globalAlpha=1

      // Axis indicator
      ctx.save(); ctx.globalAlpha=0.25
      const ax=50,ay=H-50,al=25
      for(const[l,lx,ly,lz,c] of [['X',al,0,0,'#ef4444'],['Y',0,-al,0,'#10b981'],['Z',0,0,al,'#3b82f6']]) {
        let[rx,ry]=rotateY(lx,ly,lz,rot.angleY); [rx,ry]=rotateX(rx,ry,0,rot.angleX)
        ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ax+rx,ay+ry)
        ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke()
        ctx.fillStyle=c;ctx.font='9px sans-serif';ctx.fillText(l,ax+rx+3,ay+ry+3)
      }
      ctx.restore()

      animRef.current = requestAnimationFrame(render)
    }
    render()

    // Interactions
    function getNodeAt(mx, my) {
      const proj = projectedRef.current
      let best=null, bestD=Infinity
      for(const n of nodes) {
        const p=proj[n.id]; if(!p) continue
        const r=(6+((n.weighted_degree||1)/maxD)*16)*p.scale
        const dx=mx-p.x, dy=my-p.y, d=dx*dx+dy*dy
        if(d<(r+8)*(r+8)&&d<bestD) { best=n; bestD=d }
      }
      return best
    }

    function onMove(e) {
      const r=canvas.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top
      if(dragRef.current.dragging) {
        const dx=e.clientX-dragRef.current.lastX, dy=e.clientY-dragRef.current.lastY
        rotRef.current.angleY+=dx*0.008
        rotRef.current.angleX=Math.max(-1.2,Math.min(1.2,rotRef.current.angleX+dy*0.005))
        dragRef.current.lastX=e.clientX; dragRef.current.lastY=e.clientY
        dragRef.current.moved=true; return
      }
      const found=getNodeAt(mx,my)
      hovRef.current=found?found.id:null
      setHoveredNode(found?found.id:null)
      canvas.style.cursor=found?'pointer':'grab'
    }
    function onClick(e) {
      if(dragRef.current.moved) { dragRef.current.moved=false; return }
      const r=canvas.getBoundingClientRect()
      const found=getNodeAt(e.clientX-r.left, e.clientY-r.top)
      if(found) {
        const newSel = selRef.current===found.id?null:found.id
        selRef.current=newSel
        setSelectedNode(newSel)
        if(newSel) fetchDetail(newSel); else setNodeDetail(null)
      } else {
        selRef.current=null; setSelectedNode(null); setNodeDetail(null)
      }
    }
    function onDown(e) {
      rotRef.current.auto=false; setAutoRotate(false)
      dragRef.current={dragging:true, lastX:e.clientX, lastY:e.clientY, startX:e.clientX, startY:e.clientY, moved:false}
    }
    function onUp() { dragRef.current.dragging=false }
    function onWheel(e) {
      e.preventDefault()
      zoomRef.current=Math.max(0.3,Math.min(4,zoomRef.current*(e.deltaY<0?1.1:0.9)))
    }

    canvas.addEventListener('mousemove',onMove)
    canvas.addEventListener('click',onClick)
    canvas.addEventListener('mousedown',onDown)
    canvas.addEventListener('mouseup',onUp)
    canvas.addEventListener('mouseleave',onUp)
    canvas.addEventListener('wheel',onWheel,{passive:false})

    return () => {
      canvas.removeEventListener('mousemove',onMove)
      canvas.removeEventListener('click',onClick)
      canvas.removeEventListener('mousedown',onDown)
      canvas.removeEventListener('mouseup',onUp)
      canvas.removeEventListener('mouseleave',onUp)
      canvas.removeEventListener('wheel',onWheel)
      if(animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [data])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading collusion map...</div>

  const cartels = data?.cartels || []
  const referralLoops = data?.referral_loops || []
  const detail = nodeDetail

  return (
    <div>
      <div className="page-header">
        <h2>3D Collusion Detection Map</h2>
        <p>Drag to rotate &middot; Scroll to zoom &middot; Click nodes to inspect collusion links</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {[['Shared Staff','#ef4444'],['Shared Locations','#f59e0b'],['Shared Participants','#3b82f6']].map(([l,c]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-secondary)' }}>
              <div style={{ width:16, height:3, background:c, borderRadius:2 }} />{l}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn sm ${autoRotate?'primary':''}`} onClick={() => { const next=!autoRotate; setAutoRotate(next); rotRef.current.auto=next }}>
            {autoRotate?'Stop Rotation':'Auto Rotate'}
          </button>
          <button className="btn sm" onClick={() => { zoomRef.current=1; rotRef.current.angleY=0; rotRef.current.angleX=0.3 }}>Reset</button>
          {selectedNode && <button className="btn sm" onClick={() => { setSelectedNode(null); setNodeDetail(null) }}>Deselect</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <div className="card" style={{ padding:0, overflow:'hidden', flex:detail?'1 1 58%':'1 1 100%', transition:'flex 0.3s' }}>
          <div style={{ height:580, background:'var(--canvas-bg)', position:'relative' }}>
            <canvas ref={canvasRef} style={{ width:'100%', height:'100%' }} />
          </div>
        </div>

        {detail && !detail.error && (
          <div className="card slide-in" style={{ flex:'0 0 380px', maxHeight:580, overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--accent-orange)', marginBottom:4 }}>Collusion Analysis</div>
                <div style={{ fontSize:18, fontWeight:800 }}>{detail.provider?.name}</div>
                <div style={{ fontSize:12, fontFamily:'monospace', color:'var(--text-muted)', marginTop:2 }}>{selectedNode}</div>
              </div>
              <button className="btn sm" onClick={() => { setSelectedNode(null); setNodeDetail(null) }}>&times;</button>
            </div>
            {loadingDetail ? <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)' }}>Analysing...</div> : (
              <div className="fade-in">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
                  {[
                    ['Risk', `${((detail.risk_profile?.risk_score||0)*100).toFixed(0)}%`, detail.risk_profile?.risk_score>0.5?'var(--accent-red)':'var(--accent-green)'],
                    ['Partners', detail.collusionPartners?.length||0, 'var(--accent-orange)'],
                    ['Alerts', detail.risk_profile?.alerts||0, 'var(--accent-yellow)'],
                  ].map(([l,v,c]) => (
                    <div key={l} style={{ padding:10, background:'var(--bg-secondary)', borderRadius:8, border:'1px solid var(--border)', textAlign:'center' }}>
                      <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', fontWeight:700 }}>{l}</div>
                      <div style={{ fontSize:20, fontWeight:800, color:c, marginTop:2 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {detail.collusionPartners?.length > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', marginBottom:8 }}>
                      Collusion Partners ({detail.collusionPartners.length})
                    </div>
                    {detail.collusionPartners.slice(0,15).map((p,i) => (
                      <div key={i} onClick={() => { setSelectedNode(p.partner); fetchDetail(p.partner) }}
                        style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', marginBottom:4,
                          background:'var(--bg-secondary)', borderRadius:8, border:'1px solid var(--border)', fontSize:12, cursor:'pointer', transition:'all 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor='var(--accent-blue)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                        <div>
                          <div style={{ fontWeight:700, fontFamily:'monospace' }}>{p.partner}</div>
                          <div style={{ display:'flex', gap:8, marginTop:4 }}>
                            {p.shared_staff>0 && <span style={{ fontSize:10, color:'#ef4444', fontWeight:600 }}>{p.shared_staff} staff</span>}
                            {p.shared_participants>0 && <span style={{ fontSize:10, color:'#3b82f6', fontWeight:600 }}>{p.shared_participants} pts</span>}
                            {p.shared_locations>0 && <span style={{ fontSize:10, color:'#f59e0b', fontWeight:600 }}>{p.shared_locations} loc</span>}
                          </div>
                        </div>
                        <div style={{ fontSize:16, fontWeight:800, color:p.weight>10?'var(--accent-red)':'var(--accent-orange)' }}>{p.weight}</div>
                      </div>
                    ))}
                  </div>
                )}
                {detail.alerts?.filter(a => a.source_engine==='Collusion Detection'||a.source_engine==='Network Graph').length > 0 && (
                  <div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>Alerts</div>
                    {detail.alerts.filter(a => a.source_engine==='Collusion Detection'||a.source_engine==='Network Graph').slice(0,5).map((a,i) => (
                      <div key={i} style={{ display:'flex', gap:8, padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:11 }}>
                        <div className={`alert-severity ${a.severity}`} style={{ marginTop:4 }} />
                        <div>
                          <div style={{ fontWeight:600 }}>{a.title?.slice(0,60)}</div>
                          <div style={{ color:'var(--text-muted)', fontSize:10 }}>{a.type} &middot; {(a.confidence*100).toFixed(0)}%</div>
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

      <div className="grid-2" style={{ marginTop:20 }}>
        <div className="card">
          <div className="card-title">Provider Cartel Clusters ({cartels.length})</div>
          <div className="alert-list" style={{ maxHeight:400, overflowY:'auto' }}>
            {cartels.map((c,i) => (
              <div key={i} className="alert-item" onClick={() => { const pid=c.entities?.[0]; if(pid){setSelectedNode(pid);fetchDetail(pid)} }}>
                <div className={`alert-severity ${c.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize:12 }}>{c.title}</div>
                  <div className="alert-desc" style={{ fontSize:11 }}>{c.description}</div>
                  <div style={{ marginTop:6, fontSize:11, color:'var(--text-muted)' }}>Density: {c.density} | Staff: {c.shared_staff} | Pts: {c.shared_participants}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Referral Loops ({referralLoops.length})</div>
          <div className="alert-list" style={{ maxHeight:400, overflowY:'auto' }}>
            {referralLoops.map((r,i) => (
              <div key={i} className="alert-item" onClick={() => { const pid=r.entities?.find(e=>e.startsWith('PRV')); if(pid){setSelectedNode(pid);fetchDetail(pid)} }}>
                <div className={`alert-severity ${r.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize:12 }}>{r.title}</div>
                  <div className="alert-desc" style={{ fontSize:11 }}>{r.description}</div>
                </div>
              </div>
            ))}
            {referralLoops.length===0 && <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)' }}>No referral loops detected</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

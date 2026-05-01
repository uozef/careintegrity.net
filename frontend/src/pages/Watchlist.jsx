import { useState, useEffect } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

export default function Watchlist() {
  const { data, loading } = useApi('/watchlist', [])
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [newNote, setNewNote] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ entity_id: '', entity_type: 'provider', entity_name: '', reason: '', priority: 'high' })
  const { data: providers } = useApi('/providers', [])

  useEffect(() => { if (data) setItems(data) }, [data])

  const handleAdd = async () => {
    const result = await fetchApi('/watchlist', { method: 'POST', body: JSON.stringify(addForm) })
    if (result && !result.detail) { setItems(prev => [result, ...prev]); setShowAdd(false); setAddForm({ entity_id: '', entity_type: 'provider', entity_name: '', reason: '', priority: 'high' }) }
  }

  const handleNote = async (wlId) => {
    if (!newNote) return
    const result = await fetchApi(`/watchlist/${wlId}/note`, { method: 'POST', body: JSON.stringify({ note: newNote }) })
    if (result) { setItems(prev => prev.map(w => w.id === wlId ? result : w)); setSelected(result); setNewNote('') }
  }

  const handleStatus = async (wlId, status) => {
    const result = await fetchApi(`/watchlist/${wlId}`, { method: 'PUT', body: JSON.stringify({ status }) })
    if (result) { setItems(prev => prev.map(w => w.id === wlId ? result : w)); setSelected(result) }
  }

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading watchlist...</div>

  const active = items.filter(w => w.status === 'active')
  const resolved = items.filter(w => w.status !== 'active')

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div><h2>Watchlist</h2><p>Entities under active surveillance — {active.length} active, {resolved.length} resolved</p></div>
        <button className="btn primary" onClick={() => setShowAdd(true)}>+ Add to Watchlist</button>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}><div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">Add to Watchlist</div>
          <div className="form-group"><label className="form-label">Entity Type</label>
            <select className="form-input" value={addForm.entity_type} onChange={e => setAddForm(p => ({ ...p, entity_type: e.target.value }))}>
              <option value="provider">Provider</option><option value="worker">Worker</option><option value="participant">Participant</option></select></div>
          {addForm.entity_type === 'provider' && providers && (
            <div className="form-group"><label className="form-label">Select Provider</label>
              <select className="form-input" value={addForm.entity_id} onChange={e => { const p = providers.find(p => p.id === e.target.value); setAddForm(prev => ({ ...prev, entity_id: e.target.value, entity_name: p?.name || '' })) }}>
                <option value="">Select...</option>{providers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}</select></div>
          )}
          {addForm.entity_type !== 'provider' && <>
            <div className="form-group"><label className="form-label">Entity ID</label><input className="form-input" value={addForm.entity_id} onChange={e => setAddForm(p => ({...p, entity_id: e.target.value}))} placeholder="e.g. WRK-0005"/></div>
            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={addForm.entity_name} onChange={e => setAddForm(p => ({...p, entity_name: e.target.value}))}/></div>
          </>}
          <div className="form-group"><label className="form-label">Reason</label><input className="form-input" value={addForm.reason} onChange={e => setAddForm(p => ({...p, reason: e.target.value}))} placeholder="Why is this entity being watched?"/></div>
          <div className="form-group"><label className="form-label">Priority</label>
            <select className="form-input" value={addForm.priority} onChange={e => setAddForm(p => ({...p, priority: e.target.value}))}>
              <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option></select></div>
          <div style={{display:'flex',gap:8}}><button className="btn primary" onClick={handleAdd}>Add</button><button className="btn" onClick={() => setShowAdd(false)}>Cancel</button></div>
        </div></div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[['Active', active.length, 'warning'], ['Critical', items.filter(w=>w.priority==='critical').length, 'critical'],
          ['High', items.filter(w=>w.priority==='high').length, 'high'], ['Resolved', resolved.length, 'success']
        ].map(([l,v,c]) => <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`}>{v}</div></div>)}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <div className="card" style={{ flex: 1 }}>
          <div className="card-title">Watchlist Entries</div>
          {items.map(w => (
            <div key={w.id} onClick={() => setSelected(w)} className="alert-item" style={{
              borderColor: selected?.id === w.id ? 'var(--accent-blue)' : undefined,
              opacity: w.status !== 'active' ? 0.5 : 1,
            }}>
              <div className={`alert-severity ${w.priority}`} />
              <div className="alert-content">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="alert-title">{w.entity_name}</div>
                  <span className={`status-badge ${w.status === 'active' ? 'pending' : 'paid'}`}>{w.status}</span>
                </div>
                <div className="alert-desc">{w.reason}</div>
                <div className="alert-meta">
                  <span className="alert-tag">{w.entity_type}</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{w.entity_id}</span>
                  <span className="alert-confidence">Added by {w.added_by} &middot; Review: {w.review_date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="card slide-in" style={{ flex: '0 0 360px', maxHeight: 600, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: `var(--severity-${selected.priority})`, marginBottom: 4 }}>Watching</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.entity_name}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{selected.entity_id}</div>
              </div>
              <button className="btn sm" onClick={() => setSelected(null)}>&times;</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>{selected.reason}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
              Added: {selected.added_at?.slice(0,10)} &middot; By: {selected.added_by} &middot; Review: {selected.review_date}
            </div>
            {selected.notes?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>NOTES ({selected.notes.length})</div>
                {selected.notes.map((n, i) => (
                  <div key={i} style={{ padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 4, fontSize: 12, border: '1px solid var(--border)' }}>
                    <div>{n.text}</div><div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{n.author} &middot; {n.timestamp?.slice(0,16)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="form-group">
              <input className="form-input" placeholder="Add investigation note..." value={newNote} onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleNote(selected.id) }} style={{ fontSize: 12 }} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {selected.status === 'active' && <button className="btn success sm" onClick={() => handleStatus(selected.id, 'resolved')}>Resolve</button>}
              {selected.status !== 'active' && <button className="btn sm" onClick={() => handleStatus(selected.id, 'active')}>Reactivate</button>}
              <button className="btn sm" onClick={() => handleStatus(selected.id, 'escalated')}>Escalate</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

export default function Tipoffs() {
  const { data, loading } = useApi('/tipoffs', [])
  const [tips, setTips] = useState([])
  const [selected, setSelected] = useState(null)
  const [newNote, setNewNote] = useState('')
  const [showSubmit, setShowSubmit] = useState(false)
  const [form, setForm] = useState({ category: 'Billing Fraud', subject: '', description: '', provider_id: '', contact_method: '', contact_detail: '' })

  useEffect(() => { if (data) setTips(data) }, [data])

  const handleSubmit = async () => {
    const payload = { ...form, contact_method: form.contact_method || null, contact_detail: form.contact_detail || null, provider_id: form.provider_id || null }
    const result = await fetchApi('/tipoffs', { method: 'POST', body: JSON.stringify(payload) })
    if (result && !result.detail) { setTips(prev => [result, ...prev]); setShowSubmit(false) }
  }

  const handleUpdate = async (tipId, updates) => {
    const result = await fetchApi(`/tipoffs/${tipId}`, { method: 'PUT', body: JSON.stringify(updates) })
    if (result) { setTips(prev => prev.map(t => t.id === tipId ? result : t)); setSelected(result) }
  }

  const handleNote = async (tipId) => {
    if (!newNote) return
    const result = await fetchApi(`/tipoffs/${tipId}/note`, { method: 'POST', body: JSON.stringify({ note: newNote }) })
    if (result) { setTips(prev => prev.map(t => t.id === tipId ? result : t)); setSelected(result); setNewNote('') }
  }

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading tip-offs...</div>

  const statusCounts = {}
  tips.forEach(t => statusCounts[t.status] = (statusCounts[t.status] || 0) + 1)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div><h2>Whistleblower Portal</h2><p>Anonymous tip-offs and fraud reports — {tips.length} received</p></div>
        <button className="btn primary" onClick={() => setShowSubmit(true)}>+ Submit Tip-off</button>
      </div>

      {showSubmit && (
        <div className="modal-overlay" onClick={() => setShowSubmit(false)}><div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">Submit Fraud Tip-off</div>
          <div className="form-group"><label className="form-label">Category</label>
            <select className="form-input" value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))}>
              {['Billing Fraud','Service Quality','Workforce Abuse','Provider Misconduct','Plan Misuse','Other'].map(c => <option key={c}>{c}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Subject</label><input className="form-input" value={form.subject} onChange={e => setForm(p => ({...p,subject:e.target.value}))} placeholder="Brief title"/></div>
          <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={4} value={form.description} onChange={e => setForm(p => ({...p,description:e.target.value}))} placeholder="Describe what you've observed..." style={{resize:'vertical'}}/></div>
          <div className="form-group"><label className="form-label">Provider ID (optional)</label><input className="form-input" value={form.provider_id} onChange={e => setForm(p => ({...p,provider_id:e.target.value}))} placeholder="e.g. PRV-0003"/></div>
          <div className="form-group"><label className="form-label">Contact Method (optional — leave blank for anonymous)</label>
            <select className="form-input" value={form.contact_method} onChange={e => setForm(p => ({...p,contact_method:e.target.value}))}>
              <option value="">Anonymous</option><option value="email">Email</option><option value="phone">Phone</option></select></div>
          {form.contact_method && <div className="form-group"><label className="form-label">Contact Detail</label><input className="form-input" value={form.contact_detail} onChange={e => setForm(p => ({...p,contact_detail:e.target.value}))}/></div>}
          <div style={{display:'flex',gap:8}}><button className="btn primary" onClick={handleSubmit} disabled={!form.subject||!form.description}>Submit</button><button className="btn" onClick={() => setShowSubmit(false)}>Cancel</button></div>
        </div></div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[['Total', tips.length, 'info'], ['New', statusCounts.new||0, 'critical'],
          ['Investigating', statusCounts.investigating||0, 'warning'], ['Resolved', statusCounts.resolved||0, 'success']
        ].map(([l,v,c]) => <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`}>{v}</div></div>)}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <div className="card" style={{ flex: 1 }}>
          {tips.map(t => (
            <div key={t.id} onClick={() => setSelected(t)} className="alert-item" style={{ borderColor: selected?.id === t.id ? 'var(--accent-blue)' : undefined }}>
              <div className={`alert-severity ${t.priority === 'high' ? 'high' : t.status === 'new' ? 'critical' : 'medium'}`} />
              <div className="alert-content">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="alert-title">{t.subject}</div>
                  <span className={`status-badge ${t.status === 'new' ? 'pending' : t.status === 'investigating' ? 'sent' : 'paid'}`}>{t.status}</span>
                </div>
                <div className="alert-desc">{t.description?.slice(0, 120)}</div>
                <div className="alert-meta">
                  <span className="alert-tag">{t.category}</span>
                  {t.provider_id && <span style={{fontSize:10,fontFamily:'monospace',color:'var(--text-muted)'}}>{t.provider_id}</span>}
                  <span className="alert-confidence">{t.contact_method || 'Anonymous'} &middot; {t.submitted_at?.slice(0, 10)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="card slide-in" style={{ flex: '0 0 400px', maxHeight: 600, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-orange)', marginBottom: 4 }}>Tip-off Investigation</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.subject}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{selected.id}</div>
              </div>
              <button className="btn sm" onClick={() => setSelected(null)}>&times;</button>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14, fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>{selected.description}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 2 }}>
              <div>Category: <strong>{selected.category}</strong></div>
              {selected.provider_id && <div>Provider: <strong style={{ color: 'var(--accent-blue)' }}>{selected.provider_id}</strong></div>}
              <div>Source: <strong>{selected.contact_method || 'Anonymous'}</strong> {selected.contact_detail && `(${selected.contact_detail})`}</div>
              <div>Submitted: <strong>{selected.submitted_at?.slice(0, 16)}</strong></div>
              {selected.assigned_to && <div>Assigned to: <strong>{selected.assigned_to}</strong></div>}
            </div>

            {selected.investigation_notes?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>NOTES</div>
                {selected.investigation_notes.map((n, i) => (
                  <div key={i} style={{ padding: '6px 8px', background: 'var(--bg-card)', borderRadius: 6, marginBottom: 4, fontSize: 12, border: '1px solid var(--border)' }}>
                    <div>{n.text}</div><div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{n.author} &middot; {n.timestamp?.slice(0, 16)}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="form-group"><input className="form-input" placeholder="Add investigation note..." value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleNote(selected.id) }} /></div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={() => handleUpdate(selected.id, { status: 'investigating' })}>Investigate</button>
              <button className="btn sm success" onClick={() => handleUpdate(selected.id, { status: 'resolved' })}>Resolve</button>
              <button className="btn sm danger" onClick={() => handleUpdate(selected.id, { priority: 'high' })}>Escalate</button>
              <button className="btn sm" onClick={() => handleUpdate(selected.id, { status: 'dismissed' })}>Dismiss</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

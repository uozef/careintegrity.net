import { useState, useEffect } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

const STATUSES = ['all', 'pending', 'sent', 'paid', 'disputed', 'overdue', 'cancelled']

export default function Penalties() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [penalties, setPenalties] = useState([])
  const [total, setTotal] = useState(0)
  const [selectedPenalty, setSelectedPenalty] = useState(null)
  const [sending, setSending] = useState({})

  const statusParam = statusFilter !== 'all' ? `&penalty_status=${statusFilter}` : ''
  const { data, loading } = useApi(`/penalties?limit=200${statusParam}`, [statusFilter])

  useEffect(() => {
    if (data) {
      setPenalties(data.penalties || [])
      setTotal(data.total || 0)
    }
  }, [data])

  const handleSendEmail = async (penaltyId) => {
    setSending(prev => ({ ...prev, [penaltyId]: true }))
    const result = await fetchApi(`/penalties/${penaltyId}/send-email`, { method: 'POST' })
    if (result?.success) {
      setPenalties(prev => prev.map(p => p.id === penaltyId ? { ...p, status: 'sent', email_sent: true } : p))
    }
    setSending(prev => ({ ...prev, [penaltyId]: false }))
  }

  const handleSendAll = async () => {
    const result = await fetchApi('/penalties/send-all', { method: 'POST' })
    if (result) {
      // Refresh
      const fresh = await fetchApi(`/penalties?limit=200${statusParam}`)
      if (fresh) {
        setPenalties(fresh.penalties || [])
        setTotal(fresh.total || 0)
      }
    }
  }

  const handleUpdateStatus = async (penaltyId, newStatus) => {
    const result = await fetchApi(`/penalties/${penaltyId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus, notes: '' }),
    })
    if (result) {
      setPenalties(prev => prev.map(p => p.id === penaltyId ? { ...p, ...result } : p))
      setSelectedPenalty(null)
    }
  }

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading penalties...</div>

  const summaryByStatus = {}
  penalties.forEach(p => {
    summaryByStatus[p.status] = (summaryByStatus[p.status] || 0) + 1
  })

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Penalty Management</h2>
          <p>{total} penalties issued &mdash; Automated enforcement for detected fraud</p>
        </div>
        <button className="btn primary" onClick={handleSendAll}>Send All Pending Emails</button>
      </div>

      <div className="stats-grid">
        {['pending', 'sent', 'paid', 'disputed', 'overdue'].map(s => (
          <div className="stat-card" key={s} onClick={() => setStatusFilter(s)} style={{ cursor: 'pointer' }}>
            <div className="stat-label">{s.charAt(0).toUpperCase() + s.slice(1)}</div>
            <div className={`stat-value ${s === 'paid' ? 'success' : s === 'disputed' || s === 'overdue' ? 'critical' : 'warning'}`}>
              {summaryByStatus[s] || 0}
            </div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        {STATUSES.map(s => (
          <button key={s} className={`filter-btn ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {selectedPenalty && (
        <div className="modal-overlay" onClick={() => setSelectedPenalty(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Penalty Details &mdash; {selectedPenalty.id}</div>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div><strong>Provider:</strong> {selectedPenalty.provider_name} ({selectedPenalty.provider_id})</div>
              <div><strong>Fine Code:</strong> {selectedPenalty.fine_code} &mdash; {selectedPenalty.fine_code_name}</div>
              <div><strong>Amount:</strong> <span style={{ color: 'var(--accent-red)', fontWeight: 700, fontSize: 18 }}>${selectedPenalty.amount?.toLocaleString()}</span></div>
              <div><strong>Severity:</strong> <span className={`risk-badge ${selectedPenalty.severity}`}>{selectedPenalty.severity}</span></div>
              <div><strong>Status:</strong> <span className={`status-badge ${selectedPenalty.status}`}>{selectedPenalty.status}</span></div>
              <div><strong>Issued:</strong> {selectedPenalty.issued_at?.slice(0, 10)}</div>
              <div><strong>Due:</strong> {selectedPenalty.due_date}</div>
              <div><strong>Alert:</strong> {selectedPenalty.alert_id}</div>
              <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                {selectedPenalty.description}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 20, flexWrap: 'wrap' }}>
              {selectedPenalty.status !== 'paid' && (
                <button className="btn success" onClick={() => handleUpdateStatus(selectedPenalty.id, 'paid')}>Mark as Paid</button>
              )}
              {selectedPenalty.status !== 'disputed' && (
                <button className="btn danger" onClick={() => handleUpdateStatus(selectedPenalty.id, 'disputed')}>Mark Disputed</button>
              )}
              {selectedPenalty.status !== 'cancelled' && (
                <button className="btn" onClick={() => handleUpdateStatus(selectedPenalty.id, 'cancelled')}>Cancel</button>
              )}
              {!selectedPenalty.email_sent && (
                <button className="btn primary" onClick={() => { handleSendEmail(selectedPenalty.id); setSelectedPenalty(null) }}>Send Email</button>
              )}
              <button className="btn" onClick={() => setSelectedPenalty(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Penalty ID</th>
                <th>Provider</th>
                <th>Fine Code</th>
                <th>Amount</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {penalties.map(p => (
                <tr key={p.id} onClick={() => setSelectedPenalty(p)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{p.id}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>{p.provider_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.provider_id}</div>
                  </td>
                  <td><span className="alert-tag">{p.fine_code}</span></td>
                  <td style={{ fontWeight: 700, color: 'var(--accent-red)', fontSize: 14 }}>${p.amount?.toLocaleString()}</td>
                  <td><span className={`risk-badge ${p.severity}`}>{p.severity}</span></td>
                  <td><span className={`status-badge ${p.status}`}>{p.status}</span></td>
                  <td style={{ fontSize: 12 }}>{p.issued_at?.slice(0, 10)}</td>
                  <td style={{ fontSize: 12 }}>{p.due_date}</td>
                  <td>
                    {p.email_sent ? (
                      <span style={{ color: 'var(--accent-green)', fontSize: 12 }}>Sent</span>
                    ) : (
                      <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); handleSendEmail(p.id) }}
                        disabled={sending[p.id]}>
                        {sending[p.id] ? '...' : 'Send'}
                      </button>
                    )}
                  </td>
                  <td>
                    {p.status !== 'paid' && (
                      <button className="btn sm success" onClick={(e) => { e.stopPropagation(); handleUpdateStatus(p.id, 'paid') }}>
                        Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

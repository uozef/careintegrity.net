import { useState, useEffect } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

function formatMoney(n) { return !n ? '$0' : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n.toFixed(0)}` }

const EXAMPLE_QUERIES = [
  "workers billing between midnight and 5am with sessions over 6 hours",
  "providers with more than 50 participants but less than 3 workers",
  "SIL services billed at rates above $90 per hour on weekends",
  "same worker billing at multiple providers with overlapping shifts",
  "providers with excessive therapy stacking across participants",
  "claims over $800 with rates above $100 per hour",
  "providers with overnight billing and inflated session hours",
  "shared staff across providers with ghost worker patterns",
]

export default function PatternSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [expandedSuspect, setExpandedSuspect] = useState(null)
  const [showSave, setShowSave] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [scenarios, setScenarios] = useState([])
  const [activeTab, setActiveTab] = useState('search')

  const { data: savedScenarios } = useApi('/scenarios', [])
  useEffect(() => { if (savedScenarios) setScenarios(savedScenarios) }, [savedScenarios])

  const runSearch = async (q) => {
    if (!q?.trim()) return
    setSearching(true); setResults(null); setExpandedSuspect(null)
    const data = await fetchApi('/pattern-search', { method: 'POST', body: JSON.stringify({ query: q }) })
    setResults(data); setSearching(false)
  }

  const handleSave = async () => {
    if (!saveName || !query) return
    const result = await fetchApi('/scenarios', { method: 'POST', body: JSON.stringify({ name: saveName, query }) })
    if (result && !result.detail) { setScenarios(prev => [...prev, result]); setShowSave(false); setSaveName('') }
  }

  const runScenario = async (sc) => {
    setQuery(sc.query); setActiveTab('search')
    setSearching(true); setResults(null)
    const data = await fetchApi(`/scenarios/${sc.id}/run`, { method: 'POST' })
    setResults(data); setSearching(false)
  }

  const deleteScenario = async (id) => {
    await fetchApi(`/scenarios/${id}`, { method: 'DELETE' })
    setScenarios(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div>
      <div className="page-header">
        <h2>Fraud Pattern Search</h2>
        <p>Describe a fraud pattern in plain English -- the system investigates all data sources and returns matching suspects</p>
      </div>

      <div className="tabs">
        <div className={`tab ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>Search</div>
        <div className={`tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>Saved Scenarios ({scenarios.length})</div>
      </div>

      {activeTab === 'search' && (
        <div>
          {/* Search Input */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea className="form-input" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Describe the fraud pattern you want to detect...&#10;&#10;Examples:&#10;- workers billing between midnight and 5am with sessions over 6 hours&#10;- providers with more than 50 participants but less than 3 workers&#10;- SIL services billed at rates above $90 per hour on weekends"
                style={{ flex: 1, fontSize: 14, padding: '14px 16px', minHeight: 100, resize: 'vertical', lineHeight: 1.5 }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch(query) } }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn primary" onClick={() => runSearch(query)} disabled={searching || !query.trim()}>
                {searching ? 'Investigating...' : 'Investigate Pattern'}
              </button>
              {query && results && (
                <button className="btn" onClick={() => setShowSave(true)}>Save Scenario</button>
              )}
            </div>
          </div>

          {/* Save Modal */}
          {showSave && (
            <div className="modal-overlay" onClick={() => setShowSave(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 420 }}>
                <div className="modal-title">Save Fraud Scenario</div>
                <div className="form-group">
                  <label className="form-label">Scenario Name</label>
                  <input className="form-input" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="e.g. Ghost worker night billing" autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Query</label>
                  <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{query}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" onClick={handleSave} disabled={!saveName}>Save</button>
                  <button className="btn" onClick={() => setShowSave(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Examples */}
          {!results && !searching && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-title">Example Fraud Patterns</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {EXAMPLE_QUERIES.map((eq, i) => (
                  <div key={i} onClick={() => { setQuery(eq); runSearch(eq) }}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
                    {eq}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Searching */}
          {searching && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 16px', width: 32, height: 32 }} />
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Investigating across all data sources...</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Parsing pattern, scanning {(98966).toLocaleString()} claims, matching against 60 providers and 150 workers</div>
            </div>
          )}

          {/* Results */}
          {results && !searching && (
            <div>
              {/* Summary */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-title" style={{ marginBottom: 4 }}>Investigation Results</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{results.total_suspects} suspects found for: "{results.query}"</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Searched at {results.searched_at?.slice(11, 19)}</div>
                </div>
                {results.parsed_params && Object.keys(results.parsed_params).length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(results.parsed_params).map(([k, v]) => (
                      <span key={k} className="alert-tag" style={{ fontSize: 10 }}>
                        {k}: {Array.isArray(v) ? v.join(', ') : String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Suspect List */}
              {results.suspects?.map((s, i) => (
                <div key={i} className="card" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => setExpandedSuspect(expandedSuspect === i ? null : i)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: s.match_score > 60 ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14,
                        color: s.match_score > 60 ? 'var(--accent-red)' : 'var(--accent-orange)', flexShrink: 0 }}>
                        {s.match_score}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{s.entity_name}</div>
                        <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{s.entity_id} -- {s.entity_type}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          {s.reasons.map((r, ri) => (
                            <span key={ri} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(239,68,68,0.06)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.12)' }}>{r}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-blue)' }}>{formatMoney(s.total_amount)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.matched_claims} claims matched</div>
                      {s.risk_score > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: s.risk_score > 0.5 ? 'var(--accent-red)' : 'var(--accent-orange)', marginTop: 4 }}>
                          Risk: {(s.risk_score * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                  </div>

                  {expandedSuspect === i && (
                    <div className="fade-in" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                        {[['Participants', s.participants, 'var(--accent-purple)'], ['Workers', s.workers, 'var(--accent-green)'],
                          ['Alerts', s.alert_count, 'var(--accent-orange)'], ['Match Score', s.match_score, s.match_score > 60 ? 'var(--accent-red)' : 'var(--accent-orange)']
                        ].map(([l, v, c]) => (
                          <div key={l} style={{ padding: '6px 12px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {s.sample_claims?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Sample Matching Claims</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>
                              <th style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Claim</th>
                              <th style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Date</th>
                              <th style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Time</th>
                              <th style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Service</th>
                              <th style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Hours</th>
                              <th style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Rate</th>
                              <th style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Amount</th>
                            </tr></thead>
                            <tbody>
                              {s.sample_claims.map(c => (
                                <tr key={c.id}>
                                  <td style={{ fontSize: 11, padding: '5px 8px', fontFamily: 'monospace', borderBottom: '1px solid var(--border)' }}>{c.id}</td>
                                  <td style={{ fontSize: 11, padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>{c.date}</td>
                                  <td style={{ fontSize: 11, padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>{c.time}</td>
                                  <td style={{ fontSize: 11, padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>{c.service}</td>
                                  <td style={{ fontSize: 11, padding: '5px 8px', fontWeight: 700, borderBottom: '1px solid var(--border)', color: c.hours > 6 ? 'var(--accent-red)' : 'var(--text-primary)' }}>{c.hours}h</td>
                                  <td style={{ fontSize: 11, padding: '5px 8px', borderBottom: '1px solid var(--border)', color: c.rate > 90 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>${c.rate}/h</td>
                                  <td style={{ fontSize: 11, padding: '5px 8px', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>${c.amount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {results.suspects?.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No suspects found matching this pattern. Try broadening your search criteria.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SAVED SCENARIOS TAB */}
      {activeTab === 'saved' && (
        <div>
          {scenarios.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No saved scenarios yet. Run a search and click "Save Scenario" to save it for later.
            </div>
          ) : (
            <div>
              {scenarios.map(sc => (
                <div key={sc.id} className="card" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>{sc.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>{sc.query}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                        Created by {sc.created_by} -- Run {sc.run_count} times
                        {sc.last_run && <> -- Last: {sc.last_run.slice(0, 16)}</>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="btn primary sm" onClick={() => runScenario(sc)}>Run</button>
                      <button className="btn sm danger" onClick={() => deleteScenario(sc.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

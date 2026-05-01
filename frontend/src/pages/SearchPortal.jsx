import { useState, useCallback, useEffect } from 'react'
import { fetchApi, useApi } from '../hooks/useApi'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }
const TYPE_COLORS = { provider: '#3b82f6', participant: '#8b5cf6', worker: '#10b981' }

function formatMoney(n) {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export default function SearchPortal() {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [entityDetail, setEntityDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 15

  // Load initial data — show top providers on page load
  const { data: initialProviders } = useApi('/providers', [])
  const { data: initialParticipants } = useApi('/participants?limit=20', [])

  useEffect(() => {
    if (!results && initialProviders && initialParticipants) {
      const initial = [
        ...(initialProviders || []).slice(0, 15).map(p => ({
          type: 'provider', id: p.id, name: p.name,
          detail: `Services: ${(p.service_types || []).slice(0, 3).join(', ')}`,
          risk_score: p.risk_score || 0, alert_count: p.alert_count || 0,
        })),
        ...(initialParticipants || []).slice(0, 10).map(p => ({
          type: 'participant', id: p.id, name: p.name,
          detail: `NDIS: ${p.ndis_number} | ${p.disability_type} | ${p.support_needs_level}`,
          risk_score: 0, alert_count: 0,
        })),
      ]
      setResults({ results: initial, total: initial.length })
    }
  }, [initialProviders, initialParticipants])

  const doSearch = useCallback(async (q, type) => {
    if (!q || q.length < 2) {
      // Reset to initial
      if (initialProviders) {
        const initial = [
          ...(initialProviders || []).slice(0, 15).map(p => ({
            type: 'provider', id: p.id, name: p.name,
            detail: `Services: ${(p.service_types || []).slice(0, 3).join(', ')}`,
            risk_score: p.risk_score || 0, alert_count: p.alert_count || 0,
          })),
          ...(initialParticipants || []).slice(0, 10).map(p => ({
            type: 'participant', id: p.id, name: p.name,
            detail: `NDIS: ${p.ndis_number} | ${p.disability_type} | ${p.support_needs_level}`,
            risk_score: 0, alert_count: 0,
          })),
        ]
        setResults({ results: initial, total: initial.length })
      }
      return
    }
    setSearching(true)
    const data = await fetchApi(`/search?q=${encodeURIComponent(q)}&entity_type=${type}`)
    setResults(data)
    setSearching(false)
  }, [initialProviders, initialParticipants])

  const handleSearch = (e) => {
    e.preventDefault()
    doSearch(query, typeFilter)
  }

  const handleInputChange = (val) => {
    setQuery(val)
    if (val.length >= 3) doSearch(val, typeFilter)
  }

  const selectEntity = useCallback(async (entity) => {
    setSelectedEntity(entity)
    setLoadingDetail(true)
    try {
      if (entity.type === 'provider') {
        const detail = await fetchApi(`/graph/node/${entity.id}`)
        setEntityDetail(detail)
      } else if (entity.type === 'participant') {
        const detail = await fetchApi(`/investigation/participant/${entity.id}/services`)
        const partData = await fetchApi(`/participants/${entity.id}/comparison`)
        setEntityDetail({ ...detail, comparison: partData })
      } else if (entity.type === 'worker') {
        const detail = await fetchApi(`/graph/node/${entity.id}`)
        setEntityDetail(detail)
      }
    } catch (err) { setEntityDetail(null) }
    setLoadingDetail(false)
  }, [])

  return (
    <div>
      <div className="page-header">
        <h2>Search Portal</h2>
        <p>Search providers, participants, and workers by name, ID, ABN, or NDIS number</p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" value={query} onChange={e => handleInputChange(e.target.value)}
            placeholder="Search by name, ID, ABN, NDIS number..."
            style={{ flex: 1, fontSize: 15, padding: '14px 18px' }} autoFocus />
          <select className="form-input" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); if (query.length >= 3) doSearch(query, e.target.value) }}
            style={{ width: 160, fontSize: 13 }}>
            <option value="all">All Types</option>
            <option value="provider">Providers</option>
            <option value="participant">Participants</option>
            <option value="worker">Workers</option>
          </select>
          <button className="btn primary" type="submit" style={{ padding: '14px 24px' }}>Search</button>
        </div>
      </form>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Results List */}
        <div style={{ flex: 1 }}>
          {searching && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Searching...</div>}

          {results && !searching && (
            <div className="card">
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Results ({results.total})</span>
              </div>
              {results.results?.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No results found</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.results?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(r => (
                  <div key={r.id} onClick={() => selectEntity(r)}
                    style={{
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      background: selectedEntity?.id === r.id ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)',
                      border: `1px solid ${selectedEntity?.id === r.id ? 'var(--accent-blue)' : 'var(--border)'}`,
                      transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 12,
                    }}
                    onMouseEnter={e => { if (selectedEntity?.id !== r.id) e.currentTarget.style.borderColor = 'var(--accent-blue)' }}
                    onMouseLeave={e => { if (selectedEntity?.id !== r.id) e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_COLORS[r.type], flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{r.name}</div>
                        {r.risk_score > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: r.risk_score > 0.5 ? 'var(--accent-red)' : 'var(--accent-orange)' }}>
                            {(r.risk_score * 100).toFixed(0)}% risk
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        <span style={{ fontFamily: 'monospace' }}>{r.id}</span> &middot; {r.detail}
                      </div>
                    </div>
                    {r.alert_count > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-orange)', flexShrink: 0 }}>{r.alert_count} alerts</span>
                    )}
                  </div>
                ))}
              </div>
              {results.results?.length > PAGE_SIZE && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
                  <button className="btn sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Page {page + 1} of {Math.ceil(results.results.length / PAGE_SIZE)}
                  </span>
                  <button className="btn sm" disabled={(page + 1) * PAGE_SIZE >= results.results.length} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedEntity && (
          <div className="card slide-in" style={{ flex: '0 0 420px', maxHeight: 700, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: TYPE_COLORS[selectedEntity.type], marginBottom: 4 }}>
                  {selectedEntity.type}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedEntity.name}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 2 }}>{selectedEntity.id}</div>
              </div>
              <button className="btn sm" onClick={() => { setSelectedEntity(null); setEntityDetail(null) }}>&times;</button>
            </div>

            {loadingDetail ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div> : entityDetail && (
              <div className="fade-in">
                {/* Provider Detail */}
                {selectedEntity.type === 'provider' && entityDetail.node_type === 'provider' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                      {[
                        ['Risk', `${((entityDetail.risk_score || 0) * 100).toFixed(0)}%`, entityDetail.risk_score > 0.5 ? 'var(--accent-red)' : 'var(--accent-green)'],
                        ['Billed', formatMoney(entityDetail.total_billed), 'var(--accent-blue)'],
                        ['Alerts', entityDetail.alert_count || 0, 'var(--accent-orange)'],
                        ['Hours', `${entityDetail.total_hours}h`, 'var(--accent-cyan)'],
                        ['Clients', entityDetail.participant_count, 'var(--accent-purple)'],
                        ['Staff', entityDetail.worker_count, 'var(--accent-green)'],
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c, marginTop: 1 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
                      ABN: {entityDetail.abn} &middot; Since: {entityDetail.registration_date}
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>SERVICES</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(entityDetail.service_types || []).map(s => <span key={s} className="alert-tag">{s}</span>)}
                      </div>
                    </div>
                    {entityDetail.monthly_billing?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>BILLING TREND</div>
                        <ResponsiveContainer width="100%" height={120}>
                          <AreaChart data={entityDetail.monthly_billing}>
                            <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={9} tickFormatter={v => v.slice(5)} />
                            <YAxis stroke="var(--text-muted)" fontSize={9} tickFormatter={v => formatMoney(v)} />
                            <Tooltip contentStyle={tooltipStyle} formatter={v => formatMoney(v)} />
                            <Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="rgba(59,130,246,0.15)" strokeWidth={1.5} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {entityDetail.alerts?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>ALERTS ({entityDetail.alerts.length})</div>
                        {entityDetail.alerts.slice(0, 5).map((a, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                            <div className={`alert-severity ${a.severity}`} style={{ marginTop: 4 }} />
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.title?.slice(0, 55)}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{a.source_engine} &middot; {(a.confidence * 100).toFixed(0)}%</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Participant Detail */}
                {selectedEntity.type === 'participant' && entityDetail.services && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                      {[
                        ['Hours', `${entityDetail.total_hours}h`, 'var(--accent-cyan)'],
                        ['Cost', formatMoney(entityDetail.total_cost), 'var(--accent-blue)'],
                        ['Claims', entityDetail.total_claims, 'var(--text-primary)'],
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c, marginTop: 1 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {entityDetail.comparison?.baseline && (
                      <div style={{ marginBottom: 12, padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>BASELINE</div>
                        <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                          Level: <strong>{entityDetail.comparison.baseline.support_level}</strong> &middot;
                          Expected: <strong>{entityDetail.comparison.baseline.expected_weekly_hours}h/wk</strong> &middot;
                          Budget: <strong>{formatMoney(entityDetail.comparison.baseline.expected_weekly_cost)}/wk</strong>
                        </div>
                      </div>
                    )}
                    {entityDetail.monthly?.length > 1 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>MONTHLY TREND</div>
                        <ResponsiveContainer width="100%" height={120}>
                          <AreaChart data={entityDetail.monthly}>
                            <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={9} tickFormatter={v => v.slice(5)} />
                            <YAxis stroke="var(--text-muted)" fontSize={9} tickFormatter={v => formatMoney(v)} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [n === 'cost' ? formatMoney(v) : v, n]} />
                            <Area type="monotone" dataKey="cost" stroke="#8b5cf6" fill="rgba(139,92,246,0.15)" strokeWidth={1.5} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>SERVICES ({entityDetail.services.length})</div>
                    {entityDetail.services.map(s => (
                      <div key={s.service_type} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <span style={{ fontWeight: 600 }}>{s.service_type}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{s.total_hours}h &middot; {formatMoney(s.total_cost)} &middot; {s.claim_count} claims</span>
                      </div>
                    ))}
                  </>
                )}

                {/* Worker Detail */}
                {selectedEntity.type === 'worker' && entityDetail.node_type === 'worker' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                      {[
                        ['Role', entityDetail.role, 'var(--accent-green)'],
                        ['Hours', `${entityDetail.total_hours}h`, 'var(--accent-blue)'],
                        ['Earned', formatMoney(entityDetail.total_earned), 'var(--accent-cyan)'],
                        ['Clients', entityDetail.participants_served, 'var(--accent-purple)'],
                        ['Max Daily', `${entityDetail.max_daily_hours}h`, entityDetail.max_daily_hours > 16 ? 'var(--accent-red)' : 'var(--text-primary)'],
                        ['Geo Spread', `${entityDetail.geographic_spread_km}km`, entityDetail.geographic_spread_km > 50 ? 'var(--accent-red)' : 'var(--text-primary)'],
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: c, marginTop: 1 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {entityDetail.multi_provider_flag && (
                      <div style={{ padding: 8, background: 'rgba(239,68,68,0.08)', borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--accent-red)', fontWeight: 700 }}>
                        Multi-provider worker — collusion risk
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>PROVIDERS</div>
                    {entityDetail.registered_providers?.map(pid => (
                      <div key={pid} style={{ fontSize: 12, fontFamily: 'monospace', padding: '3px 0', borderBottom: '1px solid var(--border)', color: 'var(--accent-blue)' }}>{pid}</div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

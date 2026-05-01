import { useApi } from '../hooks/useApi'

export default function TimeBudget() {
  const { data: alerts, loading } = useApi('/alerts?limit=150&engine=Time%20Budget', [])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading time budget analysis...</div>

  const allAlerts = alerts?.alerts || []
  const timeImpossibilities = allAlerts.filter(a => a.type === 'worker_time_impossibility')
  const excessiveHours = allAlerts.filter(a => a.type === 'excessive_daily_hours')
  const overservicing = allAlerts.filter(a => a.type === 'participant_overservicing')
  const travelImpossibilities = allAlerts.filter(a => a.type === 'travel_impossibility')

  return (
    <div>
      <div className="page-header">
        <h2>Human Time Budget Constraints</h2>
        <p>Physical impossibility detection — worker overlaps, participant capacity, travel constraints</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Time Impossibilities</div>
          <div className="stat-value critical">{timeImpossibilities.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Excessive Daily Hours</div>
          <div className="stat-value high">{excessiveHours.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Participant Overservicing</div>
          <div className="stat-value warning">{overservicing.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Travel Impossibilities</div>
          <div className="stat-value info">{travelImpossibilities.length}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Worker Time Impossibilities (same worker, 2 places at once)</div>
          <div className="alert-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {timeImpossibilities.slice(0, 20).map((a, i) => (
              <div key={i} className="alert-item">
                <div className={`alert-severity ${a.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize: 12 }}>{a.title}</div>
                  <div className="alert-desc" style={{ fontSize: 11 }}>{a.description}</div>
                  {a.distance_km && (
                    <div style={{ marginTop: 4, fontSize: 11 }}>
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>{a.distance_km} km apart</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {timeImpossibilities.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#5e6275' }}>No time impossibilities detected</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Excessive Daily Hours (workers billing 16h+)</div>
          <div className="alert-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {excessiveHours.slice(0, 20).map((a, i) => (
              <div key={i} className="alert-item">
                <div className={`alert-severity ${a.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize: 12 }}>{a.title}</div>
                  <div className="alert-desc" style={{ fontSize: 11 }}>{a.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Participant Overservicing</div>
          <div className="alert-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {overservicing.slice(0, 20).map((a, i) => (
              <div key={i} className="alert-item">
                <div className={`alert-severity ${a.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize: 12 }}>{a.title}</div>
                  <div className="alert-desc" style={{ fontSize: 11 }}>{a.description}</div>
                  {a.ratio && (
                    <div style={{ marginTop: 4, fontSize: 11 }}>
                      <span style={{ color: '#f97316', fontWeight: 600 }}>{a.ratio}x allocated hours</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Travel Impossibilities</div>
          <div className="alert-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {travelImpossibilities.slice(0, 20).map((a, i) => (
              <div key={i} className="alert-item">
                <div className={`alert-severity ${a.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize: 12 }}>{a.title}</div>
                  <div className="alert-desc" style={{ fontSize: 11 }}>{a.description}</div>
                </div>
              </div>
            ))}
            {travelImpossibilities.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#5e6275' }}>No travel impossibilities detected</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

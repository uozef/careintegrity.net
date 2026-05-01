import { useApi, logout } from '../hooks/useApi'
import { useTheme } from '../App'

const NAV_ITEMS = [
  {
    section: 'Overview',
    items: [
      { id: 'dashboard', icon: '\u2302', label: 'Dashboard' },
      { id: 'alerts', icon: '\u26A0', label: 'Alerts', badge: true },
      { id: 'executive-report', icon: '\u2637', label: 'Executive Report' },
      { id: 'engines', icon: '\u2699', label: 'Detection Engines' },
    ]
  },
  {
    section: 'Intelligence',
    items: [
      { id: 'network', icon: '\u25C8', label: 'Network Graph' },
      { id: 'risk-heatmap', icon: '\u2600', label: 'Risk Heatmap' },
      { id: 'providers', icon: '\u2616', label: 'Providers' },
      { id: 'drift', icon: '\u2197', label: 'Behavioural Drift' },
      { id: 'time-budget', icon: '\u23F0', label: 'Time Budget' },
      { id: 'dna', icon: '\u29BF', label: 'Provider DNA' },
      { id: 'collusion', icon: '\u2687', label: 'Collusion Map' },
      { id: 'invoices', icon: '\u2637', label: 'Invoice Pressure' },
    ]
  },
  {
    section: 'Investigation',
    items: [
      { id: 'fraud-cases', icon: '\u2620', label: 'Fraud Cases' },
      { id: 'investigation', icon: '\u2609', label: 'Provider Explorer' },
      { id: 'search', icon: '\u2315', label: 'Search Portal' },
      { id: 'service-codes', icon: '\u2261', label: 'Service Codes' },
      { id: 'watchlist', icon: '\u2691', label: 'Watchlist' },
      { id: 'tipoffs', icon: '\u2709', label: 'Whistleblower' },
    ]
  },
  {
    section: 'Enforcement',
    items: [
      { id: 'penalties', icon: '\u2696', label: 'Penalties', badgeKey: 'penalties' },
      { id: 'fine-codes', icon: '\u2630', label: 'Fine Codes' },
      { id: 'financial', icon: '\u0024', label: 'Financial Tracker' },
      { id: 'rules', icon: '\u2263', label: 'Rule Engine' },
    ]
  },
  {
    section: 'Administration',
    items: [
      { id: 'users', icon: '\u263A', label: 'User Management' },
      { id: 'compliance', icon: '\u2611', label: 'Compliance' },
      { id: 'system-health', icon: '\u2665', label: 'System Health' },
    ]
  }
]

export default function Sidebar({ activePage, onNavigate }) {
  const { data: dashboard } = useApi('/dashboard', [])
  const { data: user } = useApi('/auth/me', [])
  const { theme, toggleTheme } = useTheme()

  const alertCount = dashboard?.summary?.critical_alerts || 0
  const penaltyCount = dashboard?.financial?.penalties_pending_count || 0

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>CareIntegrity.AI</h1>
        <p>NDIS Fraud Intelligence</p>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(section => (
          <div key={section.section} className="nav-section">
            <div className="nav-section-title">{section.section}</div>
            {section.items.map(item => (
              <div
                key={item.id}
                className={`nav-item ${activePage === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.badge && alertCount > 0 && (
                  <span className="nav-badge">{alertCount}</span>
                )}
                {item.badgeKey === 'penalties' && penaltyCount > 0 && (
                  <span className="nav-badge" style={{ background: 'var(--accent-orange)' }}>{penaltyCount}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {(user?.full_name || 'A')[0]}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{user?.full_name || 'Admin'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user?.role || 'admin'}</div>
          </div>
        </div>
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? '\u2600 Light Mode' : '\u263D Dark Mode'}
        </button>
        <button className="logout-btn" onClick={logout}>Sign Out</button>
      </div>
    </aside>
  )
}

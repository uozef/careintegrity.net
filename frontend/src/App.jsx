import { useState, useEffect, createContext, useContext } from 'react'
import { isLoggedIn } from './hooks/useApi'
import LoginPage from './pages/LoginPage'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import NetworkGraph from './pages/NetworkGraph'
import Providers from './pages/Providers'
import ProviderDetail from './pages/ProviderDetail'
import BehaviouralDrift from './pages/BehaviouralDrift'
import TimeBudget from './pages/TimeBudget'
import ProviderDNA from './pages/ProviderDNA'
import CollusionMap from './pages/CollusionMap'
import InvoicePressure from './pages/InvoicePressure'
import Engines from './pages/Engines'
import FineCodes from './pages/FineCodes'
import Penalties from './pages/Penalties'
import FinancialTracker from './pages/FinancialTracker'
import RuleEngine from './pages/RuleEngine'
import Investigation from './pages/Investigation'
import SearchPortal from './pages/SearchPortal'
import ServiceCodes from './pages/ServiceCodes'
import FraudCases from './pages/FraudCases'
import UserManagement from './pages/UserManagement'
import ExecutiveReport from './pages/ExecutiveReport'
import Watchlist from './pages/Watchlist'
import Compliance from './pages/Compliance'
import Tipoffs from './pages/Tipoffs'
import SystemHealth from './pages/SystemHealth'
import RiskHeatmap from './pages/RiskHeatmap'
import SystemSettings from './pages/SystemSettings'

export const ThemeContext = createContext()

export function useTheme() {
  return useContext(ThemeContext)
}

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [theme, setTheme] = useState(localStorage.getItem('ndis_theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ndis_theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  if (!loggedIn) {
    return (
      <ThemeContext.Provider value={{ theme, toggleTheme }}>
        <LoginPage onLogin={() => setLoggedIn(true)} />
      </ThemeContext.Provider>
    )
  }

  const navigate = (p, data) => {
    if (p === 'provider-detail' && data) setSelectedProvider(data)
    setPage(p)
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard onNavigate={navigate} />
      case 'alerts': return <Alerts />
      case 'network': return <NetworkGraph />
      case 'providers': return <Providers onSelectProvider={(id) => navigate('provider-detail', id)} />
      case 'provider-detail': return <ProviderDetail providerId={selectedProvider} onBack={() => navigate('providers')} />
      case 'drift': return <BehaviouralDrift />
      case 'time-budget': return <TimeBudget />
      case 'dna': return <ProviderDNA />
      case 'collusion': return <CollusionMap />
      case 'invoices': return <InvoicePressure />
      case 'engines': return <Engines />
      case 'fine-codes': return <FineCodes />
      case 'penalties': return <Penalties />
      case 'financial': return <FinancialTracker />
      case 'rules': return <RuleEngine />
      case 'investigation': return <Investigation />
      case 'search': return <SearchPortal />
      case 'service-codes': return <ServiceCodes />
      case 'fraud-cases': return <FraudCases />
      case 'users': return <UserManagement />
      case 'executive-report': return <ExecutiveReport />
      case 'watchlist': return <Watchlist />
      case 'compliance': return <Compliance />
      case 'tipoffs': return <Tipoffs />
      case 'system-health': return <SystemHealth />
      case 'risk-heatmap': return <RiskHeatmap />
      case 'settings': return <SystemSettings />
      default: return <Dashboard onNavigate={navigate} />
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className="app">
        <Sidebar activePage={page} onNavigate={navigate} />
        <main className="main-content">
          <div className="fade-in" key={page}>
            {renderPage()}
          </div>
        </main>
      </div>
    </ThemeContext.Provider>
  )
}

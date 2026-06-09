import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AppProvider } from './context/AppContext'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import LiveCharts from './pages/LiveCharts'
import Indicators from './pages/Indicators'
import Signals from './pages/Signals'
import AIPredictions from './pages/AIPredictions'
import Sentiment from './pages/Sentiment'
import WatchlistPage from './pages/WatchlistPage'
import OptionsSignals from './pages/OptionsSignals'

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgba(22, 25, 42, 0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              backdropFilter: 'blur(20px)',
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#00d4a1', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ff4d6d', secondary: '#fff' } },
          }}
        />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/charts" element={<LiveCharts />} />
            <Route path="/indicators" element={<Indicators />} />
            <Route path="/signals" element={<Signals />} />
            <Route path="/options" element={<OptionsSignals />} />
            <Route path="/ai" element={<AIPredictions />} />
            <Route path="/sentiment" element={<Sentiment />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  )
}

export default App

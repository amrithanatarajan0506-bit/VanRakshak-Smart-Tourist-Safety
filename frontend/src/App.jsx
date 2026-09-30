import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import useAuthStore from './store/authStore'
import Login from './pages/tourist/Login'
import TouristHome from './pages/tourist/TouristHome'
import LiveSafetyMap from './pages/tourist/LiveSafetyMap'
import TouristSOS from './pages/tourist/TouristSOS'
import ControlRoom from './pages/control_room/ControlRoom'
import RangerTerminal from './pages/ranger/RangerTerminal'
import ScenarioRunner from './pages/scenario/ScenarioRunner'
import { LanguageProvider } from './lib/language'

/** Route guard — redirects to login if unauthenticated or unauthorized */
function PrivateRoute({ children, allowedRoles }) {
  const { isAuthenticated, role, token } = useAuthStore()

  if (!isAuthenticated && !token) {
    return <Navigate to="/signin" replace />
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return (
      <div className="min-h-screen flex items-center justify-center forest-bg px-4">
        <div className="bg-surface hairline-border rounded p-8 text-center max-w-md shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-full bg-error/10 text-error mx-auto flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">lock</span>
          </div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Access Restricted</h2>
          <p className="font-body-md text-on-surface-variant text-sm">
            Current role (<span className="font-data-mono text-tertiary font-bold uppercase">{role}</span>) is not authorized for this specific console.
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <a href="/home" className="btn-primary text-xs">GO TO HOME</a>
            <a href="/map" className="btn-ghost text-xs">OPEN MAP</a>
          </div>
        </div>
      </div>
    )
  }

  return children
}

export default function App() {
  const { fetchMe, token } = useAuthStore()

  useEffect(() => {
    if (token) fetchMe()
  }, [])

  return (
    <BrowserRouter>
      <LanguageProvider>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/signin" element={<Login />} />
        <Route path="/register" element={<Navigate to="/signin" replace />} />

        {/* Live Safety Map — Accessible to all authorized roles */}
        <Route path="/map" element={<LiveSafetyMap />} />

        {/* Public tourist browsing; emergency submission remains authenticated. */}
        <Route path="/home" element={<TouristHome />} />
        <Route path="/sos" element={
          <PrivateRoute allowedRoles={['tourist', 'rescue_team', 'control_room']}>
            <TouristSOS />
          </PrivateRoute>
        } />

        {/* Control Room Console */}
        <Route path="/control-room" element={
          <PrivateRoute allowedRoles={['control_room']}>
            <ControlRoom />
          </PrivateRoute>
        } />

        {/* Ranger Terminal */}
        <Route path="/ranger" element={
          <PrivateRoute allowedRoles={['rescue_team']}>
            <RangerTerminal />
          </PrivateRoute>
        } />

        {/* Scenario Runner — open demo suite */}
        <Route path="/scenario" element={<ScenarioRunner />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      </LanguageProvider>
    </BrowserRouter>
  )
}

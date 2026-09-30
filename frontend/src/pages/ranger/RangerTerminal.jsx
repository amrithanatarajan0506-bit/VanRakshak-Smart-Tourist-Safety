import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import useAuthStore from '../../store/authStore'
import SignedInTourists from '../../components/SignedInTourists'
import { parseServerDate, formatISTDateTime } from '../../lib/istTime'
import { API_BASE } from '../../lib/api'
import CallTouristAction from '../../components/CallTouristAction'

const API = API_BASE

function StatCard({ label, value, icon, color = 'text-tertiary', sub }) {
  return (
    <div className="bg-surface hairline-border rounded p-md space-y-xs shadow-sm">
      <div className="flex justify-between items-start">
        <div className="font-label-caps text-label-caps text-outline text-[10px]">{label}</div>
        <span className={`material-symbols-outlined text-sm ${color}`}>{icon}</span>
      </div>
      <div className={`font-data-mono text-data-mono text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="font-data-mono text-data-mono text-on-surface-variant text-xs">{sub}</div>}
    </div>
  )
}

function EmergencyDistressCard({ inc, onAcknowledge, isAcknowledging }) {
  const isSOS = inc.incident_type === 'EMERGENCY_SOS' || inc.incident_type === 'SOS' || inc.type === 'SOS' || inc.type === 'EMERGENCY_SOS'
  const isRestricted = inc.incident_type === 'RESTRICTED_ZONE_BREACH' || inc.type === 'RESTRICTED_ZONE_BREACH'

  const title = isSOS
    ? '🚨 CRITICAL SOS BEACON: TOURIST DISTRESS SIGNAL'
    : isRestricted
      ? '🚫 CRITICAL 250M RESTRICTED GEOFENCE BREACH: TOURIST IN PROTECTED ZONE'
      : '🚨 CRITICAL GEOFENCE BREACH: TOURIST IN DANGER ZONE'

  const hasLocation = inc.lat != null && inc.lng != null
  const locationParams = hasLocation ? `&lat=${inc.lat}&lng=${inc.lng}` : ''
  const mapUrl = `/map?incident_id=${inc.id || ''}${locationParams}&name=${encodeURIComponent(inc.tourist_name || '')}&phone=${encodeURIComponent(inc.tourist_phone || '')}&type=${encodeURIComponent(inc.incident_type || 'RESTRICTED_BREACH')}&ist=${encodeURIComponent(inc.created_at_ist || '')}`

  return (
    <div className={`border-2 rounded-lg p-4 relative overflow-hidden shadow-md animate-pulse space-y-3 ${
      isRestricted ? 'bg-purple-950/5 border-purple-600/80' : 'bg-error/5 border-error/70'
    }`}>
      <div className={`flex items-center justify-between border-b pb-2 ${isRestricted ? 'border-purple-200' : 'border-error/20'}`}>
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full animate-ping ${isRestricted ? 'bg-purple-600' : 'bg-error'}`} />
          <span className={`font-headline-sm text-sm font-bold uppercase tracking-wide ${isRestricted ? 'text-purple-800' : 'text-error'}`}>
            {title}
          </span>
        </div>
        <span className={`font-label-caps text-[10px] text-white px-2 py-0.5 rounded font-bold ${isRestricted ? 'bg-purple-700' : 'bg-error'}`}>
          {inc.status === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : 'IMMEDIATE RESPONSE'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-surface hairline-border rounded p-3 text-xs font-data-mono">
        <div>
          <span className="text-outline text-[10px] block">TOURIST NAME</span>
          <strong className="text-on-surface text-sm">{inc.tourist_name || '—'}</strong>
        </div>
        <div>
          <span className="text-outline text-[10px] block">PHONE NUMBER</span>
          {inc.tourist_phone && inc.tourist_phone !== 'Not provided'
            ? <span className="text-on-surface">{inc.tourist_phone}</span>
            : <span className="text-outline">Phone unavailable</span>}
        </div>
        <div>
          <span className="text-outline text-[10px] block">GPS COORDINATES</span>
          <span className="text-on-surface font-bold text-primary">
            {hasLocation ? `${Number(inc.lat).toFixed(5)}°N, ${Number(inc.lng).toFixed(5)}°E` : 'GPS location unavailable'}
          </span>
        </div>
        <div>
          <span className="text-outline text-[10px] block">RECORDED IST TIME</span>
          <span className="text-secondary font-bold">
            {inc.created_at_ist || (inc.created_at ? formatISTDateTime(parseServerDate(inc.created_at)) : '—')}
          </span>
        </div>
      </div>

      {inc.notes && (
        <div className="text-xs font-body-md text-on-surface bg-surface-container-low p-2.5 rounded hairline-border font-data-mono">
          {inc.notes}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
        <div className="font-data-mono text-xs text-secondary flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">shield</span>
          Dispatched Unit: <strong>{inc.assigned_unit || 'Ranger assignment pending'}</strong> {inc.eta_minutes != null ? `(ETA: ~${inc.eta_minutes} min)` : ''}
        </div>
        <div className="flex gap-2">
          {(inc.status === 'TEAM_ASSIGNED' || inc.status === 'DETECTED') && (
            <button
              type="button"
              onClick={() => onAcknowledge(inc)}
              disabled={isAcknowledging}
              className="btn-primary text-xs flex items-center gap-1 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-sm">{isAcknowledging ? 'progress_activity' : 'check_circle'}</span>
              {isAcknowledging ? 'ACKNOWLEDGING…' : 'ACKNOWLEDGE SOS'}
            </button>
          )}
          {inc.status === 'ACKNOWLEDGED' && (
            <span className="font-label-caps text-[10px] text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">check_circle</span> ACKNOWLEDGED
            </span>
          )}
          <CallTouristAction phone={inc.tourist_phone} />
          <Link
            to={mapUrl}
            className={`btn-primary text-xs flex items-center gap-1 shadow-md ${
              isRestricted ? 'bg-purple-700 hover:bg-purple-800' : 'bg-error hover:bg-error/90'
            }`}
          >
            <span className="material-symbols-outlined text-sm">near_me</span>
            TRACK TOURIST ON LIVE MAP
          </Link>
        </div>
      </div>
    </div>
  )
}

function IncidentRow({ inc, onAcknowledge, acknowledgingId }) {
  const isEmergency = inc.incident_type === 'EMERGENCY_SOS' || inc.incident_type === 'SOS' || inc.incident_type === 'RESTRICTED_ZONE_BREACH' || inc.incident_type === 'ENDANGERED_ZONE_BREACH' || inc.severity === 'critical'
  if (isEmergency) {
    return <EmergencyDistressCard
      inc={inc}
      onAcknowledge={onAcknowledge}
      isAcknowledging={acknowledgingId === inc.id}
    />
  }

  const hasLocation = inc.lat != null && inc.lng != null
  const locationParams = hasLocation ? `&lat=${inc.lat}&lng=${inc.lng}` : ''
  const mapUrl = `/map?incident_id=${inc.id || ''}${locationParams}&name=${encodeURIComponent(inc.tourist_name || 'Tourist')}&phone=${encodeURIComponent(inc.tourist_phone || '')}&type=${encodeURIComponent(inc.incident_type || 'INCIDENT')}&ist=${encodeURIComponent(inc.created_at_ist || '')}`
  const hasTouristPhone = Boolean(inc.tourist_phone && inc.tourist_phone !== 'Not provided')

  const sev = inc.severity || 'medium'
  const sevColor = sev === 'high' ? 'text-primary chip-warn' : 'chip-safe text-secondary'
  const barColor = sev === 'high' ? 'bg-primary' : 'bg-secondary'

  return (
    <div className="bg-surface hairline-border rounded p-md flex items-start gap-md relative overflow-hidden hover:bg-surface-container-low transition-colors">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${barColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-sm mb-xs">
          <span className={`font-label-caps text-[10px] px-sm py-unit rounded ${sevColor}`}>
            {sev.toUpperCase()}
          </span>
          <span className="font-data-mono text-data-mono text-outline text-xs">
            {inc.incident_type || inc.type || 'INCIDENT'}
          </span>
        </div>
        <p className="font-body-md text-body-md text-on-surface text-sm truncate">{inc.notes || inc.message || 'No description provided.'}</p>
        <div className="flex flex-wrap gap-md mt-xs">
          {inc.lat && (
            <span className="font-data-mono text-data-mono text-primary font-bold text-xs flex items-center gap-xs">
              <span className="material-symbols-outlined text-xs">my_location</span>
              {Number(inc.lat).toFixed(4)}°, {Number(inc.lng).toFixed(4)}°
            </span>
          )}
          <span className="font-data-mono text-data-mono text-secondary text-xs">
            {inc.created_at_ist || (inc.created_at ? formatISTDateTime(parseServerDate(inc.created_at)) : '—')}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-xs">
        {hasTouristPhone && <CallTouristAction phone={inc.tourist_phone} />}
        <Link to={mapUrl} className="btn-primary text-xs flex items-center gap-1">
          <span className="material-symbols-outlined text-xs">near_me</span>
          TRACK MAP
        </Link>
      </div>
    </div>
  )
}

function RangerRow({ ranger }) {
  const isOnline = ranger.status === 'active' || ranger.status === 'online'
  return (
    <div className="flex items-center gap-md p-sm hairline-border-b last:border-0">
      <div className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-secondary animate-pulse' : 'bg-outline'}`} />
      <div className="flex-1 min-w-0">
        <div className="font-body-md text-body-md text-on-surface text-sm truncate">{ranger.name}</div>
        <div className="font-data-mono text-data-mono text-on-surface-variant text-xs">{ranger.unit_type?.toUpperCase() || 'RANGER'} · {ranger.unit_id}</div>
      </div>
      <span className={`font-label-caps text-[10px] px-sm py-unit rounded ${isOnline ? 'chip-safe' : 'chip-warn'}`}>
        {isOnline ? 'ACTIVE ON PATROL' : 'STANDBY'}
      </span>
    </div>
  )
}

export default function RangerTerminal() {
  const { token, user, logout } = useAuthStore()
  const navigate = useNavigate()

  const [incidents, setIncidents] = useState([])
  const [rangers,   setRangers]   = useState([])
  const [advisories,setAdvisories]= useState([])
  const [weather,   setWeather]   = useState([])
  const [acknowledgingId, setAcknowledgingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('incidents')

  const headers = token ? { Authorization: `Bearer ${token}` } : {}

  const fetchAll = useCallback(async () => {
    try {
      const [iRes, rRes, aRes, wRes] = await Promise.allSettled([
        axios.get(`${API}/incidents`,    { headers }),
        axios.get(`${API}/rangers`,      { headers }),
        axios.get(`${API}/advisories`,   { headers }),
        axios.get(`${API}/weather`,      { headers }),
      ])
      if (iRes.status === 'fulfilled') setIncidents(iRes.value.data || [])
      if (rRes.status === 'fulfilled') setRangers(rRes.value.data || [])
      if (aRes.status === 'fulfilled') setAdvisories(aRes.value.data || [])
      if (wRes.status === 'fulfilled') setWeather(wRes.value.data?.slice(0,3) || [])
    } catch (_) {}
    setLoading(false)
  }, [token])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (user?.role !== 'rescue_team' || !navigator.geolocation) return undefined
    const rangerId = localStorage.getItem('vr_ranger_id')
    if (!rangerId) return undefined

    const watchId = navigator.geolocation.watchPosition(position => {
      axios.patch(`${API}/rangers/${rangerId}/location`, {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy_m: position.coords.accuracy,
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    }, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [token, user?.role])

  /* Fast polling every 3s so SOS / 250m Geofence alerts pop up instantly */
  useEffect(() => {
    const id = setInterval(fetchAll, 3000)
    return () => clearInterval(id)
  }, [fetchAll])

  const handleAcknowledge = async (incident) => {
    setActionError('')
    setAcknowledgingId(incident.id)
    try {
      await axios.patch(`${API}/incidents/${incident.id}/status`, {
        new_status: 'ACKNOWLEDGED',
        notes: 'Acknowledged by ranger',
      }, { headers })
      await fetchAll()
    } catch (err) {
      setActionError(err?.response?.data?.detail || 'Could not acknowledge this incident. Retry.')
    } finally {
      setAcknowledgingId(null)
    }
  }

  const handleLogout = () => { logout(); navigate('/signin') }

  const critical = incidents.filter(i => i.severity === 'critical' || i.incident_type === 'EMERGENCY_SOS' || i.incident_type === 'RESTRICTED_ZONE_BREACH' || i.incident_type === 'ENDANGERED_ZONE_BREACH').length
  const activeRangers = rangers.filter(r => r.status === 'active' || r.status === 'online').length

  return (
    <div className="min-h-screen font-body-md text-on-surface antialiased bg-surface forest-bg pb-4">

      {/* Header */}
      <header className="sticky top-0 z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 bg-surface/90 backdrop-blur border-b border-outline/15">
        <div className="flex items-center gap-md">
          <span className="material-symbols-outlined text-secondary text-xl" style={{ fontVariationSettings: '"FILL" 1' }}>shield_person</span>
          <div>
            <h1 className="font-headline-sm text-headline-sm text-on-surface leading-none">RANGER STATION TERMINAL</h1>
            <div className="font-data-mono text-data-mono text-secondary text-[10px] flex items-center gap-xs mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse inline-block" /> LIVE AUTO-DISPATCH MONITOR (IST SYNCED)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-gutter">
          <span className="font-data-mono text-data-mono text-tertiary text-xs hidden md:block">
            STATION OPERATOR: {user?.full_name?.toUpperCase() || user?.email?.toUpperCase() || 'RANGER-01'}
          </span>
          <button onClick={fetchAll} className="btn-ghost text-xs">
            <span className="material-symbols-outlined text-sm">refresh</span>
            <span className="hidden md:inline">REFRESH</span>
          </button>
          <button onClick={handleLogout} className="btn-ghost text-xs">
            <span className="material-symbols-outlined text-sm">logout</span>
          </button>
        </div>
      </header>

      <div className="px-margin-mobile md:px-margin-desktop py-lg max-w-7xl mx-auto space-y-lg">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
          <StatCard label="OPEN INCIDENTS" value={incidents.length} icon="report" color="text-error" sub="total registered" />
          <StatCard label="CRITICAL ALERTS" value={critical} icon="emergency" color="text-error" sub="immediate dispatch" />
          <StatCard label="ACTIVE RANGERS" value={activeRangers || 3} icon="shield_person" color="text-secondary" sub={`of ${rangers.length || 3} on duty`} />
          <StatCard label="ADVISORIES"     value={advisories.length} icon="warning" color="text-primary" sub="active geofences" />
        </div>

        {/* Weather strip */}
        {weather.length > 0 && (
          <div className="bg-surface hairline-border rounded p-sm flex flex-wrap gap-lg">
            {weather.map((w, i) => (
              <div key={i} className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-sm text-tertiary">cloud</span>
                <span className="font-data-mono text-data-mono text-on-surface-variant text-xs">
                  {w.city || w.location} <strong className="text-on-surface">{w.temp || w.temperature}°C</strong> {w.condition || w.description}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex hairline-border-b">
          {[
            { key: 'incidents', label: 'INCIDENTS, SOS & 250M RESTRICTED BREACHES', icon: 'report', count: incidents.length },
            { key: 'rangers',   label: 'STATION RANGERS',                          icon: 'shield_person', count: rangers.length },
            { key: 'advisories',label: 'ACTIVE NOTICES',                           icon: 'warning',       count: advisories.length },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-xs px-md py-sm font-label-caps text-label-caps transition-colors border-b-2 ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{t.icon}</span>
              {t.label}
              {t.count > 0 && (
                <span className={`ml-xs text-[10px] px-xs py-unit rounded-full ${tab === t.key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-xl text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl animate-spin text-outline">progress_activity</span>
            <p className="font-data-mono text-data-mono mt-md">SYNCING WITH RANGER REPEATERS…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
            {/* Main panel */}
            <div className="md:col-span-2 space-y-sm">
              {actionError && (
                <div className="bg-error/10 text-error hairline-border border-error/30 rounded p-sm text-sm" role="alert">
                  {actionError}
                </div>
              )}
              {tab === 'incidents' && (
                incidents.length ? (
                  incidents.map(i => (
                    <IncidentRow key={i.id} inc={i} onAcknowledge={handleAcknowledge} acknowledgingId={acknowledgingId} />
                  ))
                ) : (
                  <div className="text-center py-xl bg-surface hairline-border rounded space-y-2">
                    <span className="material-symbols-outlined text-4xl text-secondary">check_circle</span>
                    <p className="font-data-mono text-data-mono text-on-surface-variant">ALL PATROL SECTORS CLEAR</p>
                    <p className="font-body-md text-xs text-outline">No active SOS distress signals or 250m restricted zone breaches.</p>
                  </div>
                )
              )}
              {tab === 'rangers' && (
                <div className="bg-surface hairline-border rounded p-md space-y-xs shadow-sm">
                  {rangers.length ? rangers.map(r => <RangerRow key={r.id} ranger={r} />) : (
                    <div className="space-y-xs">
                      <RangerRow ranger={{ id: 'R1', name: 'Arjun Singh', unit_id: 'RANGER-01', unit_type: 'ranger', status: 'active' }} />
                      <RangerRow ranger={{ id: 'R2', name: 'Priya Sharma', unit_id: 'RANGER-02', unit_type: 'ranger', status: 'active' }} />
                      <RangerRow ranger={{ id: 'R3', name: 'Dr. Kiran Rao', unit_id: 'MED-01', unit_type: 'medic', status: 'active' }} />
                    </div>
                  )}
                </div>
              )}
              {tab === 'advisories' && (
                <div className="space-y-sm">
                  {advisories.map(a => (
                    <div key={a.id} className="bg-surface hairline-border rounded p-md relative overflow-hidden">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.severity === 'critical' ? 'bg-error' : a.severity === 'warning' ? 'bg-primary' : 'bg-secondary'}`} />
                      <div className="flex flex-wrap items-start justify-between gap-sm mb-xs">
                        <h4 className="font-headline-sm text-headline-sm text-on-surface text-sm">{a.title}</h4>
                        <span className={`font-label-caps text-[10px] px-sm py-unit rounded ${a.severity === 'critical' ? 'chip-danger' : 'chip-warn'}`}>
                          {(a.severity || 'info').toUpperCase()}
                        </span>
                      </div>
                      <p className="font-body-md text-body-md text-on-surface-variant text-sm">{a.body}</p>
                      <div className="font-data-mono text-data-mono text-outline text-xs mt-sm">
                        {a.region?.toUpperCase()} · {a.category?.replace('_', ' ').toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: quick actions */}
            <div className="space-y-md">
              <SignedInTourists />

              <div className="bg-surface hairline-border rounded p-md shadow-sm">
                <div className="font-label-caps text-label-caps text-tertiary hairline-border-b pb-sm mb-md">QUICK ACTIONS</div>
                <div className="space-y-sm">
                  <button onClick={fetchAll} className="flex items-center gap-sm p-sm rounded hover:bg-surface-container transition-colors w-full text-left">
                    <span className="material-symbols-outlined text-tertiary">refresh</span>
                    <span className="font-body-md text-body-md text-on-surface text-sm">Sync Field Log</span>
                  </button>
                </div>
              </div>

              {/* Station telemetry */}
              <div className="bg-surface hairline-border rounded p-md shadow-sm">
                <div className="font-label-caps text-label-caps text-tertiary hairline-border-b pb-sm mb-md">STATION TELEMETRY</div>
                <div className="space-y-sm">
                  <div className="flex justify-between font-data-mono text-data-mono text-xs">
                    <span className="text-outline">LORA GATEWAY</span>
                    <span className="text-secondary font-bold">● ONLINE (868MHz)</span>
                  </div>
                  <div className="flex justify-between font-data-mono text-data-mono text-xs">
                    <span className="text-outline">TIME SYNCHRONIZATION</span>
                    <span className="text-secondary font-bold">● IST (UTC+05:30)</span>
                  </div>
                  <div className="flex justify-between font-data-mono text-data-mono text-xs">
                    <span className="text-outline">RESTRICTED RADAR</span>
                    <span className="text-purple-700 font-bold">ARMED (250m)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

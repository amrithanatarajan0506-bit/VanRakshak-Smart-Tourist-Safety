import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../lib/api'
import { enqueueSOS, getPendingSOSCount, syncQueuedSOS } from '../../lib/offlineSosQueue'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { useLanguage } from '../../lib/languageContext'

const readDeviceLocation = () => new Promise(resolve => {
  if (!navigator.geolocation) {
    resolve(null)
    return
  }
  navigator.geolocation.getCurrentPosition(
    pos => resolve({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestampMs: pos.timestamp,
    }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
  )
})

function EmergencyHelplines() {
  const { t } = useLanguage()
  const helplines = [
    { label: t('sos.nationalHelpline'), number: '112', style: 'text-error' },
    { label: t('sos.touristHelpline'), number: '1363', style: 'text-primary' },
    { label: t('sos.tamilHelpline'), number: '1800-425-4409', style: 'text-secondary' },
  ]

  return (
    <section className="bg-surface-container hairline-border rounded p-md" aria-label={t('sos.helplines')}>
      <h2 className="font-label-caps text-label-caps text-tertiary mb-sm font-bold">{t('sos.helplines')}</h2>
      <ul className="space-y-xs font-data-mono text-data-mono text-on-surface-variant text-xs">
        {helplines.map(helpline => (
          <li key={helpline.number} className="flex items-center gap-sm">
            <span className={`material-symbols-outlined text-sm ${helpline.style}`}>call</span>
            <span className="flex-1">{helpline.label}</span>
            <a className={`font-bold ${helpline.style}`} href={`tel:${helpline.number.replaceAll('-', '')}`}>
              {helpline.number}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

const SAFETY_GUIDANCE = {
  en: {
    title: 'Emergency guidance',
    items: [
      'Move to a safe, visible place if you can do so safely.',
      'Send SOS and share your GPS location with responders.',
      'Save phone battery and give responders a nearby landmark.',
    ],
  },
  ta: {
    title: 'அவசரகால வழிகாட்டுதல்',
    items: [
      'பாதுகாப்பாகச் செல்ல முடிந்தால், பாதுகாப்பான மற்றும் தெளிவாகத் தெரியும் இடத்திற்குச் செல்லுங்கள்.',
      'SOS அனுப்பி, உங்கள் GPS இருப்பிடத்தை மீட்புக் குழுவுடன் பகிருங்கள்.',
      'தொலைபேசி மின்கலத்தைச் சேமித்து, அருகிலுள்ள அடையாள இடத்தைத் தெரிவியுங்கள்.',
    ],
  },
  hi: {
    title: 'आपातकालीन सहायता',
    items: [
      'यदि सुरक्षित हो, तो किसी सुरक्षित और दिखाई देने वाली जगह पर जाएँ।',
      'SOS भेजें और अपना GPS स्थान बचाव दल के साथ साझा करें।',
      'फोन की बैटरी बचाएँ और पास का कोई पहचानने योग्य स्थान बताएँ।',
    ],
  },
}

export default function TouristSOS() {
  const { language, t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const voiceDispatchStartedRef = useRef(false)
  const [location, setLocation]   = useState(null)
  const [locError, setLocError]   = useState('')
  const [sosSent,  setSosSent]    = useState(false)
  const [loading,  setLoading]    = useState(false)
  const [error,    setError]      = useState('')
  const [form,     setForm]       = useState({ message: '', type: 'SOS' })
  const [sosResult, setSosResult] = useState(null)
  const [offlineQueued, setOfflineQueued] = useState(false)
  const [queuedSOSId, setQueuedSOSId] = useState(null)
  const [pendingQueueCount, setPendingQueueCount] = useState(0)
  const [elapsed,  setElapsed]    = useState(0)

  const syncOfflineQueue = useCallback(async () => {
    const result = await syncQueuedSOS()
    setPendingQueueCount(result.pendingCount)
    const deliveredSOS = result.sentItems.find(item => item.queueId === queuedSOSId)
    if (deliveredSOS) {
      const { data } = deliveredSOS
      setSosResult({
        id: data.id,
        status: data.status,
        timestamp_ist: data.created_at_ist,
        tourist: data.tourist,
        assignedRanger: data.assigned_ranger_station,
      })
      setQueuedSOSId(null)
      setOfflineQueued(false)
    }
  }, [queuedSOSId])

  useEffect(() => {
    getPendingSOSCount().then(setPendingQueueCount).catch(() => {})
    const handleOnline = () => syncOfflineQueue().catch(() => {})
    window.addEventListener('online', handleOnline)
    if (navigator.onLine) handleOnline()
    return () => window.removeEventListener('online', handleOnline)
  }, [syncOfflineQueue])

  /* Get GPS location */
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError('GPS sensor not available on this device.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestampMs: pos.timestamp,
        })
        setLocError('')
      },
      error => {
        const messages = {
          1: 'Location permission is blocked. Allow location access for this site, then refresh.',
          2: 'Device location is unavailable. Turn on Windows Location Services and retry.',
          3: 'Location request timed out. Check device location settings and refresh.',
        }
        setLocError(messages[error.code] || 'Could not get device location. Check location settings and refresh.')
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }, [])

  /* Elapsed timer after SOS is sent */
  useEffect(() => {
    if (!sosSent) return
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [sosSent])

  useEffect(() => {
    if (!sosSent || offlineQueued || !sosResult?.id) return undefined
    const refreshIncident = async () => {
      try {
        const { data } = await api.get(`/incidents/${sosResult.id}`)
        setSosResult(previous => ({ ...previous, status: data.status }))
      } catch (_) {}
    }
    refreshIncident()
    const id = setInterval(refreshIncident, 10000)
    return () => clearInterval(id)
  }, [offlineQueued, sosResult?.id, sosSent])

  const formatElapsed = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const handleSOS = useCallback(async () => {
    setError('')
    setLoading(true)

    const currentLocation = location && Date.now() - location.timestampMs < 30000
      ? location
      : await readDeviceLocation()
    setLocation(currentLocation)

    const message = form.message.trim() || undefined
    const payload = {
      incident_type: form.type || 'EMERGENCY_SOS',
      type: form.type || 'EMERGENCY_SOS',
      severity: 'critical',
      notes: message,
      message,
      lat: currentLocation?.lat ?? null,
      lng: currentLocation?.lng ?? null,
    }

    try {
      if (!navigator.onLine) {
        const localId = await enqueueSOS(payload)
        setQueuedSOSId(localId)
        setPendingQueueCount(await getPendingSOSCount())
        setSosResult({ status: 'QUEUED_OFFLINE' })
        setOfflineQueued(true)
        setSosSent(true)
        return
      }

      const { data } = await api.post('/incidents', payload)
      setSosResult({
        id: data.id,
        status: data.status,
        timestamp_ist: data.created_at_ist,
        tourist: data.tourist,
        assignedRanger: data.assigned_ranger_station,
      })
      setOfflineQueued(false)
      setSosSent(true)
    } catch (err) {
      if (!err.response) {
        try {
          const localId = await enqueueSOS(payload)
          setQueuedSOSId(localId)
          setPendingQueueCount(await getPendingSOSCount())
          setSosResult({ status: 'QUEUED_OFFLINE' })
          setOfflineQueued(true)
          setSosSent(true)
        } catch {
          setError('Network unavailable and this device could not save the SOS. Call an emergency number below.')
        }
      } else {
        setError(err.response.data?.detail || 'SOS could not be sent to the Ranger Station. Retry or call an emergency number below.')
      }
    } finally {
      setLoading(false)
    }
  }, [form.message, form.type, location])

  useEffect(() => {
    if (searchParams.get('voiceConfirm') !== '1' || voiceDispatchStartedRef.current) return
    voiceDispatchStartedRef.current = true
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('voiceConfirm')
    setSearchParams(nextParams, { replace: true })
    handleSOS()
  }, [handleSOS, searchParams, setSearchParams])

  const INCIDENT_TYPES = [
    { value: 'SOS',      label: 'EMERGENCY SOS',   icon: 'sos',         color: 'text-error'   },
    { value: 'MEDICAL',  label: 'MEDICAL CRISIS',  icon: 'local_hospital', color: 'text-primary' },
    { value: 'LOST',     label: 'LOST / STRANDED', icon: 'wrong_location', color: 'text-primary' },
    { value: 'WILDLIFE', label: 'WILDLIFE THREAT', icon: 'pets',        color: 'text-error'   },
    { value: 'LANDSLIDE',label: 'LANDSLIDE / FIRE',icon: 'local_fire_department', color: 'text-error' },
    { value: 'OTHER',    label: 'OTHER HAZARD',    icon: 'report',      color: 'text-outline' },
  ]

  return (
    <div className="min-h-screen forest-bg font-body-md pb-20 md:pb-0">

      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 bg-surface/90 backdrop-blur border-b border-outline/15">
        <div className="flex items-center gap-md">
          <Link to="/home" className="flex items-center gap-xs text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-sm">arrow_back</span>
          </Link>
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-error text-xl" style={{ fontVariationSettings: '"FILL" 1' }}>sos</span>
            <h1 className="font-headline-sm text-headline-sm text-error font-bold tracking-tight">{t('sos.title')}</h1>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="min-h-screen px-margin-mobile md:px-margin-desktop max-w-2xl mx-auto pt-24 pb-xl">

        <EmergencyHelplines />

        <section className="mt-md bg-surface hairline-border rounded p-md" aria-label="Multilingual emergency guidance">
          <div className="flex flex-wrap items-center justify-between gap-sm mb-sm">
            <h2 className="font-label-caps text-label-caps text-tertiary font-bold">{t('sos.guidance')}</h2>
          </div>
          <ul className="space-y-xs list-disc list-inside font-body-md text-sm text-on-surface-variant">
            {SAFETY_GUIDANCE[language].items.map(item => <li key={item}>{item}</li>)}
          </ul>
        </section>

        {sosSent ? (
          /* ── SOS Sent / Confirmed State ── */
          <div className="space-y-lg text-center animate-fadeIn">
            <div className="relative inline-flex items-center justify-center">
              <div className="w-32 h-32 rounded-full bg-error/10 flex items-center justify-center border-2 border-error animate-pulse shadow-lg">
                <span className="material-symbols-outlined text-6xl text-error" style={{ fontVariationSettings: '"FILL" 1' }}>sos</span>
              </div>
            </div>
            <div>
              <h2 className="font-headline-md text-headline-md text-error font-bold leading-tight">
                {offlineQueued ? 'SOS SAVED ON THIS DEVICE' : 'SOS SIGNAL TRANSMITTED'}
              </h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
                {offlineQueued
                  ? `No network is available. Your SOS is stored on this device and will retry when connectivity returns. Pending: ${pendingQueueCount}. Call a helpline below now if you need immediate help.`
                  : 'Your SOS alert has been sent to the Ranger Station.'}
              </p>
            </div>

            {/* Incident Telemetry Card */}
            <div className="bg-surface hairline-border rounded-lg p-md text-left space-y-sm shadow-md border-l-4 border-error">
              <div className="flex justify-between items-center hairline-border-b pb-sm">
                <span className="font-label-caps text-label-caps text-error font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-error animate-ping" />
                  {offlineQueued ? 'OFFLINE SOS · WAITING TO SYNC' : 'INCIDENT DISPATCH ACTIVE'}
                </span>
                <span className="font-data-mono text-xs text-tertiary">ID: {sosResult?.id?.slice(0, 8) || '—'}</span>
              </div>

              <div className="grid grid-cols-2 gap-sm text-xs font-data-mono">
                <div>
                  <span className="text-outline text-[10px] block">TOURIST NAME</span>
                  <strong className="text-on-surface text-sm">{sosResult?.tourist?.name || '—'}</strong>
                </div>
                <div>
                  <span className="text-outline text-[10px] block">PHONE NUMBER</span>
                  <strong className="text-primary text-sm">{sosResult?.tourist?.phone || '—'}</strong>
                </div>
                <div>
                  <span className="text-outline text-[10px] block">IST TIMESTAMP</span>
                  <span className="text-secondary font-bold">{sosResult?.timestamp_ist || '—'}</span>
                </div>
                <div>
                  <span className="text-outline text-[10px] block">BEACON ELAPSED</span>
                  <span className="text-error font-bold">{formatElapsed(elapsed)}</span>
                </div>
                <div>
                  <span className="text-outline text-[10px] block">LATITUDE</span>
                  <span className="text-on-surface">{sosResult?.tourist?.coordinates?.lat != null ? `${Number(sosResult.tourist.coordinates.lat).toFixed(5)}°N` : 'GPS unavailable'}</span>
                </div>
                <div>
                  <span className="text-outline text-[10px] block">LONGITUDE</span>
                  <span className="text-on-surface">{sosResult?.tourist?.coordinates?.lng != null ? `${Number(sosResult.tourist.coordinates.lng).toFixed(5)}°E` : 'GPS unavailable'}</span>
                </div>
              </div>

              {/* Assigned Ranger Unit */}
              <div className="p-sm bg-secondary/10 hairline-border border-secondary/30 rounded flex items-center justify-between text-xs font-data-mono">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-base">shield_person</span>
                  <div>
                    <span className="text-outline text-[10px] block">RANGER RESPONSE</span>
                    <strong className="text-secondary">{sosResult?.assignedRanger?.ranger_name || 'Awaiting ranger acknowledgement'}</strong>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-primary font-bold text-sm">{sosResult?.assignedRanger?.eta_minutes != null ? `ETA: ~${sosResult.assignedRanger.eta_minutes} MIN` : 'ETA pending'}</span>
                  {sosResult?.assignedRanger?.distance_m != null && <span className="text-outline text-[10px] block">~{sosResult.assignedRanger.distance_m}m away</span>}
                </div>
              </div>
            </div>

            {/* Safety Protocol Guidance */}
            <div className="bg-error-container/20 hairline-border rounded p-md text-left">
              <div className="font-label-caps text-label-caps text-error mb-sm flex items-center gap-1 font-bold">
                <span className="material-symbols-outlined text-sm">health_and_safety</span>
                WHAT TO DO NOW (SURVIVAL PROTOCOL)
              </div>
              <ul className="space-y-xs font-body-md text-body-md text-on-surface-variant text-sm list-disc list-inside">
                <li>Remain in your current location if it is safe to do so.</li>
                <li>Keep your phone screen active; rangers will call your number directly.</li>
                <li>In dense pine cover, whistle or reflect bright light toward the ridge.</li>
                <li>If facing flood/landslide risk, move to elevated solid rock ground.</li>
              </ul>
            </div>

            {!offlineQueued && elapsed >= 120 && !['ACKNOWLEDGED', 'TEAM_ON_SITE', 'RESOLVED'].includes(sosResult?.status) && (
              <div className="bg-error/10 hairline-border border-error/40 rounded p-md text-left" role="alert">
                <h3 className="font-label-caps text-error font-bold">NO RANGER ACKNOWLEDGMENT YET</h3>
                <p className="font-body-md text-sm text-on-surface-variant mt-xs">
                  This incident has not been marked acknowledged. If no responder has contacted you, call emergency services now.
                </p>
                <a href="tel:112" className="btn-primary mt-sm inline-flex items-center gap-xs bg-error">
                  <span className="material-symbols-outlined text-sm">call</span>
                  CALL 112
                </a>
              </div>
            )}

            <div className="flex gap-md justify-center flex-wrap pt-2">
              <Link to="/map" className="btn-primary flex items-center gap-1 text-xs">
                <span className="material-symbols-outlined text-sm">map</span>
                TRACK RANGER ON LIVE MAP
              </Link>
              <Link to="/ranger" className="btn-ghost text-xs flex items-center gap-1 text-secondary">
                <span className="material-symbols-outlined text-sm">shield_person</span>
                OPEN RANGER STATION LOG
              </Link>
              <button
                onClick={() => { setSosSent(false); setElapsed(0) }}
                className="btn-ghost text-xs"
              >
                SEND ANOTHER ALERT
              </button>
            </div>
          </div>
        ) : (
          /* ── SOS Form State ── */
          <div className="space-y-lg">
            <div>
              <div className="font-data-mono text-data-mono text-tertiary flex items-center gap-sm mb-sm">
                <span className="material-symbols-outlined text-sm text-primary">my_location</span>
                {location
                  ? `${location.lat.toFixed(4)}° N, ${location.lng.toFixed(4)}° E — GPS SATELLITE FIX`
                  : locError || 'ACQUIRING SATELLITE FIX…'}
              </div>
              <h2 className="font-headline-md text-headline-md text-on-surface">Emergency Assistance</h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-xs">
                Select your emergency type. Your current device location will be included when available; otherwise responders will be told that GPS is unavailable.
              </p>
            </div>

            {/* Incident Type Grid */}
            <div>
              <label className="field-label">EMERGENCY CLASSIFICATION</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-sm">
                {INCIDENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, type: t.value }))}
                    className={`flex flex-col items-center gap-xs p-sm rounded hairline-border transition-all ${
                      form.type === t.value
                        ? 'bg-error/15 border-error/70 shadow-sm'
                        : 'bg-surface hover:bg-surface-container'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-2xl ${form.type === t.value ? 'text-error' : t.color}`}
                      style={form.type === t.value ? { fontVariationSettings: '"FILL" 1' } : {}}>
                      {t.icon}
                    </span>
                    <span className={`font-label-caps text-[10px] ${form.type === t.value ? 'text-error font-bold' : 'text-on-surface-variant'}`}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Situation Message */}
            <div>
              <label className="field-label" htmlFor="sos-message">SITUATION DETAILS (OPTIONAL)</label>
              <textarea
                id="sos-message"
                value={form.message}
                onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                placeholder="E.g., Medical injury / stranded near ravine / need immediate evacuation..."
                rows={3}
                className="field-input resize-none"
              />
            </div>

            {error && (
              <div className="bg-error-container/40 text-error font-data-mono text-data-mono text-sm px-md py-sm rounded hairline-border flex items-start gap-sm">
                <span className="material-symbols-outlined text-sm mt-px">error</span>
                {error}
              </div>
            )}

            {/* 1-Tap SOS Button */}
            <button
              onClick={handleSOS}
              disabled={loading}
              className="w-full py-lg bg-error text-on-error font-headline-sm text-headline-sm rounded-lg hover:bg-error/90 active:scale-[0.98] transition-all duration-150 shadow-xl disabled:opacity-60 flex items-center justify-center gap-md"
            >
              {loading
                ? <><span className="material-symbols-outlined text-2xl animate-spin">progress_activity</span> TRANSMITTING SOS BEACON…</>
                : <><span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: '"FILL" 1' }}>sos</span> TRANSMIT EMERGENCY SOS BEACON</>
              }
            </button>

            <div className="text-center pt-1">
              <Link to="/home" className="font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-xs">
                <span className="material-symbols-outlined text-sm">arrow_back</span> BACK TO DASHBOARD
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

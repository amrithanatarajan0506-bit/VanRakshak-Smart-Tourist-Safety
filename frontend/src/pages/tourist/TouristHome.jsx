import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import useAuthStore from '../../store/authStore'
import { formatISTTime } from '../../lib/istTime'
import { API_BASE } from '../../lib/api'
import ZoneCard from '../../components/ZoneCard'
import MultilingualAssistant from '../../components/MultilingualAssistant'
import RoutePlanner from '../../components/RoutePlanner'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import VoiceEmergencyMonitor from '../../components/VoiceEmergencyMonitor'
import { useLanguage } from '../../lib/languageContext'

const API = API_BASE

/* ── IST clock ── */
function useISTClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(formatISTTime(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

/* ── Trail Card with Start, Destination & Safe Route Link ── */
function TrailCard({ trail }) {
  const statusColor = trail.status === 'open'
    ? 'bg-secondary'
    : trail.status === 'warning'
      ? 'bg-primary'
      : 'bg-error'

  return (
    <div className="bg-surface hairline-border rounded flex flex-col hover:bg-surface-container-low transition-all relative overflow-hidden group shadow-sm hover:shadow-md">
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${statusColor}`} />
      
      {/* Image & Region Header */}
      <div className="h-36 bg-surface-container-high relative overflow-hidden">
        {trail.image ? (
          <img
            src={trail.image}
            alt={trail.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-30">
            <span className="material-symbols-outlined text-4xl text-outline">terrain</span>
          </div>
        )}
        <div className="absolute top-2 right-2 bg-surface/90 backdrop-blur px-2 py-0.5 font-data-mono text-[10px] rounded hairline-border text-tertiary font-bold">
          {trail.region?.toUpperCase() || 'INDIA'}
        </div>
        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur px-2 py-0.5 font-data-mono text-[10px] rounded text-white flex items-center gap-1">
          <span className="material-symbols-outlined text-xs text-secondary">verified</span>
          {trail.safetyRating || 'Verified Safe'}
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h4 className="font-headline-sm text-base text-on-surface font-bold leading-tight">{trail.name}</h4>
          <p className="font-body-md text-on-surface-variant text-xs mt-1 line-clamp-2">
            {trail.description}
          </p>

          {/* Start Point -> Destination Point Details */}
          <div className="mt-3 p-2 bg-surface-container-low hairline-border rounded space-y-1.5 font-data-mono text-[11px]">
            <div className="flex items-start gap-1.5 text-on-surface">
              <span className="material-symbols-outlined text-xs text-primary shrink-0 mt-0.5">trip_origin</span>
              <div className="truncate">
                <span className="text-outline text-[10px]">START: </span>
                <span className="font-semibold">{trail.startPoint?.name || 'Trailhead'}</span>
              </div>
            </div>
            <div className="flex items-start gap-1.5 text-on-surface">
              <span className="material-symbols-outlined text-xs text-secondary shrink-0 mt-0.5">sports_score</span>
              <div className="truncate">
                <span className="text-outline text-[10px]">DEST: </span>
                <span className="font-semibold">{trail.endPoint?.name || 'Summit'}</span>
              </div>
            </div>
          </div>

          {/* Trail Metrics */}
          <div className="grid grid-cols-3 gap-1 my-3 border-y border-outline/10 py-2 text-center">
            <div>
              <div className="font-label-caps text-outline text-[9px]">DISTANCE</div>
              <div className="font-data-mono text-xs font-bold text-on-surface">{trail.distanceKm || '5.2'} km</div>
            </div>
            <div>
              <div className="font-label-caps text-outline text-[9px]">EST. TIME</div>
              <div className="font-data-mono text-xs font-bold text-on-surface">{trail.estDuration || '2h'}</div>
            </div>
            <div>
              <div className="font-label-caps text-outline text-[9px]">DIFFICULTY</div>
              <div className={`font-data-mono text-xs font-bold ${
                trail.difficulty === 'Difficult' ? 'text-error' :
                trail.difficulty === 'Moderate'  ? 'text-primary' : 'text-secondary'
              }`}>{trail.difficulty}</div>
            </div>
          </div>

          {/* Hazard Bypass Tag */}
          {trail.hazardBypass && (
            <div className="font-data-mono text-[10px] text-secondary flex items-center gap-1 mb-2">
              <span className="material-symbols-outlined text-xs">shield</span>
              <span className="truncate">{trail.hazardBypass}</span>
            </div>
          )}
        </div>

        {/* View on Map Action */}
        <Link
          to={`/map?trail=${trail.id || trail.slug}`}
          className="btn-primary w-full justify-center flex items-center gap-1 text-xs py-2 group-hover:bg-primary/90"
        >
          <span className="material-symbols-outlined text-sm">conversion_path</span>
          VIEW SAFE ROUTE ON MAP
        </Link>
      </div>
    </div>
  )
}

/* ── Risk Zone item ── */
function RiskItem({ color, label, detail }) {
  const dot =
    color === 'red'   ? <div className="w-3 h-3 rounded-full bg-error border border-white animate-pulse" /> :
    color === 'amber' ? <div className="w-3 h-3 rounded-sm bg-primary border border-white" /> :
                        <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-secondary" />

  const textColor =
    color === 'red'   ? 'text-error' :
    color === 'amber' ? 'text-primary' : 'text-secondary'

  return (
    <li className="flex items-center gap-sm">
      {dot}
      <div>
        <div className={`font-label-caps text-label-caps ${textColor}`}>{label}</div>
        <div className="font-data-mono text-data-mono text-on-surface-variant text-xs">{detail}</div>
      </div>
    </li>
  )
}

/* ══════════════════════════════════════════════════════
   TOURIST HOME — main component
══════════════════════════════════════════════════════ */
export default function TouristHome() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const clock = useISTClock()
  const { t } = useLanguage()

  const [weather, setWeather]       = useState([])
  const [advisories, setAdvisories] = useState([])
  const [dangerZones, setDanger]    = useState([])
  const [permitTab, setPermitTab]   = useState('indian')
  const [destinationQuery, setDestinationQuery] = useState('')

  /* ── Fetch live data ── */
  const fetchData = useCallback(async () => {
    const token = useAuthStore.getState().token
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    try {
      const [wRes, aRes, dRes] = await Promise.allSettled([
        axios.get(`${API}/weather`, { headers }),
        axios.get(`${API}/advisories`, { headers }),
        axios.get(`${API}/danger-zones`, { headers }),
      ])
      if (wRes.status === 'fulfilled') setWeather(wRes.value.data?.slice?.(0,8) || [])
      if (aRes.status === 'fulfilled') setAdvisories(aRes.value.data?.slice?.(0,6) || [])
        if (dRes.status === 'fulfilled') setDanger(dRes.value.data?.features || [])
    } catch (_) { /* silently ignore */ }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDestinationSearch = event => {
    event.preventDefault()
    const query = destinationQuery.trim()
    if (query) navigate(`/map?destination=${encodeURIComponent(query)}`)
  }

  /* ── Weather ticker text ── */
  const weatherText = weather.length
    ? weather.map(w => `${w.city || w.location} ${w.temp || w.temperature}°C ${w.condition || w.description}`).join('   ·   ')
    : 'Live weather feed unavailable'

  /* ── Alerts ticker text ── */
  const alertsText = advisories.length
    ? advisories.map(a => a.title).join('   ·   ')
    : 'No active advisories'

  const handleLogout = () => { logout(); navigate('/signin') }

  return (
    <div className="min-h-screen font-body-md text-on-surface antialiased forest-bg pb-20 md:pb-0">

      {/* ── Top App Bar ── */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 bg-surface/90 backdrop-blur border-b border-outline/15">
        <div className="flex items-center gap-md">
          <span className="material-symbols-outlined text-secondary text-2xl" style={{ fontVariationSettings: '"FILL" 1' }}>forest</span>
          <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface">VANRAKSHA</h1>
        </div>
        <div className="flex items-center gap-gutter">
          <nav className="hidden md:flex gap-lg font-label-caps text-label-caps">
            <Link to="/home" className="text-primary hover:bg-surface-container-high transition-colors px-2 py-1 rounded">{t('nav.trails')}</Link>
            <Link to="/map"  className="text-on-surface-variant hover:bg-surface-container-high transition-colors px-2 py-1 rounded">{t('nav.liveMap')}</Link>
            <Link to="/sos"  className="text-error hover:bg-error/10 transition-colors px-2 py-1 rounded">{t('nav.sos')}</Link>
          </nav>
          <LanguageSwitcher />
          {user ? (
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-xs font-label-caps text-label-caps text-on-surface-variant hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              {t('nav.logout')}
            </button>
          ) : (
            <Link to="/signin" className="hidden md:flex items-center gap-xs font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-sm">login</span>
              {t('nav.signin')}
            </Link>
          )}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="min-h-screen px-margin-mobile md:px-margin-desktop max-w-7xl mx-auto pt-24">

        {/* Hero */}
        <section className="py-xl flex flex-col md:flex-row gap-xl items-start">
          <div className="flex-1 space-y-lg">
            <div className="font-data-mono text-data-mono text-tertiary flex items-center gap-sm">
              <span className="material-symbols-outlined text-sm">my_location</span>
              {t('home.locationShown')}
            </div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">
              {t('home.headline')}
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
              {t('home.description')}
            </p>
            {user && (
              <div className="space-y-xs">
                <p className="font-data-mono text-data-mono text-secondary text-sm">
                  ● {t('home.signedIn')} {(user.full_name || user.email || 'TOURIST').toUpperCase()}{user.phone ? ` · ${user.phone}` : ''}
                </p>
                {user.dtid_code && (
                  <p className="font-data-mono text-xs text-on-surface-variant" role="status">
                    {t('home.digitalId')}: <strong className="text-primary">{user.dtid_code}</strong>
                  </p>
                )}
                {user.verification_status === 'format_validated' && (
                  <p className="font-data-mono text-[11px] text-on-surface-variant" role="status">
                    <span className="text-secondary font-bold">{t('home.idAccepted')}</span>
                    {' · '}{user.tourist_type === 'indian' ? t('home.aadhaarAccepted') : t('home.passportAccepted')}
                    {' · '}{t('home.govNotQueried')}
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-md pt-sm flex-wrap">
              <Link to="/map" className="btn-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">map</span>
                {t('home.exploreMap')}
              </Link>
              <Link to="/sos" className="btn-ghost">
                <span className="material-symbols-outlined text-sm text-error">sos</span>
                {t('home.emergencySos')}
              </Link>
            </div>
          </div>

          {/* Permit Protocol Panel */}
          <div className="w-full md:w-96 bg-surface hairline-border rounded p-md space-y-md shadow-sm">
            <div className="flex justify-between items-center hairline-border-b pb-sm">
              <h3 className="font-label-caps text-label-caps text-tertiary">{t('home.permitProtocol')}</h3>
              <span className="material-symbols-outlined text-tertiary text-sm">assignment_ind</span>
            </div>
            <div className="flex bg-surface-container rounded p-xs hairline-border">
              <button
                onClick={() => setPermitTab('indian')}
                className={`flex-1 py-xs text-center font-label-caps text-label-caps rounded transition-colors ${
                  permitTab === 'indian' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >{t('home.indianCitizen')}</button>
              <button
                onClick={() => setPermitTab('foreign')}
                className={`flex-1 py-xs text-center font-label-caps text-label-caps rounded transition-colors ${
                  permitTab === 'foreign' ? 'bg-tertiary text-on-tertiary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >{t('home.foreignNational')}</button>
            </div>
            <div className="space-y-sm pt-sm">
              {permitTab === 'indian' ? (
                <div className="p-sm bg-surface-container-lowest rounded hairline-border">
                  <div className="font-label-caps text-label-caps text-primary mb-xs">{t('home.ilp')}</div>
                  <p className="font-body-md text-body-md text-on-surface-variant text-sm">
                    {t('home.ilpText')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-sm bg-surface-container-lowest rounded hairline-border">
                    <div className="font-label-caps text-label-caps text-tertiary mb-xs">{t('home.pap')}</div>
                    <p className="font-body-md text-body-md text-on-surface-variant text-sm">
                      {t('home.papText')}
                    </p>
                  </div>
                  <div className="p-sm bg-surface-container-lowest rounded hairline-border">
                    <div className="font-label-caps text-label-caps text-tertiary mb-xs">{t('home.rap')}</div>
                    <p className="font-body-md text-body-md text-on-surface-variant text-sm">
                      {t('home.rapText')}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── Live Tickers ── */}
        <section className="space-y-unit mb-xl shadow-sm rounded overflow-hidden hairline-border">
          {/* Weather Ticker */}
          <div className="bg-surface flex items-center h-8 hairline-border-b">
            <div className="bg-primary text-on-primary font-label-caps text-label-caps px-sm h-full flex items-center z-10 whitespace-nowrap text-xs">
              {t('home.weather')}
            </div>
            <div className="ticker-wrap flex-1 text-primary font-data-mono text-data-mono text-sm bg-surface-container-low h-full flex items-center">
              <div className="ticker-content">{weather.length ? weatherText : t('home.weatherUnavailable')}</div>
            </div>
          </div>
          {/* Alerts Ticker */}
          <div className="bg-surface flex items-center h-8">
            <div className="bg-error text-on-error font-label-caps text-label-caps px-sm h-full flex items-center z-10 whitespace-nowrap text-xs">
              {t('home.alerts')}
            </div>
            <div className="ticker-wrap flex-1 text-error font-data-mono text-data-mono text-sm bg-error-container/20 h-full flex items-center">
              <div className="ticker-content-reverse">{advisories.length ? alertsText : t('home.noAdvisories')}</div>
            </div>
          </div>
        </section>

        <section className="mb-xl hairline-border-b pb-xl">
          <div className="max-w-3xl">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">{t('home.planDestination')}</h3>
            <p className="font-body-md text-on-surface-variant text-sm mt-xs">
              {t('home.destinationHelp')}
            </p>
            <form onSubmit={handleDestinationSearch} className="flex flex-col sm:flex-row gap-sm mt-md">
              <input
                aria-label={t('map.destination')}
                value={destinationQuery}
                onChange={event => setDestinationQuery(event.target.value)}
                placeholder={t('home.destination')}
                required
                className="field-input flex-1"
              />
              <button type="submit" className="btn-primary flex items-center justify-center gap-sm">
                <span className="material-symbols-outlined text-sm">route</span>
                {t('home.findRoute')}
              </button>
            </form>
          </div>
        </section>

        <section className="mb-xl grid grid-cols-1 lg:grid-cols-2 gap-md items-start">
          <RoutePlanner zones={dangerZones} />
          <MultilingualAssistant />
        </section>

        <section className="mb-xl">
          <div className="flex items-center justify-between hairline-border-b pb-sm mb-sm">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">{t('home.hazardZones')}</h3>
            <Link to="/map" className="font-label-caps text-label-caps text-secondary hover:underline">{t('home.openLiveMap')}</Link>
          </div>
          {dangerZones.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
              {dangerZones.map(zone => <ZoneCard key={zone.id} zone={zone} />)}
            </div>
          ) : (
            <p className="font-data-mono text-sm text-on-surface-variant py-md">
              {t('home.noZones')}
            </p>
          )}
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="hidden md:flex w-full py-lg px-margin-mobile md:px-margin-desktop flex-col md:flex-row justify-between items-center gap-md bg-surface-container-low border-t border-outline/10">
        <div className="font-data-mono text-data-mono text-tertiary text-xs text-center md:text-left">
          VANRAKSHA FOREST SAFETY PORTAL | OFFICIAL GOVT USE ONLY
          <br />
          <span className="text-tertiary/70">SIH Hackathon Prototype – Not Official Govt Site</span>
        </div>
        <div className="flex gap-lg">
          <span className="font-label-caps text-label-caps text-secondary">IST CLOCK: {clock}</span>
        </div>
      </footer>
      <VoiceEmergencyMonitor />
    </div>
  )
}

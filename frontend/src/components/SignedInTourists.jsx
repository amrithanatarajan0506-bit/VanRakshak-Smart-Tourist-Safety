import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { formatISTDateTime, parseServerDate } from '../lib/istTime'

/** Tourists who have entered the app (name, phone, entry time in IST) — for Rangers / Admin. */
export default function SignedInTourists({ showAllDetails = false }) {
  const [tourists, setTourists] = useState([])
  const liveTourists = tourists.filter(t => t.location_updated_at && Date.now() - new Date(t.location_updated_at).getTime() <= 90000)
  const movingTourists = liveTourists.filter(t => Number(t.speed_kmh) >= 1)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/tourists')
      setTourists(data || [])
    } catch { /* keep last list */ }
  }, [])

  const downloadCsv = () => {
    const columns = [
      ['id', 'Tourist ID'], ['full_name', 'Name'], ['phone', 'Phone'], ['email', 'Email'],
      ['tourist_type', 'Tourist type'], ['identity_type', 'Identity document type'],
      ['nationality', 'Nationality'], ['passport_country', 'Passport country'],
      ['verification_status', 'Verification status'], ['identity_verified_at', 'Identity verified at'],
      ['identity_created_at', 'Identity record created at'], ['dtid_code', 'Digital tourist ID'],
      ['digital_id_issued_at', 'Digital ID issued at'], ['account_created_at', 'Account created at'],
      ['last_login_at', 'Last login'], ['lat', 'Latitude'], ['lng', 'Longitude'],
      ['accuracy_m', 'Location accuracy (m)'], ['speed_kmh', 'Speed (km/h)'],
      ['location_updated_at', 'Location updated at'], ['risk_level', 'Zone risk'],
      ['risk_score', 'Risk score'], ['risk_reason', 'Risk details'], ['trips', 'Trips'],
    ]
    const valueFor = (tourist, key) => {
      const value = tourist[key]
      if (['identity_verified_at', 'identity_created_at', 'digital_id_issued_at', 'account_created_at', 'last_login_at', 'location_updated_at'].includes(key)) {
        const parsed = parseServerDate(value)
        return parsed ? formatISTDateTime(parsed) : ''
      }
      if (key === 'trips') return (value || []).map(trip => [trip.destination, trip.start_date, trip.end_date, trip.status, trip.emergency_contact_name].filter(Boolean).join(' / ')).join('; ')
      return value ?? ''
    }
    const escape = value => `"${String(value).replaceAll('"', '""')}"`
    const content = [columns.map(([, label]) => escape(label)).join(','), ...tourists.map(tourist => columns.map(([key]) => escape(valueFor(tourist, key))).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `vanraksha-tourists-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const time = value => {
    const parsed = parseServerDate(value)
    return parsed ? formatISTDateTime(parsed) : value || '—'
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="bg-surface hairline-border rounded p-md shadow-sm">
      <div className="flex items-center justify-between hairline-border-b pb-sm mb-md">
        <div className="font-label-caps text-label-caps text-tertiary">SIGNED-IN TOURISTS</div>
        <div className="flex items-center gap-sm">
          <div className="flex items-center gap-sm font-data-mono text-[10px]">
            <span className="text-outline">{tourists.length} TOTAL</span>
            <span className="text-secondary">{liveTourists.length} LIVE</span>
            <span className="text-primary">{movingTourists.length} MOVING</span>
          </div>
          {showAllDetails && <button type="button" onClick={downloadCsv} disabled={!tourists.length} className="btn-ghost text-xs flex items-center gap-xs disabled:opacity-50">
            <span className="material-symbols-outlined text-sm">download</span>DOWNLOAD CSV
          </button>}
        </div>
      </div>
      {!showAllDetails && <p className="font-data-mono text-[10px] text-outline mb-sm">
        LOCATION FRESHNESS, MOVEMENT, AND CONFIGURED-ZONE PROXIMITY · NOT AN AI PREDICTION
      </p>}
      <div className={`divide-y divide-outline/10 ${showAllDetails ? '' : 'max-h-64 overflow-y-auto'}`}>
        {tourists.map(t => (
          <div key={t.id} className="py-sm first:pt-0 last:pb-0">
            <div className="font-body-md text-sm text-on-surface font-semibold truncate">{t.full_name}</div>
            {t.dtid_code && <div className="font-data-mono text-[10px] text-secondary">ID · {t.dtid_code}</div>}
            <div className="flex items-center justify-between gap-sm font-data-mono text-xs">
              <a href={`tel:${t.phone}`} className="text-primary hover:underline flex items-center gap-xs">
                <span className="material-symbols-outlined text-xs">call</span>{t.phone}
              </a>
              <span className="text-outline text-[10px]">{t.last_login_ist || time(t.last_login_at)}</span>
            </div>
            {Number.isFinite(t.lat) && Number.isFinite(t.lng) && (
              <div className="mt-xs flex flex-wrap items-center justify-between gap-xs font-data-mono text-[10px]">
                <span className="text-on-surface-variant">
                  {Number(t.lat).toFixed(5)}°, {Number(t.lng).toFixed(5)}°
                  {t.speed_kmh != null ? ` · ${Number(t.speed_kmh).toFixed(1)} km/h` : ''}
                </span>
                <span className={t.risk_level === 'HIGH' ? 'text-error font-bold' : t.risk_level === 'ELEVATED' ? 'text-primary font-bold' : 'text-secondary'}>
                  ZONE RISK: {t.risk_level || 'UNASSESSED'}{t.risk_score != null ? ` · ${t.risk_score}/100` : ''}
                </span>
                <Link
                  to={`/map?lat=${t.lat}&lng=${t.lng}&name=${encodeURIComponent(t.full_name || 'Tourist')}&phone=${encodeURIComponent(t.phone || '')}&type=TOURIST&dtid=${encodeURIComponent(t.dtid_code || '')}&tourist_id=${encodeURIComponent(t.id)}`}
                  className="text-primary hover:underline font-bold"
                >
                  TRACK
                </Link>
                {t.risk_reason && <span className="basis-full text-outline">{t.risk_reason}</span>}
              </div>
            )}
            {showAllDetails && <dl className="mt-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-md gap-y-xs font-data-mono text-[10px]">
              <div><dt className="text-outline">EMAIL</dt><dd className="break-all text-on-surface-variant">{t.email || '—'}</dd></div>
              <div><dt className="text-outline">TOURIST / ID TYPE</dt><dd className="text-on-surface-variant">{t.tourist_type || '—'} / {t.identity_type || '—'}</dd></div>
              <div><dt className="text-outline">NATIONALITY / PASSPORT COUNTRY</dt><dd className="text-on-surface-variant">{t.nationality || '—'} / {t.passport_country || '—'}</dd></div>
              <div><dt className="text-outline">VERIFICATION</dt><dd className="text-on-surface-variant">{t.verification_status || '—'}{t.identity_verified_at ? ` · ${time(t.identity_verified_at)}` : ''}</dd></div>
              <div><dt className="text-outline">ACCOUNT CREATED</dt><dd className="text-on-surface-variant">{time(t.account_created_at)}</dd></div>
              <div><dt className="text-outline">IDENTITY RECORD CREATED</dt><dd className="text-on-surface-variant">{time(t.identity_created_at)}</dd></div>
              <div><dt className="text-outline">DIGITAL ID ISSUED</dt><dd className="text-on-surface-variant">{time(t.digital_id_issued_at)}</dd></div>
              <div><dt className="text-outline">LOCATION UPDATED</dt><dd className="text-on-surface-variant">{time(t.location_updated_at)}</dd></div>
              <div><dt className="text-outline">GPS ACCURACY</dt><dd className="text-on-surface-variant">{t.accuracy_m == null ? '—' : `${Number(t.accuracy_m).toFixed(1)} m`}</dd></div>
              <div className="sm:col-span-2 lg:col-span-3"><dt className="text-outline">TRIP HISTORY</dt><dd className="text-on-surface-variant">{t.trips?.length ? t.trips.map(trip => `${trip.destination} (${trip.start_date || 'date unplanned'}${trip.end_date ? ` to ${trip.end_date}` : ''}; ${trip.status || 'status unavailable'}${trip.emergency_contact_name ? `; contact: ${trip.emergency_contact_name}` : ''})`).join(' · ') : 'No trips recorded'}</dd></div>
            </dl>}
          </div>
        ))}
        {!tourists.length && (
          <p className="font-data-mono text-xs text-on-surface-variant text-center py-md">NO TOURISTS SIGNED IN YET</p>
        )}
      </div>
    </div>
  )
}

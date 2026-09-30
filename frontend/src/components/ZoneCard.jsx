import { useState } from 'react'
import { zoneMeta } from '../lib/zoneImages'

export default function ZoneCard({ zone }) {
  const p = zone.properties
  const meta = zoneMeta(p.name)
  const [broken, setBroken] = useState(false)
  return (
    <div className="bg-surface hairline-border rounded overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
      <div className={`h-32 relative bg-gradient-to-br ${meta.tone}`}>
        {!broken && (
          <img src={`/zones/${meta.slug}.jpg`} alt={p.name} loading="lazy" onError={() => setBroken(true)}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        )}
        {broken && <span className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-5xl text-white/40">{meta.icon}</span>}
        <span className="absolute top-2 right-2 bg-error text-on-error font-data-mono text-[10px] px-2 py-0.5 rounded uppercase">{p.severity}</span>
      </div>
      <div className="p-3">
        <div className="font-label-caps text-sm text-on-surface leading-snug">{p.name}</div>
        <div className="font-data-mono text-xs text-on-surface-variant mt-1">{p.zone_type} · {p.radius_m} m</div>
      </div>
    </div>
  )
}

// Drop a photo named <slug>.jpg into frontend/public/zones/ to show it on that hazard-zone card.
// If the file is missing the card falls back to a themed gradient, so nothing breaks.
export const ZONES_META = [
  { key: 'monkey point', slug: 'monkey-point', icon: 'radar', tone: 'from-slate-600 to-slate-900' },
  { key: 'chail', slug: 'chail', icon: 'pets', tone: 'from-emerald-700 to-emerald-950' },
  { key: 'corbett', slug: 'corbett', icon: 'forest', tone: 'from-green-700 to-green-950' },
  { key: 'nanda devi', slug: 'nanda-devi', icon: 'landslide', tone: 'from-sky-700 to-slate-900' },
  { key: 'valley of flowers', slug: 'valley-of-flowers', icon: 'local_florist', tone: 'from-fuchsia-700 to-emerald-900' },
  { key: 'dzukou', slug: 'dzukou', icon: 'water', tone: 'from-lime-700 to-emerald-900' },
  { key: 'khangchendzonga', slug: 'khangchendzonga', icon: 'ac_unit', tone: 'from-cyan-700 to-slate-900' },
  { key: 'cherrapunji', slug: 'cherrapunji', icon: 'waterfall_chart', tone: 'from-teal-700 to-slate-900' },
  { key: 'silent valley', slug: 'silent-valley', icon: 'nature', tone: 'from-green-800 to-black' },
  { key: 'bandipur', slug: 'bandipur', icon: 'pets', tone: 'from-amber-700 to-emerald-950' },
]
export function zoneMeta(name = '') {
  const n = name.toLowerCase()
  return ZONES_META.find(z => n.includes(z.key)) || { slug: 'default', icon: 'warning', tone: 'from-stone-600 to-stone-900' }
}

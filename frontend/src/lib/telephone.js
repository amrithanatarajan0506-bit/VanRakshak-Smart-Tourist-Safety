export function getTelephoneHref(phone) {
  const normalized = String(phone || '').replace(/[^\d+]/g, '')
  return /^\+?\d{7,15}$/.test(normalized) ? `tel:${normalized}` : null
}
const toIsoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function getPeriodRange(preset, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end)
  if (preset === 'today') return { start: toIsoDate(start), end: toIsoDate(end) }
  if (preset === '7d') start.setDate(start.getDate() - 6)
  if (preset === '30d') start.setDate(start.getDate() - 29)
  if (preset === 'month') start.setDate(1)
  return { start: toIsoDate(start), end: toIsoDate(end) }
}

export function isLocationMessage(message, expectedVehicleId) {
  if (message?.type !== 'location' || !message.location) return false
  const point = message.location
  const lat = Number(point.latitude)
  const lon = Number(point.longitude)
  const speed = point.speed_kph == null ? null : Number(point.speed_kph)
  return Number(point.vehicle_id) === Number(expectedVehicleId) &&
    Number.isInteger(Number(point.id)) && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    Number.isFinite(lon) && Math.abs(lon) <= 180 &&
    (speed === null || (Number.isFinite(speed) && speed >= 0 && speed <= 300)) &&
    Number.isFinite(new Date(point.recorded_at).getTime()) &&
    Number.isFinite(new Date(point.timestamp).getTime()) &&
    typeof point.source === 'string' && typeof point.is_simulated === 'boolean'
}

export function mergeLocation(locations, point, limit = 100) {
  if (limit <= 0) return []
  const byId = new Map(locations.map((item) => [Number(item.id), item]))
  byId.set(Number(point.id), point)
  return [...byId.values()]
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at) || Number(a.id) - Number(b.id))
    .slice(-limit)
}

export function reconnectDelay(attempt) {
  return Math.min(1000 * (2 ** Math.max(0, attempt)), 30000)
}

export function gpsFreshnessLabel(isRecent, latest) {
  return gpsConnectionStatus(latest, Date.now(), isRecent ? 90_000 : 0)
}

export function gpsConnectionStatus(point, now = Date.now(), freshnessMs = 90_000) {
  if (!point) return 'Never connected'
  if (point.is_simulated || point.source === 'simulated') return 'Simulated'
  if (!['device', 'provider'].includes(point.source)) return 'Disconnected'
  if (point.device_connected === false) return 'Disconnected'
  const recordedAt = new Date(point.recorded_at).getTime()
  return Number.isFinite(recordedAt) && now - recordedAt <= freshnessMs ? 'Connected' : 'Disconnected'
}

export function gpsSourceLabel(point) {
  if (point?.is_simulated || point?.source === 'simulated') return 'Simulated'
  if (point?.source === 'device') return 'Physical Device'
  if (point?.source === 'provider') return 'Provider'
  return 'Unknown'
}

export function locationTelemetry(point) {
  return {
    speed: point?.speed_kph == null ? 'Not reported' : `${Number(point.speed_kph).toFixed(1)} km/h`,
    timestamp: point?.recorded_at && Number.isFinite(new Date(point.recorded_at).getTime())
      ? new Date(point.recorded_at).toLocaleString()
      : 'No GPS update',
    source: point?.is_simulated || point?.source === 'simulated'
      ? 'Simulated test data'
      : point?.source === 'device' ? 'Physical device' : point?.source === 'provider' ? 'GPS provider' : 'Unknown source',
    heading: point?.heading_degrees == null ? 'Not reported' : `${Number(point.heading_degrees).toFixed(0)}°`,
  }
}

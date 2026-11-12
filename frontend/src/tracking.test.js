import test from 'node:test'
import assert from 'node:assert/strict'
import { gpsConnectionStatus, gpsFreshnessLabel, gpsSourceLabel, isLocationMessage, locationTelemetry, mergeLocation, reconnectDelay } from './tracking.js'

const point = (id, recorded_at = '2026-10-27T10:00:00Z') => ({
  id, vehicle_id: 7, latitude: 17.4, longitude: 78.5, speed_kph: 42,
  recorded_at, timestamp: recorded_at, source: 'simulated', is_simulated: true,
})

test('location messages validate vehicle, coordinates, speed, timestamp and simulated source', () => {
  assert.equal(isLocationMessage({ type: 'location', location: point(1) }, 7), true)
  assert.equal(isLocationMessage({ type: 'location', location: point(1) }, 8), false)
  assert.equal(isLocationMessage({ type: 'location', location: { ...point(1), speed_kph: -1 } }, 7), false)
  assert.equal(isLocationMessage({ type: 'location', location: { ...point(1), recorded_at: 'bad' } }, 7), false)
  assert.equal(isLocationMessage({ type: 'location', location: { ...point(1), is_simulated: undefined } }, 7), false)
})

test('location merge updates a marker once by ID and keeps chronological bounded history', () => {
  const result = mergeLocation([point(1), point(2, '2026-10-27T10:02:00Z')], point(1, '2026-10-27T10:03:00Z'))
  assert.equal(result.length, 2)
  assert.equal(result[1].id, 1)
  assert.deepEqual(mergeLocation([], point(1), 0), [])
})

test('reconnect delay grows exponentially and is capped', () => {
  assert.equal(reconnectDelay(0), 1000)
  assert.equal(reconnectDelay(3), 8000)
  assert.equal(reconnectDelay(20), 30000)
})

test('telemetry presentation distinguishes simulated, physical and provider GPS', () => {
  const simulated = point(1)
  const telemetry = locationTelemetry(simulated)
  assert.equal(telemetry.speed, '42.0 km/h')
  assert.notEqual(telemetry.timestamp, 'No GPS update')
  assert.equal(telemetry.source, 'Simulated test data')
  assert.equal(gpsFreshnessLabel(true, simulated), 'Simulated')
  assert.equal(gpsSourceLabel(simulated), 'Simulated')
  const physical = { ...simulated, source: 'device', is_simulated: false, recorded_at: new Date().toISOString() }
  assert.equal(gpsConnectionStatus(physical), 'Connected')
  assert.equal(gpsSourceLabel(physical), 'Physical Device')
  assert.equal(gpsConnectionStatus({ ...physical, device_connected: false }), 'Disconnected')
  assert.equal(gpsConnectionStatus(null), 'Never connected')
  assert.equal(gpsSourceLabel({ ...physical, source: 'provider' }), 'Provider')
  assert.equal(gpsConnectionStatus({ ...physical, source: 'provider', recorded_at: '2020-01-01T00:00:00Z' }), 'Disconnected')
  assert.equal(locationTelemetry(physical).heading, 'Not reported')
})

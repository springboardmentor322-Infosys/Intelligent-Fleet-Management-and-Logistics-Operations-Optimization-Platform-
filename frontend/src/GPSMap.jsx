
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import {
  Activity,
  Clock3,
  Crosshair,
  MapPin,
  Navigation,
  Radio,
  Route,
  Truck,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import api from './api'
import { gpsConnectionStatus, gpsSourceLabel, isLocationMessage, locationTelemetry, mergeLocation, reconnectDelay } from './tracking'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const truckIcon = L.divIcon({
  className: 'fleetflow-truck-marker',
  html: `
    <div style="
      width:38px;height:38px;border-radius:12px;
      background:#10b981;border:3px solid #ffffff;
      box-shadow:0 3px 14px rgba(0,0,0,.45);
      display:flex;align-items:center;justify-content:center;
      font-size:21px;
    ">🚚</div>
  `,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
})

function FollowVehicle({ position }) {
  const map = useMap()

  useEffect(() => {
    if (position) {
      map.panTo(position, { animate: true, duration: 0.8 })
    }
  }, [map, position])

  return null
}

function Metric({ icon: Icon, label, value, detail }) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
      <Icon size={18} className="mb-3 text-emerald-400" />
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-white">
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  )
}

export default function GPSMap({ vehicleId }) {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(0)
  const [socketStatus, setSocketStatus] = useState('connecting')
  const [tripContext, setTripContext] = useState(null)
  const [etaNotice, setEtaNotice] = useState('')
  const socketRef = useRef(null)
  const reconnectAttemptRef = useRef(0)

  const loadHistory = useCallback(async () => {
    if (!vehicleId) {
      setLocations([])
      setError('')
      return
    }

    setLoading(true)

    try {
      const response = await api.get(
        `/gps/vehicles/${vehicleId}/history`,
        { params: { limit: 100 } },
      )

      setLocations((current) => {
        return (response.data || []).reduce((merged, point) => mergeLocation(merged, point), current)
      })
      setError('')
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          'Could not load GPS history. Check your login and permissions.',
      )
    } finally {
      setLoading(false)
    }
  }, [vehicleId])

  useEffect(() => {
    if (!vehicleId) {
      return undefined
    }
    let cancelled = false
    api.get(`/gps/vehicles/${vehicleId}/context`).then((response) => { if (!cancelled) setTripContext(response.data) }).catch(() => { if (!cancelled) setTripContext(null) })
    return () => { cancelled = true }
  }, [vehicleId])

  useEffect(() => {
    if (!vehicleId) return undefined

    const initialLoadId = window.setTimeout(() => loadHistory(), 0)
    const clockId = window.setInterval(() => setNow(Date.now()), 1000)
    const latestPollId = window.setInterval(async () => {
      try {
        const response = await api.get(`/gps/vehicles/${vehicleId}/latest`)
        if (!disposed) setLocations((previous) => mergeLocation(previous, response.data))
      } catch (err) {
        if (!disposed && err.response?.status !== 404) {
          setError(err.response?.data?.detail || 'Could not refresh the latest GPS position.')
        }
      }
    }, 15000)
    let reconnectId
    let disposed = false
    const connect = () => {
      if (disposed) return
      if (socketRef.current && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socketRef.current.readyState)) return
      setSocketStatus('connecting')
      const token = localStorage.getItem('fleetflow_token')
      const socketUrl = new URL(`/gps/ws/vehicles/${vehicleId}`, api.defaults.baseURL)
      socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(socketUrl)
      socketRef.current = socket
      socket.onopen = () => {
        if (disposed || socketRef.current !== socket) return
        if (!token) { socket.close(1008, 'Authentication required'); return }
        socket.send(JSON.stringify({ token }))
      }
      socket.onmessage = (event) => {
        if (disposed || socketRef.current !== socket) return
        let message
        try { message = JSON.parse(event.data) } catch { return }
        if (message.type === 'ready') setSocketStatus('connected')
        if (message.type === 'ready') reconnectAttemptRef.current = 0
        if (isLocationMessage(message, vehicleId)) {
          setLocations((previous) => mergeLocation(previous, message.location))
        }
        if (message.type === 'eta' && Number(message.vehicle_id) === Number(vehicleId)) {
          setEtaNotice('Trip ETA updated from the latest location and OSRM route duration; live traffic is unavailable.')
          setTripContext((previous) => previous ? ({ ...previous, estimated_arrival: message.estimated_arrival,
            shipments: previous.shipments.map((shipment) => ({ ...shipment, estimated_arrival: message.estimated_arrival })) }) : previous)
        }
        if (message.type === 'eta_unavailable') {
          setEtaNotice(message.reason || 'Route provider unavailable; saved ETA was retained.')
        }
      }
      socket.onerror = () => { if (!disposed) setSocketStatus('disconnected') }
      socket.onclose = (event) => {
        if (socketRef.current === socket) socketRef.current = null
        if (disposed) return
        const rejected = event.code === 1008
        if (rejected) { setSocketStatus('disconnected'); setError('Tracking access was denied. Sign in with an authorized fleet role.') }
        else if (!disposed) {
          setSocketStatus('reconnecting')
          const delay = reconnectDelay(reconnectAttemptRef.current)
          reconnectAttemptRef.current += 1
          reconnectId = window.setTimeout(connect, delay)
        }
      }
    }
    connect()

    return () => {
      disposed = true
      if (socketRef.current) socketRef.current.close()
      socketRef.current = null
      window.clearTimeout(reconnectId)
      window.clearInterval(clockId)
      window.clearInterval(latestPollId)
      window.clearTimeout(initialLoadId)
    }
  }, [loadHistory, vehicleId])

  const validLocations = useMemo(() => {
    return locations
      .filter((point) => {
        const lat = Number(point.latitude)
        const lon = Number(point.longitude)

        return (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lon) <= 180 &&
          !(lat === -90 && lon === -180)
        )
      })
      .sort((a, b) => {
        const timeDifference =
          new Date(a.recorded_at).getTime() -
          new Date(b.recorded_at).getTime()

        return timeDifference || Number(a.id) - Number(b.id)
      })
  }, [locations])

  const latest = validLocations[validLocations.length - 1]
  const latestTime = latest ? new Date(latest.recorded_at) : null
  const ageSeconds = latestTime
    ? Math.max(0, Math.floor((now - latestTime.getTime()) / 1000))
    : null

  const connectionStatus = gpsConnectionStatus(latest, now)
  const isConnected = connectionStatus === 'Connected'
  const isSimulated = connectionStatus === 'Simulated'

  const positions = validLocations.map((point) => [
    Number(point.latitude),
    Number(point.longitude),
  ])

  const currentPosition = positions.length
    ? positions[positions.length - 1]
    : null

  const center = currentPosition || [17.385, 78.4867]
  const latestTelemetry = locationTelemetry(latest)

  const formatTime = (date) =>
    date
      ? date.toLocaleString([], {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : 'No GPS update'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <Truck className="text-emerald-400" size={23} />
          </div>
          <div>
            <h3 className="font-semibold text-white">Live fleet tracking</h3>
            <p className="text-xs text-slate-400">
              Vehicle ID: {vehicleId || 'Not selected'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
              isConnected
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : isSimulated
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? 'animate-pulse bg-emerald-400' : isSimulated ? 'bg-amber-400' : 'bg-rose-400'
              }`}
            />
            {connectionStatus}
          </div>

          <button
            type="button"
            onClick={loadHistory}
            disabled={loading || !vehicleId}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 transition hover:border-emerald-500/50 disabled:opacity-50"
          >
            <Activity size={16} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-slate-400">Selected vehicle</p>
              <h4 className="mt-1 text-lg font-bold text-white">
                Vehicle {vehicleId || '—'}
              </h4>
              <p className="text-xs text-slate-500">FleetFlow GPS unit</p>
            </div>
            <Truck size={24} className="text-emerald-400" />
          </div>

          <div className="space-y-3 border-y border-slate-800 py-4">
            <div><p className="text-xs text-slate-400">Current trip</p><p className="mt-1 text-sm text-white">{vehicleId && tripContext?.trip_id ? `Trip ${tripContext.trip_id}` : 'No active or scheduled trip'}</p>{vehicleId && tripContext?.estimated_arrival && <p className="mt-1 text-xs text-slate-400">Trip ETA: {new Date(tripContext.estimated_arrival).toLocaleString()}</p>}</div>
            <div className="flex items-start gap-3">
              <MapPin size={17} className="mt-1 shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <p className="text-xs text-slate-400">Latest coordinates</p>
                <p className="mt-1 break-words text-sm font-medium text-white">
                  {latest
                    ? `${Number(latest.latitude).toFixed(6)}, ${Number(latest.longitude).toFixed(6)}`
                    : 'Waiting for a GPS position'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock3 size={17} className="mt-1 shrink-0 text-emerald-400" />
              <div>
                <p className="text-xs text-slate-400">Last recorded</p>
                <p className="mt-1 text-sm text-white">
                  {formatTime(latestTime)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {ageSeconds === null
                    ? 'No update received'
                    : ageSeconds < 2
                      ? 'Updated just now'
                      : `${ageSeconds} seconds ago`}
                </p>
                <p className="mt-1 text-xs text-slate-500">Speed: {latestTelemetry.speed} · Heading: {latestTelemetry.heading}</p>
                <p className="mt-1 text-xs text-slate-500">Source: {gpsSourceLabel(latest)}{latest?.device_connected == null ? '' : ` · Device reports ${latest.device_connected ? 'connected' : 'disconnected'}`}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Metric
              icon={Crosshair}
              label="GPS points"
              value={validLocations.length}
              detail="Loaded history"
            />
            <Metric
              icon={Radio}
              label="GPS freshness"
              value={connectionStatus}
              detail="90-second freshness threshold"
            />
            <Metric
              icon={Navigation}
              label="Latitude"
              value={latest ? Number(latest.latitude).toFixed(4) : '—'}
            />
            <Metric
              icon={MapPin}
              label="Longitude"
              value={latest ? Number(latest.longitude).toFixed(4) : '—'}
            />
          </div>

          <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">Tracking feed</span>
              <span className="text-xs font-medium text-emerald-300">
            {vehicleId ? `WebSocket ${socketStatus}` : 'No vehicle selected'}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${
                  isConnected ? 'w-full bg-emerald-400' : isSimulated ? 'w-1/4 bg-amber-400' : 'w-1/4 bg-rose-400'
                }`}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Persisted location updates stream over WebSocket. The freshness
              indicator reflects record age, not verified hardware connectivity.
            </p>
          </div>
          {etaNotice && <p role="status" className="mt-2 text-xs text-amber-300">{etaNotice}</p>}
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/90 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold text-white">Vehicle location map</h4>
              <p className="mt-1 text-xs text-slate-400">
                Recorded route and latest reported position
              </p>
            </div>
            <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300">
              OpenStreetMap
            </span>
          </div>

          <div className="h-[430px] overflow-hidden rounded-xl border border-slate-700/70">
            <MapContainer
              key={vehicleId || 'none'}
              center={center}
              zoom={7}
              scrollWheelZoom
              className="h-full w-full"
            >
              <FollowVehicle position={currentPosition} />

              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {positions.length > 1 && (
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: '#10b981',
                    weight: 5,
                    opacity: 0.9,
                  }}
                />
              )}

              {latest && (
                <Marker
                  position={currentPosition}
                  icon={truckIcon}
                >
                  <Popup>
                    <strong>Vehicle {vehicleId}</strong>
                    <br />
                    Latest recorded GPS position
                    <br />
                    {Number(latest.latitude).toFixed(6)},{' '}
                    {Number(latest.longitude).toFixed(6)}
                    <br />
                    Speed: {latestTelemetry.speed}
                    <br />
                    Heading: {latestTelemetry.heading}
                    <br />
                    Source: {gpsSourceLabel(latest)}
                    <br />
                    {formatTime(latestTime)}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              Latest vehicle position
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1 w-5 rounded bg-emerald-400" />
              Recorded GPS trail
            </span>
            <span className="flex items-center gap-2">
              <Route size={14} />
              {positions.length} route points
            </span>
          </div>
        </section>
      </div>

      <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-sm leading-6 text-slate-300">
        <div className="flex items-start gap-3">
          <Activity size={19} className="mt-1 shrink-0 text-blue-400" />
          <p>
            GPS history streams over WebSocket. The vehicle marker follows
            the newest saved coordinate. Simulated points are not actual vehicle
            telemetry, and the connecting line may not follow roads. Real
            tracking requires a GPS device or mobile app to send location data.
          </p>
        </div>
      </div>
    </div>
  )
}

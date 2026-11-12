import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRoleLandingView, shouldShowFleetDashboard } from './roleRouting.js'

test('login landing keeps each established role on its intended workspace', () => {
  assert.equal(getRoleLandingView('driver'), 'drivers')
  assert.equal(getRoleLandingView('dispatcher'), 'dispatcherDashboard')
  assert.equal(getRoleLandingView('fleet_manager'), 'vehicles')
  assert.equal(getRoleLandingView('administrator'), 'admin')
  assert.equal(getRoleLandingView('unknown'), 'restricted')
})

test('Fleet Dashboard layout is visible only to administrator, fleet manager and dispatcher', () => {
  assert.equal(shouldShowFleetDashboard('administrator'), true)
  assert.equal(shouldShowFleetDashboard('fleet_manager'), true)
  assert.equal(shouldShowFleetDashboard('dispatcher'), true)
  assert.equal(shouldShowFleetDashboard('driver'), false)
  assert.equal(shouldShowFleetDashboard(undefined), false)
})

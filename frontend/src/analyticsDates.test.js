import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPeriodRange } from './analyticsDates.js'

test('analytics presets create inclusive calendar date ranges', () => {
  const now = new Date(2026, 9, 29, 15, 30)
  assert.deepEqual(getPeriodRange('today', now), { start: '2026-10-29', end: '2026-10-29' })
  assert.deepEqual(getPeriodRange('7d', now), { start: '2026-10-23', end: '2026-10-29' })
  assert.deepEqual(getPeriodRange('30d', now), { start: '2026-09-30', end: '2026-10-29' })
  assert.deepEqual(getPeriodRange('month', now), { start: '2026-10-01', end: '2026-10-29' })
})

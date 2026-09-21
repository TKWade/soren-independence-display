import assert from 'node:assert/strict'
import test from 'node:test'
import { getTimelineState, summarizeDay, dateKey } from '../src/lib/schedule.ts'

const picture = { id: 'home', label: 'HOME', kind: 'home' }
const place = { id: 'home', name: 'Home', picture }
const person = { id: 'carer', name: 'Carer', picture }
const activity = { id: 'home', label: 'HOME', picture }
const event = (id, start, end, sleep = false) => ({
  id, title: id, label: id, startTime: `2026-09-23T${start}`,
  endTime: end && `2026-09-23T${end}`, activity, people: [person], place, picture,
  ...(sleep ? { sleepLocation: place } : {}),
})
const day = {
  id: 'day', date: '2026-09-23', primaryEventId: 'swim',
  events: [event('school', '08:00', '15:00'), event('swim', '16:00', '17:00'), event('sleep', '19:30', undefined, true)],
}
const at = time => getTimelineState(day, new Date(`2026-09-23T${time}`))
test('before first event: first is next, no now', () => {
  assert.equal(at('07:00').currentId, undefined)
  assert.equal(at('07:00').nextId, 'school')
})
test('start inclusive, end exclusive, gap does not invent now', () => {
  assert.equal(at('08:00').currentId, 'school')
  assert.equal(at('15:00').currentId, undefined)
  assert.equal(at('15:00').nextId, 'swim')
  assert.equal(at('16:00').currentId, 'swim')
  assert.equal(at('17:00').statuses.swim, 'past')
  assert.equal(at('17:00').nextId, 'sleep')
})
test('sleep is the remaining now through late evening', () => {
  assert.equal(at('23:59').currentId, 'sleep')
  assert.equal(at('23:59').nextId, undefined)
})
test('past and future days do not get a false now', () => {
  const past = getTimelineState(day, new Date('2026-09-24T12:00'))
  assert.equal(past.currentId, undefined)
  assert.ok(Object.values(past.statuses).every(status => status === 'past'))
  const future = getTimelineState(day, new Date('2026-09-22T12:00'))
  assert.equal(future.currentId, undefined)
  assert.equal(future.nextId, 'school')
})
test('missing end lasts until next start and transitions exactly', () => {
  const schedule = { ...day, events: [event('home', '08:00'), event('sleep', '19:30', undefined, true)] }
  assert.equal(getTimelineState(schedule, new Date('2026-09-23T19:29')).currentId, 'home')
  assert.equal(getTimelineState(schedule, new Date('2026-09-23T19:30')).currentId, 'sleep')
})
test('sorts without mutating; summary uses designated primary and final sleep', () => {
  const unsorted = { ...day, events: [...day.events].reverse() }
  assert.equal(getTimelineState(unsorted, new Date('2026-09-23T09:00')).events[0].id, 'school')
  assert.equal(unsorted.events[0].id, 'sleep')
  assert.equal(summarizeDay(day).sleep.id, 'home')
  assert.equal(summarizeDay(day).activity, day.events[1].picture)
})
test('empty schedules are safe', () => {
  assert.deepEqual(getTimelineState({ ...day, events: [] }, new Date()).events, [])
  assert.equal(summarizeDay({ ...day, events: [] }), undefined)
})
test('local date key handles year boundary', () => {
  assert.equal(dateKey(new Date(2027, 0, 1, 0, 1)), '2027-01-01')
})

test('overlapping events choose latest active start', () => {
  const schedule = { ...day, events: [event('school', '08:00', '17:00'), event('swim', '16:00', '18:00')] }
  assert.equal(getTimelineState(schedule, new Date('2026-09-23T16:30')).currentId, 'swim')
})
test('completed sleep event remains destination until local midnight', () => {
  const schedule = { ...day, events: [event('sleep', '19:30', '20:00', true)] }
  assert.equal(getTimelineState(schedule, new Date('2026-09-23T22:00')).currentId, 'sleep')
  assert.equal(getTimelineState(schedule, new Date('2026-09-24T00:00')).currentId, undefined)
})

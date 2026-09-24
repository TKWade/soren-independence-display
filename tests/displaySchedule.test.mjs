import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDaySchedule } from '../src/lib/displaySchedule.ts'
import { createMockWeek, mockHomeSchedule, mockProfile, activities, places, people } from '../src/data/mockWeek.ts'
import { summarizeDay, getTimelineState } from '../src/lib/schedule.ts'

const date = '2026-09-23'
const external = {
  id: 'shared-school',
  source: { kind: 'external', provider: 'google', externalCalendarId: 'family-calendar',
    externalEventId: 'school-instance', externalSeriesId: 'school-series', lastSyncedAt: '2026-09-23T10:00:00Z' },
  calendar: { title: 'School dropoff', startTime: date + 'T08:00', endTime: date + 'T15:00',
    timeZone: 'America/Chicago', location: 'Calendar-owned school address',
    recurrence: { rules: ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'] } },
}
const visual = (profileId, overrides = {}) => ({
  eventId: external.id, profileId, label: 'SCHOOL', visible: true,
  activity: activities.school, picture: activities.school.picture, people: [people.dad], place: places.school,
  ...overrides,
})
const project = (profileId, events, enrichments, homeSchedule) => buildDaySchedule({
  date, profileId, events, enrichments, homeSchedule, primaryEventId: external.id,
})

test('one external event projects independent visual metadata for multiple profiles', () => {
  const enrichments = [visual('soren'), visual('sister', { label: 'CLASS', people: [people.mom], place: places.momHome })]
  const before = structuredClone({ external, enrichments })
  const soren = project('soren', [external], enrichments).events[0]
  const sister = project('sister', [external], enrichments).events[0]
  assert.equal(soren.id, sister.id)
  assert.equal(soren.startTime, sister.startTime)
  assert.equal(soren.label, 'SCHOOL')
  assert.equal(sister.label, 'CLASS')
  assert.equal(sister.people[0].id, 'mom')
  assert.equal(sister.place.id, 'mom-home')
  assert.equal('source' in soren, false)
  assert.deepEqual({ external, enrichments }, before)
})
test('visibility is profile-specific; unmapped events stay off the display', () => {
  const enrichments = [visual('soren', { visible: false }), visual('sister')]
  assert.equal(project('soren', [external], enrichments).events.length, 0)
  assert.equal(project('sister', [external], enrichments).events.length, 1)
  assert.equal(project('unknown', [external], enrichments).events.length, 0)
})
test('local, Google and Microsoft sources share the same UI projection', () => {
  const sources = [{ kind: 'local' }, external.source, { ...external.source, provider: 'microsoft' }]
  const results = sources.map(source => project('soren', [{ ...external, source }], [visual('soren')]))
  assert.deepEqual(results[0], results[1])
  assert.deepEqual(results[1], results[2])
})
test('calendar refresh changes scheduling without overwriting visual enrichment', () => {
  const enrichment = visual('soren', { label: 'CLASS', place: places.dadHome })
  const updated = { ...external, calendar: { ...external.calendar, title: 'New provider title', startTime: date + 'T09:00', location: 'New address' } }
  const result = project('soren', [updated], [enrichment]).events[0]
  assert.equal(result.title, 'New provider title')
  assert.equal(result.startTime, date + 'T09:00')
  assert.equal(result.label, 'CLASS')
  assert.equal(result.place.id, 'dad-home')
})
test('home schedule produces a sleep card without any calendar event', () => {
  const day = project(mockProfile.id, [], [], mockHomeSchedule)
  assert.equal(day.events.length, 1)
  assert.equal(day.events[0].sleepLocation.id, 'mom-home')
  assert.equal(summarizeDay(day).sleep.id, 'mom-home')
  assert.equal(getTimelineState(day, new Date(date + 'T20:00')).currentId, date + '-sleep')
  assert.equal(project('sister', [], [], mockHomeSchedule).events.length, 0)
})
test('refactoring preserves the approved weekly pictures and Wednesday sequence', () => {
  const week = createMockWeek(new Date(date + 'T12:00'))
  assert.equal(week.length, 7)
  assert.deepEqual(week.map(day => summarizeDay(day).activity.label), ['SCHOOL', 'SCHOOL', 'SWIM', 'SCHOOL', 'SCHOOL', 'PARK', 'HOME'])
  assert.deepEqual(week.map(day => summarizeDay(day).sleep.id), ['dad-home', 'dad-home', 'mom-home', 'mom-home', 'dad-home', 'dad-home', 'mom-home'])
  assert.deepEqual(week[2].events.map(event => event.label), ['SCHOOL', 'PICKUP', 'SWIM', 'HOME', 'DINNER', 'SLEEP'])
  assert.deepEqual(week[2].events.map(event => event.startTime.slice(11)), ['08:00', '15:00', '15:30', '17:00', '18:00', '19:30'])
})

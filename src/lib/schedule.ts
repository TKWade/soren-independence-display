import type { CalendarEvent, DaySchedule, DaySummary } from '../types/calendar.ts'

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function dayLabels(date: string) {
  const local = new Date(date + 'T12:00:00')
  return {
    name: local.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase(),
    shortName: local.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    displayDate: local.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
    dayOfMonth: local.getDate(),
  }
}
export function orderedEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
}
export function summarizeDay(day: DaySchedule): DaySummary | undefined {
  const events = orderedEvents(day.events)
  const primary = events.find(event => event.id === day.primaryEventId) ?? events[0]
  if (!primary) return undefined
  return {
    activity: primary.picture,
    people: primary.people.map(person => person.picture),
    sleep: events.findLast(event => event.sleepLocation)?.sleepLocation?.picture,
  }
}
export type EventStatus = 'past' | 'now' | 'next' | 'future'
export interface TimelineState {
  events: CalendarEvent[]
  statuses: Record<string, EventStatus>
  currentId?: string
  nextId?: string
}
/**
 * End times are exclusive. Untimed ends last until the next event or local midnight.
 * In a gap there is no NOW; the upcoming event is NEXT. For overlapping events,
 * the most recently started active event wins. Past/future dates never get a false NOW.
 */
export function getTimelineState(day: DaySchedule, now: Date): TimelineState {
  const events = orderedEvents(day.events)
  const midnight = new Date(day.date + 'T00:00:00')
  midnight.setDate(midnight.getDate() + 1)
  const time = now.getTime()
  const endOf = (event: CalendarEvent, index: number) => event.endTime
    ? Date.parse(event.endTime)
    : events[index + 1] ? Date.parse(events[index + 1].startTime) : midnight.getTime()
  let currentId: string | undefined
  events.forEach((event, index) => {
    if (Date.parse(event.startTime) <= time && time < endOf(event, index)) currentId = event.id
  })
  // Keep the final sleep destination meaningful for the rest of its scheduled day.
  if (!currentId && dateKey(now) === day.date && events.length) {
    const final = events[events.length - 1]
    if (final.sleepLocation && time >= Date.parse(final.startTime)) currentId = final.id
  }
  const nextId = events.find(event => Date.parse(event.startTime) > time)?.id
  const statuses: Record<string, EventStatus> = {}
  events.forEach((event, index) => {
    statuses[event.id] = event.id === currentId ? 'now' : event.id === nextId ? 'next'
      : endOf(event, index) <= time || Date.parse(event.startTime) <= time ? 'past' : 'future'
  })
  return { events, statuses, currentId, nextId }
}

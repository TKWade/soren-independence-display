import type { CalendarEvent, DaySchedule, EventVisualEnrichment, HomeSchedule } from '../types/calendar.ts'

/**
 * Join already-expanded calendar occurrences to one profile's visual records.
 * No recurrence expansion, provider calls, matching engine, or sync occurs here.
 * Dates/occurrences must already be resolved into the profile's display timezone.
 */
export function buildDaySchedule({ date, profileId, events, enrichments, homeSchedule, primaryEventId }: {
  date: string
  profileId: string
  events: CalendarEvent[]
  enrichments: EventVisualEnrichment[]
  homeSchedule?: HomeSchedule
  primaryEventId: string
}): DaySchedule {
  const visuals = new Map(enrichments.filter(item => item.profileId === profileId).map(item => [item.eventId, item]))
  const displayEvents: DaySchedule['events'] = events.flatMap(event => {
    const visual = visuals.get(event.id)
    // Unmapped events remain off the child display until enriched/reviewed.
    if (!visual?.visible) return []
    return [{
      id: event.id, title: event.calendar.title,
      startTime: event.calendar.startTime, endTime: event.calendar.endTime,
      label: visual.label, activity: visual.activity, picture: visual.picture,
      people: visual.people, place: visual.place,
    }]
  })
  const weekday = new Date(date + 'T12:00:00').getDay()
  const night = homeSchedule?.profileId === profileId
    ? homeSchedule.nights.find(item => item.weekday === weekday) : undefined
  if (night) displayEvents.push({
    id: `${date}-sleep`, title: 'SLEEP', label: night.picture.label,
    startTime: `${date}T${night.bedtime}`, activity: night.activity,
    picture: night.picture, people: night.people, place: night.place, sleepLocation: night.place,
  })
  return { id: date, date, events: displayEvents, primaryEventId }
}

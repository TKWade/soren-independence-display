import type { Activity, CalendarEvent, DaySchedule, EventMatchingRule, EventVisualEnrichment, HomeSchedule, Person, Place, Profile } from '../types/calendar'
import { dateKey } from '../lib/schedule.ts'
import { buildDaySchedule } from '../lib/displaySchedule.ts'
export { dateKey } from '../lib/schedule.ts'

export const mockProfile: Profile = { id: 'soren', name: 'Soren' }
const mockTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

export const people: Record<string, Person> = {
  dad: { id: 'dad', name: 'Dad', picture: { id: 'dad', label: 'DAD', kind: 'dad' } },
  mom: { id: 'mom', name: 'Mom', picture: { id: 'mom', label: 'MOM', kind: 'mom' } },
}
export const places: Record<string, Place> = {
  school: { id: 'school', name: 'School', picture: { id: 'school', label: 'SCHOOL', kind: 'school' } },
  pool: { id: 'pool', name: 'Swimming pool', picture: { id: 'pool', label: 'POOL', kind: 'swim' } },
  park: { id: 'park', name: 'Park', picture: { id: 'park', label: 'PARK', kind: 'park' } },
  dadHome: { id: 'dad-home', name: 'Dad’s house', picture: { id: 'dad-home', label: 'DAD', kind: 'home', badgeKind: 'dad' } },
  momHome: { id: 'mom-home', name: 'Mom’s house', picture: { id: 'mom-home', label: 'MOM', kind: 'home', badgeKind: 'mom' } },
}
const activity = (id: Activity['picture']['kind'], label: string): Activity => ({
  id, label, picture: { id, label, kind: id },
})
export const activities = {
  school: activity('school', 'SCHOOL'), swim: activity('swim', 'SWIM'),
  park: activity('park', 'PARK'), home: activity('home', 'HOME'),
  dinner: activity('dinner', 'DINNER'), sleep: activity('sleep', 'SLEEP'),
  pickup: { id: 'pickup', label: 'PICKUP', picture: { id: 'pickup', label: 'PICKUP', kind: 'home' } } satisfies Activity,
}

/** Examples of rule definitions only; no importer or matching engine is running. */
export const mockMatchingRules: EventMatchingRule[] = [
  { id: 'school-title', enabled: true, priority: 100, profileIds: [mockProfile.id],
    match: { title: { operator: 'equals', value: 'SCHOOL', caseSensitive: false } },
    defaults: { label: 'SCHOOL', activity: activities.school, picture: activities.school.picture } },
  { id: 'swimming-title', enabled: true, priority: 90, profileIds: [mockProfile.id],
    match: { title: { operator: 'contains', value: 'SWIMMING', caseSensitive: false } },
    defaults: { label: 'SWIM', activity: activities.swim, picture: activities.swim.picture } },
]

export const mockHomeSchedule: HomeSchedule = {
  id: 'weekly-home', profileId: mockProfile.id, timeZone: mockTimeZone,
  nights: ([0, 1, 2, 3, 4, 5, 6] as const).map(weekday => {
    const person = [people.mom, people.dad, people.dad, people.mom, people.mom, people.dad, people.dad][weekday]
    return { weekday, bedtime: '19:30', people: [person],
      place: person.id === 'dad' ? places.dadHome : places.momHome,
      activity: activities.sleep, picture: { ...activities.sleep.picture, badgeKind: person.picture.kind } }
  }),
}

/** A repeating illustrative week, anchored to the current local Monday. */
export function createMockWeek(today: Date): DaySchedule[] {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    const key = dateKey(date)
    const person = [people.dad, people.dad, people.mom, people.mom, people.dad, people.dad, people.mom][index]
    const home = person.id === 'dad' ? places.dadHome : places.momHome
    const events: CalendarEvent[] = []
    const enrichments: EventVisualEnrichment[] = []
    const add = (id: string, start: string, end: string | undefined, act: Activity, place: Place, label = act.label) => {
      const event: CalendarEvent = {
        id: key + '-' + id, source: { kind: 'local' },
        calendar: { title: label, startTime: key + 'T' + start,
          endTime: end ? key + 'T' + end : undefined, timeZone: mockTimeZone, location: place.name },
      }
      const visual: EventVisualEnrichment = {
        eventId: event.id, profileId: mockProfile.id, visible: true,
        label, activity: act, people: [person], place, picture: { ...act.picture, label },
      }
      if (id === 'pickup') visual.picture = { ...person.picture, label: 'PICKUP' }
      if (act.id === 'home') visual.picture = { ...home.picture, label: 'HOME' }
      enrichments.push(visual)
      events.push(event)
      return event.id
    }
    let primaryEventId: string
    if (index < 5) {
      primaryEventId = add('school', '08:00', '15:00', activities.school, places.school)
      add('pickup', '15:00', '15:30', activities.pickup, places.school)
      if (index === 2) {
        primaryEventId = add('swim', '15:30', '17:00', activities.swim, places.pool)
        add('home', '17:00', '18:00', activities.home, home)
      } else add('home', '15:30', '18:00', activities.home, home)
    } else {
      primaryEventId = add(index === 5 ? 'park' : 'home', '09:00', '12:00',
        index === 5 ? activities.park : activities.home, index === 5 ? places.park : home)
      add('afternoon', '12:00', '18:00', activities.home, home)
    }
    add('dinner', '18:00', '19:30', activities.dinner, home)
    return buildDaySchedule({ date: key, profileId: mockProfile.id, events, enrichments,
      homeSchedule: mockHomeSchedule, primaryEventId })
  })
}

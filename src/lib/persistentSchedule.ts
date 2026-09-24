import { prepareExternalDisplay } from '../calendar/relevance.ts'
import type { HouseholdData, HomeRuleRow, LibraryRow } from '../data/records.ts'
import type { DaySchedule, DisplayEvent, PictureItem } from '../types/calendar.ts'
import { addDays, atLocalTime, dateInZone, mondayFor } from './time.ts'
import { resolveOccurrences } from './recurrence.ts'

export function resolveHomeRule(rules: HomeRuleRow[], profileId: string, date: string) {
 const candidates = rules.filter(rule => rule.profile_id === profileId)
 return candidates.find(rule => rule.override_date === date)
  ?? candidates.find(rule => rule.override_date === null && rule.weekday === new Date(date + 'T12:00').getDay())
}
export function pictureFor(row: LibraryRow, data: HouseholdData): PictureItem {
 const resident = data.people.find(person => person.id === row.picture_person_id)
 return { id: row.id, label: row.label, kind: row.icon,
  photoUrl: row.image_path ? data.imageUrls[row.image_path] : undefined, badgeKind: resident?.icon }
}
export function normalizeWeek(snapshot: HouseholdData, profileId: string, now: Date): DaySchedule[] {
 const data=prepareExternalDisplay(snapshot)
 if (!data.profiles.some(profile => profile.id === profileId && profile.active)) return []
 const zone = data.household.time_zone
 const monday = mondayFor(dateInZone(now, zone))
 const occurrences = data.events.flatMap(event => resolveOccurrences(event,monday,addDays(monday,6)))
 const personFor = (id: string) => {
  const row = data.people.find(item => item.id === id)
  return row ? { id, name: row.name, picture: pictureFor(row, data) } : undefined
 }
 return Array.from({ length: 7 }, (_, index) => {
  const date = addDays(monday, index)
  const begin = atLocalTime(date, '00:00', zone, 'compatible')
  const end = atLocalTime(addDays(date, 1), '00:00', zone, 'compatible')
  let primaryEventId = ''
  const events: DisplayEvent[] = []
  for (const visual of data.visuals.filter(item => item.profile_id === profileId && item.visible)) {
   for (const event of occurrences.filter(item => item.seriesEventId === visual.event_id)) {
    const startsToday = dateInZone(new Date(event.start_time), zone) === date
    const overlaps = Date.parse(event.start_time) < Date.parse(end) && event.end_time && Date.parse(event.end_time) > Date.parse(begin)
    if (!startsToday && !overlaps) continue
    const activity = data.activities.find(item => item.id === visual.activity_id)
    const place = data.places.find(item => item.id === visual.place_id)
    if (!activity || !place) continue
    const label = visual.label_override || activity.label
    const personPicture = visual.picture_person_id ? personFor(visual.picture_person_id)?.picture : undefined
    const picture = personPicture ?? (activity.icon === 'home' ? pictureFor(place, data) : pictureFor(activity, data))
    events.push({ id: event.id, title: event.title, label, startTime: event.start_time, endTime: event.end_time ?? undefined,
     activity: { id: activity.id, label: activity.label, picture: pictureFor(activity, data) },
     place: { id: place.id, name: place.name, picture: pictureFor(place, data) },
     people: data.eventPeople.filter(item => item.visual_id === visual.id).map(item => personFor(item.person_id)).filter(item => item !== undefined),
     picture: { ...picture, label } })
    if (visual.is_primary && !primaryEventId) primaryEventId = event.id
    }
  }
  const home = resolveHomeRule(data.homeRules, profileId, date)
  const homePlace = data.places.find(item => item.id === home?.place_id)
  if (home && homePlace) {
   const caregiver = home.caregiver_id ? personFor(home.caregiver_id) : undefined
   const place = { id: homePlace.id, name: homePlace.name, picture: pictureFor(homePlace, data) }
   const sleepPicture: PictureItem = { id: 'sleep', label: 'SLEEP', kind: 'sleep', badgeKind: caregiver?.picture.kind }
   events.push({ id: date + '-sleep', title: 'Sleep', label: 'SLEEP', startTime: atLocalTime(date, home.bedtime, zone, 'compatible'),
    activity: { id: 'sleep', label: 'SLEEP', picture: sleepPicture }, picture: sleepPicture,
    people: caregiver ? [caregiver] : [], place, sleepLocation: place })
  }
  return { id: date, date, timeZone: zone, events, primaryEventId }
 })
}

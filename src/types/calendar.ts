export type PictureKind = 'school' | 'swim' | 'park' | 'home' | 'dad' | 'mom' | 'dinner' | 'sleep'
export interface PictureItem {
  id: string
  label: string
  kind: PictureKind
  photoUrl?: string
  /** A second recognition cue, e.g. a resident's portrait on a house. */
  badgeKind?: PictureKind
}
export interface Person {
  id: string
  name: string
  picture: PictureItem
}
export interface Place {
  id: string
  name: string
  picture: PictureItem
}
export interface Activity {
  id: string
  label: string
  picture: PictureItem
}
export interface CalendarEvent {
  id: string
  title: string
  label: string
  /** ISO local date-time for mock data; backend timestamps may include an offset. */
  startTime: string
  endTime?: string
  activity: Activity
  people: Person[]
  place: Place
  picture: PictureItem
  sleepLocation?: Place
}
export interface DaySchedule {
  id: string
  date: string
  events: CalendarEvent[]
  primaryEventId: string
}
export interface DaySummary {
  activity: PictureItem
  people: PictureItem[]
  sleep?: PictureItem
}

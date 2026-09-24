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
export interface Profile {
  id: string
  name: string
}

export type CalendarProvider = 'google' | 'microsoft'

/** Provider adapters translate to this contract; UI never consumes provider payloads. */
export interface ExternalEventSource {
  kind: 'external'
  provider: CalendarProvider
  externalCalendarId: string
  externalEventId: string
  externalSeriesId?: string
  /** Original occurrence start, retained when a recurring instance is moved. */
  originalStartTime?: string
  /** ISO instant; absent until a successful sync. No credentials belong here. */
  lastSyncedAt?: string
}
export type EventSource = { kind: 'local' } | ExternalEventSource

export interface CalendarRecurrence {
  /** Provider-neutral RFC 5545 RRULE values, without the RRULE: prefix. */
  rules: string[]
  additionalDates?: string[]
  excludedDates?: string[]
}

/** Owned by the calendar provider for linked events, or the local editor otherwise. */
export interface CalendarEventDetails {
  title: string
  startTime: string
  endTime?: string
  /** IANA zone; imported timed events must include an offset in their timestamps. */
  timeZone: string
  allDay?: boolean
  recurrence?: CalendarRecurrence
  /** Calendar text/address, deliberately separate from an app visual Place. */
  location?: string
}
export interface CalendarEvent {
  /** Stable application ID, independent of provider IDs. */
  id: string
  source: EventSource
  calendar: CalendarEventDetails
}

export interface VisualEnrichment {
  label: string
  activity: Activity
  picture: PictureItem
  people: Person[]
  place: Place
  visible: boolean
}

/** Separate app-owned record: unique (eventId, profileId), never replaced by sync. */
export interface EventVisualEnrichment extends VisualEnrichment {
  eventId: string
  profileId: string
}

/** Architectural contract only; rule evaluation/import is not implemented. */
export interface EventMatchingRule {
  id: string
  enabled: boolean
  priority: number
  profileIds: string[]
  match: {
    title: { operator: 'equals' | 'contains'; value: string; caseSensitive: boolean }
    source?: { provider: CalendarProvider; externalCalendarId?: string }
  }
  /** Proposes app metadata, never calendar edits. Explicit enrichment wins. */
  defaults: Partial<VisualEnrichment>
}

/** App-owned weekly home/sleep plan, independent of CalendarEvent records. */
export interface HomeSchedule {
  id: string
  profileId: string
  timeZone: string
  nights: {
    /** JavaScript weekday: Sunday = 0. */
    weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
    bedtime: string
    place: Place
    people: Person[]
    picture: PictureItem
    activity: Activity
  }[]
}

/** Read-only projection for the approved UI; not a persisted calendar record. */
export interface DisplayEvent {
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
  timeZone?: string
  events: DisplayEvent[]
  primaryEventId: string
}
export interface DaySummary {
  activity: PictureItem
  people: PictureItem[]
  sleep?: PictureItem
}

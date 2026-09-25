import { Temporal } from '@js-temporal/polyfill'
import type { ExternalCalendar, ExternalChange, ExternalEvent, ExternalEventIdentity } from '../../src/types/externalCalendar.ts'
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Invalid provider object');return value as Record<string,unknown>}
const text=(value:unknown)=>typeof value==='string'?value:''
function required(value:unknown) {const result=text(value);if(!result.trim()) throw new Error('Missing provider identifier or time');return result}
function identity(provider:'google'|'microsoft',raw:Record<string,unknown>,calendar:ExternalCalendar):ExternalEventIdentity {
 return {provider,connectionId:calendar.connection_id,calendarId:calendar.id,externalCalendarId:calendar.external_calendar_id,externalEventId:required(raw.id)}
}
function instant(value:string,zone:string) {
 if(/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) return Temporal.Instant.from(value).toString()
 // Live Graph adapter must request UTC or translate Windows timezone IDs before normalization.
 return Temporal.PlainDateTime.from(value).toZonedDateTime(zone,{disambiguation:'reject'}).toInstant().toString()
}
function validate(event:ExternalEvent):ExternalChange {
 if(event.allDay) {
  if(Temporal.PlainDate.compare(Temporal.PlainDate.from(event.end),Temporal.PlainDate.from(event.start))<=0) throw new Error('Invalid all-day range')
 } else if(Temporal.Instant.compare(Temporal.Instant.from(event.end),Temporal.Instant.from(event.start))<=0) throw new Error('Invalid event range')
 if(event.lastModified) Temporal.Instant.from(event.lastModified)
 Temporal.Instant.from(event.lastSyncedAt).toZonedDateTimeISO(event.timeZone)
 return {type:'upsert',event}
}
/** Pure provider normalization shared by live adapters and test fixtures. */
export function normalizeGoogleEvent(value:unknown,calendar:ExternalCalendar,syncedAt:string):ExternalChange {
 const raw=object(value),source=identity('google',raw,calendar)
 if(raw.status==='cancelled') return {type:'cancel',identity:source,lastSyncedAt:syncedAt}
 const start=object(raw.start),end=object(raw.end),allDay=!!start.date
 const zone=text(start.timeZone)||calendar.time_zone
 const original=raw.originalStartTime?object(raw.originalStartTime):null
 return validate({...source,externalSeriesId:text(raw.recurringEventId)||null,
  originalStart:original?(text(original.dateTime)||text(original.date)||null):null,
  title:text(raw.summary),description:text(raw.description),start:allDay?Temporal.PlainDate.from(required(start.date)).toString():instant(required(start.dateTime),zone),
  end:allDay?Temporal.PlainDate.from(required(end.date)).toString():instant(required(end.dateTime),zone),allDay,timeZone:zone,
  locationText:text(raw.location),recurrence:Array.isArray(raw.recurrence)?{rules:raw.recurrence}:null,
  kind:raw.recurringEventId?'occurrence':raw.recurrence?'seriesMaster':'single',status:raw.status==='tentative'?'tentative':'confirmed',
  lastModified:text(raw.updated)||null,lastSyncedAt:syncedAt})
}
export function normalizeMicrosoftEvent(value:unknown,calendar:ExternalCalendar,syncedAt:string):ExternalChange {
 const raw=object(value),source=identity('microsoft',raw,calendar)
 if(raw.isCancelled===true||raw['@removed']) return {type:'cancel',identity:source,lastSyncedAt:syncedAt}
 const start=object(raw.start),end=object(raw.end),allDay=raw.isAllDay===true
 const zone=text(start.timeZone)||calendar.time_zone
 const location=raw.location?object(raw.location):null
 return validate({...source,externalSeriesId:text(raw.seriesMasterId)||null,originalStart:text(raw.originalStart)||null,
  title:text(raw.subject),description:text(raw.bodyPreview),
  start:allDay?Temporal.PlainDate.from(required(start.dateTime).slice(0,10)).toString():instant(required(start.dateTime),zone),
  end:allDay?Temporal.PlainDate.from(required(end.dateTime).slice(0,10)).toString():instant(required(end.dateTime),text(end.timeZone)||zone),
  allDay,timeZone:zone,locationText:location?text(location.displayName):'',recurrence:raw.recurrence?object(raw.recurrence):null,
  kind:raw.type==='seriesMaster'?'seriesMaster':raw.seriesMasterId?'occurrence':'single',status:raw.showAs==='tentative'?'tentative':'confirmed',
  lastModified:text(raw.lastModifiedDateTime)||null,lastSyncedAt:syncedAt})
}

import type { CalendarProvider, EventMatchingRule } from './calendar.ts'
export interface CalendarConnection {
 id:string; household_id:string; provider:CalendarProvider; label:string; provider_account_id?:string|null;
 status:'connected'|'needs_authorization'|'disabled'; last_synced_at:string|null
}
export interface ExternalCalendar {
 id:string; household_id:string; connection_id:string; external_calendar_id:string;
 name:string; time_zone:string; enabled:boolean; behavior:'evaluate'|'ignore';
 last_synced_at:string|null; sync_status:'idle'|'error'; sync_error:string|null
}
/** Safe sync summary. Opaque cursors and credentials exist only in the trusted server layer. */
export type CalendarSyncState = Pick<ExternalCalendar,'id'|'last_synced_at'|'sync_status'|'sync_error'>
export interface ExternalEventIdentity {
 provider:CalendarProvider; connectionId:string; calendarId:string; externalCalendarId:string; externalEventId:string
}
export interface ExternalEvent extends ExternalEventIdentity {
 externalSeriesId:string|null; originalStart:string|null;
 title:string; description:string; start:string; end:string; allDay:boolean; timeZone:string;
 locationText:string; recurrence:Record<string,unknown>|null;
 kind:'single'|'occurrence'|'seriesMaster'; status:'confirmed'|'tentative';
 lastModified:string|null; lastSyncedAt:string
}
export type ExternalChange = {type:'upsert';event:ExternalEvent} | {type:'cancel';identity:ExternalEventIdentity;lastSyncedAt:string}
export interface MappingVisuals {
 activity_id:string|null; place_id:string|null; caregiver_id:string|null; picture_person_id:string|null;
 label:string|null; visible:boolean; is_primary:boolean
}
/** A manual per-profile decision, scoped to one event or to a whole provider series. */
export interface EventProfileMapping extends MappingVisuals {
 id:string; household_id:string; calendar_id:string; group_key:string; profile_id:string; action:'include'|'ignore'
}
/** Persisted form of the existing deterministic title-match rule contract. */
export interface CalendarMatchingRule extends MappingVisuals {
 id:string; household_id:string; profile_id:string; name:string; enabled:boolean; priority:number;
 title_operator:EventMatchingRule['match']['title']['operator']; title_value:string; case_sensitive:boolean;
 action:'include'|'ignore'; calendar_id:string|null;
 source_filter:{provider?:CalendarProvider;externalCalendarId?:string}|null
}
export interface CalendarIntegrationData {
 connections:CalendarConnection[]; calendars:ExternalCalendar[]; mappings:EventProfileMapping[]; matchingRules:CalendarMatchingRule[]
}

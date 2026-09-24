import type { CalendarIntegrationData } from '../types/externalCalendar'
import type { PictureKind } from '../types/calendar'
import type { LocalRecurrence } from '../lib/recurrence'
import type { ImagePresentation } from '../lib/images'
export interface HouseholdRow { id: string; name: string; time_zone: string }
export interface ProfileRow { id: string; household_id: string; name: string; active: boolean }
export interface LibraryRow {
 id: string; household_id: string; name: string; label: string; icon: PictureKind; image_path: string | null; active: boolean;
 relationship?: string; address?: string; place_type?: string; picture_person_id?: string | null
 source_image_path?: string | null; image_presentation?: ImagePresentation | null
}
export type LibraryName = 'people' | 'places' | 'activities'
export interface EventRow {
 id: string; household_id: string; title: string; start_time: string; end_time: string | null; time_zone: string;
 location: string; all_day: boolean; recurrence: object | null; source_kind: 'local' | 'external'
 local_recurrence?: LocalRecurrence | null
 description?:string; last_modified?:string|null; external_status?:'confirmed'|'tentative'|'cancelled'|null; external_kind?:'single'|'occurrence'|'seriesMaster'|null; all_day_start?:string|null; all_day_end?:string|null
}
export interface SourceRow {
 calendar_id?:string|null; event_id: string; provider: 'google' | 'microsoft'; external_calendar_id: string; external_event_id: string;
 external_series_id: string | null; original_start_time: string | null; last_synced_at: string | null
}
export interface VisualRow {
 id: string; household_id: string; event_id: string; profile_id: string; activity_id: string; place_id: string;
 label_override: string | null; visible: boolean; is_primary: boolean; picture_person_id: string | null
}
export interface EventPersonRow { visual_id: string; person_id: string }
export interface HomeRuleRow {
 id: string; household_id: string; profile_id: string; weekday: number | null; override_date: string | null;
 bedtime: string; place_id: string; caregiver_id: string | null
}
export interface HouseholdData {
 household: HouseholdRow; profiles: ProfileRow[]; people: LibraryRow[]; places: LibraryRow[]; activities: LibraryRow[];
 events: EventRow[]; sources: SourceRow[]; visuals: VisualRow[]; eventPeople: EventPersonRow[]; homeRules: HomeRuleRow[];
 integration?:CalendarIntegrationData; imageUrls: Record<string,string>
}

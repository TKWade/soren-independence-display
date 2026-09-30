import type { HouseholdData } from '../data/records.ts'
export type OvernightMode='local'|'calendar_with_local_fallback'|'calendar_driven'
export interface ProfileHomePreferences {
 household_id:string;profile_id:string;overnight_mode:OvernightMode;
 default_bedtime:string|null;weekday_bedtimes:Partial<Record<number,string>>
}
export function homePreferences(data:HouseholdData,profileId:string):ProfileHomePreferences {
 return data.homePreferences?.find(p=>p.profile_id===profileId)??{household_id:data.household.id,profile_id:profileId,overnight_mode:'local',default_bedtime:null,weekday_bedtimes:{}}
}
export function eligibleSleepCalendar(data:HouseholdData) {
 return data.integration?.calendars.some(c=>c.enabled&&c.behavior==='evaluate'&&data.integration?.connections.some(connection=>connection.id===c.connection_id&&connection.status==='connected'))??false
}
/** Bedtime is independent of the resolved location and requires no calendar or fake local rule. */
export function normalBedtime(data:HouseholdData,profileId:string,date:string,explicit?:string|null) {
 const preferences=homePreferences(data,profileId),weekday=new Date(date+'T12:00:00Z').getUTCDay()
 return explicit||preferences.weekday_bedtimes[weekday]||preferences.default_bedtime||data.homeRules.find(r=>r.profile_id===profileId&&r.override_date===null&&r.weekday===weekday)?.bedtime||undefined
}

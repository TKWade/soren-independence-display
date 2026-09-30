import type { HouseholdData } from '../data/records.ts'
import { normalizeWeek } from './persistentSchedule.ts'
import { atLocalTime, mondayFor } from './time.ts'
/** Compose existing normalized weeks; recurrence and event projection remain owned by the engine. */
export function scheduleForDates(data:HouseholdData,profileId:string,dates:string[]) {
 const weeks=[...new Set(dates.map(mondayFor))]
 const days=weeks.flatMap(date=>normalizeWeek(data,profileId,new Date(atLocalTime(date,'12:00',data.household.time_zone,'compatible'))))
 const byDate=new Map(days.map(day=>[day.date,day]))
 return dates.flatMap(date=>byDate.has(date)?[byDate.get(date)!]:[])
}

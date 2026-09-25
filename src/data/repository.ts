import { validateImageFile } from '../lib/images'
import { client } from './supabase'
import type { HouseholdData, HouseholdRow, LibraryName, LibraryRow } from './records'
const bucket = 'household-images'
export async function households(): Promise<HouseholdRow[]> {
 const { data, error } = await client().from('households').select('*').order('created_at')
 if (error) throw error
 return data ?? []
}
async function rows(table: string, householdId: string) {
 const all: unknown[] = []
 for (let start = 0; ; start += 500) {
  const { data, error } = await client().from(table).select('*').eq('household_id', householdId).order('id').range(start,start+499)
  if (error) throw error
  all.push(...(data ?? []))
  if (!data || data.length < 500) return all
 }
}
export async function loadHousehold(household: HouseholdRow): Promise<HouseholdData> {
 const tables = ['profiles','people','places','activities','calendar_events','external_event_sources','event_visuals','event_people','home_rules','calendar_connections','external_calendars','event_profile_mappings','event_matching_rules','profile_display_preferences']
 const result = await Promise.all(tables.map(table => rows(table, household.id)))
 const data = { household, profiles: result[0], people: result[1], places: result[2], activities: result[3],
  events: result[4], sources: result[5], visuals: result[6], eventPeople: result[7], homeRules: result[8], displayPreferences:result[13], imageUrls: {}, integration:{connections:result[9],calendars:result[10],mappings:result[11],matchingRules:result[12]} } as HouseholdData
 const paths = [...new Set([...data.people,...data.places,...data.activities].flatMap(item => [item.image_path,item.source_image_path].filter((path): path is string => !!path)))]
 if (paths.length) {
  const { data: signed } = await client().storage.from(bucket).createSignedUrls(paths,3600)
  for (const image of signed ?? []) if (image.path && image.signedUrl) data.imageUrls[image.path] = image.signedUrl
 }
 return data
}
export async function createHousehold(name: string, zone: string) {
 const { data, error } = await client().rpc('create_household', { household_name: name, zone })
 if (error) throw error
 return data as string
}
export async function saveLibrary(table: LibraryName, values: Partial<LibraryRow>) {
 const { error } = await client().from(table).upsert(values)
 if (error) throw error
}
export async function saveRecord(table: 'profiles' | 'home_rules', values: Record<string,unknown>) {
 const { error } = await client().from(table).upsert(values)
 if (error) throw error
}
export async function removeRecord(table: 'calendar_events' | 'home_rules', id: string, hid: string) {
 const { error } = await client().from(table).delete().eq('id',id).eq('household_id',hid)
 if (error) throw error
}
export async function saveEvent(payload: Record<string,unknown>) {
 const { error } = await client().rpc('save_local_event', { payload })
 if (error) throw error
}
export async function seedHousehold(hid: string, weekStart: string) {
 const { error } = await client().rpc('seed_sample_household',{ hid, week_start: weekStart })
 if (error) throw error
}
export async function uploadImage(hid: string, file: Blob, group: string, rendition: 'original'|'display') {
 validateImageFile(file)
 const path = `${hid}/images/${group}/${rendition}.` + ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type])
 const { error } = await client().storage.from(bucket).upload(path,file,{ contentType: file.type, upsert: false })
 if (error) throw error
 return path
}
export async function discardUpload(path: string) { await client().storage.from(bucket).remove([path]) }


export async function saveDisplayProfile(payload:Record<string,unknown>) {
 const {error}=await client().rpc('save_display_profile',{payload});if(error) throw error
}

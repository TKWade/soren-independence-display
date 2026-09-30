import type { SupabaseClient } from '@supabase/supabase-js'
/** Queue claims fence image reuse in the database; shared paths are never returned. */
export async function cleanupImages(service:SupabaseClient,householdId?:string) {
 const {data,error}=await service.rpc('claim_image_cleanup',{hid:householdId??null});if(error) return {pending:true}
 const paths=(data??[]) as string[]
 if(!paths.length)return {pending:false}
 const removed=await service.storage.from('household-images').remove(paths)
 if(removed.error)return {pending:true}
 const finished=await service.rpc('finish_image_cleanup',{paths})
 return {pending:!!finished.error}
}

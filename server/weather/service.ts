import {weatherStage,logWeatherFailure} from './diagnostics.ts'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {HouseholdWeather} from '../../src/weather/types.ts'
import type {WeatherProvider} from './provider.ts'
export async function refreshWeather(service:SupabaseClient,provider:WeatherProvider,hid:string|null=null) {
 const {data,error}=await service.rpc('claim_weather_refresh',{hid});if(error)throw new Error('Weather cache unavailable')
 let failed=0
 await Promise.all((data??[]).map(async(row:HouseholdWeather&{lease_id:string})=>{
  let result=null
  try {
   const household=await weatherStage('household_lookup','household_unavailable',async()=>{
    const {data,error}=await service.from('households').select('time_zone').eq('id',row.household_id).single()
    if(error||!data)throw new Error('Household unavailable')
    return data
   })
   result=await weatherStage('provider_forecast','unknown',()=>provider.forecast(row.location!,household.time_zone))
  }catch(error){failed++;logWeatherFailure(error)}
  // Even lookup/provider/normalization failures finish with null: retain cache, mark failed, release lease.
  try {
   await weatherStage('finish_refresh','database_finish_failed',async()=>{
    const {error}=await service.rpc('finish_weather_refresh',{hid:row.household_id,expected_revision:row.revision,lease:row.lease_id,result})
    if(error)throw new Error('Weather cache unavailable')
   })
  }catch(error){logWeatherFailure(error);throw error}
 }))
 return {processed:data?.length??0,failed}
}

import {client} from '../data/supabase'
import type {DisplayAuthorization,SwitchingSettings,CaregiverStatuses} from './access'
export interface AccessResult {allowed:boolean;reason?:'pin_required'|'pin_not_configured'|'incorrect'|'retry'|'unavailable'|'change_required';changeToken?:string;retryAfter?:number;expiresIn?:number}
export async function profileContext(hid:string):Promise<{authorization:DisplayAuthorization;settings:SwitchingSettings;caregivers:CaregiverStatuses}> {
 const {data,error}=await client().rpc('display_profile_context',{hid});if(error)throw new Error('Profile access unavailable')
 return data
}
export async function authorizeProfile(hid:string,pid:string):Promise<AccessResult> {
 const {data,error}=await client().rpc('authorize_display_profile',{hid,pid});if(error)throw new Error('Profile access unavailable')
 return data
}
async function action(body:object) {
 const {data,error}=await client().functions.invoke('profile-access',{body});if(error)throw new Error('Profile access unavailable')
 return data
}
export async function verifyProfilePin(householdId:string,profileId:string,pin:string,caregiverId:string):Promise<AccessResult> {return action({action:'verify',householdId,profileId,caregiverId,pin})}
export async function changeRequiredPin(householdId:string,profileId:string,caregiverId:string,changeToken:string,pin:string,confirmPin:string):Promise<AccessResult> {return action({action:'change',householdId,profileId,caregiverId,changeToken,pin,confirmPin})}
export async function manageCaregiverPin(householdId:string,caregiverId:string,operation:'set'|'reset'|'require_change',pin?:string,confirmPin?:string) {await action({action:'manage',householdId,caregiverId,operation,pin,confirmPin})}
export async function saveCaregiverProfile(profile:object&{household_id:string},pin:string,confirmPin:string) {await action({action:'save',householdId:profile.household_id,profile,pin,confirmPin})}
export async function configureProfileAccess(householdId:string,settings:SwitchingSettings) {await action({action:'configure',householdId,settings})}

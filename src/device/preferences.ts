import type {ProfileRow} from '../data/records.ts'
export interface DeviceHouseholdPreference {profileId?:string;keepAwake:boolean}
export interface DevicePreferences {version:1;householdId:string;households:Record<string,DeviceHouseholdPreference>}
export interface PreferenceStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
const key=(userId:string)=>'soren.device.v1:'+encodeURIComponent(userId)
export function browserPreferenceStorage():PreferenceStorage|undefined {try{return window.localStorage}catch{return undefined}}
export function readDevicePreferences(userId:string|undefined,storage:PreferenceStorage|undefined):DevicePreferences|null {
 if(!userId||!storage)return null
 try {
  const raw=storage.getItem(key(userId));if(!raw)return null
  const p=JSON.parse(raw)
  if(p?.version!==1||typeof p.householdId!=='string'||!p.households||typeof p.households!=='object'||Array.isArray(p.households))return null
  for(const value of Object.values(p.households) as DeviceHouseholdPreference[])if(!value||typeof value.keepAwake!=='boolean'||value.profileId!==undefined&&typeof value.profileId!=='string')return null
  return p
 }catch{return null}
}
/** IDs only. This preference confers no authorization and contains no session/data snapshot. */
export function saveDevicePreference(userId:string,hid:string,change:Partial<DeviceHouseholdPreference>,storage:PreferenceStorage|undefined) {
 if(!storage||!userId||!hid)throw new Error('Device storage unavailable')
 const p=readDevicePreferences(userId,storage)??{version:1 as const,householdId:'',households:{}}
 const previous=Object.hasOwn(p.households,hid)?p.households[hid]:{keepAwake:false}
 const next={...p,householdId:change.profileId?hid:p.householdId,households:{...p.households,[hid]:{...previous,...change}}}
 storage.setItem(key(userId),JSON.stringify(next));return next
}
export function deviceHouseholdPreference(p:DevicePreferences|null,hid:string) {return p&&Object.hasOwn(p.households,hid)?p.households[hid]:undefined}
export function launchHousehold(search:string,p:DevicePreferences|null,admin:boolean) {
 const query=new URLSearchParams(search)
 const householdId=query.get('household')??(!admin&&!query.has('profile')?p?.householdId??'':'')
 return {householdId,strict:!admin&&(query.has('household')||Boolean(householdId))}
}
export function selectDeviceProfile(search:string,p:DevicePreferences|null,hid:string,profiles:ProfileRow[]):ProfileRow|undefined {
 const query=new URLSearchParams(search)
 if(query.has('household')&&query.get('household')!==hid)return undefined
 const id=query.has('profile')?query.get('profile'):deviceHouseholdPreference(p,hid)?.profileId
 return profiles.find(profile=>profile.id===id&&profile.active&&profile.household_id===hid)
}

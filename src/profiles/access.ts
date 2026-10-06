export type ProfileRole = 'child' | 'sibling' | 'caregiver' | 'other'
export interface SwitchingSettings {allowChildToChildSwitching:boolean;requirePinForAllProfileSwitches:boolean}
export interface CaregiverStatus {configured:boolean;changeRequired:boolean}
export type CaregiverStatuses=Record<string,CaregiverStatus>
export interface DisplayAuthorization {householdId:string;allowedProfileIds:string[];defaultProfileId:string|null;scope:'trusted-caregiver-display'|'display-only'}
export interface ChooserProfile {id:string;name:string;active:boolean;role?:ProfileRole;photoUrl?:string;avatar?:string|null}
export const defaultSwitchingSettings:SwitchingSettings={allowChildToChildSwitching:true,requirePinForAllProfileSwitches:false}
export function profileRole(role:unknown):ProfileRole {return ['child','sibling','caregiver','other'].includes(String(role))?role as ProfileRole:'child'}
/** Presentation hint only. The server repeats policy using its recorded current profile. */
export function requiresPin(target:ChooserProfile,current:ChooserProfile|undefined,settings:SwitchingSettings) {
 if(profileRole(target.role)==='caregiver'||settings.requirePinForAllProfileSwitches)return true
 const young=(role:unknown)=>['child','sibling'].includes(profileRole(role))
 return !settings.allowChildToChildSwitching&&young(target.role)&&(!current||profileRole(current.role)!=='caregiver')
}
export function authorizedProfiles(profiles:ChooserProfile[],authorization:DisplayAuthorization) {return profiles.filter(p=>p.active&&authorization.allowedProfileIds.includes(p.id))}
export function avatarInitials(name:string) {return name.trim().split(/\s+/u).filter(Boolean).slice(0,2).map(part=>Array.from(part)[0]).join('').toLocaleUpperCase('en-US')||'?'}
export function avatarColor(id:string) {
 const colors=['#243E59','#315447','#633F61','#664A28','#354B70','#64434A']
 let hash=0;for(const char of id)hash=(Math.imul(hash,31)+char.codePointAt(0)!)>>>0
 return colors[hash%colors.length]
}
export interface DisplayGrant {profileId:string;householdId:string;role:ProfileRole;expiresAt:number|null}
/** Only a previously server-authorized current display may survive a transient outage. */
export function retainDisplayGrant(grant:DisplayGrant|undefined,profile:{id:string;household_id:string;role?:ProfileRole;active:boolean}|undefined,now=Date.now()) {
 return Boolean(grant&&profile&&profile.active&&profile.id===grant.profileId&&profile.household_id===grant.householdId&&profileRole(profile.role)===grant.role&&(grant.expiresAt===null||grant.expiresAt>now))
}

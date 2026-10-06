import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react'
import type {HouseholdData,ProfileRow} from '../data/records'
import {authorizedProfiles,type ChooserProfile,type DisplayAuthorization,type CaregiverStatuses,type SwitchingSettings} from './access'
import {authorizeProfile,profileContext,verifyProfilePin,changeRequiredPin} from './client'
import {ProfileChooser,ProfileSwitchButton} from './ProfileChooser'
import {profileRole,retainDisplayGrant,type DisplayGrant} from './access'
import type {AccessResult} from './client'
interface Context {authorization:DisplayAuthorization;settings:SwitchingSettings;caregivers:CaregiverStatuses}
/** No schedule renders until the server authorizes the target. Context is scoped to this household/session. */
export function ProfileDisplayAccess({data,requested,children}:{data:HouseholdData;requested?:ProfileRow;children:(profile:ProfileRow,trigger:ReactNode)=>ReactNode}) {
 const [context,setContext]=useState<Context>(),[selected,setSelected]=useState<ProfileRow>(),[open,setOpen]=useState(false),[initialTarget,setInitialTarget]=useState<ChooserProfile>(),[failed,setFailed]=useState(false),[version,setVersion]=useState(0)
 const sequence=useRef(0)
 const grant=useRef<DisplayGrant>(undefined)
 const [displayGrant,setDisplayGrant]=useState<DisplayGrant>()
 const writeGrant=useCallback((value:DisplayGrant|undefined)=>{grant.current=value;setDisplayGrant(value)},[])
 const hid=data.household.id
 const visual=useCallback((profile:ProfileRow):ChooserProfile=>({...profile,photoUrl:profile.image_path?data.imageUrls[profile.image_path]:undefined}),[data.imageUrls])
 const select=useCallback((profile:ChooserProfile,result:AccessResult)=>{
  const row=data.profiles.find(p=>p.id===profile.id&&p.active&&p.household_id===hid)
  if(!row)return
  const query=new URLSearchParams(window.location.search);query.set('household',hid);query.set('profile',row.id)
  window.history.pushState(null,'',`${window.location.pathname}?${query}${window.location.hash}`)
  writeGrant({profileId:row.id,householdId:hid,role:profileRole(row.role),expiresAt:result.expiresIn===undefined?null:Date.now()+result.expiresIn*1000})
  setSelected(row);setOpen(false);setInitialTarget(undefined)
 },[data.profiles,hid,writeGrant])
 useEffect(()=>{
  const run=++sequence.current;let disposed=false
  const query=new URLSearchParams(window.location.search)
  const target=query.has('profile')?data.profiles.find(p=>p.id===query.get('profile')):requested
  const retained=retainDisplayGrant(grant.current,target)
  // Clear a different or expired display immediately; retain an authorized current display on outages.
  // eslint-disable-next-line react/set-state-in-effect
  if(!retained){setSelected(undefined);setContext(undefined);writeGrant(undefined)}
  // Reset request UI when synchronizing server authorization.
  // eslint-disable-next-line react/set-state-in-effect
  setFailed(false);setInitialTarget(undefined);setOpen(false)
  void (async()=>{
   const value=await profileContext(hid)
   if(disposed||run!==sequence.current)return
   setContext(value)
   if(!target||!target.active||target.household_id!==hid||!value.authorization.allowedProfileIds.includes(target.id)){writeGrant(undefined);setSelected(undefined);setOpen(true);return}
   const result=await authorizeProfile(hid,target.id)
   if(disposed||run!==sequence.current)return
   if(result.allowed){writeGrant({profileId:target.id,householdId:hid,role:profileRole(target.role),expiresAt:result.expiresIn===undefined?null:Date.now()+result.expiresIn*1000});setSelected(target)}
   else {writeGrant(undefined);setSelected(undefined);setInitialTarget(visual(target));setOpen(true)}
  })().catch(()=>{if(!disposed)setFailed(true)})
  return()=>{disposed=true}
 },[hid,requested,version,visual,data.profiles,writeGrant])
 // Revalidate protected grants/policy after expiry, a role change, refresh or foregrounding.
 useEffect(()=>{
  if(!selected)return
  let disposed=false
  async function check(){
   if(!retainDisplayGrant(grant.current,selected)){writeGrant(undefined);setSelected(undefined);setVersion(v=>v+1);return}
   try{const result=await authorizeProfile(hid,selected!.id);if(!disposed&&!result.allowed){writeGrant(undefined);setSelected(undefined);setVersion(v=>v+1)}}
   catch{if(!disposed&&!retainDisplayGrant(grant.current,selected)){writeGrant(undefined);setSelected(undefined);setFailed(true)}}
  }
  const timer=setInterval(()=>void check(),30_000)
  const expiry=grant.current?.expiresAt
  const expiration=expiry===null||expiry===undefined?undefined:setTimeout(()=>{if(!disposed){writeGrant(undefined);setSelected(undefined);setVersion(v=>v+1)}},Math.max(0,expiry-Date.now()))
  const foreground=()=>{if(document.visibilityState==='visible')void check()}
  document.addEventListener('visibilitychange',foreground)
  return()=>{disposed=true;clearInterval(timer);clearTimeout(expiration);document.removeEventListener('visibilitychange',foreground)}
 },[selected,hid,writeGrant])
 useEffect(()=>{const changed=()=>setVersion(v=>v+1);window.addEventListener('popstate',changed);return()=>window.removeEventListener('popstate',changed)},[])
 const query=new URLSearchParams(window.location.search)
 const validSelected=selected&&retainDisplayGrant(displayGrant,selected)&&(!query.has('profile')||query.get('profile')===selected.id)&&(!query.has('household')||query.get('household')===hid)&&data.profiles.some(p=>p.id===selected.id&&p.active&&p.household_id===hid&&profileRole(p.role)===profileRole(selected.role))?selected:undefined
 const current=validSelected?visual(validSelected):undefined
 const profiles=context?authorizedProfiles(data.profiles.filter(p=>p.household_id===hid).map(visual),context.authorization):[]
 return <>
  {validSelected?children(validSelected,<ProfileSwitchButton profile={current!} onClick={()=>{setInitialTarget(undefined);setOpen(true)}}/>):<div className="display-state" role="status">{failed?<><p>Unable to connect.</p><button onClick={()=>setVersion(v=>v+1)}>Try again</button></>:context?<p>Choose a profile</p>:<p>WAIT</p>}</div>}
  {open&&context&&<ProfileChooser key={initialTarget?.id??'chooser'} profiles={profiles} current={current} settings={context.settings} caregivers={context.caregivers} initialTarget={initialTarget} onClose={validSelected?()=>setOpen(false):undefined} onSelected={select} authorize={id=>authorizeProfile(hid,id)} verify={(id,pin,cid)=>verifyProfilePin(hid,id,pin,cid)} changePin={(id,cid,token,pin,confirm)=>changeRequiredPin(hid,id,cid,token,pin,confirm)}/>}
 </>
}

import {DeleteControl} from './DeleteControl'
import { useEffect,useState } from 'react'
import type { HouseholdData, ProfileRow } from '../data/records'
import type { DisplayMode, ProfileDisplayPreferences } from '../types/display'
import type { RunAction } from './Admin'
import { saveDisplayProfile,uploadImage,discardUpload } from '../data/repository'
import {manageCaregiverPin,profileContext,saveCaregiverProfile} from '../profiles/client'
import type {CaregiverStatus,ProfileRole} from '../profiles/access'
import {profileRole} from '../profiles/access'
import {ProfileAvatar} from '../profiles/ProfileChooser'
import { defaultDisplayPreferences, parseDisplayPreferences } from '../display/preferences'
function ProfileForm({data,profile,run,onSaved,readOnly}:{data:HouseholdData;profile?:ProfileRow;run:RunAction;onSaved:()=>void;readOnly:boolean}) {
 const [role,setRole]=useState<ProfileRole>(profileRole(profile?.role)),[pin,setPin]=useState(''),[confirm,setConfirm]=useState(''),[editingPin,setEditingPin]=useState(false),[validation,setValidation]=useState('')
 const [status,setStatus]=useState<CaregiverStatus>(),[statusFailed,setStatusFailed]=useState(false)
 const newCaregiver=role==='caregiver'&&profileRole(profile?.role)!=='caregiver'
 useEffect(()=>{
  if(!profile||profile.role!=='caregiver'||readOnly)return
  let disposed=false
  void profileContext(data.household.id).then(c=>{if(!disposed)setStatus(c.caregivers[profile.id]??{configured:false,changeRequired:false})}).catch(()=>{if(!disposed)setStatusFailed(true)})
  return()=>{disposed=true}
 },[data.household.id,profile,readOnly])
 const reloadStatus=async()=>{if(profile){const c=await profileContext(data.household.id);setStatus(c.caregivers[profile.id])}}
 const valid=()=>/^\d{4,8}$/.test(pin)&&pin===confirm
 const manage=(operation:'set'|'reset'|'require_change')=>{
  if(!profile)return
  if(operation==='set'&&!valid()){setValidation('Enter matching PINs with 4–8 digits.');return}
  if(operation==='reset'&&!window.confirm(`Reset ${profile.name}’s PIN? This profile will be unavailable until a new PIN is set.`))return
  const entered=pin,repeated=confirm;setPin('');setConfirm('');setValidation('')
  void run(async()=>{await manageCaregiverPin(data.household.id,profile.id,operation,entered,repeated);await reloadStatus();setEditingPin(false)})
 }
 const [photo,setPhoto]=useState<File>(),[removePhoto,setRemovePhoto]=useState(false)
 const [preferences,setPreferences]=useState(()=>parseDisplayPreferences(data.displayPreferences?.find(row=>row.profile_id===profile?.id)?.preferences))
 const update=<K extends keyof ProfileDisplayPreferences>(key:K,value:ProfileDisplayPreferences[K])=>setPreferences(p=>({...p,[key]:value}))
 const checks:[keyof Pick<ProfileDisplayPreferences,'allowNavigation'|'autoAdvance'|'showWho'|'showWhere'|'showTimes'|'audioEnabled'>,string][]=[
  ['allowNavigation','Allow opening day and picture details'],['autoAdvance','Move forward automatically as the day progresses'],['showWho','Show who will be there'],['showWhere','Show where activities happen'],['showTimes','Show activity start times'],['audioEnabled','Allow audio cues (no audio cues are available yet)']]
 return <form onSubmit={e=>{e.preventDefault();setValidation('');
  if(newCaregiver&&!valid()){setValidation('Enter matching PINs with 4–8 digits.');return}
  if(profile?.role==='caregiver'&&role!=='caregiver'&&!window.confirm(`Remove ${profile.name}’s caregiver access? Their PIN and temporary grants will be removed.`))return
  const values=new FormData(e.currentTarget),entered=pin,repeated=confirm;setPin('');setConfirm('');void run(async()=>{
  let path=removePhoto?null:profile?.image_path??null,newPath:string|undefined
  try {
   if(photo){newPath=await uploadImage(data.household.id,photo,crypto.randomUUID(),'original');path=newPath}
   const payload={id:profile?.id??crypto.randomUUID(),household_id:data.household.id,name:String(values.get('name')).trim(),active:values.get('active')==='on',role,image_path:path,avatar:String(values.get('avatar'))||null,preferences:parseDisplayPreferences(preferences)}
   if(newCaregiver)await saveCaregiverProfile(payload,entered,repeated);else await saveDisplayProfile(payload)
  }catch(error){if(newPath)await discardUpload(newPath);throw error}
  onSaved()
 })}}>
  <h3>Profile identity</h3><label>Name<input name="name" defaultValue={profile?.name} maxLength={100} required/></label><label className="check"><input type="checkbox" name="active" defaultChecked={profile?.active??true}/>Active</label>
  <label>Role<select name="role" value={role} onChange={e=>{setRole(e.target.value as ProfileRole);setPin('');setConfirm('');setValidation('')}}><option value="child">Child</option><option value="sibling">Sibling</option><option value="caregiver">Caregiver</option><option value="other">Other</option></select></label>
  <p>Each caregiver profile requires its own PIN.</p>
  <label>Profile photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{setPhoto(e.target.files?.[0]);setRemovePhoto(false)}}/></label>
  {profile?.image_path&&!removePhoto&&!photo&&<span role="img" aria-label={`${profile.name} profile avatar`} style={{display:'inline-block',width:96,fontSize:18}}><ProfileAvatar profile={{...profile,photoUrl:data.imageUrls[profile.image_path]}}/></span>}
  {(profile?.image_path||photo)&&<button type="button" className="secondary" onClick={()=>{setPhoto(undefined);setRemovePhoto(true)}}>Remove photo</button>}
  <label>Illustrated fallback<select name="avatar" defaultValue={profile?.avatar??''}><option value="">Initials</option><option value="sun">Sun</option><option value="star">Star</option><option value="flower">Flower</option><option value="moon">Moon</option></select></label>
  {role==='caregiver'&&<section className="admin-subsection" aria-label="Caregiver access"><h3>Caregiver access</h3>
   <p>PIN status: {newCaregiver?'Not configured':statusFailed?'Unavailable':!status?readOnly?'Not configured':'Loading…':status.changeRequired?'Change required':status.configured?'Configured':'Not configured'}</p>
   {(newCaregiver||editingPin)&&<div className="form-grid"><label>PIN<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,8))}/></label><label>Confirm PIN<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={confirm} onChange={e=>setConfirm(e.target.value.replace(/\D/g,'').slice(0,8))}/></label></div>}
   {!newCaregiver&&<div className="editor-actions">
    {editingPin?<><button type="button" disabled={readOnly} onClick={()=>manage('set')}>Save PIN</button><button type="button" className="secondary" onClick={()=>{setEditingPin(false);setPin('');setConfirm('')}}>Cancel</button></>:<button type="button" disabled={readOnly||!status} onClick={()=>setEditingPin(true)}>{status?.configured?'Change PIN':'Set PIN'}</button>}
    <button type="button" className="secondary" disabled={readOnly||!status?.configured} onClick={()=>manage('reset')}>Reset PIN</button>
    <button type="button" className="secondary" disabled={readOnly||!status?.configured||status.changeRequired} onClick={()=>manage('require_change')}>Require PIN change</button>
   </div>}
   {newCaregiver&&<p>PIN and profile are saved together. Changing the role or leaving this editor cancels setup.</p>}
  </section>}
  {validation&&<p role="alert">{validation}</p>}
  <section className="admin-subsection" aria-label="Display and interaction"><h3>Display &amp; Interaction</h3>
   <label>Display Mode<select value={preferences.displayMode} onChange={e=>setPreferences(defaultDisplayPreferences(e.target.value as DisplayMode))}><option value="week">Rolling week</option><option value="standard-calendar">Standard calendar</option><option value="first-next-then">First / Next / Then</option></select></label>
   <p>One schedule, shown in the way that works best for this person. Changing modes starts with that mode’s recommended settings.</p>
   {preferences.displayMode==='standard-calendar'&&<fieldset><legend>Calendar views for this profile</legend>
    <label className="check"><input type="checkbox" checked={preferences.showActivityTimes} onChange={e=>update('showActivityTimes',e.target.checked)}/>Show activity start times</label>
    <label className="check"><input type="checkbox" checked={preferences.showClock} onChange={e=>update('showClock',e.target.checked)}/>Show live household clock</label>
    <label>Clock format<select value={preferences.clockFormat} onChange={e=>update('clockFormat',e.target.value as '12h'|'24h')}><option value="12h">12 hour</option><option value="24h">24 hour</option></select></label>
    <label>Allowed views<select value={preferences.allowedViews.join(',')} onChange={e=>{const views=e.target.value.split(',') as ('week'|'month')[];setPreferences(p=>({...p,allowedViews:views,defaultView:views.includes(p.defaultView)?p.defaultView:views[0]}))}}><option value="week">Week only</option><option value="month">Month only</option><option value="week,month">Week and Month</option></select></label>
    <label>Default view<select value={preferences.defaultView} onChange={e=>update('defaultView',e.target.value as 'week'|'month')}>{preferences.allowedViews.map(view=><option key={view} value={view}>{view==='week'?'Week':'Month'}</option>)}</select></label>
    <label className="check"><input type="checkbox" checked={preferences.allowCalendarNavigation} onChange={e=>update('allowCalendarNavigation',e.target.checked)}/>Allow Previous / Today / Next navigation</label>
   </fieldset>}
   {preferences.displayMode!=='first-next-then'&&<fieldset><legend>Weather on this display</legend>
     <label className="check"><input type="checkbox" checked={preferences.showWeather} onChange={e=>update('showWeather',e.target.checked)}/>Show household weather</label>
     <label>Weather detail<select value={preferences.weatherDetail} onChange={e=>update('weatherDetail',e.target.value as 'simple'|'standard')}><option value="simple">Simple: icon and temperature</option><option value="standard">Standard: condition and high / low</option></select></label>
    </fieldset>}
    <details><summary>Advanced display preferences</summary>
    <label className="check"><input type="checkbox" checked={preferences.showProfileSwitching!==false} onChange={e=>update('showProfileSwitching',e.target.checked)}/>Show profile avatar for switching</label>
    {preferences.displayMode==='first-next-then'?<><label>Maximum activities shown<select value={Math.min(3,preferences.maxVisibleItems)} onChange={e=>update('maxVisibleItems',Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label><p>This view stays on one screen, without day navigation.</p></>:<p>Week shows seven days. Opening a date shows the full Day timeline.</p>}
    {checks.map(([key,label])=><label className="check" key={key}><input type="checkbox" checked={preferences[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}
    <p>Turning automatic progress off holds the view until it is reopened or these preferences are changed.</p>
    <label>Motion<select value={preferences.motionPreference} onChange={e=>update('motionPreference',e.target.value as ProfileDisplayPreferences['motionPreference'])}><option value="normal">Normal</option><option value="reduced">Reduced</option><option value="none">None</option></select></label>
   </details>
  </section><button disabled={readOnly}>{newCaregiver?'Set PIN & Save Profile':'Save profile'}</button>{profile&&<section className="danger-zone" aria-label="Profile danger zone"><h3>Profile Danger Zone</h3><p>Use the Active checkbox to archive this profile and preserve its history.</p><DeleteControl entity="profiles" id={profile.id} householdId={data.household.id} run={run} done={onSaved}/></section>}
 </form>
}
export function ProfileEditor({data,run,readOnly=false}:{data:HouseholdData;run:RunAction;readOnly?:boolean}) {
 const [selected,setSelected]=useState(''),[version,setVersion]=useState(0)
 const profile=data.profiles.find(p=>p.id===selected)
 return <section><h2>Display profiles</h2><label>Edit profile<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">New profile</option>{data.profiles.map(p=><option key={p.id} value={p.id}>{p.name}{p.active?'':' (inactive)'}</option>)}</select></label>
  <ProfileForm key={selected+version} data={data} profile={profile} run={run} readOnly={readOnly} onSaved={()=>{setSelected('');setVersion(v=>v+1)}}/>

 </section>
}

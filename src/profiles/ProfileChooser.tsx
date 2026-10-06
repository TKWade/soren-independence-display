import {useEffect,useRef,useState} from 'react'
import {avatarColor,avatarInitials,requiresPin,profileRole,type CaregiverStatuses,type ChooserProfile,type SwitchingSettings} from './access'
import type {AccessResult} from './client'
import './profiles.css'
const illustrations:Record<string,string>={sun:'☀',star:'★',flower:'✿',moon:'☾'}
export function ProfileAvatar({profile}:{profile:ChooserProfile}) {
 const [failedUrl,setFailedUrl]=useState<string>()
 return <span className="profile-avatar" style={{backgroundColor:avatarColor(profile.id)}}>
  {profile.photoUrl&&profile.photoUrl!==failedUrl?<img src={profile.photoUrl} alt="" onError={()=>setFailedUrl(profile.photoUrl)}/>:<span aria-hidden="true">{illustrations[profile.avatar??'']??avatarInitials(profile.name)}</span>}
 </span>
}
export function ProfileSwitchButton({profile,onClick}:{profile:ChooserProfile;onClick:()=>void}) {
 return <button type="button" className="profile-switch-trigger" aria-label={`Switch profile, current profile ${profile.name}`} onClick={onClick}><ProfileAvatar profile={profile}/></button>
}
export function ProfileChooser({profiles,current,settings,caregivers,initialTarget,onClose,onSelected,authorize,verify,changePin}:{
 profiles:ChooserProfile[];current?:ChooserProfile;settings:SwitchingSettings;caregivers:CaregiverStatuses;initialTarget?:ChooserProfile;
 onClose?:()=>void;onSelected:(profile:ChooserProfile,result:AccessResult)=>void;authorize:(id:string)=>Promise<AccessResult>;
 verify:(id:string,pin:string,caregiverId:string)=>Promise<AccessResult>;
 changePin?:(id:string,caregiverId:string,token:string,pin:string,confirm:string)=>Promise<AccessResult>
}) {
 const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null)
 const [target,setTarget]=useState(initialTarget),[caregiver,setCaregiver]=useState(initialTarget?.role==='caregiver'?initialTarget:undefined)
 const [pin,setPin]=useState(''),[confirm,setConfirm]=useState(''),[changeToken,setChangeToken]=useState<string>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
 const mounted=useRef(true)
 const available=profiles.filter(p=>p.active&&profileRole(p.role)==='caregiver'&&caregivers[p.id]?.configured)
 const configured=(p:ChooserProfile)=>p.role==='caregiver'?Boolean(caregivers[p.id]?.configured):available.length>0
 useEffect(()=>{mounted.current=true;const element=dialog.current;element?.showModal();return()=>{mounted.current=false;element?.close()}},[])
 useEffect(()=>{if(caregiver&&input.current)input.current.focus();else dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()},[target,caregiver,changeToken])
 useEffect(()=>{if(!retry)return;const timer=setTimeout(()=>setRetry(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer)},[retry])
 function reset(){setTarget(undefined);setCaregiver(undefined);setPin('');setConfirm('');setChangeToken(undefined);setError('');setRetry(0)}
 async function choose(profile:ChooserProfile) {
  setBusy(true);setError('');setPin('')
  try {
   const result=await authorize(profile.id)
   if(!mounted.current)return
   if(result.allowed)onSelected(profile,result)
   else {setTarget(profile);setCaregiver(profile.role==='caregiver'?profile:undefined);setError(result.reason==='pin_not_configured'?'Caregiver PIN setup required.':result.reason==='pin_required'?'':'Profile unavailable.')}
  }catch{if(mounted.current)setError('Unable to connect. Try again.')}
  finally{if(mounted.current)setBusy(false)}
 }
 async function submit() {
  if(!target||!caregiver||busy||retry||!/^\d{4,8}$/.test(pin))return
  if(changeToken&&(!changePin||pin!==confirm)){setError('Enter matching PINs with 4–8 digits.');return}
  const entered=pin,repeated=confirm;setPin('');setConfirm('');setBusy(true);setError('')
  try {
   const result=changeToken?await changePin!(target.id,caregiver.id,changeToken,entered,repeated):await verify(target.id,entered,caregiver.id)
   if(!mounted.current)return
   if(result.allowed)onSelected(target,result)
   else if(result.reason==='change_required'&&result.changeToken){setChangeToken(result.changeToken);setRetry(0)}
   else {setRetry(result.retryAfter??0);setError(result.reason==='incorrect'?'Incorrect PIN.':result.reason==='retry'?'Try again shortly.':result.reason==='pin_not_configured'?'Caregiver PIN setup required.':'Profile unavailable.')}
  }catch{if(mounted.current)setError('Unable to connect. Try again.')}
  finally{if(mounted.current){setBusy(false);input.current?.focus()}}
 }
 const firstName=caregiver?.name.trim().split(/\s+/)[0]??''
 return <dialog className={`profile-chooser${target?' profile-pin-dialog':''}`} ref={dialog} aria-labelledby="profile-chooser-title" onCancel={event=>{event.preventDefault();if(!busy){if(target)reset();else onClose?.()}}}>
  <div className="profile-chooser-content">
   {target?<>
    <h1 id="profile-chooser-title">Caregiver access</h1>
    {!caregiver?<><p>Choose any caregiver to authorize switching to {target.name}.</p><div className="profile-grid">{available.map(p=><button className="profile-choice" type="button" key={p.id} onClick={()=>{setCaregiver(p);setRetry(0);setError('')}}><span className="profile-choice-image"><ProfileAvatar profile={p}/></span><span className="profile-choice-name">{p.name}</span></button>)}</div>{available.length===0&&<p>Caregiver PIN setup required.</p>}<div className="profile-dialog-actions"><button onClick={reset}>Cancel</button></div></>:<form onSubmit={event=>{event.preventDefault();void submit()}}>
     <div className="profile-pin-identity"><ProfileAvatar profile={caregiver}/><h2>{caregiver.name}</h2></div>
     {configured(caregiver)?<>
      <label className="profile-pin-label">{changeToken?`Set ${firstName}’s new PIN`:`Enter ${firstName}’s PIN`}<input ref={input} aria-label={changeToken?'New PIN':`Enter ${firstName}’s PIN`} type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" minLength={4} maxLength={8} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,'').slice(0,8))} disabled={busy||retry>0}/></label>
      {changeToken?<><p className="profile-guidance">PIN change required before continuing.</p><label className="profile-pin-label">Confirm new PIN<input aria-label="Confirm new PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={confirm} onChange={e=>setConfirm(e.target.value.replace(/\D/g,'').slice(0,8))}/></label></>:<div className="profile-keypad" aria-label="PIN keypad">{['1','2','3','4','5','6','7','8','9','clear','0','delete'].map(key=><button key={key} type="button" aria-label={key==='delete'?'Delete last digit':key==='clear'?'Clear PIN':key} disabled={busy||retry>0} onClick={()=>{setPin(value=>key==='clear'?'':key==='delete'?value.slice(0,-1):(value+key).slice(0,8));input.current?.focus()}}>{key==='delete'?'⌫':key==='clear'?'Clear':key}</button>)}</div>}
     </>:<p>Caregiver PIN setup required.</p>}
     <p role="alert" className="profile-error">{error|| (retry>0?`Try again in ${retry} seconds.`:'')}</p>
     <div className="profile-dialog-actions"><button type="button" disabled={busy} onClick={reset}>Cancel</button><button type="submit" disabled={!configured(caregiver)||busy||retry>0||pin.length<4||Boolean(changeToken&&confirm.length<4)}>Continue</button></div>
    </form>}
   </>:<>
    <h1 id="profile-chooser-title">Who’s using SOREN?</h1>
    <div className="profile-grid">{profiles.map(profile=>{
     const locked=requiresPin(profile,current,settings),unavailable=locked&&!configured(profile)
     return <button key={profile.id} className="profile-choice" type="button" disabled={busy||unavailable} aria-label={`${profile.name}${locked?', caregiver PIN required':''}${profile.id===current?.id?', current profile':''}${unavailable?', unavailable until PIN setup':''}`} aria-current={profile.id===current?.id?'true':undefined} onClick={()=>profile.id===current?.id&&onClose?onClose():void choose(profile)}>
      <span className="profile-choice-image"><ProfileAvatar profile={profile}/>{locked&&<span className="profile-lock" aria-hidden="true">🔒</span>}</span><span className="profile-choice-name">{profile.name}</span>{profile.id===current?.id&&<span className="profile-current">CURRENT</span>}
     </button>
    })}</div>
    {profiles.length===0&&<p role="status">No profiles available.</p>}
    {profiles.some(p=>requiresPin(p,current,settings)&&!configured(p))&&<p className="profile-guidance">Caregiver PIN setup required for unavailable profiles.</p>}
    {onClose&&<div className="profile-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button></div>}
    <p role="alert" className="profile-error">{error}</p>
   </>}
  </div>
 </dialog>
}

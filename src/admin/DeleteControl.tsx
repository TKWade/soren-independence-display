import { useEffect, useRef, useState } from 'react'
import { client } from '../data/supabase'
import type { RunAction } from './Admin'
export type Deletable='people'|'places'|'activities'|'profiles'|'calendar_events'|'home_rules'|'event_profile_mappings'|'event_matching_rules'
export interface DeletionPreview {name:string;dependencies:Record<string,number>;blocked:boolean}
export function DeleteControl({entity,id,householdId,run,done,label='Permanent delete'}:{entity:Deletable;id:string;householdId:string;run:RunAction;done:()=>void;label?:string}) {
 const [preview,setPreview]=useState<DeletionPreview>(),[typed,setTyped]=useState('')
 const close=()=>{setPreview(undefined);setTyped('')}
 return <>
 <button type="button" className="danger" onClick={()=>void run(async()=>{const {data,error}=await client().rpc('deletion_preview',{hid:householdId,entity,rid:id});if(error)throw error;setPreview(data as DeletionPreview)},'Review deletion before confirming.')}>{label}</button>
 {preview&&<DeletionDialog entity={entity} id={id} preview={preview} label={label} typed={typed} setTyped={setTyped} close={close} confirm={()=>void run(async()=>{
  const {error}=await client().rpc('delete_owned_record',{hid:householdId,entity,rid:id,confirmation:entity==='profiles'?typed:preview.name});if(error)throw error
  // Deletion is complete. Failed cleanup remains in a server-side retry queue.
  if(['people','places','activities'].includes(entity))try{await client().functions.invoke('household-maintenance',{body:{householdId}})}catch{/* Scheduled worker retries. */}
  close();done()
 },'Removed. Image cleanup is queued when needed.')}/>}
 </>
}
export function DeletionDialog({entity,id,preview,label,typed,setTyped,close,confirm}:{entity:Deletable;id:string;preview:DeletionPreview;label:string;typed:string;setTyped:(value:string)=>void;close:()=>void;confirm:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const modal=dialog.current;modal?.showModal();return()=>modal?.close()},[])
 return <dialog ref={dialog} className="delete-dialog" onCancel={close} aria-labelledby={'delete-title-'+id}>
 <h3 id={'delete-title-'+id}>{label}: {preview.name}</h3>
 <p>{entity==='profiles'?'This permanently removes this profile’s visuals, mappings, settings and sleep rules. Shared events remain for other profiles.':entity==='calendar_events'?'This removes the local event or entire recurring series and its visual assignments for every profile.':entity==='event_profile_mappings'||entity==='event_matching_rules'?'This removes only this application decision. The provider event is unchanged; other rules may apply again.':'Permanent deletion cannot be undone. Archive is the lower-risk option for library items.'}</p>
 <h4>Dependency summary</h4><ul className="dependency-summary">{Object.entries(preview.dependencies).map(([name,count])=><li key={name}>{name.replaceAll('_',' ')}: {count}</li>)}</ul>
 {preview.blocked&&<p className="admin-error" role="alert">Deletion blocked. Reassign or remove referenced records first. The last profile and provider-owned events cannot be permanently deleted here.</p>}
 {entity==='profiles'&&<label>Type the profile name to confirm<input value={typed} onChange={e=>setTyped(e.target.value)} autoComplete="off"/></label>}
 <button type="button" className="secondary" onClick={close}>Cancel</button>
 <button type="button" className="danger" disabled={preview.blocked||(entity==='profiles'&&typed!==preview.name)} onClick={confirm}>Confirm {label.toLowerCase()}</button>
 </dialog>
}

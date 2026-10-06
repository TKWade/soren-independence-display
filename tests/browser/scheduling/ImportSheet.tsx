import {useState} from 'react'
import {Art,Sheet} from './Shared'
import {formatDate,formatTime,reviewImports,type PrototypeData,type PrototypeEvent} from './model'
export function ImportSheet({data,event,profileId,onClose,onSave}:{data:PrototypeData;event:PrototypeEvent;profileId:string;onClose:()=>void;onSave:(data:PrototypeData,message:string)=>void}) {
 const [profiles,setProfiles]=useState(event.profileIds.length?event.profileIds:[profileId]),[activity,setActivity]=useState(event.activityId),[future,setFuture]=useState(false)
 const repeats=data.events.some(e=>e.id!==event.id&&e.title===event.title&&e.date>=event.date)
 const review=(decision:'included'|'ignored')=>{onSave(reviewImports(data,[event.id],decision,profiles,activity,future),decision==='included'?'Imported activity included on selected profiles.':'Imported activity ignored.');onClose()}
 return <Sheet title="Review imported event" onClose={onClose}><div className="sp-editor-form"><span className="sp-import-badge">Imported · fictional calendar</span><h3>{event.title}</h3><p>{formatDate(event.date)} · {formatTime(event.start)} – {formatTime(event.end)}</p><p className="sp-muted">Calendar-owned time stays read-only. Choose how this appointment appears on the display.</p>
  <fieldset><legend>Show on</legend><div className="sp-chips">{data.profiles.map(p=><label key={p.id}><input type="checkbox" checked={profiles.includes(p.id)} onChange={e=>setProfiles(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>{p.name}</label>)}</div></fieldset>
  <fieldset><legend>Activity</legend><div className="sp-activity-options">{data.activities.map(a=><button type="button" key={a.id} aria-pressed={activity===a.id} onClick={()=>setActivity(a.id)}><Art kind={a.kind}/>{a.name}</button>)}</div></fieldset>
  {repeats&&<label className="sp-check"><input type="checkbox" checked={future} onChange={e=>setFuture(e.target.checked)}/>Apply to future events with this title?</label>}
  {future&&<p className="sp-muted">Applies to unreviewed occurrences from this date onward in this fictional calendar. Your previous decisions stay intact.</p>}
  <footer><button className="sp-secondary" onClick={()=>review('ignored')}>Ignore</button><button disabled={!profiles.length} onClick={()=>review('included')}>Include</button></footer>
 </div></Sheet>
}

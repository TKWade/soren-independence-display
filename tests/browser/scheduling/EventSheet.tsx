import {useState,type FormEvent} from 'react'
import {Art,Sheet} from './Shared'
import {formatDate,formatTime,fromTime,timeInput,duplicateEvent,type PrototypeActivity,type PrototypeData,type PrototypeEvent} from './model'
import type {PictureKind} from '../../../src/types/calendar'
const kinds:PictureKind[]=['school','swim','park','home','dinner','sleep','dad','mom']
interface Props {data:PrototypeData;profileId:string;date:string;start:number;event?:PrototypeEvent;onClose:()=>void;onSave:(data:PrototypeData,message:string)=>void}
export function EventSheet({data,profileId,date,start,event,onClose,onSave}:Props) {
 const [draft,setDraft]=useState<PrototypeEvent>(()=>event??{id:crypto.randomUUID(),date,start,end:Math.min(1440,start+30),activityId:'',profileIds:[profileId],personIds:[],origin:'local',review:'included'})
 const [working,setWorking]=useState(data),[inline,setInline]=useState<'activity'|'person'|'place'>(),[name,setName]=useState(''),[kind,setKind]=useState<PictureKind>('park'),[duration,setDuration]=useState('30'),[error,setError]=useState('')
 const activity=working.activities.find(a=>a.id===draft.activityId)
 const select=(a:PrototypeActivity)=>{setDraft(d=>({...d,activityId:a.id,end:Math.min(1440,d.start+a.duration),personIds:a.personIds,placeId:a.placeId}));setError('')}
 function createInline(e:FormEvent){
  e.preventDefault();const trimmed=name.trim();if(!trimmed)return
  const id=crypto.randomUUID()
  if(inline==='activity'){
   const a={id,name:trimmed,kind,duration:duration?Number(duration):30,personIds:[]}
   setWorking(d=>({...d,activities:[a,...d.activities]}));select(a)
  }else if(inline==='person'){
   setWorking(d=>({...d,people:[...d.people,{id,name:trimmed,kind}]}));setDraft(d=>({...d,personIds:[...d.personIds,id]}))
  }else{
   setWorking(d=>({...d,places:[...d.places,{id,name:trimmed,kind}]}));setDraft(d=>({...d,placeId:id}))
  }
  setInline(undefined);setName('')
 }
 function save(e:FormEvent){
  e.preventDefault()
  if(!activity||!draft.date||!Number.isFinite(draft.start)||!Number.isFinite(draft.end)||draft.end<=draft.start||draft.end>1440||draft.start%15||draft.end%15){setError('Choose an activity and an end after the start, in 15-minute steps.');return}
  onSave({...working,events:event?working.events.map(e=>e.id===event.id?draft:e):[...working.events,draft]},`${activity.name} ${event?'updated':'added'} · ${formatTime(draft.start)}`)
  onClose()
 }
 const openInline=(type:'activity'|'person'|'place')=>{setInline(type);setName('');setKind(type==='person'?'mom':type==='place'?'home':'park');setDuration('30')}
 return <Sheet title={inline?`New ${inline}`:event?'Edit activity':'Add activity'} onClose={onClose}>
  {inline?<form onSubmit={createInline} className="sp-editor-form"><p>Create it here, then return to this event. Nothing saves until you save the event.</p><label>Name<input autoFocus value={name} onChange={e=>setName(e.target.value)} required maxLength={40}/></label><fieldset><legend>Picture</legend><div className="sp-picture-options">{kinds.map(k=><button type="button" key={k} aria-label={`${k} picture`} aria-pressed={kind===k} onClick={()=>setKind(k)}><Art kind={k}/></button>)}</div></fieldset>{inline==='activity'&&<label>Default duration (optional)<select value={duration} onChange={e=>setDuration(e.target.value)}><option value="">Use 30 minutes</option>{[15,30,45,60,90,120,180].map(n=><option value={n} key={n}>{n} minutes</option>)}</select></label>}<footer><button type="button" className="sp-secondary" onClick={()=>setInline(undefined)}>Back to event</button><button disabled={!name.trim()}>Create & select</button></footer></form>:<form onSubmit={save} className="sp-editor-form">
   <p className="sp-muted">{working.profiles.find(p=>p.id===profileId)?.name} · {formatDate(draft.date)}</p>
   <fieldset><legend>{event?'Activity':'Favorites & recent activities'}</legend><div className="sp-activity-options">{working.activities.map(a=><button type="button" key={a.id} aria-pressed={a.id===draft.activityId} onClick={()=>select(a)}><Art kind={a.kind}/><span>{a.name}</span><small>{a.duration} min</small></button>)}<button type="button" className="sp-new" onClick={()=>openInline('activity')}><span aria-hidden="true">＋</span>New Activity</button></div></fieldset>
   <div className="sp-fields"><label>Date<input type="date" value={draft.date} required onChange={e=>setDraft(d=>({...d,date:e.target.value}))}/></label><label>Start<input type="time" step="900" value={timeInput(draft.start)} required onChange={e=>setDraft(d=>({...d,start:fromTime(e.target.value)}))}/></label><label>End<input type="time" step="900" value={draft.end===1440?'00:00':timeInput(draft.end)} required onChange={e=>setDraft(d=>({...d,end:e.target.value==='00:00'?1440:fromTime(e.target.value)}))}/></label></div>
   <details className="sp-context-details"><summary>With {draft.personIds.map(id=>working.people.find(p=>p.id===id)?.name).join(', ')||'no one selected'} · Where {working.places.find(p=>p.id===draft.placeId)?.name||'not set'}</summary><div>
   <fieldset><legend>With <small>optional</small></legend><div className="sp-chips">{working.people.map(p=><label key={p.id}><input type="checkbox" checked={draft.personIds.includes(p.id)} onChange={e=>setDraft(d=>({...d,personIds:e.target.checked?[...d.personIds,p.id]:d.personIds.filter(id=>id!==p.id)}))}/>{p.name}</label>)}<button type="button" className="sp-secondary" onClick={()=>openInline('person')}>+ New person</button></div></fieldset>
   <fieldset><legend>Where <small>optional</small></legend><div className="sp-chips"><button type="button" aria-pressed={!draft.placeId} onClick={()=>setDraft(d=>({...d,placeId:undefined}))}>None</button>{working.places.map(p=><button key={p.id} type="button" aria-pressed={draft.placeId===p.id} onClick={()=>setDraft(d=>({...d,placeId:p.id}))}>{p.name}</button>)}<button type="button" className="sp-secondary" onClick={()=>openInline('place')}>+ New place</button></div></fieldset>
   </div></details>
   <p className="sp-form-status" role="alert">{error}</p>
   {event&&<div className="sp-event-actions"><button type="button" className="sp-secondary" onClick={()=>{const copy=duplicateEvent(event,crypto.randomUUID(),profileId);onSave({...data,events:[...data.events,copy]},'Activity duplicated at the same time. Tap it to adjust.');onClose()}}>Duplicate event</button><button type="button" className="sp-danger" onClick={()=>{onSave({...data,events:data.events.map(e=>e.id===event.id?{...e,cancelled:true}:e)},'Activity cancelled. Undo is available.');onClose()}}>Cancel activity</button></div>}
   <footer><button type="button" className="sp-secondary" onClick={onClose}>Cancel</button><button disabled={!activity}>{event?'Save changes':'Add'}</button></footer>
  </form>}
 </Sheet>
}

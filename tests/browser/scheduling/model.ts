import type {PictureKind} from '../../../src/types/calendar.ts'
/** Disposable interaction state. Not a second production schedule or persistence model. */
export interface PrototypeActivity {id:string;name:string;kind:PictureKind;duration:number;personIds:string[];placeId?:string}
export interface PrototypeIdentity {id:string;name:string;active:true;avatar:string}
export interface PrototypeProfile extends PrototypeIdentity {visibility:Horizon}
export interface ContextItem {id:string;name:string;kind:PictureKind}
export interface PrototypeEvent {id:string;date:string;start:number;end:number;activityId:string;profileIds:string[];personIds:string[];placeId?:string;origin:'local'|'imported';title?:string;review:'pending'|'included'|'ignored';cancelled?:boolean}
export interface PrototypeRule {title:string;fromDate:string;profileIds:string[];activityId:string;decision:'included'|'ignored'}
export interface PrototypeData {caregiver:PrototypeIdentity;profiles:PrototypeProfile[];activities:PrototypeActivity[];people:ContextItem[];places:ContextItem[];events:PrototypeEvent[];rules:PrototypeRule[]}
export type Horizon = 0|1|2|3|4|5|6|7|14|21|28|'month'
export const TODAY='2026-10-06'
export const NOW=14*60+30
export const HORIZONS: {value:Horizon;label:string}[]=[{value:0,label:'Now + Next'},...[1,2,3,4,5,6,7].map(n=>({value:n as Horizon,label:n===1?'Today':`${n} Days`})),{value:14,label:'2 Weeks'},{value:21,label:'3 Weeks'},{value:28,label:'4 Weeks'},{value:'month',label:'Month'}]
export const addDays=(date:string,days:number)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10)
export const formatDate=(date:string,options:Intl.DateTimeFormatOptions={weekday:'short',month:'short',day:'numeric'})=>new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))
export const formatTime=(minutes:number)=>minutes===1440?'12:00 AM (+1 day)':`${Math.floor(minutes/60)%12||12}:${String(minutes%60).padStart(2,'0')} ${minutes<720?'AM':'PM'}`
export const timeInput=(minutes:number)=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`
export const fromTime=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m}
export const snap=(minutes:number)=>Math.round(minutes/15)*15
/** Editing Start keeps a later End; repairs use 30 minutes, capped at same-day midnight. */
export function changeEventStart(event:PrototypeEvent,minutes:number):PrototypeEvent {
 if(!Number.isFinite(minutes))return event
 const start=Math.max(0,Math.min(1425,snap(minutes)))
 return {...event,start,end:event.end>start?event.end:Math.min(1440,start+30)}
}
export const ordered=(events:PrototypeEvent[])=>[...events].sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start||a.end-b.end||a.id.localeCompare(b.id))
export const visibleEvents=(data:PrototypeData,profileId:string)=>ordered(data.events.filter(e=>!e.cancelled&&e.review==='included'&&e.profileIds.includes(profileId)))
export function rangeDates(anchor:string,horizon:Horizon):string[] {
 if(horizon==='month'){
  const first=anchor.slice(0,7)+'-01',weekday=new Date(first+'T12:00:00Z').getUTCDay()
  return Array.from({length:42},(_,i)=>addDays(first,i-weekday))
 }
 return Array.from({length:Math.max(1,horizon)},(_,i)=>addDays(anchor,i))
}
export function shiftRange(anchor:string,horizon:Horizon,direction:number) {
 if(horizon!=='month')return addDays(anchor,direction*Math.max(1,horizon))
 const date=new Date(anchor.slice(0,7)+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+direction);return date.toISOString().slice(0,10)
}
export function moveEvent(event:PrototypeEvent,delta:number,resize=false):PrototypeEvent {
 if(event.origin!=='local')return event
 if(resize)return {...event,end:Math.max(event.start+15,Math.min(1440,snap(event.end+delta)))}
 const duration=event.end-event.start,start=Math.max(0,Math.min(1440-duration,snap(event.start+delta)))
 return {...event,start,end:start+duration}
}
/** Connected overlap groups get stable side-by-side lanes; touching ends share a lane. */
export function overlapLayout(events:PrototypeEvent[]) {
 const result:{event:PrototypeEvent;lane:number;lanes:number}[]=[]
 let group:typeof result=[],end=-1
 const flush=()=>{const lanes=Math.max(1,...group.map(x=>x.lane+1));result.push(...group.map(x=>({...x,lanes})));group=[]}
 for(const event of ordered(events)){
  if(group.length&&event.start>=end)flush()
  const occupied=new Set(group.filter(x=>x.event.end>event.start).map(x=>x.lane));let lane=0;while(occupied.has(lane))lane++
  if(!group.length)end=event.end;else end=Math.max(end,event.end)
  group.push({event,lane,lanes:1})
 }
 if(group.length)flush();return result
}
export function duplicateEvent(event:PrototypeEvent,id:string,profileId:string,date=event.date):PrototypeEvent {
 return {...event,id,date,profileIds:[profileId],origin:'local',review:'included',cancelled:false,title:undefined}
}
export function copyDay(data:PrototypeData,profileId:string,from:string,to:string,makeId:()=>string) {
 return {...data,events:[...data.events,...visibleEvents(data,profileId).filter(e=>e.date===from).map(e=>duplicateEvent(e,makeId(),profileId,to))]}
}
export function reviewImports(data:PrototypeData,ids:string[],decision:'included'|'ignored',profiles:string[],activityId?:string,future=false):PrototypeData {
 if(decision==='included'&&!profiles.length)return data
 const selected=data.events.filter(e=>ids.includes(e.id)&&e.origin==='imported'&&!e.cancelled)
 const rules=future?selected.filter(e=>e.title).map(e=>({title:e.title!.trim().toLowerCase(),fromDate:e.date,profileIds:profiles,activityId:activityId??e.activityId,decision})):[]
 return {...data,rules:[...data.rules,...rules],events:data.events.map(event=>{
  if(event.origin!=='imported')return event
  const rule=rules.find(r=>r.title===event.title?.trim().toLowerCase()&&event.date>=r.fromDate)
  if(!ids.includes(event.id)&&!(event.review==='pending'&&rule))return event
  return {...event,review:decision,profileIds:profiles,activityId:activityId??rule?.activityId??event.activityId}
 })}
}
export const ROUTINES:Record<string,{activityId:string;start:number;duration:number}[]>={
 'School Day':[{activityId:'school',start:8*60,duration:180},{activityId:'lunch',start:12*60,duration:30},{activityId:'home',start:15*60,duration:60}],
 Weekend:[{activityId:'lunch',start:12*60,duration:45},{activityId:'park',start:14*60,duration:60},{activityId:'home',start:17*60,duration:60}],
 'No School':[{activityId:'home',start:9*60,duration:60},{activityId:'therapy',start:11*60,duration:45},{activityId:'lunch',start:12*60,duration:30}],
}
export function applyRoutine(data:PrototypeData,profileId:string,date:string,name:string,makeId:()=>string):PrototypeData {
 return {...data,events:[...data.events,...(ROUTINES[name]??[]).map(slot=>{
  const activity=data.activities.find(a=>a.id===slot.activityId)!
  return {id:makeId(),date,start:slot.start,end:slot.start+slot.duration,activityId:activity.id,profileIds:[profileId],personIds:activity.personIds,placeId:activity.placeId,origin:'local' as const,review:'included' as const}
 })]}
}
export function createFixture(scenario:'family'|'residential'):PrototypeData {
 const profiles=(scenario==='family'?[['soren','Soren','sun'],['siv','Siv','flower']]:[['alex','Alex','star'],['jordan','Jordan','moon'],['riley','Riley','sun'],['morgan','Morgan','flower']]).map(([id,name,avatar])=>({id,name,avatar,active:true as const,visibility:(scenario==='family'?7:1) as Horizon}))
 const people:ContextItem[]=[{id:'lee',name:scenario==='family'?'Lee':'Sam · support',kind:'dad'},{id:'jules',name:scenario==='family'?'Jules':'Avery · support',kind:'mom'}]
 const places:ContextItem[]=[{id:'school-place',name:'Oak School',kind:'school'},{id:'clinic',name:'Maple Center',kind:'home'},{id:'home-place',name:scenario==='family'?'Home':'Cedar House',kind:'home'},{id:'garden',name:'Garden',kind:'park'}]
 const activities:PrototypeActivity[]=[
  {id:'school',name:'School',kind:'school',duration:180,personIds:['lee'],placeId:'school-place'},
  {id:'lunch',name:'Lunch',kind:'dinner',duration:30,personIds:[],placeId:'home-place'},
  {id:'pt',name:'PT',kind:'park',duration:45,personIds:['jules'],placeId:'clinic'},
  {id:'therapy',name:'Therapy',kind:'swim',duration:30,personIds:['jules'],placeId:'clinic'},
  {id:'home',name:'Home',kind:'home',duration:60,personIds:['lee'],placeId:'home-place'},
  {id:'park',name:'Outside',kind:'park',duration:30,personIds:['lee'],placeId:'garden'},
  {id:'rest',name:'Rest',kind:'sleep',duration:15,personIds:[],placeId:'home-place'},
 ]
 const events:PrototypeEvent[]=[];let n=0
 const add=(profileId:string,date:string,activityId:string,start:number,duration?:number)=>{
  const a=activities.find(a=>a.id===activityId)!;events.push({id:`local-${n++}`,date,start,end:start+(duration??a.duration),activityId,profileIds:[profileId],personIds:a.personIds,placeId:a.placeId,origin:'local',review:'included'})
 }
 profiles.forEach((p,i)=>{
  for(let day=0;day<28;day++){
   const date=addDays(TODAY,day),weekend=[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())
   if(scenario==='family'){
    add(p.id,date,weekend?'home':'school',8*60+i*15,weekend?60:180);add(p.id,date,'lunch',12*60,30);add(p.id,date,'home',17*60,60)
    if(day===0){add(p.id,date,'pt',14*60,45);add(p.id,date,'therapy',14*60+15,30);add(p.id,date,'rest',14*60+45,15)}
   }else{
    for(let slot=0;slot<12;slot++)add(p.id,date,['home','pt','rest','therapy','park','lunch'][slot%6],9*60+slot*15,15)
    add(p.id,date,'therapy',9*60+15,45);add(p.id,date,'lunch',12*60,30);add(p.id,date,'park',14*60,30);add(p.id,date,'home',17*60,60)
   }
  }
 })
 if(scenario==='family')for(let i=0;i<9;i++)events.push({id:`import-${i}`,date:addDays(TODAY,i%7),start:13*60+(i%3)*30,end:13*60+(i%3)*30+45,activityId:i%3===1?'pt':'therapy',profileIds:[],personIds:[],origin:'imported',title:i%3===1?'Physical therapy':'Therapy appointment',review:'pending'})
 return {caregiver:{id:'caregiver',name:'Caregiver',avatar:'star',active:true},profiles,activities,people,places,events,rules:[]}
}


export const AVATARS=['sun','flower','star','moon'] as const
export function updatePrototypeProfile(data:PrototypeData,id:string,name:string,avatar:string,visibility?:Horizon):PrototypeData {
 const clean=name.trim()
 if(!clean||clean.length>40||!AVATARS.some(a=>a===avatar))return data
 if(id===data.caregiver.id)return {...data,caregiver:{...data.caregiver,name:clean,avatar}}
 if(!data.profiles.some(p=>p.id===id)||!HORIZONS.some(h=>h.value===visibility))return data
 return {...data,profiles:data.profiles.map(p=>p.id===id?{...p,name:clean,avatar,visibility:visibility!}:p)}
}
export function restoreScheduleSnapshot(current:PrototypeData,previous:PrototypeData):PrototypeData {
 return {...previous,profiles:current.profiles,caregiver:current.caregiver}
}
export function moveEventToDay(event:PrototypeEvent,date:string):PrototypeEvent {
 if(event.origin!=='local'||event.cancelled||!/^\d{4}-\d{2}-\d{2}$/.test(date))return event
 const parsed=new Date(date+'T12:00:00Z')
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||event.date===date)return event
 return {...event,date}
}
/** Monday–Sunday picker around the saved event, independently of profile visibility. */
export function nearbyWeek(date:string) {
 const weekday=new Date(date+'T12:00:00Z').getUTCDay()
 return Array.from({length:7},(_,i)=>addDays(date,i-((weekday+6)%7)))
}
export function currentAndNext(events:PrototypeEvent[],date=TODAY,minute=NOW) {
 const sorted=ordered(events),current=sorted.find(e=>e.date===date&&e.start<=minute&&e.end>minute)
 const upcoming=sorted.filter(e=>e.date>date||(e.date===date&&e.start>minute))
 return current?[current,...upcoming.slice(0,1)]:upcoming.slice(0,2)
}

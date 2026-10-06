import {fixtureWeather} from './weather-fixture'
// Local-only visual harness. No Supabase reads/writes or personal photos.
import { useState } from 'react'
import {DisplayHeader} from '../../src/display/DisplayHeader'
import {DisplayRenderer} from '../../src/display/DisplayRenderer'
import {defaultDisplayPreferences} from '../../src/display/preferences'

import { createMockWeek } from '../../src/data/mockWeek'
import { DayCard } from '../../src/components/DayCard'
import { SelectedDayTimeline } from '../../src/components/SelectedDayTimeline'
import { ImageEditor, type ImageDraft } from '../../src/admin/ImageEditor'
import { decodeImage, renderImage } from '../../src/lib/imageProcessing'
import { RepeatFields } from '../../src/admin/RepeatFields'
import { dateKey, dayLabels, getTimelineState } from '../../src/lib/schedule'
import '../../src/index.css'
import '../../src/admin/admin.css'
if(!import.meta.env.DEV) throw new Error('Development fixture only')
const canvas=document.createElement('canvas');canvas.width=600;canvas.height=6000
const context=canvas.getContext('2d')!
context.fillStyle='#89adc1';context.fillRect(0,0,600,6000)
context.fillStyle='#f2cb9d';context.beginPath();context.ellipse(300,850,240,350,0,0,Math.PI*2);context.fill()
context.fillStyle='#273e59';context.fillRect(100,1150,400,4500)
context.fillStyle='white';context.font='60px sans-serif';context.fillText('TALL TEST',100,5800)
const portrait=canvas.toDataURL('image/png')
// 15:45 on Wednesday makes NOW and NEXT deterministic.
const fixtureDate=new URLSearchParams(location.search).get('monthDate')
const now=fixtureDate?new Date(fixtureDate+'T12:00:00'):new Date(2026,8,23,15,45)
const week=createMockWeek(now)
for(const day of week) for(const event of day.events) {
 for(const person of event.people) if(person.id==='dad') person.picture={...person.picture,photoUrl:portrait}
 if(event.picture.kind==='dad') event.picture={...event.picture,photoUrl:portrait}
 if(event.place.id==='dad-home') event.place={...event.place,picture:{...event.place.picture,photoUrl:portrait}}
 if(event.sleepLocation?.id==='dad-home') event.sleepLocation={...event.sleepLocation,picture:{...event.sleepLocation.picture,photoUrl:portrait}}
}
export function Fixture() {
 const [selected,setSelected]=useState<string|null>(new URLSearchParams(location.search).get('day'))
 const [mode,setMode]=useState('week')
 const [draft,setDraft]=useState<ImageDraft>()
 const [encoded,setEncoded]=useState('')
 const originalDay=week.find(d=>d.id===selected)
 const count=Number(new URLSearchParams(location.search).get('count'))
 let day=originalDay&&count>0?{...originalDay,events:originalDay.events.filter(e=>getTimelineState(originalDay,now).statuses[e.id]!=='past').slice(0,count)}:originalDay
 const scenario=new URLSearchParams(location.search).get('scenario')
 const prefs={...defaultDisplayPreferences(),showTimes:scenario==='activity-time'}
 if(day&&scenario) {
  const base=day.events[0],sleep=scenario.startsWith('sleep')
  const picture={id:sleep?'sleep':'school',kind:sleep?'sleep' as const:'school' as const,label:sleep?'SLEEP':'SCHOOL'}
  const mom={id:'mom',name:'Mom',picture:{id:'mom',kind:'mom' as const,label:'MOM'}}
  const dad={id:'dad',name:'Dad',picture:{id:'dad',kind:'dad' as const,label:'DAD'}}
  const place={id:'mom-home',name:'Mom Home',picture:{id:'mom-home',kind:'home' as const,label:scenario==='long-place'?'MOM HOME — NORTHSIDE FAMILY HOUSE':'MOM HOME'}}
  day={...day,events:[{...base,id:'scenario',label:picture.label,picture,activity:{id:picture.id,picture},startTime:new Date(now.getTime()-60000).toISOString(),endTime:new Date(now.getTime()+3600000).toISOString(),sleepLocation:sleep?place:undefined,place:scenario==='title-only'||scenario==='with-only'?{...place,id:'',name:''}:place,people:scenario==='sleep-where'||scenario==='title-only'?[]:scenario==='two-caregivers'?[mom,dad]:[mom]}]}
 }
 if(day&&scenario==='multi') {
  const base=day.events[0],mom={id:'mom',name:'Mom',picture:{id:'mom',kind:'mom' as const,label:'MOM'}}
  const place={id:'home',name:'Mom Home',picture:{id:'home',kind:'home' as const,label:'MOM HOME'}}
  day={...day,events:['SCHOOL','PT','AFTER SCHOOL ACTIVITY','SLEEP'].slice(0,count||4).map((label,index)=>{
   const kind=index===3?'sleep' as const:'school' as const
   const picture={id:'multi-'+index,kind,label,...(index===2?{photoUrl:portrait}:{})}
   return {...base,id:'multi-'+index,label,picture,activity:{id:picture.id,picture},place:new URLSearchParams(location.search).has('richContext')?{...place,picture:{...place.picture,label:'NORTHSIDE FAMILY HOUSE',photoUrl:portrait}}:place,people:new URLSearchParams(location.search).has('richContext')?[mom,{id:'dad',name:'Dad',picture:{id:'dad',kind:'dad' as const,label:'DAD',photoUrl:portrait}}]:[mom],sleepLocation:index===3?place:undefined,startTime:new Date(now.getTime()+(index-1)*3600000).toISOString(),endTime:new Date(now.getTime()+index*3600000+1800000).toISOString()}
  })}
 }
 const weather=new URLSearchParams(location.search).has('weather')?fixtureWeather(now,week[0].timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone):undefined
 const view=new URLSearchParams(location.search).get('view')
 if(view) {
  const preferences=defaultDisplayPreferences(view==='sequence'?'first-next-then':view==='rolling'?'week':'standard-calendar')
  if(view==='month')preferences.defaultView='month'
  const displayWeek=new URLSearchParams(location.search).has('wrapped')?week.map((day,index)=>({...day,events:day.events.map(event=>({...event,people:event.people.map(person=>({...person,picture:{...person.picture,label:index===2?'MRS STELTER':person.picture.label}})),...(event.sleepLocation?{sleepLocation:{...event.sleepLocation,picture:{...event.sleepLocation.picture,label:index===3?'MOM NORTHSIDE HOME':event.sleepLocation.picture.label}}}:{})}))})):week
  return <DisplayRenderer weather={weather} schedule={{days:displayWeek,timeZone:week[0].timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone}} now={now} preferences={preferences} profileName="Soren"/>
 }
 return <><nav hidden={new URLSearchParams(location.search).has('comparison')} aria-label="Test fixture" style={{position:'fixed',bottom:0,right:0,zIndex:20,background:'white',fontSize:12}}><button onClick={()=>setMode('week')}>Test Week</button> | <button onClick={()=>setMode('admin')}>Test crop & repeat</button></nav>
 {mode==='week'?<main className="calendar-shell mx-auto flex min-h-dvh max-w-[1800px] flex-col"><DisplayHeader profileName="Soren" context={day?dayLabels(day.date).name:'MY WEEK'} compact>{day?<button className="week-button" onClick={()=>setSelected(null)}>← WEEK</button>:<p className="month-label">September 2026</p>}</DisplayHeader>
 {day?<SelectedDayTimeline weather={weather} day={day} now={now} preferences={prefs}/>:<section className="week-grid grid grid-cols-7" aria-label="This week">{week.map(d=><DayCard key={d.id} day={d} isToday={d.date===dateKey(now)} onSelect={()=>setSelected(d.id)}/>)}</section>}
 <footer className="page-footer flex items-center justify-between gap-4"><span className="footer-hint">☝ TAP A DAY</span></footer></main>:<main className="admin-shell"><h1>Image and recurrence test</h1><p>Synthetic 600 × 6000 portrait. Nothing is saved.</p><ImageEditor preset="people" originalUrl={portrait} displayUrl={portrait} label="DAD" icon="dad" onChange={setDraft}/><output aria-label="Crop state">{draft?JSON.stringify({presentation:draft.presentation,pending:draft.pending,error:draft.error}):''}</output><button disabled={!draft?.image} onClick={async()=>{const blob=await renderImage(draft!.image!,draft!.presentation);const decoded=await decodeImage(blob);setEncoded(`${blob.type}: ${decoded.naturalWidth} × ${decoded.naturalHeight}, ${blob.size} bytes`)}}>Test derivative encoding</button><output aria-label="Encoded image">{encoded}</output><RepeatFields startDate="2026-09-10" initial={{version:1,frequency:'weekly',interval:3,startDate:'2026-09-10',endDate:'2026-12-17',weekdays:[4]}}/></main>}</>
}

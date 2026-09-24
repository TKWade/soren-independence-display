// Local-only visual harness. No Supabase reads/writes or personal photos.
import { useState } from 'react'

import { createMockWeek } from '../../src/data/mockWeek'
import { DayCard } from '../../src/components/DayCard'
import { SelectedDayTimeline } from '../../src/components/SelectedDayTimeline'
import { ImageEditor, type ImageDraft } from '../../src/admin/ImageEditor'
import { decodeImage, renderImage } from '../../src/lib/imageProcessing'
import { RepeatFields } from '../../src/admin/RepeatFields'
import { dateKey, dayLabels } from '../../src/lib/schedule'
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
const now=new Date(2026,8,23,15,45)
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
 const day=week.find(d=>d.id===selected)
 return <><nav hidden={new URLSearchParams(location.search).has('comparison')} aria-label="Test fixture" style={{position:'fixed',bottom:0,right:0,zIndex:20,background:'white',fontSize:12}}><button onClick={()=>setMode('week')}>Test Week</button> | <button onClick={()=>setMode('admin')}>Test crop & repeat</button></nav>
 {mode==='week'?<main className="calendar-shell mx-auto flex min-h-dvh max-w-[1800px] flex-col"><header className="page-header flex items-center justify-between gap-4"><div className="flex items-center gap-4"><div className="brand-mark">☀</div><div><p className="eyebrow">SOREN’S CALENDAR</p><h1>{day?dayLabels(day.date).name:'MY WEEK'}</h1></div></div>{day?<button className="week-button" onClick={()=>setSelected(null)}>← WEEK</button>:<p className="month-label">September 2026</p>}</header>
 {day?<SelectedDayTimeline day={day} now={now}/>:<section className="week-grid grid grid-cols-7" aria-label="This week">{week.map(d=><DayCard key={d.id} day={d} isToday={d.date===dateKey(now)} onSelect={()=>setSelected(d.id)}/>)}</section>}
 <footer className="page-footer flex items-center justify-between gap-4"><span className="footer-hint">☝ TAP A DAY</span></footer></main>:<main className="admin-shell"><h1>Image and recurrence test</h1><p>Synthetic 600 × 6000 portrait. Nothing is saved.</p><ImageEditor preset="people" originalUrl={portrait} displayUrl={portrait} label="DAD" icon="dad" onChange={setDraft}/><output aria-label="Crop state">{draft?JSON.stringify({presentation:draft.presentation,pending:draft.pending,error:draft.error}):''}</output><button disabled={!draft?.image} onClick={async()=>{const blob=await renderImage(draft!.image!,draft!.presentation);const decoded=await decodeImage(blob);setEncoded(`${blob.type}: ${decoded.naturalWidth} × ${decoded.naturalHeight}, ${blob.size} bytes`)}}>Test derivative encoding</button><output aria-label="Encoded image">{encoded}</output><RepeatFields startDate="2026-09-10" initial={{version:1,frequency:'weekly',interval:3,startDate:'2026-09-10',endDate:'2026-12-17',weekdays:[4]}}/></main>}</>
}

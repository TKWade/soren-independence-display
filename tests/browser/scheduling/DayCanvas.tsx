import {useEffect,useRef,useState,type PointerEvent} from 'react'
import {Art} from './Shared'
import {formatTime,moveEvent,overlapLayout,type PrototypeData,type PrototypeEvent} from './model'
const PX_PER_MINUTE=4
interface Props {data:PrototypeData;events:PrototypeEvent[];editing:boolean;onAdd:(time:number)=>void;onEdit:(event:PrototypeEvent)=>void;onMove:(event:PrototypeEvent)=>void}
export function DayCanvas({data,events,editing,onAdd,onEdit,onMove}:Props) {
 const canvas=useRef<HTMLDivElement>(null),gesture=useRef<{event:PrototypeEvent;resize:boolean;startY:number;clientY:number;pointerId:number;preview:PrototypeEvent;frame:number}|undefined>(undefined),[preview,setPreview]=useState<PrototypeEvent>()
 const start=Math.min(8*60,...events.map(e=>Math.floor(e.start/60)*60)),end=Math.max(19*60,...events.map(e=>Math.ceil(e.end/60)*60))
 const shown=events.map(e=>e.id===preview?.id?preview:e),layout=overlapLayout(shown)
 useEffect(()=>()=>{if(gesture.current)cancelAnimationFrame(gesture.current.frame)},[])
 function begin(e:PointerEvent,ev:PrototypeEvent,resize:boolean){
  if(e.button!==0||!editing||ev.origin!=='local')return
  e.preventDefault();e.stopPropagation();canvas.current?.setPointerCapture(e.pointerId)
  const g={event:ev,resize,startY:e.clientY+window.scrollY,clientY:e.clientY,pointerId:e.pointerId,preview:ev,frame:0};gesture.current=g
  const tick=()=>{
   if(gesture.current!==g)return
   if(g.clientY<100)window.scrollBy(0,-10);else if(g.clientY>window.innerHeight-70)window.scrollBy(0,10)
   const next=moveEvent(g.event,(g.clientY+window.scrollY-g.startY)/PX_PER_MINUTE,g.resize)
   if(next.start!==g.preview.start||next.end!==g.preview.end){g.preview=next;setPreview(next)}
   g.frame=requestAnimationFrame(tick)
  };g.frame=requestAnimationFrame(tick)
 }
 function finish(commit:boolean){
  const g=gesture.current;if(!g)return;cancelAnimationFrame(g.frame);gesture.current=undefined
  if(canvas.current?.hasPointerCapture(g.pointerId))canvas.current.releasePointerCapture(g.pointerId)
  setPreview(undefined)
  if(commit&&(g.preview.start!==g.event.start||g.preview.end!==g.event.end))onMove(g.preview)
 }
 return <div className="sp-day-canvas" ref={canvas} style={{height:(end-start)*PX_PER_MINUTE}} onPointerMove={e=>{if(gesture.current)gesture.current.clientY=e.clientY}} onPointerUp={()=>finish(true)} onPointerCancel={()=>finish(false)} onLostPointerCapture={()=>finish(false)}>
  {Array.from({length:(end-start)/15},(_,i)=>{const t=start+i*15;return <div key={t} className={`sp-time-row${t%60===0?' is-hour':''}`} style={{top:(t-start)*PX_PER_MINUTE,height:15*PX_PER_MINUTE}}><time>{formatTime(t)}</time>{editing?<button type="button" className="sp-empty-slot" aria-label={`Add activity at ${formatTime(t)}`} onClick={()=>onAdd(t)}><span>＋</span></button>:<span className="sp-slot-line"/>}</div>})}
  {layout.map(({event,lane,lanes})=>{
   const activity=data.activities.find(a=>a.id===event.activityId)!,moving=preview?.id===event.id
   const time=`${formatTime(event.start)} – ${formatTime(event.end)}`
   const content=<><Art kind={activity.kind}/><span><strong>{activity.name.toUpperCase()}</strong><time>{time}</time>{event.origin==='imported'&&editing&&<small>Imported · included</small>}</span></>
   return <article key={event.id} className={`sp-time-event${moving?' is-moving':''}${event.origin==='imported'?' is-linked':''}`} data-event-id={event.id} data-lane={lane} data-lanes={lanes} style={{top:(event.start-start)*PX_PER_MINUTE+2,height:(event.end-event.start)*PX_PER_MINUTE-4,left:`calc(82px + (100% - 90px) * ${lane/lanes})`,width:`calc((100% - 90px) / ${lanes} - 6px)`}}>
    {editing?<><button type="button" className="sp-event-face" aria-label={`Edit ${activity.name}, ${time}`} onClick={()=>onEdit(event)}>{content}</button>{event.origin==='local'&&<><button type="button" className="sp-move-grip" aria-label={`Move ${activity.name}, ${time}. Arrow keys change by 15 minutes.`} title="Drag to move; arrow keys move 15 minutes" onPointerDown={e=>begin(e,event,false)} onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onMove(moveEvent(event,(e.key==='ArrowUp'?-1:1)*(e.shiftKey?60:15)))}}}>⠿</button><button type="button" className="sp-resize-grip" aria-label={`Resize ${activity.name}, ending ${formatTime(event.end)}. Arrow keys change by 15 minutes.`} title="Drag to resize; arrow keys change 15 minutes" onPointerDown={e=>begin(e,event,true)} onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onMove(moveEvent(event,(e.key==='ArrowUp'?-1:1)*15,true))}}}><span/></button></>}</>:<div className="sp-event-face">{content}</div>}
   </article>
  })}
  {preview&&<div className="sp-drag-preview" role="status">{formatTime(preview.start)} – {formatTime(preview.end)}</div>}
 </div>
}

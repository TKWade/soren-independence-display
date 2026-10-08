import {useEffect,useRef,useState,type PointerEvent} from 'react'
import {Art} from './Shared'
import {formatTime,moveEvent,overlapLayout,type PrototypeData,type PrototypeEvent} from './model'
import {TimelineGesture,HOLD_MS,initialTimelineMinute,edgeScrollDelta} from './timelineInteraction'
const gestureClock=()=>performance.now()
interface Props {data:PrototypeData;date:string;events:PrototypeEvent[];editing:boolean;onAdd:(time:number)=>void;onEdit:(event:PrototypeEvent)=>void;onMove:(event:PrototypeEvent)=>void}
export function DayCanvas({data,date,events,editing,onAdd,onEdit,onMove}:Props) {
 const canvas=useRef<HTMLDivElement>(null),engine=useRef(new TimelineGesture()),[preview,setPreview]=useState<PrototypeEvent>(),[resizing,setResizing]=useState(false)
 const input=useRef<{kind:'pointer'|'touch';id:number;x:number;y:number;dragging:boolean;frame:number;timer:ReturnType<typeof setTimeout>;lastFrame:number}|undefined>(undefined)
 const suppressClick=useRef(0),initial=useRef({date,events}),callback=useRef(onMove)
 useEffect(()=>{callback.current=onMove},[onMove])
 const start=Math.min(8*60,...events.map(e=>Math.floor(e.start/60)*60)),end=Math.max(19*60,...events.map(e=>Math.ceil(e.end/60)*60))
 const shown=events.map(e=>e.id===preview?.id?preview:e),layout=overlapLayout(shown)
 const scale=()=>Number(getComputedStyle(canvas.current!).getPropertyValue('--sp-minute-px'))||2
 const toolbarBottom=()=>Math.max(0,document.querySelector('.sp-editing-bar')?.getBoundingClientRect().bottom??0)
 function finish(commit:boolean){
  const g=input.current;if(!g)return
  clearTimeout(g.timer);cancelAnimationFrame(g.frame)
  if(engine.current.state?.phase==='moving')suppressClick.current=gestureClock()+800
  const changed=engine.current.finish(commit);input.current=undefined
  if(g.kind==='pointer'&&canvas.current?.hasPointerCapture(g.id))canvas.current.releasePointerCapture(g.id)
  setPreview(undefined);if(changed)callback.current(changed)
 }
 function track(x:number,y:number){
  const g=input.current;if(!g)return;g.x=x;g.y=y
  const state=engine.current.state
  if(state?.phase==='moving'&&Math.hypot(x-state.x,y-state.y)>8)g.dragging=true
  engine.current.update(x,y,window.scrollY,scale())
  if(!engine.current.state){suppressClick.current=gestureClock()+800;finish(false)}
 }
 function startInput(event:PrototypeEvent,kind:'pointer'|'touch',id:number,x:number,y:number,immediate=false,resize=false){
  if(input.current)finish(false)
  if(!engine.current.begin(event,x,y,window.scrollY,gestureClock(),immediate,resize))return
  const g={kind,id,x,y,dragging:false,frame:0,timer:0 as unknown as ReturnType<typeof setTimeout>,lastFrame:gestureClock()};input.current=g
  function activate(){
   if(input.current!==g)return
   if(!immediate&&!engine.current.activate(gestureClock()))return
   suppressClick.current=gestureClock()+800
   if(kind==='pointer')canvas.current?.setPointerCapture(id)
   setResizing(resize);setPreview(event)
   const tick=(now:number)=>{
    if(input.current!==g)return
    if(g.dragging)window.scrollBy(0,edgeScrollDelta(g.y,toolbarBottom(),window.innerHeight,now-g.lastFrame));g.lastFrame=now
    engine.current.update(g.x,g.y,window.scrollY,scale())
    const next=engine.current.state?.preview
    setPreview(old=>old?.start===next?.start&&old?.end===next?.end?old:next)
    g.frame=requestAnimationFrame(tick)
   };g.frame=requestAnimationFrame(tick)
  }
  if(immediate)activate();else g.timer=setTimeout(activate,HOLD_MS+1)
 }
 function beginPointer(e:PointerEvent,event:PrototypeEvent,immediate=false,resize=false){
  if(e.button!==0||!editing||event.origin!=='local'||(!immediate&&e.pointerType==='touch'))return
  if(immediate){e.preventDefault();e.stopPropagation()}
  startInput(event,'pointer',e.pointerId,e.clientX,e.clientY,immediate,resize)
 }
 // A passive swipe stays native. Only an activated hold prevents touch scrolling.
 // Do not switch touch-action after pointerdown: browsers determine it at gesture start.
 useEffect(()=>{
  const node=canvas.current!,gesture=engine.current;if(!editing)return
  const touchStart=(e:TouchEvent)=>{
   if(e.touches.length!==1){finish(false);return}
   const face=(e.target as Element).closest<HTMLElement>('.sp-event-face[data-local-event]')
   const event=events.find(ev=>ev.id===face?.dataset.localEvent);if(!event)return
   const t=e.touches[0];startInput(event,'touch',t.identifier,t.clientX,t.clientY)
  }
  const touchMove=(e:TouchEvent)=>{
   const g=input.current;if(g?.kind!=='touch')return
   const t=Array.from(e.touches).find(t=>t.identifier===g.id);if(!t)return
   if(engine.current.state?.phase==='moving'){
    if(!e.cancelable){finish(false);return} // Native scrolling already won; never reschedule.
    e.preventDefault()
   }
   track(t.clientX,t.clientY)
  }
  const touchEnd=(e:TouchEvent)=>{
   if(input.current?.kind!=='touch'||!Array.from(e.changedTouches).some(t=>t.identifier===input.current?.id))return
   if(engine.current.state?.phase==='moving'&&e.cancelable)e.preventDefault()
   finish(true)
  }
  const pointerMove=(e:globalThis.PointerEvent)=>{if(input.current?.kind==='pointer'&&input.current.id===e.pointerId)track(e.clientX,e.clientY)}
  const pointerEnd=(e:globalThis.PointerEvent)=>{if(input.current?.kind==='pointer'&&input.current.id===e.pointerId){track(e.clientX,e.clientY);finish(true)}}
  const cancel=()=>finish(false)
  const pointerCancel=(e:globalThis.PointerEvent)=>{if(input.current?.kind==='pointer'&&input.current.id===e.pointerId)cancel()}
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&input.current){e.preventDefault();cancel()}}
  const scrolled=()=>{if(engine.current.state?.phase==='waiting'&&input.current)track(input.current.x,input.current.y)}
  const context=(e:Event)=>{if(input.current||gestureClock()<suppressClick.current)e.preventDefault()}
  node.addEventListener('touchstart',touchStart,{passive:true})
  node.addEventListener('contextmenu',context)
  document.addEventListener('touchmove',touchMove,{passive:false})
  document.addEventListener('touchend',touchEnd,{passive:false})
  document.addEventListener('touchcancel',cancel)
  document.addEventListener('pointermove',pointerMove)
  document.addEventListener('pointerup',pointerEnd)
  document.addEventListener('pointercancel',pointerCancel)
  node.addEventListener('lostpointercapture',pointerCancel)
  window.addEventListener('keydown',escape);window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);window.addEventListener('scroll',scrolled)
  return()=>{
   setPreview(undefined)
   if(input.current){clearTimeout(input.current.timer);cancelAnimationFrame(input.current.frame);input.current=undefined;gesture.finish(false)}
   node.removeEventListener('touchstart',touchStart);node.removeEventListener('contextmenu',context)
   document.removeEventListener('touchmove',touchMove);document.removeEventListener('touchend',touchEnd);document.removeEventListener('touchcancel',cancel)
   document.removeEventListener('pointermove',pointerMove);document.removeEventListener('pointerup',pointerEnd);document.removeEventListener('pointercancel',pointerCancel);node.removeEventListener('lostpointercapture',pointerCancel)
   window.removeEventListener('keydown',escape);window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);window.removeEventListener('scroll',scrolled)
  }
 },[editing,events])
 useEffect(()=>{
  const frame=requestAnimationFrame(()=>{
   const node=canvas.current!,minute=initialTimelineMinute(initial.current.date,initial.current.events),start=Number(node.dataset.start),end=Number(node.dataset.end)
   const top=node.getBoundingClientRect().top+window.scrollY+(Math.max(start,Math.min(end-15,minute))-start)*scale()-(document.querySelector('.sp-editing-bar')?.getBoundingClientRect().height??0)-16
   window.scrollTo({top:Math.max(0,top),behavior:'instant'})
  });return()=>cancelAnimationFrame(frame)
  // A date/profile mounts a new canvas. Editing and event changes must not reset the scroll.
 },[])
 return <div className="sp-day-canvas" ref={canvas} data-start={start} data-end={end} style={{height:`calc(${end-start} * var(--sp-minute-px) * 1px)`}}>
  {Array.from({length:(end-start)/15},(_,i)=>{const t=start+i*15;return <div key={t} className={`sp-time-row${t%60===0?' is-hour':''}`} style={{top:`calc(${t-start} * var(--sp-minute-px) * 1px)`,height:'calc(15 * var(--sp-minute-px) * 1px)'}}><time>{formatTime(t)}</time>{editing?<button type="button" className="sp-empty-slot" aria-label={`Add activity at ${formatTime(t)}`} onClick={()=>onAdd(t)}><span>＋</span></button>:<span className="sp-slot-line"/>}</div>})}
  {layout.map(({event,lane,lanes})=>{
   const activity=data.activities.find(a=>a.id===event.activityId)!,moving=preview?.id===event.id,duration=event.end-event.start
   const time=`${formatTime(event.start)} – ${formatTime(event.end)}`
   const context=[data.places.find(p=>p.id===event.placeId)?.name,...event.personIds.map(id=>data.people.find(p=>p.id===id)?.name)].filter(Boolean).join(' · ')
   const content=<><Art kind={activity.kind}/><span><strong>{activity.name.toUpperCase()}</strong><time>{time}</time>{duration>=60&&context&&<small>{context}</small>}{event.origin==='imported'&&editing&&<small>Imported · included</small>}</span></>
   return <article key={event.id} className={`sp-time-event${moving?' is-moving':''}${event.origin==='imported'?' is-linked':''}`} data-event-id={event.id} data-short={duration===15} data-lane={lane} data-lanes={lanes} style={{top:`calc(${event.start-start} * var(--sp-minute-px) * 1px + 2px)`,height:`calc(${duration} * var(--sp-minute-px) * 1px - 4px)`,left:`calc(76px + (100% - 84px) * ${lane/lanes})`,width:`calc((100% - 84px) / ${lanes} - 6px)`}}>
    {editing?<><button type="button" className="sp-event-face" data-local-event={event.origin==='local'?event.id:undefined} aria-label={`Edit ${activity.name}, ${time}`} onPointerDown={e=>beginPointer(e,event)} onClick={e=>{if(gestureClock()<suppressClick.current){e.preventDefault();return}onEdit(event)}}>{content}</button>{event.origin==='local'&&<><button type="button" className="sp-move-grip" aria-label={`Move ${activity.name}, ${time}. Arrow keys change by 15 minutes.`} title="Drag to move; arrow keys move 15 minutes" onPointerDown={e=>beginPointer(e,event,true)} onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onMove(moveEvent(event,(e.key==='ArrowUp'?-1:1)*(e.shiftKey?60:15)))}}}>⠿</button><button type="button" className="sp-resize-grip" aria-label={`Resize ${activity.name}, ending ${formatTime(event.end)}. Arrow keys change by 15 minutes.`} title="Drag to resize; arrow keys change 15 minutes" onPointerDown={e=>beginPointer(e,event,true,true)} onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onMove(moveEvent(event,(e.key==='ArrowUp'?-1:1)*15,true))}}}><span/></button></>}</>:<div className="sp-event-face">{content}</div>}
   </article>
  })}
  {preview&&<div className="sp-drag-preview"><div role="status"><strong>{resizing?'Drag to resize':'Drag to move'}</strong><span>{formatTime(preview.start)} – {formatTime(preview.end)}</span></div><button type="button" onClick={()=>finish(false)}>Cancel move</button></div>}
 </div>
}

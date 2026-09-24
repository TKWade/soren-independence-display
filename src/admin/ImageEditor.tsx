import { useEffect, useMemo, useRef, useState } from 'react'
import { PictureTile } from '../components/PictureTile'
import type { PictureKind } from '../types/calendar'
import { normalizePresentation, type ImagePresentation, type ImagePreset } from '../lib/images'
import { decodeImage, imageCanvas } from '../lib/imageProcessing'
export interface ImageDraft {
 image?:HTMLImageElement; file?:File; presentation:ImagePresentation; changed:boolean; removed:boolean; pending:boolean; error:string
}
export function ImageEditor({preset,originalUrl,displayUrl,initial,label,icon,onChange}:{
 preset:ImagePreset;originalUrl?:string;displayUrl?:string;initial?:ImagePresentation|null;label:string;icon:PictureKind;onChange:(draft:ImageDraft)=>void
}) {
 const [draft,setDraft]=useState<ImageDraft>({presentation:normalizePresentation(preset,initial),changed:false,removed:false,pending:false,error:''})

 const request=useRef(0)

 useEffect(()=>()=>{request.current++},[])
 const preview=useMemo(()=>{
  if(draft.removed) return {url:undefined,error:''}
  try {return {url:draft.image?imageCanvas(draft.image,draft.presentation,true).toDataURL('image/webp',.9):displayUrl,error:''}}
  catch {return {url:undefined,error:'Preview could not be created. Choose another image.'}}
 },[draft.image,draft.presentation,draft.removed,displayUrl])
 useEffect(()=>{onChange({...draft,error:draft.error||preview.error})},[draft,preview.error,onChange])
 async function load(file?:File) {
  const current=++request.current
  setDraft(value=>({...value,pending:true,error:''}))
  try {
   let blob:Blob
   if(file) blob=file
   else {
    if(!originalUrl) throw new Error('Original unavailable. Refresh or select a new image.')
    const response=await fetch(originalUrl);if(!response.ok) throw new Error('Original unavailable. Refresh or select a new image.')
    blob=await response.blob()
   }
   const image=await decodeImage(blob)
   if(current===request.current) setDraft({image,file,presentation:normalizePresentation(preset,file?undefined:initial),changed:true,removed:false,pending:false,error:''})
  } catch(error) {
   if(current===request.current) setDraft(value=>({...value,pending:false,error:error instanceof Error?error.message:'Could not read the image.'}))
  }
 }
 return <div className="image-editor"><h3>Photo & crop preview</h3>
  <label>JPEG, PNG or WebP · up to 10 MB<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file) void load(file)}}/></label>
  <p>People and activities use a square crop. Places use a landscape crop. The preview uses the same picture frame as Week.</p>
  <div className="image-editor-layout"><div className="image-week-preview"><PictureTile category={preset==='people'?'WITH':preset==='places'?'WHERE':'DO'} item={{id:'preview',label:label||'PHOTO',kind:icon,photoUrl:preview.url}}/></div>
   <div className="image-editor-controls">
    {originalUrl&&!draft.image&&!draft.removed&&<button type="button" className="secondary" disabled={draft.pending} onClick={()=>void load()}>Adjust current photo</button>}
    {draft.image&&!draft.removed && <>{(['x','y','zoom'] as const).map(key=><label key={key}>{key==='x'?'Horizontal position':key==='y'?'Vertical position':'Zoom'}<input type="range" min={key==='zoom'?1:0} max={key==='zoom'?3:1} step="0.01" value={draft.presentation[key]} onChange={e=>setDraft(value=>({...value,changed:true,presentation:{...value.presentation,[key]:Number(e.target.value)}}))}/></label>)}</>}
    {(preview.url||draft.error||preview.error) && <button type="button" className="secondary" onClick={()=>{request.current++;setDraft({presentation:normalizePresentation(preset),changed:true,removed:true,pending:false,error:''})}}>Remove photo / use icon</button>}
    {draft.pending&&<p role="status">Preparing preview…</p>}{(draft.error||preview.error)&&<p role="alert">{draft.error||preview.error}</p>}
   </div>
  </div>
 </div>
}

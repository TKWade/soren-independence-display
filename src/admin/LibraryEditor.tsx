import { useState } from 'react'
import type { HouseholdData, LibraryName, LibraryRow } from '../data/records'
import type { PictureKind } from '../types/calendar'
import { saveLibrary, uploadImage, discardUpload } from '../data/repository'
import { ImageEditor, type ImageDraft } from './ImageEditor'
import { renderImage } from '../lib/imageProcessing'
import type { RunAction } from './Admin'
const icons: PictureKind[]=['school','swim','park','home','dad','mom','dinner','sleep']
export function LibraryEditor({kind,data,run}:{kind:LibraryName;data:HouseholdData;run:RunAction}) {
 const [selected,setSelected]=useState('')
 const [version,setVersion]=useState(0)
 return <section><h2>{kind[0].toUpperCase()+kind.slice(1)}</h2>
  <label>Edit an existing entry<select value={selected} onChange={event=>setSelected(event.target.value)}><option value="">New entry</option>{data[kind].map(row=><option key={row.id} value={row.id}>{row.name}{row.active?'':' (inactive)'}</option>)}</select></label>
  <LibraryForm key={kind+selected+version} kind={kind} data={data} item={data[kind].find(row=>row.id===selected)} run={run} done={()=>{setSelected('');setVersion(value=>value+1)}}/>
 </section>
}
function LibraryForm({kind,data,item,run,done}:{kind:LibraryName;data:HouseholdData;item?:LibraryRow;run:RunAction;done:()=>void}) {
 const [image,setImage]=useState<ImageDraft>()
 const [label,setLabel]=useState(item?.label ?? '')
 const [icon,setIcon]=useState<PictureKind>(item?.icon ?? (kind==='people'?'dad':'home'))
 const originalPath=item?.source_image_path || item?.image_path
 return <form onSubmit={event=>{
  event.preventDefault();const values=new FormData(event.currentTarget)
  if(image?.pending||image?.error) return
  void run(async()=>{
   const uploaded:string[]=[]
   try {
    let imagePath=item?.image_path??null, sourcePath=item?.source_image_path??null, presentation=item?.image_presentation??null
    if(image?.removed) {imagePath=null;sourcePath=null;presentation=null}
    else if(image?.changed&&image.image) {
     const group=crypto.randomUUID()
     const derivative=await renderImage(image.image,image.presentation)
     if(image.file) {sourcePath=await uploadImage(data.household.id,image.file,group,'original');uploaded.push(sourcePath)}
     else sourcePath=originalPath??null
     imagePath=await uploadImage(data.household.id,derivative,group,'display');uploaded.push(imagePath)
     presentation=image.presentation
    }
    const record:Partial<LibraryRow>={id:item?.id??crypto.randomUUID(),household_id:data.household.id,
     name:String(values.get('name')).trim(),label:label.trim().toUpperCase(),icon,active:values.get('active')==='on',
     image_path:imagePath,source_image_path:sourcePath,image_presentation:presentation}
    if(kind==='people') record.relationship=String(values.get('relationship'))
    if(kind==='places') {record.address=String(values.get('address'));record.place_type=String(values.get('place_type'));record.picture_person_id=String(values.get('picture_person_id'))||null}
    await saveLibrary(kind,record);done()
   } catch(error) {await Promise.allSettled(uploaded.map(discardUpload));throw error}
  })
 }}>
  <div className="form-grid"><label>Name<input name="name" defaultValue={item?.name} maxLength={100} required/></label>
   <label>Short child label<input name="label" value={label} onChange={e=>setLabel(e.target.value)} maxLength={20} required/></label>
   {kind==='people'&&<label>Relationship / role<input name="relationship" defaultValue={item?.relationship}/></label>}
   {kind==='places'&&<><label>Type<input name="place_type" defaultValue={item?.place_type??'home'} required/></label><label>Address (optional)<input name="address" defaultValue={item?.address}/></label><label>Recognizable person badge<select name="picture_person_id" defaultValue={item?.picture_person_id??''}><option value="">None</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></>}
   <label>Fallback icon<select name="icon" value={icon} onChange={e=>setIcon(e.target.value as PictureKind)}>{icons.map(value=><option key={value}>{value}</option>)}</select></label>
  </div>
  <ImageEditor preset={kind} originalUrl={originalPath?data.imageUrls[originalPath]:undefined} displayUrl={item?.image_path?data.imageUrls[item.image_path]:undefined} initial={item?.image_presentation} label={label.toUpperCase()} icon={icon} onChange={setImage}/>
  <label className="check"><input type="checkbox" name="active" defaultChecked={item?.active??true}/>Active (available for new schedules)</label>
  <button disabled={image?.pending||!!image?.error}>Save {kind==='people'?'person':kind==='places'?'place':'activity'}</button>
  {item&&<button type="button" className="secondary" onClick={done}>Cancel edit</button>}
 </form>
}

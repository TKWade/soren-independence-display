import { useState } from 'react'
import { Picture } from './Picture'
import type { PictureKind } from '../types/calendar'
/** Absolute images cannot contribute their intrinsic size to a card's grid/flex layout. */
export function PhotoFrame({url,kind,badgeKind}:{url?:string;kind:PictureKind;badgeKind?:PictureKind}) {
 const [failedUrl,setFailedUrl]=useState<string>()
 return <span className="picture-frame">
  {url && url!==failedUrl ? <img src={url} alt="" draggable={false} onError={()=>setFailedUrl(url)}/> : <Picture kind={kind}/>}
  {badgeKind && <span className="picture-badge"><Picture kind={badgeKind}/></span>}
 </span>
}

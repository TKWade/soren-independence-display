import type { PictureItem } from '../types/calendar'
import { PhotoFrame } from './PhotoFrame'
/** One heading per context role, with multiple caregivers grouped in a wrapping row. */
export function EventContextRow({heading,pictures}:{heading:'WITH'|'WHERE';pictures:PictureItem[]}) {
 return <div className="event-context-row"><span className="inline-context-heading">{heading}</span><div className="context-visuals">{pictures.map((picture,index)=><span className="context-person" key={picture.id+'-'+index}><PhotoFrame url={picture.photoUrl} kind={picture.kind} badgeKind={picture.badgeKind}/><span className="inline-context-label">{picture.label}</span></span>)}</div></div>
}

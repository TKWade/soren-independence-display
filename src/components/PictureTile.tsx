import { PhotoFrame } from './PhotoFrame'
import type { PictureItem } from '../types/calendar'

export function PictureTile({ item, category }: {
  item: PictureItem
  category?: 'DO' | 'WITH' | 'SLEEP' | 'WHERE'
}) {

  const cues = { DO: '★', WITH: '●●', SLEEP: '☾', WHERE: '⌂' }
  return (
    <span className={`picture-tile picture-${item.kind}`}>
      {category && <span className="category-label"><span aria-hidden="true">{cues[category]} </span>{category}</span>}
      <PhotoFrame url={item.photoUrl} kind={item.kind} badgeKind={item.badgeKind}/>
      <span className="picture-label">{item.label}</span>
    </span>
  )
}

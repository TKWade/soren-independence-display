import { useState } from 'react'
import type { PictureItem } from '../types/calendar'
import { Picture } from './Picture'
export function PictureTile({ item, category }: {
  item: PictureItem
  category?: 'DO' | 'WITH' | 'SLEEP' | 'WHERE'
}) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>()
  const cues = { DO: '★', WITH: '●●', SLEEP: '☾', WHERE: '⌂' }
  return (
    <span className={`picture-tile picture-${item.kind}`}>
      {category && <span className="category-label"><span aria-hidden="true">{cues[category]} </span>{category}</span>}
      <span className="picture-frame">
        {item.photoUrl && item.photoUrl !== failedUrl
          ? <img src={item.photoUrl} alt="" onError={() => setFailedUrl(item.photoUrl)} />
          : <Picture kind={item.kind} />}
        {item.badgeKind && <span className="picture-badge"><Picture kind={item.badgeKind} /></span>}
      </span>
      <span className="picture-label">{item.label}</span>
    </span>
  )
}

import type { ReactNode } from 'react'
/** Text placeholder only: replace this lockup with the approved logo asset later. */
export function DisplayBrand({compact=false}:{compact?:boolean}) {
 return <div className="display-brand" aria-label="SOREN"><span className="brand-name">SOREN</span>{!compact&&<span className="brand-tagline">Soarin’, day by day.</span>}</div>
}
export function DisplayHeader({profileName,context,compact=false,children}:{profileName:string;context:string;compact?:boolean;children:ReactNode}) {
 return <header className="page-header display-header">
  <DisplayBrand compact={compact}/>
  <div className="display-heading"><p className="eyebrow">{profileName}’s Calendar</p><h1>{context}</h1></div>
  <div className="display-header-actions">{children}</div>
 </header>
}

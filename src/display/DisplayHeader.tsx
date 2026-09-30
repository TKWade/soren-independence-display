import { useState, type ReactNode } from 'react'
import './DisplayBrand.css'
/** The approved artwork includes its own tagline. Never duplicate it in markup. */
export function DisplayBrand({compact=false,src='/brand/soren-logo.png'}:{compact?:boolean;src?:string}) {
 const [failed,setFailed]=useState(false)
 return <div className="display-brand" data-compact={compact||undefined}>
  {failed?<span className="brand-name">SOREN</span>:<img className="brand-logo" src={src} width="1774" height="887" alt="SOREN — Soarin’, day by day." onError={()=>setFailed(true)}/>}
 </div>
}
export function DisplayHeader({profileName,context,compact=false,children}:{profileName:string;context:string;compact?:boolean;children:ReactNode}) {
 return <header className="page-header display-header">
  <DisplayBrand compact={compact}/>
  <div className="display-heading"><p className="eyebrow">{profileName}’s Calendar</p><h1>{context}</h1></div>
  <div className="display-header-actions">{children}</div>
 </header>
}

import type { ReactNode } from 'react'
import { DisplayBrand } from '../display/DisplayHeader'
/** Supply /brand/soren-logo.svg here once an approved asset is available. */
export function CaregiverHeader({children,logoSrc}:{children?:ReactNode;logoSrc?:string}) {
 return <header className="admin-header"><div className="admin-identity">
 {logoSrc?<div className="display-brand"><img className="admin-logo" src={logoSrc} alt="SOREN"/><span className="brand-tagline">Soarin’, day by day.</span></div>:<DisplayBrand/>}
 <h1>Caregiver Portal</h1></div>{children}</header>
}

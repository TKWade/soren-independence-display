import type { ReactNode } from 'react'
import { DisplayBrand } from '../display/DisplayHeader'
export function CaregiverHeader({children,logoSrc}:{children?:ReactNode;logoSrc?:string}) {
 return <header className="admin-header"><div className="admin-identity">
 <DisplayBrand src={logoSrc}/>
 <h1>Caregiver Portal</h1></div>{children}</header>
}

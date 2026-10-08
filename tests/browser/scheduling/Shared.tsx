import {useEffect,useRef,type ReactNode} from 'react'
import {Picture} from '../../../src/components/Picture'
import type {PictureKind} from '../../../src/types/calendar'
export function Art({kind}:{kind:PictureKind}) {return <span className="sp-art"><Picture kind={kind}/></span>}
export function Sheet({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null),restore=useRef<HTMLElement|null>(null)
 useEffect(()=>{restore.current=document.activeElement as HTMLElement;const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();restore.current?.focus({preventScroll:true})}},[])
 return <dialog className="sp-sheet" ref={ref} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}}><header><h2>{title}</h2><button type="button" className="sp-icon-button" aria-label="Close editor" onClick={onClose}>×</button></header>{children}</dialog>
}

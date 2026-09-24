import { useCallback, useEffect, useRef, useState } from 'react'
import { households, loadHousehold } from '../data/repository'
import type { HouseholdData, HouseholdRow } from '../data/records'
export function useHouseholdData(userId: string | undefined) {
 const [list,setList] = useState<HouseholdRow[]>([])
 const [selected,setSelected] = useState(() => new URLSearchParams(window.location.search).get('household') ?? '')
 const [data,setData] = useState<HouseholdData | null>(null)
 const [loading,setLoading] = useState(true)
 const [error,setError] = useState(false)
 const generation = useRef(0)
 const [refreshCount, setRefreshCount] = useState(0)
 const refresh = useCallback(() => setRefreshCount(value => value+1),[])
 useEffect(() => {
  const current=++generation.current
  let cancelled=false
  const load = async () => {
   await Promise.resolve()
   if (cancelled) return
   setLoading(true)
   setError(false)
   if (!userId) { setList([]); setData(null); setLoading(false); return }
   try {
    const available=await households()
    if(cancelled || current!==generation.current) return
    setList(available)
    const household=available.find(item=>item.id===selected) ?? available[0]
    if(!household) { setData(null); setLoading(false); return }
    if(household.id!==selected) { setSelected(household.id); return }
    const snapshot=await loadHousehold(household)
    if(!cancelled && current===generation.current) { setData(snapshot); setError(false) }
   } catch {
    if(!cancelled && current===generation.current) setError(true)
   } finally {
    if(!cancelled && current===generation.current) setLoading(false)
   }
  }
  void load()
  return () => {cancelled=true}
 },[userId,selected,refreshCount])
 useEffect(() => {
  const timer=window.setInterval(refresh,60_000)
  window.addEventListener('online',refresh)
  window.addEventListener('focus',refresh)
  return ()=>{window.clearInterval(timer);window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh)}
 },[refresh])
 return { list,selected,setSelected,data: data?.household.id === selected ? data : null,loading,error,refresh }
}

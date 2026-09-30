import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
test('household loading includes profile Home settings using their actual primary key',async()=>{
 const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-home-loader-tests',plugins:[{name:'offline-household',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/data/supabase.ts')) return `
 export function client(){return {from(table){return {select(){return this},eq(){return this},order(column){
  if(column!==(table==='profile_home_preferences'?'profile_id':'id')) throw new Error('Unknown ordering column');return this
 },async range(){return {data:table==='profile_home_preferences'?[{household_id:'h',profile_id:'p',overnight_mode:'local',default_bedtime:'20:00',weekday_bedtimes:{}}]:[],error:null}}}}}}
 `}}],server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true}})
 try {
  const {loadHousehold}=await server.ssrLoadModule('/src/data/repository.ts')
  const data=await loadHousehold({id:'h',name:'Test',time_zone:'UTC'})
  assert.equal(data.homePreferences[0].profile_id,'p');assert.equal(data.homePreferences[0].default_bedtime,'20:00')
 } finally {await server.close()}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { selectDayVariant, inlineDayContext } from '../src/lib/dayVariant.ts'
const dad={id:'dad',name:'Dad',picture:{id:'dad',kind:'dad',label:'DAD'}}
const school={id:'school',name:'School',picture:{id:'school',kind:'school',label:'SCHOOL'}}
const event={picture:school.picture,activity:{picture:school.picture},people:[dad],place:school}
test('B is the default; A requires an explicit development-only opt-in',()=>{
 for(const query of ['', '?dayVariant=b','?dayVariant=unknown','?profile=soren']) assert.equal(selectDayVariant(query,true),'b')
 assert.equal(selectDayVariant('?profile=soren&dayVariant=a',true),'a')
 for(const query of ['', '?dayVariant=a','?dayVariant=b','?dayVariant=unknown']) assert.equal(selectDayVariant(query,false),'b')
})
test('inline context retains meaningful people and places, deduplicating the activity portrait',()=>{
 assert.deepEqual(inlineDayContext(event),{people:[dad],place:school})
 assert.deepEqual(inlineDayContext({...event,picture:dad.picture}),{people:[],place:school})
 assert.deepEqual(inlineDayContext({...event,people:[dad,dad]}).people,[dad])
 assert.deepEqual(inlineDayContext({...event,people:[],place:{...school,id:'',name:''}}),{people:[],place:undefined})
 assert.deepEqual(inlineDayContext({...event,place:{...school,picture:{...school.picture,label:' '}}}),{people:[dad],place:undefined})
})
test('sleep prioritizes its actual sleep location and omits people',()=>{
 const home={...school,id:'home',name:'Home'}
 assert.deepEqual(inlineDayContext({...event,sleepLocation:home}),{people:[],place:home})
 assert.deepEqual(inlineDayContext({...event,activity:{picture:{kind:'sleep'}}}),{people:[],place:school})
})

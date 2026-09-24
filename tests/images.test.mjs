import test from 'node:test'
import assert from 'node:assert/strict'
import { validateImageFile, validateImageDimensions, normalizePresentation, cropRectangle, renditionSize, imageSignature, maxSourceBytes } from '../src/lib/images.ts'
test('image upload validates formats, nonempty files, byte limit and decoded dimensions',()=>{
 for(const type of ['image/jpeg','image/png','image/webp']) assert.doesNotThrow(()=>validateImageFile({type,size:maxSourceBytes}))
 for(const file of [{type:'image/gif',size:100},{type:'image/svg+xml',size:100},{type:'image/jpeg',size:0},{type:'image/png',size:maxSourceBytes+1}]) assert.throws(()=>validateImageFile(file))
 for(const dimensions of [[0,800],[63,100],[12001,100],[8000,6000],[NaN,200],[100.5,100]]) assert.throws(()=>validateImageDimensions(...dimensions))
 assert.doesNotThrow(()=>validateImageDimensions(6000,4000))
 assert.equal(imageSignature(new Uint8Array([255,216,255])),'image/jpeg')
 assert.equal(imageSignature(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png')
 assert.equal(imageSignature(new TextEncoder().encode('RIFFxxxxWEBP')),'image/webp')
 assert.equal(imageSignature(new TextEncoder().encode('<svg>')),null)
})
test('crop metadata is versioned, preset-owned, finite and clamped',()=>{
 assert.deepEqual(normalizePresentation('people',{preset:'places',x:-9,y:NaN,zoom:99}),{version:1,preset:'people',x:0,y:.5,zoom:3})
 assert.deepEqual(normalizePresentation('places',{x:Infinity,y:2,zoom:0}),{version:1,preset:'places',x:.5,y:1,zoom:1})
})
test('tall, wide and tiny images remain inside source bounds, preserve aspect and never upscale',()=>{
 for(const preset of ['people','places','activities']) for(const [w,h] of [[600,6000],[6000,600],[64,64],[4000,3000]]) for(const x of [0,.5,1]) for(const y of [0,.5,1]) for(const zoom of [1,2,3]) {
  const crop=cropRectangle(w,h,normalizePresentation(preset,{x,y,zoom}))
  assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=w+.001&&crop.y+crop.height<=h+.001)
  assert.ok(Math.abs(crop.width/crop.height-(preset==='places'?4/3:1))<.001)
  const size=renditionSize(crop.width,crop.height,preset)
  assert.ok(size.width<=Math.ceil(crop.width)&&size.height<=Math.ceil(crop.height)&&size.width<=1280&&size.height<=960)
 }
 assert.deepEqual(renditionSize(4000,4000,'people'),{width:768,height:768})
 assert.deepEqual(renditionSize(4000,3000,'places'),{width:1280,height:960})
 assert.deepEqual(renditionSize(64,64,'activities'),{width:64,height:64})
})

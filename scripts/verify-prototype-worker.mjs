import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {verifyPrototypeBuild} from './verify-prototype-build.mjs'

// Local workerd only: no login, remote bindings, telemetry, deploy or upload.
process.env.WRANGLER_SEND_METRICS='false'
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV='false'
process.env.WRANGLER_LOG_PATH=resolve('node_modules/.tmp/prototype-worker.log')
await verifyPrototypeBuild()
const {createTestHarness}=await import('wrangler')
const server=createTestHarness({workers:[{configPath:'./wrangler.prototype.jsonc',secrets:{}}]})
try {
 await server.listen()
 for(const route of ['','family/','residential/','setup/','tasks/']){
  const response=await server.fetch('/'+route)
  assert.equal(response.status,200,route||'/')
  assert.equal(await response.text(),await readFile(resolve('dist-prototype',route,'index.html'),'utf8'),`${route} must serve its own prototype index`)
  assert.match(response.headers.get('content-security-policy'),/connect-src 'none'/)
  console.log(`PASS /${route} = dist-prototype/${route}index.html (200)`)
 }
 for(const route of ['family','residential','setup','tasks']){
  const response=await server.fetch('/'+route,{redirect:'manual'})
  assert.equal(response.status,307)
  assert.equal(new URL(response.headers.get('location'),'http://localhost').pathname,`/${route}/`)
 }
 const fallback=await readFile('dist-prototype/404.html','utf8')
 const excluded=['/not-a-page','/admin','/dist/','/dist/index.html','/sw.js','/registerSW.js','/manifest.webmanifest','/.env.local','/.dev.vars','/wrangler.prototype.jsonc','/native/fire-demo/artifacts/app-release.apk','/release.keystore']
 // When production has been built, also try its actual JS filenames at their public URLs.
 const productionAssets=await readdir('dist/assets').catch(error=>{if(error.code==='ENOENT')return [];throw error})
 const prototypeAssets=await readdir('dist-prototype/assets')
 for(const file of productionAssets)if(file.endsWith('.js')&&!prototypeAssets.includes(file))excluded.push('/assets/'+file)
 for(const path of excluded){
  const response=await server.fetch(path)
  assert.equal(response.status,404,`${path} must not resolve to an application`)
  assert.equal(await response.text(),fallback,`${path} must serve only the prototype 404 page`)
 }
 // Fetch every emitted asset using Wrangler's own asset routing, not a generic file server.
 for(const file of [...prototypeAssets.map(file=>'assets/'+file),'brand/soren-logo.png','favicon.svg']){
  const response=await server.fetch('/'+file)
  assert.equal(response.status,200,file)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(resolve('dist-prototype',file)))
 }
 console.log(`PASS physical route redirects, ${excluded.length} excluded paths, exact static asset bytes and 404 behavior; no SPA fallback.`)
}finally{
 await server.close()
}

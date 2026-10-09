import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {verifyPrototypeBuild} from '../scripts/verify-prototype-build.mjs'

test('prototype Worker explicitly serves only the isolated physical site without a script or SPA fallback',async()=>{
 const config=JSON.parse(await readFile('wrangler.prototype.jsonc','utf8'))
 assert.deepEqual(config,{
  $schema:'./node_modules/wrangler/config-schema.json',
  name:'soren-prototype',compatibility_date:'2026-10-08',
  assets:{directory:'./dist-prototype',html_handling:'auto-trailing-slash',not_found_handling:'404-page'},
 })
 const pkg=JSON.parse(await readFile('package.json','utf8'))
 const lock=JSON.parse(await readFile('package-lock.json','utf8'))
 assert.match(pkg.devDependencies.wrangler,/^\d+\.\d+\.\d+$/,'Wrangler must be exactly pinned')
 assert.equal(lock.packages['node_modules/wrangler'].version,pkg.devDependencies.wrangler)
})

test('isolated static build emits reloadable routes and ignores browser environment credentials',async()=>{
 await mkdir('node_modules/.tmp',{recursive:true})
 const output=await mkdtemp(resolve('node_modules/.tmp/prototype-hosting-'))
 const marker='FICTIONAL_ENV_CANARY_MUST_NOT_BE_BUNDLED'
 const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','prototype/vite.config.ts','--outDir',output],{
  encoding:'utf8',env:{...process.env,VITE_SUPABASE_URL:marker,VITE_SUPABASE_PUBLISHABLE_KEY:marker,VITE_OTHER_SECRET:marker},
 })
 assert.equal(build.status,0,build.stdout+build.stderr)
 assert.equal((await verifyPrototypeBuild(output)).routes,5)
 for(const file of await readdir(resolve(output,'assets'))){
  const text=await readFile(resolve(output,'assets',file),'utf8')
  assert.ok(!text.includes(marker),'Build must ignore VITE_ environment injection')
  assert.doesNotMatch(text,/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|createClient\(/,'Prototype has no API/telemetry transport')
 }
 const headers=await readFile(resolve(output,'_headers'),'utf8')
 assert.match(headers,/connect-src 'none'/)
 assert.match(headers,/frame-ancestors 'none'/)
 const scripts=JSON.parse(await readFile('package.json','utf8')).scripts
 assert.equal(scripts.build,'tsc -b && vite build','Normal production command must remain unchanged')
 const devEntry=await readFile('tests/browser/scheduling-main.tsx','utf8')
 assert.match(devEntry,/if\(!import\.meta\.env\.DEV\)throw/,'Local fixture guard stays intact')
})

import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {resolve,relative,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

export async function verifyPrototypeBuild(directory=resolve('dist-prototype')) {
 const routes=['index.html','family/index.html','residential/index.html','setup/index.html','tasks/index.html']
 const staticFiles=new Set([...routes,'404.html','_headers','robots.txt','brand/soren-logo.png','favicon.svg'])
 const files=[]
 async function walk(folder){
  for(const item of await readdir(folder,{withFileTypes:true})){
   const path=resolve(folder,item.name)
   assert.ok(!item.isSymbolicLink(),'No linked files in static output')
   if(item.isDirectory())await walk(path)
   else files.push(relative(directory,path).replaceAll('\\','/'))
  }
 }
 await walk(directory)
 for(const file of staticFiles)assert.ok(files.includes(file),`Missing required static file: ${file}`)
 for(const route of routes){
  const html=await readFile(resolve(directory,route),'utf8')
  assert.match(html,/Content-Security-Policy/)
  assert.match(html.replaceAll('&#39;',"'"),/connect-src 'none'/)
  assert.match(html,/type="module"/)
  for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){
   assert.ok(match[1].startsWith('/')&&!match[1].startsWith('//'),'Assets must be site-local')
   assert.ok(files.includes(match[1].slice(1)),`Missing asset on ${route}`)
  }
 }
 for(const file of files){
  assert.ok(staticFiles.has(file)||/^assets\/[\w.-]+\.(js|css)$/.test(file),`Unexpected artifact: ${file}`)
  if(!/\.(js|css|html|svg)$/.test(file))continue
  const text=await readFile(resolve(directory,file),'utf8')
  assert.doesNotMatch(text,/supabase\.(co|com)|googleapis\.com|accounts\.google\.com|graph\.microsoft\.com|login\.microsoftonline\.com/i,`Provider endpoint in ${file}`)
  assert.doesNotMatch(text,/VITE_SUPABASE|SUPABASE_SERVICE_ROLE|GOOGLE_CLIENT_SECRET|sb_secret_|-----BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,`Credential/config marker in ${file}`)
  assert.doesNotMatch(text,/[A-Z]:[\\/](?:Users|GitRepositories)|\/(?:Users|home)\/[^\s"']+|file:\/\//,`Machine path in ${file}`)
  assert.doesNotMatch(text,/serviceWorker\.register|\/tests\/browser\/|\/src\/main\.tsx/,`Development/production entry leak in ${file}`)
 }
 const project=resolve(dirname(fileURLToPath(import.meta.url)),'..')
 for(const asset of ['brand/soren-logo.png','favicon.svg'])assert.deepEqual(await readFile(resolve(directory,asset)),await readFile(resolve(project,'public',asset)))
 return {routes:routes.length,files:files.length}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await verifyPrototypeBuild()
 console.log(`Prototype output verified: ${result.routes} static routes, ${result.files} allowed files; no provider/config/artifact leaks.`)
}

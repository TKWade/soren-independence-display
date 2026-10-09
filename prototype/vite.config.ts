import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

const root=fileURLToPath(new URL('.',import.meta.url))
const project=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/')
// Only presentational production modules are shared with this fictional study.
const shared=new Set([
 'src/display/DisplayHeader.tsx','src/display/DisplayBrand.css','src/display/tokens.css',
 'src/profiles/ProfileChooser.tsx','src/profiles/access.ts','src/profiles/profiles.css',
 'src/components/Picture.tsx',
])
const policy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; frame-src 'none'"
export default defineConfig({
 root,base:'/',appType:'mpa',envDir:false,envPrefix:[],publicDir:false,
 plugins:[react(),{
  name:'scheduling-prototype-isolation',
  transformIndexHtml(){return [{tag:'meta',attrs:{'http-equiv':'Content-Security-Policy',content:policy},injectTo:'head-prepend'}]},
  generateBundle(){
   for(const moduleId of this.getModuleIds()){
    const id=moduleId.replaceAll('\\','/').split('?')[0]
    if(id.includes('/node_modules/')){
     if(!/\/node_modules\/(react|react-dom|scheduler)\//.test(id))this.error('Unexpected dependency in the isolated prototype')
    }else if(id.startsWith(project)){
     const relative=id.slice(project.length)
     if(!relative.startsWith('prototype/')&&!relative.startsWith('tests/browser/scheduling/')&&!shared.has(relative))this.error(`Unexpected project module in prototype: ${relative}`)
    }
   }
   for(const asset of ['brand/soren-logo.png','favicon.svg'])this.emitFile({type:'asset',fileName:asset,source:readFileSync(new URL(`../public/${asset}`,import.meta.url))})
   this.emitFile({type:'asset',fileName:'_headers',source:`/*\n  Content-Security-Policy: ${policy}; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow\n`})
   this.emitFile({type:'asset',fileName:'robots.txt',source:'User-agent: *\nDisallow: /\n'})
   this.emitFile({type:'asset',fileName:'404.html',source:'<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found</title><h1>Page not found</h1><a href="/">SOREN Scheduling Prototype</a></html>'})
  },
 }],
 build:{
  outDir:'../dist-prototype',emptyOutDir:true,sourcemap:false,modulePreload:{polyfill:false},
  rolldownOptions:{input:Object.fromEntries(['','family','residential','setup','tasks'].map(route=>[route||'home',fileURLToPath(new URL(`${route?route+'/':''}index.html`,import.meta.url))]))},
 },
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url))
const size=p=>{const b=read(p);return [b.readUInt32BE(16),b.readUInt32BE(20)]}
test('supplied web icons match PWA dimensions and separate maskable purpose',()=>{
 for(const [name,n] of [['icon-192',192],['icon-512',512],['maskable-512',512],['soren-app-icon-1024',1024]]) assert.deepEqual(size('public/icons/'+name+'.png'),[n,n])
 const vite=read('vite.config.ts').toString()
 assert.match(vite,/icon-192.png'.*purpose: 'any'/)
 assert.match(vite,/icon-512.png'.*purpose: 'any'/)
 assert.match(vite,/maskable-512.png'.*purpose: 'maskable'/)
})
test('native legacy and adaptive resources use correct density sizes and live references',()=>{
 const res='native/fire-demo/android/app/src/main/res/'
 for(const [density,n,a] of [['mdpi',48,108],['hdpi',72,162],['xhdpi',96,216],['xxhdpi',144,324],['xxxhdpi',192,432]]) {
  for(const file of ['ic_launcher','ic_launcher_round']) assert.deepEqual(size(res+'mipmap-'+density+'/'+file+'.png'),[n,n])
  assert.deepEqual(size(res+'mipmap-'+density+'/ic_launcher_foreground.png'),[a,a])
 }
 for(const name of ['ic_launcher','ic_launcher_round']) {
  const xml=read(res+'mipmap-anydpi-v26/'+name+'.xml').toString()
  assert.match(xml,/@mipmap\/ic_launcher_foreground/)
  assert.match(xml,/@color\/ic_launcher_background/)
 }
 const manifest=read('native/fire-demo/android/app/src/main/AndroidManifest.xml').toString()
 assert.match(manifest,/android:icon="@mipmap\/ic_launcher"/)
 assert.match(manifest,/android:roundIcon="@mipmap\/ic_launcher_round"/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../native/fire-demo/'+path,import.meta.url),'utf8')
test('Fire demo is a separate bundled launch with no remote server or native plugins',()=>{
 const config=JSON.parse(read('capacitor.config.json'))
 assert.equal(config.appId,'com.soren.display.demo')
 assert.equal(config.appName,'SOREN Demo')
 assert.equal(config.webDir,'www')
 assert.equal(config.server.url,undefined)
 assert.equal(config.server.allowNavigation,undefined)
 assert.equal(config.android.webContentsDebuggingEnabled,false)
 const pkg=JSON.parse(read('package.json'))
 assert.deepEqual(Object.keys(pkg.dependencies).sort(),['@capacitor/android','@capacitor/core'])
 const manifest=read('android/app/src/main/AndroidManifest.xml')
 assert.doesNotMatch(manifest,/<uses-permission|android:lockTaskMode|android:screenOrientation/)
 assert.match(manifest,/android:allowBackup="false"/)
 assert.match(manifest,/android.intent.category.LAUNCHER/)
})
test('Fire demo blocks network and forms, excludes environment files and reuses fictional display entry',()=>{
 assert.match(read('index.html'),/connect-src 'none'/)
 assert.match(read('index.html'),/form-action 'none'/)
 assert.match(read('vite.config.ts'),/envDir: false, publicDir: false/)
 assert.match(read('demo.css'),/@source "\.\.\/\.\.\/src"/)
 const entry=read('main.tsx')
 assert.match(entry,/src\/display\/DisplayRenderer/)
 assert.match(entry,/src\/data\/mockWeek/)
 assert.doesNotMatch(entry,/^import.*(?:repository|supabase|\/Root|\/App|\/auth)/m)
})


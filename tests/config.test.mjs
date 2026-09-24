import test from 'node:test'
import assert from 'node:assert/strict'
import { validateBrowserConfig } from '../scripts/validate-browser-config.mjs'
const jwt=role=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature'
test('browser configuration only accepts public keys and safe project URLs',()=>{
 assert.doesNotThrow(()=>validateBrowserConfig(undefined,undefined))
 assert.doesNotThrow(()=>validateBrowserConfig('https://example.supabase.co','sb_publishable_example'))
 assert.doesNotThrow(()=>validateBrowserConfig('http://127.0.0.1:54321',jwt('anon')))
 assert.throws(()=>validateBrowserConfig('https://example.supabase.co','sb_secret_forbidden'))
 assert.throws(()=>validateBrowserConfig('https://example.supabase.co',jwt('service_role')))
 assert.throws(()=>validateBrowserConfig('https://example.supabase.co',undefined))
 assert.throws(()=>validateBrowserConfig('http://example.com','sb_publishable_example'))
})

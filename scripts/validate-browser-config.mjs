/** Fail before Vite can bundle a privileged key into browser assets. */
export function validateBrowserConfig(url, key) {
 if (!url && !key) return
 if (!url || !key) throw new Error('Set both Supabase browser environment variables.')
 const parsed = new URL(url)
 if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))) throw new Error('Supabase URL must use HTTPS (except local development).')
 if (key.startsWith('sb_publishable_')) return
 try {
  const payload=JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
  if(payload.role==='anon') return
 } catch { /* Invalid or non-JWT keys are rejected below. */ }
 throw new Error('Only a Supabase publishable or legacy anon key may be bundled. Never use a service-role/secret key.')
}

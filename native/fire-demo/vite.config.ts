import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
 root, envDir: false, publicDir: false,
 plugins: [react(), tailwindcss(), {
  name: 'fictional-demo-boundary',
  generateBundle() {
   for (const id of this.getModuleIds()) {
    if (/\/src\/(admin|auth|device)\/|\/src\/data\/(supabase|repository)|\/node_modules\/@supabase\//.test(id.replaceAll('\\','/'))) {
     this.error('Production data/auth module entered the fictional demo')
    }
   }
   this.emitFile({type:'asset',fileName:'brand/soren-logo.png',source:readFileSync(new URL('../../public/brand/soren-logo.png',import.meta.url))})
  },
 }],
 build: {outDir:'www',emptyOutDir:true,target:'chrome111',sourcemap:false},
})

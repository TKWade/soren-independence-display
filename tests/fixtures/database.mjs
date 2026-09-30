import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const userA='00000000-0000-4000-8000-000000000001'
const userB='00000000-0000-4000-8000-000000000002'
const migrations=['202609210001_foundation.sql','202609210002_sample_data.sql','202609230001_recurrence_images.sql','202609230002_external_calendars.sql','202609240001_google_calendar.sql','202609240002_profile_display_preferences.sql','202609260001_google_confidential_oauth.sql','202609260002_restore_google_pkce.sql','202609260003_bulk_calendar_sync.sql','202609290001_profile_calendar_views.sql','202609290002_external_home_sleep.sql','202609290003_profile_home_preferences.sql']
async function applyMigration(db,name,transform=sql=>sql) {
 let sql=await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
 if(name==='202609240001_google_calendar.sql') {
  // PGlite cannot load Supabase Vault. This SQL test double tests access/lifecycle, NOT encryption.
  await db.exec(`create schema vault; create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);
   create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
   create function vault.create_secret(value text) returns uuid language sql as $$ insert into vault.secrets(secret) values(value) returning id $$;
   create function vault.update_secret(sid uuid,value text) returns void language sql as $$ update vault.secrets set secret=value where id=sid $$;`)
  sql=sql.replace('create extension if not exists supabase_vault with schema vault;','-- Vault extension replaced by explicit test double above.')
 }
 await db.exec(transform(sql))
}
async function database(includeLatest=true) {
 const db=new PGlite()
 await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select,insert,update,delete on storage.objects to authenticated;
  insert into auth.users values('${userA}'),('${userB}');
 `)
 for(const name of (includeLatest?migrations:migrations.slice(0,2))) await applyMigration(db,name)
 return db
}
async function asUser(db,id) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}';`) }


export { database, applyMigration, migrations, asUser, userA, userB }

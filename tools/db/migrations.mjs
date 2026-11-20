import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';

export class GateError extends Error {}
export async function loadMigrations(root=process.cwd()) {
  const manifest=JSON.parse(await readFile(resolve(root,'db/migrations/manifest.json'),'utf8'));
  const versions=new Set(); let previous='';
  const entries=[];
  for(const item of manifest.migrations){
    if(!/^\d{4}$/.test(item.version)||versions.has(item.version)||item.version<=previous||
      !new RegExp('^'+item.version+'_[a-z0-9_]+\\.sql$').test(item.file)) throw new GateError('INVALID_MIGRATION_MANIFEST');
    versions.add(item.version); previous=item.version;
    const path=resolve(root,'db/migrations',item.file);
    if(dirname(path)!==resolve(root,'db/migrations')) throw new GateError('INVALID_MIGRATION_PATH');
    const sql=await readFile(path,'utf8');
    entries.push({...item,sql,sha256:createHash('sha256').update(sql).digest('hex')});
  }
  if(!entries.length)throw new GateError('EMPTY_MIGRATION_MANIFEST');
  return entries;
}
export function validateTarget(target,environment=process.env){
  if(!target||target.development!==true||target.approvedForSchemaCreation!==true||
     !target.approvedBy||/REPLACE|PENDING/i.test(target.approvedBy))throw new GateError('EXPLICIT_SAFE_TARGET_APPROVAL_REQUIRED');
  if(!['local-disposable','neon-development'].includes(target.kind))throw new GateError('DEVELOPMENT_TARGET_REQUIRED');
  const key=target.connectionStringEnvironmentVariable;
  if(!/^DB_FOUNDATION_[A-Z_]+$/.test(key??'')||!environment[key])throw new GateError('DEDICATED_FOUNDATION_CREDENTIAL_REQUIRED');
  let url;try{url=new URL(environment[key]);}catch{throw new GateError('INVALID_FOUNDATION_URL');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==target.host||
     Number(url.port||5432)!==Number(target.port||5432)||decodeURIComponent(url.pathname.slice(1))!==target.database)throw new GateError('TARGET_URL_MISMATCH');
  if(target.kind==='local-disposable'&&(!target.disposable||!['127.0.0.1','localhost','[::1]'].includes(target.host)||!/^utm_db_foundation_[a-z0-9_]+$/.test(target.database)))throw new GateError('ISOLATED_LOCAL_TARGET_REQUIRED');
  if(target.kind==='neon-development'&&(!url.hostname.endsWith('.neon.tech')||!target.projectId||!target.branchId||!['require','verify-full','verify-ca'].includes(url.searchParams.get('sslmode'))))throw new GateError('EXACT_NEON_DEVELOPMENT_TARGET_REQUIRED');
  return environment[key];
}
export async function verifyConnectedTarget(client,target){
  const {rows:[actual]}=await client.query("SELECT current_database() AS database, current_setting('server_version_num')::int AS server_version, current_setting('neon.project_id',true) AS project_id, current_setting('neon.branch_id',true) AS branch_id");
  if(actual.database!==target.database||actual.server_version<170000)throw new GateError('CONNECTED_TARGET_MISMATCH');
  if(target.kind==='neon-development'&&(actual.project_id!==target.projectId||actual.branch_id!==target.branchId))throw new GateError('CONNECTED_NEON_BRANCH_MISMATCH');
  return {kind:target.kind,database:actual.database,projectId:actual.project_id,branchId:actual.branch_id,serverVersion:actual.server_version};
}
export async function migrationStatus(client,entries){
  const {rows:[state]}=await client.query("SELECT to_regclass('migration_meta.schema_migrations') IS NOT NULL AS tracked");
  const applied=state.tracked?(await client.query('SELECT version,filename,sha256 FROM migration_meta.schema_migrations ORDER BY version')).rows:[];
  for(const row of applied){
    const expected=entries.find(m=>m.version===row.version);
    if(!expected||expected.sha256!==row.sha256||expected.file!==row.filename)throw new GateError('MIGRATION_HISTORY_OR_CHECKSUM_MISMATCH');
  }
  const appliedVersions=applied.map(row=>row.version);
  if(appliedVersions.some((version,index)=>version!==entries[index]?.version))throw new GateError('MIGRATION_HISTORY_NOT_A_PREFIX');
  return {applied,pending:entries.filter(m=>!appliedVersions.includes(m.version))};
}
export async function applyMigrations(client,entries,options={}){
  await client.query('BEGIN');
  try{
    await client.query('SELECT pg_advisory_xact_lock(260000,1)');
    await client.query('SET LOCAL search_path TO pg_catalog,public');
    await client.query("SET LOCAL lock_timeout TO '5s'");
    await client.query("SET LOCAL statement_timeout TO '20s'");
    const status=await migrationStatus(client,entries);
    if(!status.applied.length){
      const {rows}=await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')");
      if(rows.length && !(options.allowLegacyP004Adoption===true && rows.length===1 && rows[0].relname==='user_access_assignment'))throw new GateError('EXISTING_SCHEMA_REQUIRES_FORWARD_RECONCILIATION');
    }
    await client.query('CREATE SCHEMA IF NOT EXISTS migration_meta');
    await client.query('CREATE TABLE IF NOT EXISTS migration_meta.schema_migrations (version varchar(4) PRIMARY KEY, filename text NOT NULL UNIQUE, sha256 char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await client.query('REVOKE ALL ON SCHEMA migration_meta FROM PUBLIC');
    await client.query('REVOKE ALL ON migration_meta.schema_migrations FROM PUBLIC');
    for(const migration of status.pending){
      await client.query(migration.sql);
      await client.query('INSERT INTO migration_meta.schema_migrations(version,filename,sha256) VALUES ($1,$2,$3)',[migration.version,migration.file,migration.sha256]);
    }
    await client.query('COMMIT');
    return status.pending.map(m=>m.version);
  }catch(error){await client.query('ROLLBACK');throw error;}
}

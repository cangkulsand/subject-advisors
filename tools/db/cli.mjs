import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadMigrations,validateTarget,verifyConnectedTarget,migrationStatus,applyMigrations,GateError} from './migrations.mjs';
import {reviewSchema} from './review.mjs';

process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const args=process.argv.slice(2);const command=args.shift();
try{
  if(command==='review'){console.log(JSON.stringify(await reviewSchema(),null,2));}
  else{
    if(!['status','migrate','verify','test'].includes(command))throw new GateError('USE_REVIEW_STATUS_MIGRATE_VERIFY_OR_TEST');
    const flag=args.indexOf('--target');if(flag<0||!args[flag+1])throw new GateError('EXPLICIT_TARGET_FILE_REQUIRED');
    const target=JSON.parse(await readFile(resolve(args[flag+1]),'utf8'));
    const connectionString=validateTarget(target);
    // Never imports app .env files or falls back to DATABASE_URL.
    const {Client}=await import('pg');const client=new Client({connectionString,connectionTimeoutMillis:10000,query_timeout:30000});
    await client.connect();
    try{
      const actual=await verifyConnectedTarget(client,target);
      const entries=await loadMigrations();
      let result;
      if(command==='status'){const status=await migrationStatus(client,entries);result={applied:status.applied.map(m=>m.version),pending:status.pending.map(m=>m.version)};}
      if(command==='migrate'){await reviewSchema();result={applied:await applyMigrations(client,entries,target)};}
      if(command==='verify'||command==='test'){
        const status=await migrationStatus(client,entries);
        if(status.pending.length)throw new GateError('APPLY_CANONICAL_MIGRATIONS_FIRST');
        if(command==='verify'){
          await client.query('BEGIN READ ONLY');
          try{const checks=[];for(const file of ['001_schema_verification.sql','004_profile_current_semester.sql']){const response=await client.query(await readFile('db/checks/'+file,'utf8'));checks.push(...(Array.isArray(response)?response.flatMap(r=>r.rows??[]):response.rows));}result={checks};}
          finally{await client.query('ROLLBACK');}
        }else{
          if(target.allowRollbackOnlyTests!==true)throw new GateError('ROLLBACK_ONLY_TEST_APPROVAL_REQUIRED');
          // This file owns BEGIN/ROLLBACK and contains only synthetic fixtures.
          const checks=[];
          for(const file of ['002_behavior_tests.sql','003_role_boundary_tests.sql']){
            const response=await client.query(await readFile('db/checks/'+file,'utf8'));
            checks.push(...(Array.isArray(response)?response.flatMap(r=>r.rows??[]):response.rows).filter(row=>row.test_name));
          }
          result={checks,passed:checks.filter(row=>row.status==='PASS').length,skipped:checks.filter(row=>row.status.startsWith('SKIP')).length};
        }
      }
      console.log(JSON.stringify({command,target:actual,result},null,2));
    }finally{await client.end();}
  }
}catch(error){
  console.error(JSON.stringify({command,status:'BLOCKED_OR_FAILED',reason:error instanceof GateError?error.message:'DATABASE_OR_SQL_ERROR',sqlState:typeof error.code==='string'?error.code:undefined}));
  process.exitCode=1;
}

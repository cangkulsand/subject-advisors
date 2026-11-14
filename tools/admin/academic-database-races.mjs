// Synthetic fixtures only; called solely by the disposable loopback runner.
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';

export async function runAcademicRaces(observer,connect){
 const a=await connect();const b=await connect();
 const pidA=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
 const pidB=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
 async function begin(c){
  await c.query('BEGIN');
  await c.query("SET LOCAL statement_timeout='10s'");
  await c.query("SELECT set_config('app.access_actor','__ACADEMIC_RACE__',true),set_config('app.access_reason','Synthetic race verification.',true)");
 }
 async function write(sql){await begin(a);try{await a.query(sql);await a.query('COMMIT');}catch(error){await a.query('ROLLBACK');throw error;}}
 async function reject(sql,code,message){
  await begin(a);try{await assert.rejects(a.query(sql),error=>error.code===code&&(!message||error.message.includes(message)));}
  finally{await a.query('ROLLBACK');}
 }
 // Every race must be observed actually waiting on a lock held by the first session.
 // Completion timing and arbitrary sleeps are never pass conditions.
 async function race(label,first,second,expectedCode){
  await begin(a);await begin(b);let pending;let settled=false;
  try{
   await a.query(first);
   pending=b.query(second).then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
   const deadline=Date.now()+5000;let observed=false;
   while(Date.now()<deadline){
    const {rows:[state]}=await observer.query(`SELECT wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity WHERE pid=$1`,[pidB]);
    if(state?.wait_event_type==='Lock'&&state.blockers.includes(pidA)){observed=true;break;}
    assert.equal(settled,false,label+' unexpectedly finished before a lock wait');
    await nextTurn();
   }
   assert.ok(observed,label+' did not enter a Lock wait on the first session');
   assert.equal(settled,false,label+' must still be blocked');
   await a.query('COMMIT');
   const result=await pending;
   if(expectedCode){assert.equal(result.error?.code,expectedCode,label+': '+result.error?.message);await b.query('ROLLBACK');}
   else{if(result.error)throw result.error;await b.query('COMMIT');}
   console.log('PASS race '+label+' (observed pg_stat_activity Lock; blocker '+pidA+')');
  }finally{
   await a.query('ROLLBACK');await b.query('ROLLBACK');if(pending)await pending;
  }
 }
 await write(`
  INSERT INTO public.faculty(faculty_id,faculty_code,faculty_name) VALUES(-8001,'__RACE_F1__','Synthetic faculty'),(-8002,'__RACE_F2__','Synthetic faculty two');
  INSERT INTO public.learning_centre(learning_centre_id,centre_code,centre_name) VALUES(-8001,'__RACE_C__','Synthetic centre');
  INSERT INTO public.programme(programme_id,programme_code,programme_name,faculty_id) VALUES(-8001,'__RACE_P__','Synthetic programme',-8001);
  INSERT INTO public.user_access_assignment(access_assignment_id,clerk_user_id,app_role,access_status) VALUES(-8001,'__RACE_COORD__','STUDENT','ACTIVE');
  INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
   VALUES(-8001,'COORDINATOR','ROLE_DOMAIN','OPERATOR','__ACADEMIC_RACE__','Synthetic race verification.');
  INSERT INTO public.academic_semester(semester_id,academic_year,semester_no,semester_type,max_subjects,max_credits)
   VALUES(-8001,'2092/2093',1,'NORMAL',5,15),(-8002,'2092/2093',2,'NORMAL',5,15);
 `);
 const insert=`INSERT INTO public.coordinator_assignment(access_assignment_id,faculty_id,programme_id,learning_centre_id) VALUES(-8001,-8001,-8001,-8001)`;
 const end=`UPDATE public.coordinator_assignment SET ended_at=clock_timestamp() WHERE programme_id=-8001 AND ended_at IS NULL`;
 await race('serialized current switches','SELECT public.db_set_current_semester(-8001)','SELECT public.db_set_current_semester(-8002)');
 assert.deepEqual((await observer.query('SELECT semester_id FROM public.academic_semester WHERE is_current')).rows,[{semester_id:-8002}]);
 assert.equal(Number((await observer.query("SELECT count(*) FROM public.academic_setup_audit_log WHERE actor='__ACADEMIC_RACE__' AND action='SET_CURRENT'")).rows[0].count),2);
 await begin(a);await a.query('SELECT public.db_set_current_semester(-8001)');await a.query('ROLLBACK');
 assert.deepEqual((await observer.query('SELECT semester_id FROM public.academic_semester WHERE is_current')).rows,[{semester_id:-8002}]);
 await reject('SELECT public.db_set_current_semester(-8999)','23514','NOT_FOUND');
 assert.deepEqual((await observer.query('SELECT semester_id FROM public.academic_semester WHERE is_current')).rows,[{semester_id:-8002}]);
 console.log('PASS switch audit count, rollback and failed target preserve prior marker');
 await race('duplicate live assignment',insert,insert,'23505');
 assert.equal(Number((await observer.query('SELECT count(*) FROM public.coordinator_assignment WHERE programme_id=-8001 AND ended_at IS NULL')).rows[0].count),1);
 await write(end);
 await race('assignment blocks programme reassignment',insert,'UPDATE public.programme SET faculty_id=-8002 WHERE programme_id=-8001','23514');
 await write(end);
 await race('programme reassignment blocks stale assignment','UPDATE public.programme SET faculty_id=-8002 WHERE programme_id=-8001',insert,'23514');
 await write('UPDATE public.programme SET faculty_id=-8001 WHERE programme_id=-8001');
 const refs=[
  ['centre','UPDATE public.learning_centre SET is_active=false WHERE learning_centre_id=-8001','UPDATE public.learning_centre SET is_active=true WHERE learning_centre_id=-8001'],
  ['faculty','UPDATE public.faculty SET is_active=false WHERE faculty_id=-8001','UPDATE public.faculty SET is_active=true WHERE faculty_id=-8001'],
  ['programme status',"UPDATE public.programme SET status='INACTIVE' WHERE programme_id=-8001",'UPDATE public.programme SET status=NULL WHERE programme_id=-8001'],
  ['account suspension',"UPDATE public.user_access_assignment SET access_status='SUSPENDED' WHERE access_assignment_id=-8001","UPDATE public.user_access_assignment SET access_status='ACTIVE' WHERE access_assignment_id=-8001"],
  ['coordinator membership deletion',"DELETE FROM public.user_role_assignment WHERE access_assignment_id=-8001 AND app_role='COORDINATOR'",`INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason) VALUES(-8001,'COORDINATOR','ROLE_DOMAIN','OPERATOR','__ACADEMIC_RACE__','Synthetic restored role.')`]
 ];
 for(const [label,deactivate,restore] of refs){
  await race('assignment locks '+label,insert,deactivate);
  await reject(insert,'23514');
  await write(end);await write(restore);
  await race(label+' change rejects waiting assignment',deactivate,insert,'23514');
  await write(restore);
 }
 // Programme links also lock the selected faculty against concurrent soft deactivation.
 await write('UPDATE public.programme SET faculty_id=NULL WHERE programme_id=-8001');
 await race('programme link locks active faculty','UPDATE public.programme SET faculty_id=-8001 WHERE programme_id=-8001','UPDATE public.faculty SET is_active=false WHERE faculty_id=-8001');
 await write('UPDATE public.programme SET faculty_id=NULL WHERE programme_id=-8001');
 await reject('UPDATE public.programme SET faculty_id=-8001 WHERE programme_id=-8001','23514','REFERENCE_INACTIVE');
 await write('UPDATE public.faculty SET is_active=true WHERE faculty_id=-8001');
 await race('faculty deactivation rejects waiting programme link','UPDATE public.faculty SET is_active=false WHERE faculty_id=-8001','UPDATE public.programme SET faculty_id=-8001 WHERE programme_id=-8001','23514');
 const history=await observer.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE ended_at IS NOT NULL)::int AS ended FROM public.coordinator_assignment WHERE programme_id=-8001');
 assert.equal(history.rows[0].total,history.rows[0].ended);assert.ok(history.rows[0].ended>=7);
 console.log('PASS ended assignment histories retained across all races');
 // Department level (0010): a programme link and a department move/deactivation serialize on the department row.
 await write('UPDATE public.faculty SET is_active=true WHERE faculty_id=-8001');
 await write(`INSERT INTO public.department(department_id,department_code,department_name,faculty_id) VALUES(-8001,'__RACE_D__','Synthetic department',-8001)`);
 const link='UPDATE public.programme SET department_id=-8001,faculty_id=-8001 WHERE programme_id=-8001';
 const unlink='UPDATE public.programme SET department_id=NULL,faculty_id=NULL WHERE programme_id=-8001';
 await write(unlink);
 await race('programme department link blocks department move',link,'UPDATE public.department SET faculty_id=-8002 WHERE department_id=-8001','23514');
 await write(unlink);
 await race('department move blocks stale programme link','UPDATE public.department SET faculty_id=-8002 WHERE department_id=-8001',link,'23514');
 await write('UPDATE public.department SET faculty_id=-8001 WHERE department_id=-8001');
 await race('department deactivation rejects waiting programme link','UPDATE public.department SET is_active=false WHERE department_id=-8001',link,'23514');
 await write('UPDATE public.department SET is_active=true WHERE department_id=-8001');
 await write(link);
 await reject('UPDATE public.programme SET faculty_id=-8002 WHERE programme_id=-8001','23514','PROGRAMME_FACULTY_MISMATCH');
 console.log('PASS department level races and faculty consistency');
}

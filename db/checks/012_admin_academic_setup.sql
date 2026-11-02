-- Fail-closed exact structural assertions; safe in CLI BEGIN READ ONLY.
DO $check$
DECLARE shapes jsonb := '{"faculty": [["faculty_id", "integer", true], ["faculty_code", "character varying(20)", true], ["faculty_name", "character varying(255)", true], ["is_active", "boolean", true]], "coordinator_assignment": [["assignment_id", "integer", true], ["access_assignment_id", "integer", true], ["faculty_id", "integer", true], ["programme_id", "integer", true], ["learning_centre_id", "integer", true], ["started_at", "timestamp with time zone", true], ["ended_at", "timestamp with time zone", false]], "academic_setup_audit_log": [["audit_id", "bigint", true], ["entity_type", "character varying(40)", true], ["entity_id", "integer", true], ["action", "character varying(40)", true], ["actor", "character varying(255)", true], ["reason", "text", true], ["before_data", "jsonb", false], ["after_data", "jsonb", false], ["created_at", "timestamp with time zone", true]]}'::jsonb; item record; col jsonb; actual record; fk record;
BEGIN
 FOR item IN SELECT * FROM jsonb_each(shapes) LOOP
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public.'||item.key) AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM jsonb_array_length(item.value) THEN
   RAISE EXCEPTION 'Academic extension column inventory mismatch: %',item.key;
  END IF;
  FOR col IN SELECT * FROM jsonb_array_elements(item.value) LOOP
   SELECT format_type(atttypid,atttypmod) AS typ,attnotnull INTO actual FROM pg_attribute
    WHERE attrelid=to_regclass('public.'||item.key) AND attname=col->>0 AND NOT attisdropped;
   IF NOT FOUND OR actual.typ IS DISTINCT FROM col->>1 OR actual.attnotnull IS DISTINCT FROM (col->>2)::boolean THEN
    RAISE EXCEPTION 'Academic extension column shape mismatch: %.%',item.key,col->>0;
   END IF;
  END LOOP;
 END LOOP;
 FOR item IN SELECT * FROM (VALUES
  ('faculty','faculty_id'),('coordinator_assignment','assignment_id'),('academic_setup_audit_log','audit_id')) AS v(tbl,col) LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid
   AND k.conkey=ARRAY[a.attnum]::smallint[] JOIN pg_index x ON x.indexrelid=k.conindid
   WHERE k.contype='p' AND k.convalidated AND k.conrelid=to_regclass('public.'||item.tbl)
    AND a.attname=item.col AND a.attidentity='d' AND x.indisvalid AND x.indisunique) THEN
   RAISE EXCEPTION 'Academic identity primary key mismatch: %',item.tbl;
  END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid
  AND k.conkey=ARRAY[a.attnum]::smallint[] JOIN pg_index x ON x.indexrelid=k.conindid
  WHERE k.contype='u' AND k.conrelid='public.faculty'::regclass AND a.attname='faculty_code'
   AND x.indisvalid AND x.indisunique AND x.indpred IS NULL) THEN
  RAISE EXCEPTION 'Faculty code uniqueness mismatch';
 END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND
  ((table_name='learning_centre' AND column_name='is_active' AND data_type='boolean' AND is_nullable='NO' AND column_default='true') OR
   (table_name='academic_semester' AND column_name='is_current' AND data_type='boolean' AND is_nullable='NO' AND column_default='false') OR
   (table_name='programme' AND column_name='faculty_id' AND data_type='integer' AND is_nullable='YES' AND column_default IS NULL)))<>3 THEN
  RAISE EXCEPTION 'Academic additive column shape mismatch';
 END IF;
 FOR fk IN SELECT * FROM (VALUES
  ('programme','faculty_id','faculty','faculty_id'),
  ('coordinator_assignment','access_assignment_id','user_access_assignment','access_assignment_id'),
  ('coordinator_assignment','faculty_id','faculty','faculty_id'),
  ('coordinator_assignment','programme_id','programme','programme_id'),
  ('coordinator_assignment','learning_centre_id','learning_centre','learning_centre_id')) AS v(tbl,col,ref,refcol) LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_constraint k
   JOIN pg_attribute a ON a.attrelid=k.conrelid AND k.conkey=ARRAY[a.attnum]::smallint[]
   JOIN pg_attribute r ON r.attrelid=k.confrelid AND k.confkey=ARRAY[r.attnum]::smallint[]
   WHERE k.contype='f' AND k.convalidated AND k.confdeltype='r'
    AND k.conrelid=to_regclass('public.'||fk.tbl) AND a.attname=fk.col
    AND k.confrelid=to_regclass('public.'||fk.ref) AND r.attname=fk.refcol) THEN
   RAISE EXCEPTION 'Academic FK mismatch: %.%',fk.tbl,fk.col;
  END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.academic_semester_one_current_idx')
  AND i.indrelid='public.academic_semester'::regclass AND i.indisunique AND i.indisvalid AND i.indnatts=1
  AND pg_get_expr(i.indpred,i.indrelid)='is_current'
  AND pg_get_indexdef(i.indexrelid,1,true)='is_current') THEN
  RAISE EXCEPTION 'Academic unique current index mismatch';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.coordinator_assignment_one_live_scope_idx')
  AND i.indrelid='public.coordinator_assignment'::regclass AND i.indisunique AND i.indisvalid AND i.indnatts=3
  AND pg_get_expr(i.indpred,i.indrelid)='(ended_at IS NULL)'
  AND pg_get_indexdef(i.indexrelid,1,true)='access_assignment_id'
  AND pg_get_indexdef(i.indexrelid,2,true)='programme_id'
  AND pg_get_indexdef(i.indexrelid,3,true)='learning_centre_id') THEN
  RAISE EXCEPTION 'Academic unique live scope index mismatch';
 END IF;
 FOR item IN SELECT * FROM (VALUES
  ('learning_centre','academic_centre_context','db_academic_setup_context_trigger',23),
  ('faculty','academic_faculty_context','db_academic_setup_context_trigger',23),
  ('programme','academic_programme_context','db_academic_setup_reference_guard',23),
  ('academic_semester','academic_semester_context','db_academic_setup_context_trigger',23),
  ('coordinator_assignment','academic_assignment_context','db_academic_setup_assignment_guard',23),
  ('learning_centre','academic_centre_audit','db_academic_setup_audit',21),
  ('faculty','academic_faculty_audit','db_academic_setup_audit',21),
  ('programme','academic_programme_audit','db_academic_setup_audit',21),
  ('academic_semester','academic_semester_audit','db_academic_setup_audit',21),
  ('coordinator_assignment','academic_assignment_audit','db_academic_setup_audit',21),
  ('academic_setup_audit_log','immutable_academic_audit_row','db_immutable',27),
  ('academic_setup_audit_log','immutable_academic_audit_truncate','db_immutable',34),
  ('learning_centre','no_academic_centre_delete','db_immutable',42),
  ('faculty','no_academic_faculty_delete','db_immutable',42),
  ('academic_semester','no_academic_semester_delete','db_immutable',42),
  ('coordinator_assignment','no_academic_assignment_delete','db_immutable',42)) AS v(tbl,trig,func,kind) LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||item.tbl)
   AND t.tgname=item.trig AND t.tgenabled='O' AND t.tgtype=item.kind AND t.tgqual IS NULL
   AND t.tgfoid=to_regprocedure('public.'||item.func||'()')) THEN
   RAISE EXCEPTION 'Academic trigger mismatch: %',item.trig;
  END IF;
 END LOOP;
 IF to_regprocedure('public.db_set_current_semester(integer)') IS NULL OR
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE n.nspname='public' AND (p.proname LIKE 'db_academic_setup_%' OR p.proname='db_set_current_semester') AND a.grantee=0) OR
  EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid IN ('public.faculty'::regclass,'public.coordinator_assignment'::regclass,'public.academic_setup_audit_log'::regclass,'migration_meta.academic_switch_context'::regclass) AND a.grantee=0) THEN
  RAISE EXCEPTION 'Missing switch function or PUBLIC academic integrity privileges';
 END IF;
END $check$;
SELECT 'academic setup exact structural assertions' AS test_name,'PASS' AS status;

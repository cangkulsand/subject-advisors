import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse,parsePlPgSQL} from 'libpg-query';
import {loadMigrations,GateError} from './migrations.mjs';
const sqlTypes={integer:'int4',smallint:'int2',timestamptz:'timestamptz',boolean:'bool',date:'date',jsonb:'jsonb',text:'text'};
export async function reviewSchema(root=process.cwd()){
  const contract=JSON.parse(await readFile(root+'/db/schema-contract.json','utf8'));
  const migrations=await loadMigrations(root);
  if(contract.tables.length!==26)throw new GateError('EXPECTED_26_DOMAIN_ENTITIES');
  const sql=migrations.map(m=>m.sql).join('\n');const ast=await parse(sql);
  const creates=ast.stmts.flatMap(s=>s.stmt.CreateStmt?[s.stmt.CreateStmt]:[]);
  const domainCreates=creates.filter(s=>s.relation.schemaname==='public');
  if(domainCreates.length!==26||creates.some(s=>!['public','migration_meta'].includes(s.relation.schemaname)))throw new GateError('DOMAIN_TABLE_INVENTORY_MISMATCH');
  if(ast.stmts.some(s=>s.stmt.TransactionStmt))throw new GateError('MIGRATION_TRANSACTION_MUST_BE_RUNNER_OWNED');
  let count=0,fks=0;
  for(const table of contract.tables){
    const create=domainCreates.find(s=>s.relation.relname===table.table);
    if(!create)throw new GateError('TABLE_MISSING_'+table.table);
    const columns=create.tableElts.flatMap(e=>e.ColumnDef?[e.ColumnDef]:[]);
    if(columns.length!==table.columns.length)throw new GateError('COLUMN_COUNT_MISMATCH_'+table.table);
    for(const [i,expected] of table.columns.entries()){
      const column=columns[i];const constraints=column.constraints?.map(c=>c.Constraint)??[];
      const actualType=column.typeName.names.at(-1).String.sval;
      const desiredType=expected.sqlType.startsWith('varchar')?'varchar':sqlTypes[expected.sqlType];
      const typeLength=column.typeName.typmods?.[0]?.A_Const?.ival?.ival;
      const desiredLength=Number(expected.sqlType.match(/\((\d+)\)/)?.[1]);
      if(column.colname!==expected.name||actualType!==desiredType||(desiredLength&&desiredLength!==typeLength))throw new GateError('COLUMN_MAPPING_MISMATCH_'+table.table+'.'+expected.name);
      const pk=constraints.some(c=>c.contype==='CONSTR_PRIMARY');
      const notNull=pk||constraints.some(c=>c.contype==='CONSTR_NOTNULL');
      if(pk!==expected.primaryKey||notNull!==expected.implementedRequired)throw new GateError('COLUMN_CONSTRAINT_MISMATCH_'+table.table+'.'+expected.name);
      if(expected.unique&&!constraints.some(c=>c.contype==='CONSTR_UNIQUE'))throw new GateError('SOURCE_UNIQUE_MISSING');
      const fk=constraints.find(c=>c.contype==='CONSTR_FOREIGN');
      if(Boolean(fk)!==expected.foreignKey)throw new GateError('FOREIGN_KEY_MAPPING_MISMATCH');
      if(fk&&(fk.pktable.relname!==expected.references[0]||fk.pk_attrs[0].String.sval!==expected.references[1]))throw new GateError('FOREIGN_KEY_TARGET_MISMATCH');
      if(fk)fks++;count++;
    }
  }
  const plpgsql=await parsePlPgSQL(sql);
  for(const name of ['001_schema_verification.sql','002_behavior_tests.sql','003_role_boundary_tests.sql']){
    const checkSql=await readFile(root+'/db/checks/'+name,'utf8');
    await parse(checkSql);await parsePlPgSQL(checkSql);
  }
  let sourceStatus='SOURCE_NOT_BUNDLED';
  try{
    const bytes=await readFile(root+'/'+contract.source.path);
    if(createHash('sha256').update(bytes).digest('hex')!==contract.source.sha256)throw new GateError('AUTHORITATIVE_SOURCE_CHANGED_REVIEW_MAPPING');
    sourceStatus='SOURCE_HASH_MATCHES';
  }catch(error){if(error.code!=='ENOENT')throw error;}
  return {staticReview:'PASS',domainTables:26,columns:count,explicitForeignKeys:fks,plpgsqlFunctions:plpgsql.plpgsql_funcs.length,source:sourceStatus,migrations:migrations.map(({version,file,sha256})=>({version,file,sha256})),databaseExecution:'NOT_PERFORMED_BY_STATIC_REVIEW'};
}

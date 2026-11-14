import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse,parsePlPgSQL} from 'libpg-query';
import {loadMigrations,GateError} from './migrations.mjs';
const sqlTypes={integer:'int4',smallint:'int2',timestamptz:'timestamptz',boolean:'bool',date:'date',jsonb:'jsonb',text:'text'};
export async function reviewSchema(root=process.cwd()){
  const contract=JSON.parse(await readFile(root+'/db/schema-contract.json','utf8'));
  const extensions=JSON.parse(await readFile(root+'/db/engineering-extensions.json','utf8'));
  const migrations=await loadMigrations(root);
  if(contract.tables.length!==26)throw new GateError('EXPECTED_26_DOMAIN_ENTITIES');
  const sql=migrations.map(m=>m.sql).join('\n');const ast=await parse(sql);
  const creates=ast.stmts.flatMap(s=>s.stmt.CreateStmt?[s.stmt.CreateStmt]:[]);
  const extensionTables=extensions.extensions.flatMap(item=>item.tables??[]);
  const extensionColumns=extensions.extensions.flatMap(item=>(item.columns??[]).map(column=>({...column,migration:item.migration})));
  if(new Set(extensionTables).size!==extensionTables.length)throw new GateError('DUPLICATE_ENGINEERING_EXTENSION_TABLE');
  const extensionColumnKeys=extensionColumns.map(column=>`${column.table}.${column.name}`);
  if(new Set(extensionColumnKeys).size!==extensionColumnKeys.length)throw new GateError('DUPLICATE_ENGINEERING_EXTENSION_COLUMN');
  const publicCreates=creates.filter(s=>s.relation.schemaname==='public');
  const domainCreates=publicCreates.filter(s=>!extensionTables.includes(s.relation.relname));
  if(domainCreates.length!==26||publicCreates.length!==26+extensionTables.length||
     extensionTables.some(name=>!publicCreates.some(s=>s.relation.relname===name))||
     creates.some(s=>!['public','migration_meta'].includes(s.relation.schemaname)))throw new GateError('DOMAIN_OR_EXTENSION_TABLE_INVENTORY_MISMATCH');
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
  const extensionColumnsByMigration=new Map();
  for(const column of extensionColumns){
    const supportedRequiredBoolean=column.nullable===false&&column.sqlType==='boolean'&&typeof column.default==='boolean'&&
      column.migration==='0008'&&[['learning_centre','is_active',true],['academic_semester','is_current',false]]
        .some(([table,name,value])=>column.table===table&&column.name===name&&column.default===value);
    if(!(column.nullable===true&&column.default===undefined||supportedRequiredBoolean)||!column.purpose||!column.migration||!column.table||!column.name||!column.sqlType)
      throw new GateError('INVALID_ENGINEERING_EXTENSION_COLUMN');
    const migration=migrations.find(item=>item.version===column.migration);
    if(!migration)throw new GateError('ENGINEERING_EXTENSION_MIGRATION_MISSING');
    if(!extensionColumnsByMigration.has(column.migration))extensionColumnsByMigration.set(column.migration,[]);
    extensionColumnsByMigration.get(column.migration).push(column);
  }
  let extensionColumnCount=0;
  for(const [version,expectedColumns] of extensionColumnsByMigration){
    const migration=migrations.find(item=>item.version===version);
    const migrationAst=await parse(migration.sql);
    const additions=migrationAst.stmts.flatMap(statement=>{
      const alter=statement.stmt.AlterTableStmt;
      if(!alter)return [];
      return (alter.cmds??[]).flatMap(command=>{
        const add=command.AlterTableCmd;
        if(add?.subtype!=='AT_AddColumn'||alter.relation.schemaname!=='public')return [];
        return [{table:alter.relation.relname,column:add.def.ColumnDef}];
      });
    });
    const actualKeys=additions.map(item=>`${item.table}.${item.column.colname}`).sort();
    const expectedKeys=expectedColumns.map(item=>`${item.table}.${item.name}`).sort();
    if(JSON.stringify(actualKeys)!==JSON.stringify(expectedKeys))throw new GateError('ENGINEERING_EXTENSION_COLUMN_DDL_MISMATCH_'+version);
    for(const expected of expectedColumns){
      const item=additions.find(candidate=>candidate.table===expected.table&&candidate.column.colname===expected.name);
      const column=item.column;const typeName=column.typeName.names.at(-1).String.sval;
      const normalizedType=expected.sqlType.startsWith('varchar(')?'varchar':sqlTypes[expected.sqlType]??expected.sqlType;
      const typeLength=column.typeName.typmods?.[0]?.A_Const?.ival?.ival;
      const expectedLength=Number(expected.sqlType.match(/\((\d+)\)/)?.[1]);
      const constraints=column.constraints?.map(c=>c.Constraint)??[];
      const notNull=constraints.some(c=>c.contype==='CONSTR_NOTNULL');
      const defaults=constraints.filter(c=>c.contype==='CONSTR_DEFAULT');
      // Protobuf JSON omits the scalar false inside the present boolval node.
      const booleanNode=defaults[0]?.raw_expr?.A_Const?.boolval;
      const defaultBoolean=booleanNode===undefined?undefined:(booleanNode.boolval??false);
      if(typeName!==normalizedType||(expectedLength&&typeLength!==expectedLength)||
         notNull===(expected.nullable===true)||defaults.length!==(expected.nullable?0:1)||
         (expected.nullable===false&&defaultBoolean!==expected.default))
        throw new GateError('ENGINEERING_EXTENSION_COLUMN_SHAPE_MISMATCH_'+expected.table+'.'+expected.name);
    }
    extensionColumnCount+=expectedColumns.length;
  }
  const plpgsql=await parsePlPgSQL(sql);
  for(const name of ['001_schema_verification.sql','002_behavior_tests.sql','003_role_boundary_tests.sql','004_profile_current_semester.sql','005_multi_role_access.sql','006_multi_role_behavior_tests.sql','007_network_security_reference.sql','008_admin_user_management.sql','009_admin_user_management_behavior_tests.sql','010_uc20_forecast_and_confirmation.sql','011_uc20_forecast_and_confirmation_behavior_tests.sql','012_admin_academic_setup.sql','013_admin_academic_setup_behavior.sql','014_simplified_offering_flow.sql','015_department.sql','016_student_programme_change.sql','017_programme_curriculum_admin.sql']){
    const checkSql=await readFile(root+'/db/checks/'+name,'utf8');
    await parse(checkSql);await parsePlPgSQL(checkSql);
  }
  let sourceStatus='SOURCE_NOT_BUNDLED';
  try{
    const bytes=await readFile(root+'/'+contract.source.path);
    if(createHash('sha256').update(bytes).digest('hex')!==contract.source.sha256)throw new GateError('AUTHORITATIVE_SOURCE_CHANGED_REVIEW_MAPPING');
    sourceStatus='SOURCE_HASH_MATCHES';
  }catch(error){if(error.code!=='ENOENT')throw error;}
  return {staticReview:'PASS',domainTables:26,engineeringExtensionTables:extensionTables,columns:count,sourceContractColumns:count,engineeringExtensionColumns:extensionColumnCount,explicitForeignKeys:fks,plpgsqlFunctions:plpgsql.plpgsql_funcs.length,source:sourceStatus,migrations:migrations.map(({version,file,sha256})=>({version,file,sha256})),databaseExecution:'NOT_PERFORMED_BY_STATIC_REVIEW'};
}

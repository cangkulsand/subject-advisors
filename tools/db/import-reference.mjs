import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GateError,loadMigrations,migrationStatus,validateTarget,verifyConnectedTarget} from './migrations.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const DEFAULT_MANIFEST='db/reference-data/network-security/english/manifest.json';
const EXPECTED_EXCLUSIONS=['SECJ2363','SECJ3303','SECJ3483','SECJ3563','SECJ3603','SECJ3623','SECJ4423'];
const CATEGORIES={
  Core:{subjects:21,credits:62,requiredSubjects:21,requiredCredits:62,selectionRule:'all'},
  'University Compulsory':{subjects:10,credits:19,requiredSubjects:10,requiredCredits:19,selectionRule:'all'},
  'Elective E1':{subjects:8,credits:22,requiredSubjects:7,requiredCredits:null,selectionRule:'choose'},
  'Elective E2':{subjects:7,credits:18,requiredSubjects:5,requiredCredits:null,selectionRule:'choose'},
  'Elective E3':{subjects:2,credits:12,requiredSubjects:2,requiredCredits:12,selectionRule:'all'},
  'Elective U1':{subjects:24,credits:48,requiredSubjects:1,requiredCredits:null,selectionRule:'choose'},
  'Elective U2':{subjects:7,credits:14,requiredSubjects:1,requiredCredits:null,selectionRule:'choose'}
};
const CODE=/^[A-Z]{4}\d{4}$/;
const HASH=/^[a-f\d]{64}$/i;
const CELL=/^[A-Z]{1,3}[1-9][0-9]{0,5}$/;
const MAX_PREREQUISITE_TEXT=500;

export class ImportError extends GateError {
  constructor(code){super(code);this.name='ImportError';}
}
const fail=(code)=>{throw new ImportError(code);};
const hash=(value)=>createHash('sha256').update(value).digest('hex');
const canonical=(value)=>{
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest=(value)=>hash(canonical(value));
const nonblank=(value,max=500)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const isInteger=(n,min=0,max=999)=>Number.isInteger(n)&&n>=min&&n<=max;
const asArray=(value)=>Array.isArray(value)?value:fail('INVALID_MANIFEST_ARRAY');

function validateExpression(node,courseCodes,selfCode,depth=0,budget={count:0}){
  if(depth>8||++budget.count>64||!node||typeof node!=='object'||Array.isArray(node))fail('INVALID_PREREQUISITE_EXPRESSION');
  if(node.operator==='course'){
    if(Object.keys(node).sort().join(',')!=='code,operator'||!CODE.test(node.code)||!courseCodes.has(node.code)||node.code===selfCode)fail('INVALID_PREREQUISITE_COURSE');
    return [node.code];
  }
  if(!['allOf','anyOf'].includes(node.operator)||Object.keys(node).sort().join(',')!=='operands,operator')fail('INVALID_PREREQUISITE_OPERATOR');
  const operands=asArray(node.operands);
  if(operands.length<(node.operator==='anyOf'?2:1)||operands.length>16)fail('INVALID_PREREQUISITE_OPERANDS');
  return operands.flatMap(item=>validateExpression(item,courseCodes,selfCode,depth+1,budget));
}

function validateCondition(condition){
  if(!condition||typeof condition!=='object'||Array.isArray(condition)||Object.keys(condition).sort().join(',')!=='operator,sourceCell,type,value'||!CELL.test(condition.sourceCell))fail('INVALID_PREREQUISITE_CONDITION');
  if(condition.type==='completedCredits'){
    if(condition.operator!=='>'||!isInteger(condition.value,0,300)||!Number.isFinite(condition.value))fail('INVALID_COMPLETED_CREDITS_CONDITION');
  }else if(condition.type==='cgpa'){
    if(condition.operator!=='>='||typeof condition.value!=='number'||!Number.isFinite(condition.value)||condition.value<0||condition.value>4)fail('INVALID_CGPA_CONDITION');
  }else fail('UNKNOWN_PREREQUISITE_CONDITION');
}

export function validateManifest(manifest){
  if(!manifest||typeof manifest!=='object'||manifest.formatVersion!==1||!nonblank(manifest.datasetId,160))fail('INVALID_MANIFEST_HEADER');
  if(!manifest.programme||manifest.programme.programmeCode!=='SECRH'||!nonblank(manifest.programme.programmeName,255)||
     manifest.programme.curriculumVersion!=='English'||manifest.programme.totalCreditRequired!==128||
     manifest.programme.effectiveYear!==null||manifest.programme.status!=='INACTIVE'||
     manifest.programme.authorityStatus!=='student-supplied, not officially verified'||manifest.programme.importStatus!=='INACTIVE')fail('INVALID_PROGRAMME_DECLARATION');
  const sources=asArray(manifest.sources);
  if(sources.length<2||sources.length>10||sources.some(s=>!nonblank(s.path,1000)||!HASH.test(s.sha256)||!nonblank(s.role,1000)))fail('INVALID_SOURCE_PROVENANCE');
  if(new Set(sources.map(source=>source.path.toLowerCase())).size!==sources.length)fail('DUPLICATE_SOURCE_PATH');
  const sourceByPath=new Map(sources.map(source=>[source.path.toLowerCase(),source]));
  for(const source of sources){
    if(source.sheetsInspected!==undefined&&(!Array.isArray(source.sheetsInspected)||source.sheetsInspected.some(s=>!nonblank(s.name,128)||!nonblank(s.worksheetXml,256))))fail('INVALID_SOURCE_SHEETS');
  }
  if(sources[0].distinctCourseEntriesReported!==86)fail('INVALID_SOURCE_COURSE_COUNT');
  if(!Array.isArray(manifest.approvedOverrides)||manifest.approvedOverrides.length>20||manifest.approvedOverrides.some(x=>!CODE.test(x.code)||x.field!=='englishName'||!nonblank(x.value,255)||!nonblank(x.basis,1000))||new Set(manifest.approvedOverrides.map(x=>x.code)).size!==manifest.approvedOverrides.length)fail('INVALID_APPROVED_OVERRIDES');
  const exclusions=asArray(manifest.exclusions);
  if(exclusions.length!==EXPECTED_EXCLUSIONS.length||exclusions.some((e,i)=>e.code!==EXPECTED_EXCLUSIONS[i]||!nonblank(e.reason,1000)||!e.sourceLocation||!nonblank(e.sourceLocation.sheet,128)))fail('INVALID_EXCLUSIONS');
  if(!manifest.computedSummary||manifest.computedSummary.distinctSubjects!==79||manifest.computedSummary.poolCredits!==195||!manifest.computedSummary.categories)fail('INVALID_COMPUTED_SUMMARY');
  if(manifest.semesterAvailability!==null||manifest.forecastClassifications!==null||!nonblank(manifest.dataAuthority,1000))fail('UNSUPPORTED_SOURCE_CLASSIFICATION');

  const requirements=asArray(manifest.categoryRequirements);
  if(requirements.length!==Object.keys(CATEGORIES).length)fail('INVALID_CATEGORY_REQUIREMENT_COUNT');
  const requirementByCategory=new Map();
  for(const requirement of requirements){
    if(!Object.hasOwn(CATEGORIES,requirement.category)||requirementByCategory.has(requirement.category))fail('INVALID_CATEGORY_REQUIREMENT');
    const expected=CATEGORIES[requirement.category];
    if(requirement.requiredSubjects!==expected.requiredSubjects||requirement.requiredCredits!==expected.requiredCredits||
       requirement.availableSubjects!==expected.subjects||requirement.availablePoolCredits!==expected.credits||requirement.selectionRule!==expected.selectionRule)fail('CATEGORY_REQUIREMENT_MISMATCH');
    requirementByCategory.set(requirement.category,requirement);
  }
  const subjects=asArray(manifest.subjects);
  if(subjects.length!==79)fail('INVALID_SUBJECT_COUNT');
  const subjectByCode=new Map();const categoryTotals=Object.fromEntries(Object.keys(CATEGORIES).map(key=>[key,{subjects:0,credits:0}]));
  for(const subject of subjects){
    if(!subject||!CODE.test(subject.code)||subjectByCode.has(subject.code)||Object.keys(subject).some(key=>!['code','englishName','credits','category','isCompulsory','sourceLocation','nameProvenance','prerequisites','legacyEquivalent','selectionGroup'].includes(key)))fail('DUPLICATE_OR_INVALID_SUBJECT_CODE');
    if(!nonblank(subject.englishName,255)||!isInteger(subject.credits,0,30)||!Object.hasOwn(CATEGORIES,subject.category)||typeof subject.isCompulsory!=='boolean')fail('INVALID_SUBJECT_DECLARATION');
    if(subject.isCompulsory!==['Core','University Compulsory','Elective E3'].includes(subject.category))fail('SUBJECT_COMPULSORY_CATEGORY_MISMATCH');
    const expectedSelectionGroup=subject.category.startsWith('Elective ')?subject.category.slice('Elective '.length):null;
    if((expectedSelectionGroup&&subject.selectionGroup!==expectedSelectionGroup)||(!expectedSelectionGroup&&subject.selectionGroup!==undefined))fail('SUBJECT_SELECTION_GROUP_MISMATCH');
    if(EXPECTED_EXCLUSIONS.includes(subject.code))fail('EXCLUDED_SUBJECT_RETAINED');
    if(!subject.sourceLocation||!nonblank(subject.sourceLocation.file,1000)||!HASH.test(subject.sourceLocation.sha256)||
       !nonblank(subject.sourceLocation.sheet,128)||!isInteger(subject.sourceLocation.row,1,10000)||
       !nonblank(subject.sourceLocation.codeCell,16)||!nonblank(subject.sourceLocation.creditCell,16))fail('INVALID_SUBJECT_PROVENANCE');
    const sourceRecord=sourceByPath.get(subject.sourceLocation.file.toLowerCase());
    if(!sourceRecord||sourceRecord.sha256.toLowerCase()!==subject.sourceLocation.sha256.toLowerCase())fail('SUBJECT_SOURCE_NOT_DECLARED');
    const nameProvenance=subject.nameProvenance;
    if(!nameProvenance||!nonblank(nameProvenance.source,128)||
       !(nonblank(nameProvenance.cell,16)||nonblank(nameProvenance.workbookCell,16)))fail('INVALID_NAME_PROVENANCE');
    if(nameProvenance.source==='workbook'&&(!nonblank(nameProvenance.sheet,128)||!nonblank(nameProvenance.cell,16)))fail('INVALID_WORKBOOK_NAME_PROVENANCE');
    if(nameProvenance.source==='historicalMarkdownTranslation'&&(!nonblank(nameProvenance.markdownCode,32)||!CODE.test(nameProvenance.markdownCode)||!nonblank(nameProvenance.markdownPath,1000)||!nonblank(nameProvenance.translation,255)||!sourceByPath.has(nameProvenance.markdownPath.toLowerCase())))fail('INVALID_TRANSLATION_PROVENANCE');
    if(!['workbook','displayTranslation','historicalMarkdownTranslation'].includes(nameProvenance.source))fail('UNKNOWN_NAME_PROVENANCE');
    const prereq=subject.prerequisites;
    const allowedPrerequisiteKeys=['expression','fixedCourseEdgesShown','sourcePrerequisiteStatus','sourceCells','conditions','conditionNote','interpretation','topicDependent'];
    if(!prereq||Object.keys(prereq).some(key=>!allowedPrerequisiteKeys.includes(key))||typeof prereq.fixedCourseEdgesShown!=='boolean'||!['Yes','No','Depends on topic'].includes(prereq.sourcePrerequisiteStatus)||!Array.isArray(prereq.conditions)||
       !(prereq.conditionNote===null||(typeof prereq.conditionNote==='string'&&prereq.conditionNote.length<=MAX_PREREQUISITE_TEXT))||!prereq.sourceCells||typeof prereq.sourceCells!=='object'||Array.isArray(prereq.sourceCells)||
       !(prereq.interpretation===undefined||(typeof prereq.interpretation==='string'&&prereq.interpretation.length<=MAX_PREREQUISITE_TEXT))||
       (prereq.topicDependent!==undefined&&typeof prereq.topicDependent!=='boolean'))fail('INVALID_PREREQUISITE_DECLARATION');
    if(Object.keys(prereq.sourceCells).sort().join(',')!=='E,F,G,H,I,J,K'||Object.values(prereq.sourceCells).some(cell=>!CELL.test(cell))||prereq.fixedCourseEdgesShown!==Boolean(prereq.expression))fail('INVALID_PREREQUISITE_SOURCE_CELLS');
    if(prereq.conditions.length>12||prereq.sourcePrerequisiteStatus.length>MAX_PREREQUISITE_TEXT)fail('INVALID_PREREQUISITE_DECLARATION');
    for(const condition of prereq.conditions){
      validateCondition(condition);
      if(!Object.values(prereq.sourceCells).includes(condition.sourceCell))fail('CONDITION_SOURCE_CELL_NOT_DECLARED');
    }
    for(const cell of Object.values(prereq.sourceCells))if(!nonblank(cell,16))fail('INVALID_PREREQUISITE_SOURCE_CELLS');
    if(prereq.expression!==null)validateExpression(prereq.expression,new Set(subjects.map(s=>s.code)),subject.code);
    if(subject.legacyEquivalent!==undefined){
      const legacy=subject.legacyEquivalent;
      if(!legacy||Object.keys(legacy).sort().join(',')!=='code,evidence,meaning'||!CODE.test(legacy.code)||legacy.code===subject.code||!legacy.evidence||Object.keys(legacy.evidence).sort().join(',')!=='file,rowText,sha256'||!HASH.test(legacy.evidence.sha256)||!nonblank(legacy.evidence.file,1000)||!nonblank(legacy.evidence.rowText,1000)||legacy.meaning!=='Historical Markdown explicit equivalent-code column; import crosswalk only, not runtime alias.')fail('INVALID_LEGACY_CROSSWALK');
      const evidence=sourceByPath.get(legacy.evidence.file.toLowerCase());
      if(!evidence||evidence.sha256.toLowerCase()!==legacy.evidence.sha256.toLowerCase())fail('LEGACY_EVIDENCE_NOT_DECLARED');
    }
    subjectByCode.set(subject.code,subject);
    categoryTotals[subject.category].subjects++;
    categoryTotals[subject.category].credits+=subject.credits;
  }
  for(const [category,expected] of Object.entries(CATEGORIES)){
    if(categoryTotals[category].subjects!==expected.subjects||categoryTotals[category].credits!==expected.credits)fail('CATEGORY_POOL_TOTAL_MISMATCH');
    const summary=manifest.computedSummary.categories[category];
    if(!summary||summary.subjects!==expected.subjects||summary.credits!==expected.credits)fail('COMPUTED_CATEGORY_SUMMARY_MISMATCH');
  }
  for(const override of manifest.approvedOverrides){
    const subject=subjectByCode.get(override.code);
    if(!subject||subject.englishName!==override.value)fail('APPROVED_OVERRIDE_SUBJECT_MISMATCH');
  }
  const legacyCodes=subjects.flatMap(subject=>subject.legacyEquivalent?[subject.legacyEquivalent.code]:[]);
  if(legacyCodes.length!==37||new Set(legacyCodes).size!==legacyCodes.length)fail('LEGACY_CROSSWALK_COUNT_OR_UNIQUENESS_MISMATCH');
  const courses=subjectByCode;
  const graph=new Map();
  for(const subject of subjects){
    const refs=subject.prerequisites.expression===null?[]:validateExpression(subject.prerequisites.expression,courses,subject.code);
    graph.set(subject.code,new Set(refs));
    for(const condition of subject.prerequisites.conditions)if(condition.type==='completedCredits'&&condition.operator!=='>')fail('COMPLETED_CREDIT_THRESHOLD_MUST_BE_STRICT');
  }
  const visiting=new Set(),visited=new Set();
  const visit=(code)=>{
    if(visiting.has(code))fail('PREREQUISITE_CYCLE');
    if(visited.has(code))return;
    visiting.add(code);for(const next of graph.get(code)??[])visit(next);
    visiting.delete(code);visited.add(code);
  };
  for(const code of graph.keys())visit(code);
  if(subjectByCode.get('SECR4114')?.credits!==4||subjectByCode.get('SECR4118')?.credits!==8||
     !subjectByCode.get('SECR4114')?.isCompulsory||!subjectByCode.get('SECR4118')?.isCompulsory)fail('INDUSTRIAL_TRAINING_DECLARATION_MISMATCH');
  if(subjectByCode.get('SECR4973')?.prerequisites.topicDependent!==true||subjectByCode.get('SECR4973')?.prerequisites.conditionNote?.toLowerCase().includes('topic')!==true)fail('TOPIC_DEPENDENT_RULE_NOT_PRESERVED');
  return {subjects:subjectByCode,requirements:requirementByCategory,exclusions:[...EXPECTED_EXCLUSIONS]};
}

function mandatoryEdges(node,insideAny=false,result=[]){
  if(!node||insideAny)return result;
  if(node.operator==='course')result.push(node.code);
  else if(node.operator==='allOf')for(const child of node.operands)mandatoryEdges(child,false,result);
  else if(node.operator==='anyOf')return result;
  return result;
}
const sortRows=(rows,key)=>[...(rows??[])].sort((a,b)=>String(a[key]??'').localeCompare(String(b[key]??'')));
function catalogueFingerprint(catalogue){
  return digest({
    programmes:sortRows(catalogue.programmes,'programme_id'),curricula:sortRows(catalogue.curricula,'curriculum_id'),
    subjects:sortRows(catalogue.subjects,'subject_id'),curriculumSubjects:sortRows(catalogue.curriculumSubjects,'curriculum_subject_id'),
    requirements:sortRows(catalogue.requirements,'requirement_id'),prerequisites:sortRows(catalogue.prerequisites,'prerequisite_id'),
    receipts:sortRows(catalogue.receipts,'dataset_id')
  });
}

export function planReferenceImport(manifest,catalogue,targetIdentity,manifestSha256=digest(manifest)){
  const validated=validateManifest(manifest);
  const conflicts=[];
  const byCode=new Map(catalogue.subjects.map(row=>[row.subject_code,row]));
  const programme=catalogue.programmes.find(row=>row.programme_code===manifest.programme.programmeCode);
  if(programme&&programme.programme_name!==manifest.programme.programmeName)conflicts.push({type:'PROGRAMME_NAME_MISMATCH',code:programme.programme_code});
  const existingCurriculum=programme&&catalogue.curricula.find(row=>row.programme_id===programme.programme_id&&row.curriculum_version===manifest.programme.curriculumVersion);
  if(catalogue.programmes.some(row=>row.programme_code===manifest.programme.programmeCode)&&!programme)conflicts.push({type:'PROGRAMME_IDENTITY_CONFLICT'});
  if(!programme&&catalogue.curricula.some(row=>row.curriculum_version===manifest.programme.curriculumVersion&&row.programme_id===undefined))conflicts.push({type:'CURRICULUM_IDENTITY_CONFLICT'});
  const receipt=catalogue.receipts.find(row=>row.dataset_id===manifest.datasetId);
  const aliasOwners=new Map();
  for(const subject of manifest.subjects){
    const existing=byCode.get(subject.code);
    if(existing&&existing.credit_hours!==subject.credits)conflicts.push({type:'SUBJECT_CREDIT_MISMATCH',code:subject.code,existingCredits:existing.credit_hours,sourceCredits:subject.credits});
    const alias=subject.legacyEquivalent?.code;
    if(alias){
      const prior=aliasOwners.get(alias);
      if(prior&&prior!==subject.code)conflicts.push({type:'DUPLICATE_LEGACY_ALIAS',code:alias});
      aliasOwners.set(alias,subject.code);
      if(byCode.has(alias)&&alias!==subject.code)conflicts.push({type:'LEGACY_ALIAS_ALREADY_CATALOGUED',code:subject.code,legacyCode:alias});
    }
  }
  const allAliases=new Set(aliasOwners.keys());
  for(const alias of allAliases)if(validated.subjects.has(alias))conflicts.push({type:'LEGACY_ALIAS_COLLIDES_WITH_SOURCE_CODE',legacyCode:alias});

  const requirementsByType=new Map();
  for(const row of catalogue.requirements.filter(item=>existingCurriculum&&item.curriculum_id===existingCurriculum.curriculum_id)){
    requirementsByType.set(row.requirement_type,(requirementsByType.get(row.requirement_type)??0)+1);
  }
  for(const [type,count] of requirementsByType)if(count>1)conflicts.push({type:'DUPLICATE_REQUIREMENT_TYPE',requirementType:type,count});

  const reuse=[],insert=[];
  for(const subject of manifest.subjects){
    const existing=byCode.get(subject.code);
    (existing?reuse:insert).push({code:subject.code,subjectId:existing?.subject_id??null,credits:subject.credits,displayName:subject.englishName,
      existingName:existing?.subject_name??null,namePreserved:Boolean(existing)});
  }
  const requirementPlan=Object.entries(CATEGORIES).map(([category,expected])=>({
    requirementType:category.toUpperCase().replaceAll(' ','_'),requiredSubjects:expected.requiredSubjects,requiredCredits:expected.requiredCredits
  }));
  const edges=[];
  for(const subject of manifest.subjects){
    for(const code of mandatoryEdges(subject.prerequisites.expression))edges.push({subjectCode:subject.code,requiredCode:code,requirementType:'MANDATORY'});
  }
  const uniqueEdges=new Map(edges.map(edge=>[`${edge.subjectCode}\0${edge.requiredCode}\0${edge.requirementType}`,edge]));
  const orderedEdges=[...uniqueEdges.values()].sort((a,b)=>`${a.subjectCode}:${a.requiredCode}`.localeCompare(`${b.subjectCode}:${b.requiredCode}`));
  const replay=Boolean(receipt);
  if(receipt&&receipt.manifest_sha256!==manifestSha256)conflicts.push({type:'IMPORT_RECEIPT_MANIFEST_MISMATCH'});
  if(receipt&&canonical(receipt.receipt?.target)!==canonical(targetIdentity))conflicts.push({type:'IMPORT_RECEIPT_TARGET_MISMATCH'});
  if(existingCurriculum&&!receipt)conflicts.push({type:'CURRICULUM_VERSION_ALREADY_EXISTS_WITHOUT_IMPORT_RECEIPT',curriculumId:existingCurriculum.curriculum_id});
  if(receipt&&!existingCurriculum)conflicts.push({type:'IMPORT_RECEIPT_CURRICULUM_MISSING'});
  if(existingCurriculum&&receipt){
    if(receipt.curriculum_id!==existingCurriculum.curriculum_id)conflicts.push({type:'IMPORT_RECEIPT_CURRICULUM_ID_MISMATCH'});
    if(existingCurriculum.total_credit_required!==128||existingCurriculum.effective_year!==null)conflicts.push({type:'CURRICULUM_RECEIPT_DATA_MISMATCH'});
    const mappings=catalogue.curriculumSubjects.filter(row=>row.curriculum_id===existingCurriculum.curriculum_id);
    if(mappings.length!==79)conflicts.push({type:'IMPORTED_CURRICULUM_MAPPING_COUNT_MISMATCH',count:mappings.length});
    const sourceByCode=new Map(manifest.subjects.map(subject=>[subject.code,subject]));
    for(const mapping of mappings){
      const subject=catalogue.subjects.find(row=>row.subject_id===mapping.subject_id);
      const source=subject&&sourceByCode.get(subject.subject_code);
      const details=mapping.prerequisite_details??mapping.row_json?.prerequisite_details;
      if(!source||mapping.subject_category!==source.category||Number(mapping.is_compulsory)!==Number(source.isCompulsory)||
        (mapping.display_name??mapping.row_json?.display_name)!==source.englishName||canonical(details)!==canonical(source.prerequisites)){
        conflicts.push({type:'IMPORTED_MAPPING_REPLAY_MISMATCH',subjectCode:subject?.subject_code??null});
      }
    }
    const expectedReqs=new Map(requirementPlan.map(item=>[item.requirementType,item]));
    const currReqs=catalogue.requirements.filter(item=>item.curriculum_id===existingCurriculum.curriculum_id);
    if(currReqs.length!==7||currReqs.some(row=>{
      const expected=expectedReqs.get(row.requirement_type);
      return !expected||row.required_subjects!==expected.requiredSubjects||row.required_credits!==expected.requiredCredits;
    }))conflicts.push({type:'IMPORTED_REQUIREMENT_REPLAY_MISMATCH'});
    const existingEdges=catalogue.prerequisites.filter(row=>row.curriculum_id===existingCurriculum.curriculum_id)
      .map(row=>`${row.subject_code}:${row.required_subject_code}:${row.requirement_type}`).sort();
    const expectedEdgeKeys=orderedEdges.map(edge=>`${edge.subjectCode}:${edge.requiredCode}:${edge.requirementType}`).sort();
    if(canonical(existingEdges)!==canonical(expectedEdgeKeys))conflicts.push({type:'IMPORTED_PREREQUISITE_REPLAY_MISMATCH'});
    const receiptData=receipt.receipt??{};
    if(receiptData.datasetId!==manifest.datasetId||receiptData.manifestSha256!==manifestSha256||receiptData.curriculumId!==existingCurriculum.curriculum_id)conflicts.push({type:'IMPORT_RECEIPT_DATA_MISMATCH'});
  }
  const catalogueSha256=catalogueFingerprint(catalogue);
  const planned={
    formatVersion:1,datasetId:manifest.datasetId,manifestSha256,targetIdentity,catalogueSha256,
    programme:{code:manifest.programme.programmeCode,name:manifest.programme.programmeName,action:programme?'REUSE':'INSERT',statusAtPreview:programme?.status??null,statusAfterImport:programme?'PRESERVE':'ACTIVE',statusAfterActivation:programme?.status==='INACTIVE'?'ACTIVE':programme?programme.status:'ACTIVE'},
    curriculum:{version:manifest.programme.curriculumVersion,totalCreditRequired:128,effectiveYear:null,status:'INACTIVE',action:existingCurriculum?'REPLAY_NOOP':'INSERT'},
    subjects:{insert,reuse},mappings:replay?[]:manifest.subjects.map(subject=>({code:subject.code,category:subject.category,isCompulsory:subject.isCompulsory,displayName:subject.englishName,prerequisiteDetails:subject.prerequisites})),
    requirements:replay?[]:requirementPlan,mandatoryEdges:replay?[]:orderedEdges,
    conflicts:[...new Map(conflicts.map(item=>[canonical(item),item])).values()].sort((a,b)=>canonical(a).localeCompare(canonical(b))),
    importReceiptPresent:Boolean(receipt),replayNoop:replay&&conflicts.length===0,
    expectedCatalogueTotalsAfterImport:{subjects:catalogue.subjects.length+insert.length,curriculumSubjectMappings:catalogue.curriculumSubjects.length+(replay?0:79)}
  };
  const previewSha256=digest(planned);
  return {...planned,previewSha256,canApply:planned.conflicts.length===0,counts:{subjects:79,newSubjects:insert.length,reusedSubjects:reuse.length,mappings:planned.mappings.length,requirements:planned.requirements.length,mandatoryEdges:planned.mandatoryEdges.length}};
}

function targetIdentity(target){
  return {kind:target.kind,host:target.host,port:Number(target.port??5432),database:target.database,projectId:target.projectId??null,branchId:target.branchId??null};
}
export async function loadManifest(path=DEFAULT_MANIFEST){
  const absolute=resolve(ROOT,path);
  const raw=await readFile(absolute);
  let manifest;try{manifest=JSON.parse(raw.toString('utf8'));}catch{fail('INVALID_MANIFEST_JSON');}
  validateManifest(manifest);
  return {manifest,manifestSha256:hash(raw),path:relative(ROOT,absolute)};
}

async function readCatalogue(client){
  const result={programmes:[],curricula:[],subjects:[],curriculumSubjects:[],requirements:[],prerequisites:[],receipts:[]};
  const status=await migrationStatus(client,await loadMigrations(ROOT));
  const migration0005=status.applied.find(item=>item.version==='0005');
  const {rows:[receiptState]}=await client.query("SELECT to_regclass('migration_meta.reference_data_imports') IS NOT NULL AS receipt_table, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curriculum_subject' AND column_name='display_name') AS display_column, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curriculum_subject' AND column_name='prerequisite_details') AS prerequisite_column");
  const {rows:programmes}=await client.query('SELECT programme_id,programme_code,programme_name,level,status FROM public.programme ORDER BY programme_id');
  const {rows:curricula}=await client.query('SELECT curriculum_id,curriculum_version,total_credit_required,effective_year,status,programme_id FROM public.curriculum ORDER BY curriculum_id');
  const {rows:subjects}=await client.query('SELECT subject_id,subject_code,subject_name,credit_hours,subject_category,status,include_in_offering_forecast,class_type FROM public.subject ORDER BY subject_id');
  const {rows:curriculumSubjects}=await client.query('SELECT cs.curriculum_subject_id,cs.curriculum_id,cs.subject_id,cs.subject_category,cs.is_compulsory,to_jsonb(cs) AS row_json FROM public.curriculum_subject cs ORDER BY cs.curriculum_subject_id');
  const {rows:requirements}=await client.query('SELECT requirement_id,curriculum_id,requirement_type,required_credits,required_subjects FROM public.curriculum_requirement ORDER BY requirement_id');
  const {rows:prerequisites}=await client.query('SELECT sp.prerequisite_id,sp.requirement_type,sp.curriculum_subject_id,sp.required_curriculum_subject_id,cs.curriculum_id,sub.subject_code,reqsub.subject_code AS required_subject_code FROM public.subject_prerequisite sp JOIN public.curriculum_subject cs ON cs.curriculum_subject_id=sp.curriculum_subject_id JOIN public.subject sub ON sub.subject_id=cs.subject_id JOIN public.curriculum_subject rcs ON rcs.curriculum_subject_id=sp.required_curriculum_subject_id JOIN public.subject reqsub ON reqsub.subject_id=rcs.subject_id ORDER BY sp.prerequisite_id');
  if(receiptState.receipt_table){
    const {rows:receipts}=await client.query('SELECT dataset_id,curriculum_id,manifest_sha256,manifest,receipt,imported_at FROM migration_meta.reference_data_imports ORDER BY dataset_id');
    result.receipts=receipts;
  }
  Object.assign(result,{programmes,curricula,subjects,curriculumSubjects,requirements,prerequisites});
  return {catalogue:result,migrationStatus:status,receiptTable:receiptState.receipt_table,displayColumn:receiptState.display_column,prerequisiteColumn:receiptState.prerequisite_column,migration0005};
}

async function beginPreview(client){await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');}
async function finishRollback(client){await client.query('ROLLBACK');}
export async function previewReferenceImport(client,manifest,target,manifestSha256=digest(manifest)){
  await verifyConnectedTarget(client,target);
  await beginPreview(client);
  try{
    const inventory=await readCatalogue(client);
    const plan=planReferenceImport(manifest,inventory.catalogue,targetIdentity(target),manifestSha256);
    return {...plan,migrations:{applied:inventory.migrationStatus.applied.map(row=>row.version),pending:inventory.migrationStatus.pending.map(row=>row.version),required:'0005'},
      readiness:{migration0005Applied:Boolean(inventory.migration0005),receiptTable:inventory.receiptTable,displayColumn:inventory.displayColumn,prerequisiteColumn:inventory.prerequisiteColumn}};
  }finally{await finishRollback(client);}
}

function requireMigrationReady(inventory){
  if(inventory.migrationStatus.pending.length)fail('CANONICAL_MIGRATIONS_PENDING');
  if(!inventory.migration0005||!inventory.receiptTable||!inventory.displayColumn||!inventory.prerequisiteColumn)fail('REFERENCE_IMPORT_MIGRATION_0005_REQUIRED');
}
export function captureExistingReferenceRows(catalogue){
  return {
    programmes:sortRows(catalogue.programmes,'programme_id'),curricula:sortRows(catalogue.curricula,'curriculum_id'),
    subjects:sortRows(catalogue.subjects,'subject_id'),curriculumSubjects:sortRows(catalogue.curriculumSubjects,'curriculum_subject_id'),
    requirements:sortRows(catalogue.requirements,'requirement_id'),prerequisites:sortRows(catalogue.prerequisites,'prerequisite_id'),
    receipts:sortRows(catalogue.receipts,'dataset_id')
  };
}
function programmeStatusAfterImport(manifest,catalogue){
  const existing=catalogue.programmes.find(row=>row.programme_code===manifest.programme.programmeCode);
  return existing?existing.status:'ACTIVE';
}
export function assertExistingReferenceRowsUnchanged(before,after){
  const fields={programmes:'programme_id',curricula:'curriculum_id',subjects:'subject_id',curriculumSubjects:'curriculum_subject_id',requirements:'requirement_id',prerequisites:'prerequisite_id',receipts:'dataset_id'};
  const ids={
    programmes:new Set(before.programmes.map(row=>row.programme_id)),curricula:new Set(before.curricula.map(row=>row.curriculum_id)),
    subjects:new Set(before.subjects.map(row=>row.subject_id)),curriculumSubjects:new Set(before.curriculumSubjects.map(row=>row.curriculum_subject_id)),
    requirements:new Set(before.requirements.map(row=>row.requirement_id)),prerequisites:new Set(before.prerequisites.map(row=>row.prerequisite_id)),
    receipts:new Set(before.receipts.map(row=>row.dataset_id))
  };
  for(const key of Object.keys(ids)){
    const field=fields[key];
    const rows=sortRows(after[key].filter(row=>ids[key].has(row[field])),field);
    if(canonical(rows)!==canonical(before[key]))fail('EXISTING_REFERENCE_ROWS_CHANGED');
  }
}
async function insertReferenceRows(client,manifest,plan,catalogue){
  let programme=catalogue.programmes.find(row=>row.programme_code===manifest.programme.programmeCode);
  if(!programme){
    const {rows}=await client.query('INSERT INTO public.programme (programme_code,programme_name,status) VALUES ($1,$2,$3) RETURNING programme_id,programme_code,programme_name,level,status',
      [manifest.programme.programmeCode,manifest.programme.programmeName,'ACTIVE']);
    programme=rows[0];
  }
  const {rows:curriculumRows}=await client.query('INSERT INTO public.curriculum (curriculum_version,total_credit_required,effective_year,status,programme_id) VALUES ($1,$2,$3,$4,$5) RETURNING curriculum_id',
    [manifest.programme.curriculumVersion,128,null,'INACTIVE',programme.programme_id]);
  const curriculumId=curriculumRows[0].curriculum_id;
  const subjectIds=new Map(catalogue.subjects.map(row=>[row.subject_code,row.subject_id]));
  for(const item of plan.subjects.insert){
    const source=manifest.subjects.find(row=>row.code===item.code);
    const {rows}=await client.query('INSERT INTO public.subject (subject_code,subject_name,credit_hours,status,include_in_offering_forecast,class_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING subject_id',
      [source.code,source.englishName,source.credits,null,true,null]);
    subjectIds.set(source.code,rows[0].subject_id);
  }
  const curriculumSubjectIds=new Map();
  for(const source of manifest.subjects){
    const {rows}=await client.query('INSERT INTO public.curriculum_subject (curriculum_id,subject_id,subject_category,is_compulsory,display_name,prerequisite_details) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING curriculum_subject_id',
      [curriculumId,subjectIds.get(source.code),source.category,source.isCompulsory?1:0,source.englishName,JSON.stringify(source.prerequisites)]);
    curriculumSubjectIds.set(source.code,rows[0].curriculum_subject_id);
  }
  for(const item of plan.requirements){
    await client.query('INSERT INTO public.curriculum_requirement (requirement_type,required_credits,required_subjects,curriculum_id) VALUES ($1,$2,$3,$4)',
      [item.requirementType,item.requiredCredits,item.requiredSubjects,curriculumId]);
  }
  for(const edge of plan.mandatoryEdges){
    await client.query('INSERT INTO public.subject_prerequisite (requirement_type,curriculum_subject_id,required_curriculum_subject_id) VALUES ($1,$2,$3)',
      [edge.requirementType,curriculumSubjectIds.get(edge.subjectCode),curriculumSubjectIds.get(edge.requiredCode)]);
  }
  return {programmeId:programme.programme_id,curriculumId,subjectIds:Object.fromEntries(subjectIds),curriculumSubjectIds:Object.fromEntries(curriculumSubjectIds)};
}
async function checkReadiness(client,manifest,curriculumId){
  const {rows:mappings}=await client.query('SELECT cs.curriculum_subject_id,cs.subject_category,cs.is_compulsory,cs.display_name,cs.prerequisite_details,s.subject_code FROM public.curriculum_subject cs JOIN public.subject s USING(subject_id) WHERE cs.curriculum_id=$1 ORDER BY s.subject_code',[curriculumId]);
  const {rows:requirements}=await client.query('SELECT requirement_type,required_credits,required_subjects FROM public.curriculum_requirement WHERE curriculum_id=$1 ORDER BY requirement_type',[curriculumId]);
  const {rows:edges}=await client.query('SELECT sp.requirement_type,s.subject_code,rs.subject_code AS required_code FROM public.subject_prerequisite sp JOIN public.curriculum_subject cs ON cs.curriculum_subject_id=sp.curriculum_subject_id JOIN public.subject s ON s.subject_id=cs.subject_id JOIN public.curriculum_subject rcs ON rcs.curriculum_subject_id=sp.required_curriculum_subject_id JOIN public.subject rs ON rs.subject_id=rcs.subject_id WHERE cs.curriculum_id=$1 ORDER BY s.subject_code,rs.subject_code',[curriculumId]);
  if(mappings.length!==79||mappings.some(row=>!row.display_name||!row.prerequisite_details))fail('CURRICULUM_MAPPING_READINESS_FAILED');
  const sources=new Map(manifest.subjects.map(row=>[row.code,row]));
  if(mappings.some(row=>{const source=sources.get(row.subject_code);return !source||row.display_name!==source.englishName||row.subject_category!==source.category||Number(row.is_compulsory)!==Number(source.isCompulsory)||canonical(row.prerequisite_details)!==canonical(source.prerequisites);}))fail('CURRICULUM_MAPPING_READINESS_FAILED');
  const expectedRequirements=Object.entries(CATEGORIES).map(([category,item])=>({requirementType:category.toUpperCase().replaceAll(' ','_'),requiredCredits:item.requiredCredits,requiredSubjects:item.requiredSubjects}));
  if(requirements.length!==7||requirements.some(row=>{
    const expected=expectedRequirements.find(item=>item.requirementType===row.requirement_type);
    return !expected||row.required_credits!==expected.requiredCredits||row.required_subjects!==expected.requiredSubjects;
  }))fail('CURRICULUM_REQUIREMENT_READINESS_FAILED');
  const expectedEdges=[];for(const subject of manifest.subjects)for(const code of mandatoryEdges(subject.prerequisites.expression))expectedEdges.push(`${subject.code}:${code}:MANDATORY`);
  const actualEdges=edges.map(row=>`${row.subject_code}:${row.required_code}:${row.requirement_type}`);
  if(canonical(actualEdges.sort())!==canonical([...new Set(expectedEdges)].sort()))fail('CURRICULUM_PREREQUISITE_READINESS_FAILED');
  return {mappings:mappings.length,requirements:requirements.length,mandatoryEdges:edges.length};
}

export async function applyReferenceImport(client,manifest,target,expectedPreviewSha256,manifestSha256=digest(manifest),{rollbackOnly=false}={}){
  if(!HASH.test(expectedPreviewSha256??''))fail('EXPECTED_PREVIEW_DIGEST_REQUIRED');
  if(typeof rollbackOnly!=='boolean'||(rollbackOnly&&target.allowRollbackOnlyTests!==true))fail('ROLLBACK_ONLY_TEST_APPROVAL_REQUIRED');
  await verifyConnectedTarget(client,target);
  await client.query('BEGIN');
  let committed=false;
  try{
    await client.query("SET LOCAL lock_timeout TO '5s'");
    await client.query("SET LOCAL statement_timeout TO '30s'");
    await client.query('SELECT pg_advisory_xact_lock(260007,1)');
    await client.query("SET LOCAL search_path TO pg_catalog,public");
    const inventory=await readCatalogue(client);requireMigrationReady(inventory);
    await client.query('LOCK TABLE public.programme,public.curriculum,public.subject,public.curriculum_subject,public.curriculum_requirement,public.subject_prerequisite,migration_meta.reference_data_imports IN SHARE ROW EXCLUSIVE MODE');
    const lockedInventory=await readCatalogue(client);requireMigrationReady(lockedInventory);
    const plan=planReferenceImport(manifest,lockedInventory.catalogue,targetIdentity(target),manifestSha256);
    if(plan.previewSha256!==expectedPreviewSha256)fail('PREVIEW_DIGEST_CHANGED');
    if(!plan.canApply)fail('REFERENCE_IMPORT_CONFLICTS_PRESENT');
    if(plan.replayNoop){
      await checkReadiness(client,manifest,lockedInventory.catalogue.curricula.find(row=>row.curriculum_id===lockedInventory.catalogue.receipts.find(item=>item.dataset_id===manifest.datasetId).curriculum_id).curriculum_id);
      await client.query(rollbackOnly?'ROLLBACK':'COMMIT');committed=true;
      if(rollbackOnly)return {status:'ROLLED_BACK_TEST_REPLAY_NOOP',rolledBack:true,persisted:false,plan};
      return {status:'REPLAY_NOOP',plan,committed:true,receipt:lockedInventory.catalogue.receipts.find(row=>row.dataset_id===manifest.datasetId).receipt};
    }
    const before=captureExistingReferenceRows(lockedInventory.catalogue);
    const ids=await insertReferenceRows(client,manifest,plan,lockedInventory.catalogue);
    const readiness=await checkReadiness(client,manifest,ids.curriculumId);
    const afterInventory=await readCatalogue(client);
    assertExistingReferenceRowsUnchanged(before,captureExistingReferenceRows(afterInventory.catalogue));
    const receipt={formatVersion:1,datasetId:manifest.datasetId,manifestSha256:plan.manifestSha256,sourceManifestSha256:plan.manifestSha256,
      previewSha256:plan.previewSha256,target:targetIdentity(target),programmeId:ids.programmeId,curriculumId:ids.curriculumId,
      insertedSubjectCodes:plan.subjects.insert.map(item=>item.code),reusedSubjectCodes:plan.subjects.reuse.map(item=>item.code),
      subjectIds:ids.subjectIds,curriculumSubjectIds:ids.curriculumSubjectIds,counts:{...readiness,newSubjects:plan.counts.newSubjects,reusedSubjects:plan.counts.reusedSubjects},
      programmeStatus:programmeStatusAfterImport(manifest,lockedInventory.catalogue),curriculumStatus:'INACTIVE',toolRevision:hash(await readFile(fileURLToPath(import.meta.url)))};
    await client.query('INSERT INTO migration_meta.reference_data_imports (dataset_id,curriculum_id,manifest_sha256,manifest,receipt) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)',
      [manifest.datasetId,ids.curriculumId,receipt.manifestSha256,JSON.stringify(manifest),JSON.stringify(receipt)]);
    if(rollbackOnly){
      await client.query('ROLLBACK');committed=true;
      return {status:'ROLLED_BACK_TEST',rolledBack:true,persisted:false,counts:receipt.counts,programmeStatus:receipt.programmeStatus,curriculumStatus:receipt.curriculumStatus,plan:{previewSha256:plan.previewSha256,counts:plan.counts}};
    }
    await client.query('COMMIT');committed=true;
    return {status:'COMMITTED_INACTIVE',committed:true,receipt,plan};
  }catch(error){
    if(!committed){try{await client.query('ROLLBACK');}catch{}}
    throw error;
  }
}

export async function activateReferenceImport(client,manifest,target,{expectedManifestSha256,confirmReadersCompatible}={}){
  if(!confirmReadersCompatible)fail('READER_COMPATIBILITY_CONFIRMATION_REQUIRED');
  if(!HASH.test(expectedManifestSha256??''))fail('EXPECTED_MANIFEST_DIGEST_REQUIRED');
  await verifyConnectedTarget(client,target);
  await client.query('BEGIN');let committed=false;
  try{
    await client.query("SET LOCAL lock_timeout TO '5s'");
    await client.query("SET LOCAL statement_timeout TO '30s'");
    await client.query('SELECT pg_advisory_xact_lock(260007,1)');
    await client.query("SET LOCAL search_path TO pg_catalog,public");
    await client.query('LOCK TABLE public.programme,public.curriculum,public.subject,public.curriculum_subject,public.curriculum_requirement,public.subject_prerequisite,migration_meta.reference_data_imports IN SHARE ROW EXCLUSIVE MODE');
    const inventory=await readCatalogue(client);requireMigrationReady(inventory);
    const receipt=inventory.catalogue.receipts.find(row=>row.dataset_id===manifest.datasetId);
    if(!receipt||receipt.manifest_sha256!==expectedManifestSha256||canonical(receipt.receipt?.target)!==canonical(targetIdentity(target)))fail('MATCHING_IMPORT_RECEIPT_REQUIRED');
    const reconciliation=planReferenceImport(manifest,inventory.catalogue,targetIdentity(target),expectedManifestSha256);
    if(!reconciliation.replayNoop||reconciliation.conflicts.length)fail('ACTIVATION_REFERENCE_RECONCILIATION_FAILED');
    const curriculum=inventory.catalogue.curricula.find(row=>row.curriculum_id===receipt.curriculum_id);
    if(!curriculum||curriculum.total_credit_required!==128||curriculum.effective_year!==null)fail('ACTIVATION_CURRICULUM_MISMATCH');
    const readiness=await checkReadiness(client,manifest,curriculum.curriculum_id);
    if(!['ACTIVE','INACTIVE'].includes(curriculum.status))fail('CURRICULUM_NOT_INACTIVE');
    const programme=inventory.catalogue.programmes.find(row=>row.programme_id===curriculum.programme_id&&row.programme_code===manifest.programme.programmeCode&&row.programme_name===manifest.programme.programmeName);
    if(!programme||!['ACTIVE','INACTIVE',null].includes(programme.status))fail('ACTIVATION_PROGRAMME_MISMATCH');
    if(curriculum.status==='INACTIVE'){
      const {rowCount}=await client.query("UPDATE public.curriculum SET status='ACTIVE' WHERE curriculum_id=$1 AND programme_id=$2 AND status='INACTIVE'",[curriculum.curriculum_id,programme.programme_id]);
      if(rowCount!==1)fail('CURRICULUM_ACTIVATION_STATE_CHANGED');
    }
    if(programme.status==='INACTIVE'){
      const {rowCount}=await client.query("UPDATE public.programme SET status='ACTIVE' WHERE programme_id=$1 AND programme_code=$2 AND status='INACTIVE'",[programme.programme_id,manifest.programme.programmeCode]);
      if(rowCount!==1)fail('PROGRAMME_ACTIVATION_STATE_CHANGED');
    }
    const programmeStatusAfterActivation=programme.status==='INACTIVE'?'ACTIVE':programme.status;
    const {rowCount:receiptRows}=await client.query("UPDATE migration_meta.reference_data_imports SET receipt=receipt || jsonb_build_object('curriculumStatus','ACTIVE','programmeStatus',$2::text,'activatedAt',now()) WHERE dataset_id=$1 AND manifest_sha256=$3",[manifest.datasetId,programmeStatusAfterActivation,expectedManifestSha256]);
    if(receiptRows!==1)fail('ACTIVATION_RECEIPT_STATE_CHANGED');
    await client.query('COMMIT');committed=true;
    return {status:curriculum.status==='ACTIVE'&&programme.status!=='INACTIVE'?'ALREADY_ACTIVE':'ACTIVATED',committed:true,programmeId:programme.programme_id,curriculumId:curriculum.curriculum_id,programmeStatusAfterActivation,readiness};
  }catch(error){if(!committed){try{await client.query('ROLLBACK');}catch{}}throw error;}
}

function parseArgs(argv){
  if(argv.length===0)fail('ACTION_REQUIRED');
  const action=argv.shift();if(!['validate','preview','apply','activate'].includes(action))fail('UNKNOWN_ACTION');
  const values={action,confirmReadersCompatible:false};
  const valueFlags=new Set(['--manifest','--target-file','--expect-preview-sha256','--expect-manifest-sha256','--receipt-dir']);
  for(let index=0;index<argv.length;index++){
    const flag=argv[index];
    if(flag==='--confirm-readers-compatible'){
      if(values.confirmReadersCompatible)fail('DUPLICATE_FLAG');values.confirmReadersCompatible=true;continue;
    }
    if(!valueFlags.has(flag)||!argv[index+1]||argv[index+1].startsWith('--')||Object.hasOwn(values,flag))fail('INVALID_CLI_ARGUMENTS');
    values[flag]=argv[++index];
  }
  if(values.action!=='validate'&&!values['--target-file'])fail('EXPLICIT_TARGET_FILE_REQUIRED');
  if(values.action==='validate'&&values['--target-file'])fail('UNEXPECTED_TARGET_FILE');
  if(values.action!=='apply'&&values['--receipt-dir'])fail('UNEXPECTED_RECEIPT_DIR');
  if(values.action!=='activate'&&values.confirmReadersCompatible)fail('UNEXPECTED_ACTIVATION_CONFIRMATION');
  if(values.action==='apply'&&!values['--expect-preview-sha256'])fail('EXPECTED_PREVIEW_DIGEST_REQUIRED');
  if(values.action==='activate'&&(!values['--expect-manifest-sha256']||!values.confirmReadersCompatible))fail('ACTIVATION_CONFIRMATION_REQUIRED');
  if(values.action!=='apply'&&values['--expect-preview-sha256'])fail('UNEXPECTED_PREVIEW_DIGEST');
  if(values.action!=='activate'&&values['--expect-manifest-sha256'])fail('UNEXPECTED_MANIFEST_DIGEST');
  return values;
}

async function readTarget(path){
  let target;try{target=JSON.parse(await readFile(resolve(ROOT,path),'utf8'));}catch{fail('TARGET_FILE_UNAVAILABLE_OR_INVALID');}
  validateTarget(target);return target;
}
async function connectTarget(target){
  const connectionString=validateTarget(target);
  const {Client}=await import('pg');
  const client=new Client({connectionString,connectionTimeoutMillis:10000,query_timeout:30000});
  await client.connect();return client;
}
async function writeLocalReceipt(receipt,requestedDir){
  const root=resolve(ROOT,'.wrangler/reference-import');
  const runId=`${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}`;
  const directory=resolve(ROOT,requestedDir??`.wrangler/reference-import/${runId}`);
  const relativePath=relative(root,directory);
  if(relativePath.startsWith('..')||isAbsolute(relativePath))fail('UNSAFE_RECEIPT_PATH');
  const path=resolve(directory,'receipt.json');
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return relative(ROOT,path);
}
async function runCli(argv){
  process.chdir(ROOT);
  const args=parseArgs(argv);
  const {manifest,manifestSha256,path}=await loadManifest(args['--manifest']??DEFAULT_MANIFEST);
  if(args.action==='validate')return {action:'validate',status:'VALID',manifestPath:path,manifestSha256,summary:manifest.computedSummary};
  if(args.action==='activate'&&args['--expect-manifest-sha256']!==manifestSha256)fail('MANIFEST_FILE_DIGEST_MISMATCH');
  const target=await readTarget(args['--target-file']);
  const client=await connectTarget(target);
  try{
    let result;
    if(args.action==='preview')result=await previewReferenceImport(client,manifest,target,manifestSha256);
    else if(args.action==='apply')result=await applyReferenceImport(client,manifest,target,args['--expect-preview-sha256'],manifestSha256);
    else result=await activateReferenceImport(client,manifest,target,{expectedManifestSha256:args['--expect-manifest-sha256'],confirmReadersCompatible:args.confirmReadersCompatible});
    if(args.action==='apply'&&result.committed&&result.receipt){
      try{result.localReceiptPath=await writeLocalReceipt(result.receipt,args['--receipt-dir']);}
      catch{result.localReceiptStatus='FAILED_AFTER_DATABASE_COMMIT';result.durableReceiptRecoverable=true;result.status='COMMITTED_LOCAL_RECEIPT_WRITE_FAILED';}
    }
    return {action:args.action,target:targetIdentity(target),...result};
  }finally{await client.end();}
}

const invoked=fileURLToPath(import.meta.url)===process.argv[1];
if(invoked){
  runCli(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
    const reason=error instanceof ImportError||error instanceof GateError?error.message:'IMPORT_REFERENCE_FAILED';
    console.error(JSON.stringify({status:'BLOCKED_OR_FAILED',reason}));process.exitCode=1;
  });
}

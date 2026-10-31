/** Bounded, fail-closed parser for optional imported curriculum prerequisites. */
export type CurriculumPrerequisiteExpression =
  | { operator: 'course'; code: string }
  | { operator: 'allOf' | 'anyOf'; operands: CurriculumPrerequisiteExpression[] };
export interface CurriculumPrerequisiteCondition {
  type: 'completedCredits' | 'cgpa';
  operator: '>' | '>=';
  value: number;
  sourceCell: string;
}
export interface CurriculumPrerequisiteDetails {
  expression: CurriculumPrerequisiteExpression | null;
  fixedCourseEdgesShown: boolean;
  sourcePrerequisiteStatus: string;
  conditions: CurriculumPrerequisiteCondition[];
  conditionNote: string | null;
  sourceCells: Record<string, string>;
  topicDependent?: boolean;
}
export type CurriculumPrerequisiteSummary = Pick<CurriculumPrerequisiteDetails, 'expression' | 'conditionNote' | 'topicDependent'> & {
  conditions: Array<Omit<CurriculumPrerequisiteCondition, 'sourceCell'>>;
};

const MAX_DEPTH = 8;
const MAX_NODES = 64;
const MAX_TEXT = 500;
const CODE = /^[A-Z0-9]{4,12}$/;
const CELL = /^[A-Z]{1,3}[1-9][0-9]{0,5}$/;
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_TEXT;
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));

function parseExpression(value: unknown, catalogueCodes: ReadonlySet<string>, selfCode: string): CurriculumPrerequisiteExpression | null {
  let count = 0;
  const visit = (raw: unknown, depth: number): CurriculumPrerequisiteExpression | null => {
    if (depth > MAX_DEPTH || ++count > MAX_NODES || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const node = raw as Record<string, unknown>;
    if (node.operator === 'course') {
      if (!onlyKeys(node, ['operator', 'code']) || typeof node.code !== 'string' || node.code.length > 12 ||
          !CODE.test(node.code) || node.code === selfCode || !catalogueCodes.has(node.code)) return null;
      return { operator: 'course', code: node.code };
    }
    if (!onlyKeys(node, ['operator', 'operands']) || (node.operator !== 'allOf' && node.operator !== 'anyOf') ||
        !Array.isArray(node.operands) || node.operands.length < 1 || node.operands.length > 16) return null;
    const operands = node.operands.map(operand => visit(operand, depth + 1));
    if (operands.some(operand => operand === null)) return null;
    return { operator: node.operator, operands: operands as CurriculumPrerequisiteExpression[] };
  };
  return visit(value, 0);
}

export function readCurriculumPrerequisiteDetails(value: unknown, catalogueCodes: ReadonlySet<string>, selfCode: string): CurriculumPrerequisiteDetails | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  if (!onlyKeys(object, ['expression', 'fixedCourseEdgesShown', 'sourcePrerequisiteStatus', 'sourceCells', 'conditions', 'conditionNote', 'topicDependent', 'interpretation']) ||
      (object.interpretation !== undefined && !text(object.interpretation)) || !('expression' in object) || typeof object.fixedCourseEdgesShown !== 'boolean' ||
      !text(object.sourcePrerequisiteStatus) || !object.sourcePrerequisiteStatus.trim() || !Array.isArray(object.conditions) || object.conditions.length > 12 ||
      !(object.conditionNote === null || text(object.conditionNote)) ||
      !object.sourceCells || typeof object.sourceCells !== 'object' || Array.isArray(object.sourceCells) ||
      (object.topicDependent !== undefined && typeof object.topicDependent !== 'boolean')) return null;
  const sourceCells: Record<string, string> = {};
  const rawCells = object.sourceCells as Record<string, unknown>;
  const cellKeys = Object.keys(rawCells);
  if (cellKeys.length < 1 || cellKeys.length > 16 || cellKeys.some(key => !/^[A-Z]{1,3}$/.test(key) || typeof rawCells[key] !== 'string' || !CELL.test(rawCells[key] as string))) return null;
  for (const key of cellKeys) sourceCells[key] = rawCells[key] as string;
  const expression = object.expression === null ? null : parseExpression(object.expression, catalogueCodes, selfCode);
  if (object.expression !== null && expression === null) return null;
  if (object.fixedCourseEdgesShown !== (expression !== null)) return null;
  const conditions: CurriculumPrerequisiteCondition[] = [];
  for (const raw of object.conditions) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const condition = raw as Record<string, unknown>;
    if (!onlyKeys(condition, ['type', 'operator', 'value', 'sourceCell'])) return null;
    if ((condition.type !== 'completedCredits' && condition.type !== 'cgpa') ||
        (condition.operator !== '>' && condition.operator !== '>=') ||
        typeof condition.value !== 'number' || !Number.isFinite(condition.value) || condition.value < 0 || condition.value > 1000 ||
        typeof condition.sourceCell !== 'string' || !CELL.test(condition.sourceCell) || !Object.values(sourceCells).includes(condition.sourceCell)) return null;
    conditions.push({ type: condition.type, operator: condition.operator, value: condition.value, sourceCell: condition.sourceCell });
  }
  return {
    expression, fixedCourseEdgesShown: object.fixedCourseEdgesShown,
    sourcePrerequisiteStatus: object.sourcePrerequisiteStatus, conditions,
    conditionNote: object.conditionNote, sourceCells,
    ...(object.topicDependent === undefined ? {} : { topicDependent: object.topicDependent }),
  };
}

export function formatCurriculumPrerequisiteExpression(expression: CurriculumPrerequisiteExpression | null): string | null {
  if (!expression) return null;
  if (expression.operator === 'course') return expression.code;
  const joiner = expression.operator === 'allOf' ? ' AND ' : ' OR ';
  const children = expression.operands.map(child => {
    const formatted = formatCurriculumPrerequisiteExpression(child) ?? '';
    return child.operator !== 'course' && child.operator !== expression.operator ? `(${formatted})` : formatted;
  });
  return children.join(joiner);
}

/** Removes workbook cell provenance before prerequisite information enters an API response. */
export function summarizeCurriculumPrerequisiteDetails(details: CurriculumPrerequisiteDetails): CurriculumPrerequisiteSummary {
  return {
    expression: details.expression,
    conditions: details.conditions.map(({ type, operator, value }) => ({ type, operator, value })),
    conditionNote: details.conditionNote,
    ...(details.topicDependent === undefined ? {} : { topicDependent: details.topicDependent }),
  };
}

/** Browser/API decoder for the public summary shape, which intentionally omits workbook cells. */
export function readCurriculumPrerequisiteSummary(value: unknown, catalogueCodes: ReadonlySet<string>, selfCode: string): CurriculumPrerequisiteSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const summary = value as Record<string, unknown>;
  if (!onlyKeys(summary, ['expression', 'conditions', 'conditionNote', 'topicDependent']) || !Array.isArray(summary.conditions)) return null;
  if (!(summary.conditionNote === null || text(summary.conditionNote)) ||
      (summary.topicDependent !== undefined && typeof summary.topicDependent !== 'boolean') || summary.conditions.length > 12) return null;
  const expression = summary.expression === null ? null : parseExpression(summary.expression, catalogueCodes, selfCode);
  if (summary.expression !== null && expression === null) return null;
  const conditions = summary.conditions.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const condition = raw as Record<string, unknown>;
    if (!onlyKeys(condition, ['type', 'operator', 'value']) ||
        (condition.type !== 'completedCredits' && condition.type !== 'cgpa') ||
        (condition.operator !== '>' && condition.operator !== '>=') ||
        typeof condition.value !== 'number' || !Number.isFinite(condition.value) || condition.value < 0 || condition.value > 1000) return null;
    return { type: condition.type, operator: condition.operator, value: condition.value };
  });
  if (conditions.some(condition => condition === null)) return null;
  return {
    expression, conditions: conditions as CurriculumPrerequisiteSummary['conditions'], conditionNote: summary.conditionNote,
    ...(summary.topicDependent === undefined ? {} : { topicDependent: summary.topicDependent }),
  };
}

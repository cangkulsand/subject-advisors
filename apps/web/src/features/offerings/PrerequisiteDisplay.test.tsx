import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import { PrerequisiteDisplay } from './PrerequisiteDisplay';

describe('curriculum prerequisite display', () => {
  it('shows validated OR alternatives and escaped plain-text source notes with no legacy edges', () => {
    const source: OfferingSubject = { curriculumSubjectId: '10', subjectId: '10', code: 'TARGET10', name: 'Target', creditHours: 3,
      prerequisites: { status: 'available', items: [], details: {
        expression: { operator: 'anyOf', operands: [{ operator: 'course', code: 'ALPHA10' }, { operator: 'course', code: 'BETA10' }] },
        conditions: [], conditionNote: '<script>alert(1)</script>',
      } } };
    const catalogue = [source];
    const html = renderToStaticMarkup(<PrerequisiteDisplay subject={source} catalogue={catalogue} />);
    expect(html).toContain('ALPHA10 OR BETA10');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('>-<');
  });
});

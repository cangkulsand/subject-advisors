import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EligibilityStatus } from './OfferingsPage';

describe('offering eligibility display', () => {
  it('shows the exact status label for each status', () => {
    const labels = { ELIGIBLE: 'Eligible', CHECK: 'Check with your coordinator', NOT_ELIGIBLE: 'Not eligible' } as const;
    for (const [status, label] of Object.entries(labels) as Array<[keyof typeof labels, string]>) {
      const html = renderToStaticMarkup(<EligibilityStatus eligibility={{ curriculumSubjectId: '1', status, reasons: [] }} />);
      expect(html).toContain(label);
    }
  });
  it('lists every reason message and hides the decorative glyph from assistive technology', () => {
    const html = renderToStaticMarkup(<EligibilityStatus eligibility={{ curriculumSubjectId: '1', status: 'NOT_ELIGIBLE', reasons: [
      { kind: 'MISSING_PREREQUISITE', blocking: true, message: 'Needs ELIG100 Foundation' },
      { kind: 'CREDITS', blocking: true, message: 'Needs at least 30 completed credits (you have 3)' },
    ] }} />);
    expect(html).toContain('Needs ELIG100 Foundation');
    expect(html).toContain('Needs at least 30 completed credits (you have 3)');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('offerings-eligibility-not-eligible');
  });
  it('renders nothing when a subject has no evaluation', () => {
    expect(renderToStaticMarkup(<EligibilityStatus eligibility={undefined} />)).toBe('');
  });
});

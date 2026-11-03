// Reusable Playwright readability guard (S2-INT-003). Enforces docs/themeguide.md "Typography and readability".
// Usage: const problems = await scanReadability(page); assertReadable(problems, 'label');
export const MIN_TEXT_PX = 12;
export const MIN_TABLE_BODY_PX = 14;
export const MIN_TABLE_HEAD_PX = 13;

// Secondary text inside table cells (pills, ids, codes, buttons, status notes, detail dumps) only needs the 12px text minimum; primary cell text must be 14px.
const CELL_CHIP = 'code, small, kbd, button, summary, pre, [class*="pill"], [class*="badge"], [class*="audit-id"], [class*="chip"], [class*="code"], [class*="reason"], [class*="issue"], [class*="needed"], [class*="no-picks"], [class*="button"]';

export async function scanReadability(page, { minText = MIN_TEXT_PX, minBody = MIN_TABLE_BODY_PX, minHead = MIN_TABLE_HEAD_PX, ignore = [] } = {}) {
  return page.evaluate(({ minText, minBody, minHead, ignore, chip }) => {
    const problems = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ? node.nodeValue.trim() : '';
      if (!text) continue;
      const el = node.parentElement;
      if (!el || seen.has(el)) continue;
      if (el.closest('svg, script, style, noscript, [aria-hidden="true"], [hidden], option, .visually-hidden, .sr-only')) continue;
      if (ignore.some(selector => el.closest(selector))) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (style.position === 'absolute' && (style.clip !== 'auto' || rect.width <= 1 || rect.height <= 1)) continue;
      seen.add(el);
      const size = parseFloat(style.fontSize);
      const cell = el.closest('td, th');
      let limit = minText; let kind = 'text';
      if (cell && cell.closest('table')) {
        const inHead = cell.tagName === 'TH' && cell.closest('thead');
        if (inHead) { limit = minHead; kind = 'table-header'; } else if (!el.closest(chip)) { limit = minBody; kind = 'table-body'; }
      }
      if (size + 0.01 < limit) {
        problems.push({ kind, size, limit, text: text.slice(0, 40), element: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') });
      }
    }
    return problems;
  }, { minText, minBody, minHead, ignore, chip: CELL_CHIP });
}

// Table toolbar controls (docs/themeguide.md "Table toolbar (mandatory)"): search and filter buttons >= 44px, segmented tabs >= 40px.
export async function scanToolbars(page) {
  return page.evaluate(() => {
    const out = [];
    for (const [selector, min] of [['.table-toolbar .tt-search', 44], ['.table-toolbar .tt-menu-button', 44], ['.table-toolbar .tt-segment', 40]]) {
      for (const el of document.querySelectorAll(selector)) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height + 0.5 < min) out.push({ kind: 'toolbar-control', size: Math.round(rect.height), limit: min, text: (el.textContent || '').trim().slice(0, 40), element: selector });
      }
    }
    return out;
  });
}

export function formatProblems(problems) {
  return problems.slice(0, 12).map(p => `${p.kind} ${p.size}px < ${p.limit}px: <${p.element}> "${p.text}"`).join('\n') + (problems.length > 12 ? `\n... and ${problems.length - 12} more` : '');
}

export async function assertReadable(page, label, options) {
  const problems = [...await scanReadability(page, options), ...await scanToolbars(page)];
  if (process.env.READABILITY_COLLECT) { for (const p of problems) console.log(`READABILITY [${label}] ${p.kind} ${p.size}px < ${p.limit}px <${p.element}> "${p.text}"`); return; }
  if (problems.length) throw new Error(`Readability guard failed (${label}): ${problems.length} element(s)\n${formatProblems(problems)}`);
}

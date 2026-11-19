import type { ButtonHTMLAttributes, Ref } from 'react';
import '../../app/typography.css';
import './icon-button.css';

/** Icons for repeated controls (themeguide "Icon buttons"). Each button keeps a text name through aria-label and title. */
const PATHS = {
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  previous: 'm15 6-6 6 6 6',
  next: 'm9 6 6 6-6 6',
} as const;
export type IconName = keyof typeof PATHS;

export function IconButton({ icon, label, className, ref, ...rest }: { icon: IconName; label: string; ref?: Ref<HTMLButtonElement> } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type' | 'aria-label'>) {
  return <button {...rest} ref={ref} type="button" className={'icon-button' + (className ? ' ' + className : '')} aria-label={label} title={rest.title ?? label}>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={PATHS[icon]}/></svg>
  </button>;
}

/** Previous / Next page buttons for every paginated list. */
export function PagerButtons({ page, pages, onPage, noun }: { page: number; pages: number; onPage: (page: number) => void; noun?: string }) {
  return <div className="icon-pager">
    <IconButton icon="previous" label={noun ? `Previous ${noun}` : 'Previous'} disabled={page <= 1} onClick={() => onPage(page - 1)}/>
    <IconButton icon="next" label={noun ? `Next ${noun}` : 'Next'} disabled={page >= pages} onClick={() => onPage(page + 1)}/>
  </div>;
}

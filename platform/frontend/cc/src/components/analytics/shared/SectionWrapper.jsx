import { forwardRef } from 'react';

const SectionWrapper = forwardRef(function SectionWrapper(
  { id, label, title, subtitle, actions, children, className = '' },
  ref
) {
  return (
    <section
      id={id}
      ref={ref}
      className={['rounded-2xl border border-neutral-200 bg-white shadow-sm', className].join(' ')}
    >
      <div className="border-b border-neutral-100 px-4 py-4 md:px-6 md:py-5">
        {label && (
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">{label}</p>
        )}
        {title && (
          <div className="mt-1 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p>}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
          </div>
        )}
      </div>
      <div className="p-4 md:p-6">{children}</div>
    </section>
  );
});

export default SectionWrapper;

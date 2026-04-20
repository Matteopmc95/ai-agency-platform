import { classNames } from '../lib/utils';

export default function SectionCard({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}) {
  return (
    <section className={classNames('rounded-[24px] border border-neutral-200 bg-white shadow-sm', className)}>
      {(eyebrow || title || description || actions) ? (
        <header className="flex flex-col gap-4 border-b border-neutral-200 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">
                {eyebrow}
              </p>
            ) : null}
            {title ? <h3 className="mt-2 text-[28px] font-semibold text-ink">{title}</h3> : null}
            {description ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
        </header>
      ) : null}

      <div className={classNames('px-5 py-5 sm:px-6', contentClassName)}>{children}</div>
    </section>
  );
}

import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  ReactNode
} from "react";
import { cn } from "./utils";

const badgeToneStyles: Record<string, string> = {
  neutral: "border-[var(--color-badge-neutral-border)] bg-[var(--color-badge-neutral-bg)] text-[var(--color-badge-neutral-text)]",
  info: "border-[var(--color-badge-info-border)] bg-[var(--color-badge-info-bg)] text-[var(--color-badge-info-text)]",
  success: "border-[var(--color-badge-success-border)] bg-[var(--color-badge-success-bg)] text-[var(--color-badge-success-text)]",
  warning: "border-[var(--color-badge-warning-border)] bg-[var(--color-badge-warning-bg)] text-[var(--color-badge-warning-text)]",
  destructive: "border-[var(--color-badge-danger-border)] bg-[var(--color-badge-danger-bg)] text-[var(--color-badge-danger-text)]"
};

const statusBadgeStyles = {
  default: "border-[var(--color-badge-neutral-border)] bg-[var(--color-badge-neutral-bg)] text-[var(--color-badge-neutral-text)]",
  draft: "border-[var(--color-badge-warning-border)] bg-[var(--color-badge-warning-bg)] text-[var(--color-badge-warning-text)]",
  open: "border-[var(--color-badge-success-border)] bg-[var(--color-badge-success-bg)] text-[var(--color-badge-success-text)]",
  blocked: "border-[var(--color-badge-danger-border)] bg-[var(--color-badge-danger-bg)] text-[var(--color-badge-danger-text)]",
  done: "border-[var(--color-badge-info-border)] bg-[var(--color-badge-info-bg)] text-[var(--color-badge-info-text)]"
};

export type BadgeTone = keyof typeof badgeToneStyles;
export type BadgeSize = "sm" | "md" | "lg";
export type BadgeVariant = "default" | "status";
export type PanelTone = "surface" | "muted" | "elevated";
export type ButtonTone = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";
export type StatusTone = keyof typeof statusBadgeStyles;

export type WorkspaceTabItem = {
  label: string;
  href: string;
  active?: boolean;
  count?: number;
  disabled?: boolean;
};

export function Badge({
  children,
  tone = "neutral",
  variant = "default",
  size = "md"
}: {
  children: ReactNode;
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
}) {
  const toneClass = badgeToneStyles[tone] ?? badgeToneStyles.neutral;
  const statusClass =
    variant === "status" ? statusBadgeStyles.default : toneClass;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium leading-none",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : size === "lg" ? "px-3 py-1 text-xs" : "px-2.5 py-1 text-xs",
        statusClass
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  children,
  className,
  tone = "surface",
  ...props
}: HTMLAttributes<HTMLElement> & { tone?: PanelTone }) {
  const toneStyles =
    tone === "elevated"
      ? "border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5 shadow-[var(--shadow-surface)]"
      : tone === "muted"
      ? "border-[var(--color-border-default)] bg-[var(--color-bg-subtle,var(--color-bg-muted))] p-5"
      : "border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5 shadow-[var(--shadow-soft)]";

  return (
    <section
      className={cn(
        "min-w-0 rounded-[var(--radius-card)] border transition-all",
        toneStyles,
        className
      )}
      data-tone={tone}
      {...props}
    >
      {children}
    </section>
  );
}

export function ButtonLink({
  children,
  className,
  tone = "primary",
  size = "md",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  tone?: ButtonTone;
  size?: ButtonSize;
}) {
  const hasCustomBackground = /\bbg-/.test(className ?? "");
  const hasCustomTextColor =
    /\btext-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/.test(
      className ?? ""
    );

  return (
    <a
      className={cn(
        "inline-flex min-h-9 items-center justify-center rounded-[var(--radius-control)] px-4 font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "min-h-8 px-3 text-xs" : size === "lg" ? "min-h-11 px-5 text-sm" : "",
        tone === "primary"
          ? "bg-[var(--color-action-primary)] text-white shadow-sm hover:bg-[var(--color-action-primary-hover)] active:translate-y-px"
          : tone === "secondary"
          ? "bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-default)] hover:bg-[var(--color-action-primary-subtle)]"
          : "bg-transparent text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-default)] hover:bg-[var(--color-bg-muted)]",
        hasCustomBackground && "border",
        !hasCustomTextColor && tone === "primary" && "text-white",
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export function Kicker({
  children,
  className
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]",
        className
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  className
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-8 text-center", className)}>
      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{description}</p>
    </div>
  );
}

export function LoadingState({
  className,
  children
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-8 text-center", className)}>
      <p className="text-sm text-[var(--color-text-secondary)]">{children ?? "Loading..."}</p>
    </div>
  );
}

export function StatusBadge({
  tone,
  children
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
        statusBadgeStyles[tone]
      )}
    >
      {children}
    </span>
  );
}

export function WorkspaceTabs({
  items,
  ariaLabel = "Workspace sections",
  className
}: {
  items: WorkspaceTabItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex flex-wrap gap-1 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-muted)] p-1",
        className
      )}
    >
      {items.map((item) => {
        const content = (
          <>
            <span className="truncate">{item.label}</span>
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold",
                  item.active
                    ? "bg-[var(--color-bg-surface)] text-[var(--color-action-primary)]"
                    : "bg-[var(--color-bg-surface)] text-[var(--color-text-muted)]"
                )}
              >
                {item.count}
              </span>
            ) : null}
          </>
        );

        const className = cn(
          "inline-flex min-h-8 min-w-0 items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-semibold transition-colors",
          item.active
            ? "bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-[var(--shadow-soft)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]",
          item.disabled && "pointer-events-none opacity-55"
        );

        if (item.disabled) {
          return (
            <span key={item.label} aria-disabled="true" className={className}>
              {content}
            </span>
          );
        }

        return (
          <a
            key={item.label}
            aria-current={item.active ? "page" : undefined}
            className={className}
            href={item.href}
          >
            {content}
          </a>
        );
      })}
    </nav>
  );
}

export function PaginationBar({
  page,
  pageSize,
  totalItems,
  getPageHref,
  itemLabel = "records",
  className,
  controlClassName
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  getPageHref: (page: number) => string;
  itemLabel?: string;
  className?: string;
  controlClassName?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);
  const canGoPrevious = safePage > 1;
  const canGoNext = safePage < pageCount;
  const buttonClass =
    "inline-flex min-h-9 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-default)] px-3 text-sm font-semibold transition-colors";
  const enabledClass =
    "bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]";
  const disabledClass =
    "cursor-not-allowed bg-[var(--color-bg-muted)] text-[var(--color-text-disabled,var(--color-text-muted))] opacity-70";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-sm text-[var(--color-text-secondary)]">
        Showing <span className="font-semibold text-[var(--color-text-primary)]">{start}-{end}</span>{" "}
        of <span className="font-semibold text-[var(--color-text-primary)]">{totalItems}</span>{" "}
        {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        {canGoPrevious ? (
          <a className={cn(buttonClass, enabledClass, controlClassName)} href={getPageHref(safePage - 1)}>
            Previous
          </a>
        ) : (
          <span aria-disabled="true" className={cn(buttonClass, disabledClass, controlClassName)}>
            Previous
          </span>
        )}
        <span className="inline-flex min-h-9 items-center rounded-[var(--radius-control)] px-2 text-sm font-semibold text-[var(--color-text-secondary)]">
          Page {safePage} of {pageCount}
        </span>
        {canGoNext ? (
          <a className={cn(buttonClass, enabledClass, controlClassName)} href={getPageHref(safePage + 1)}>
            Next
          </a>
        ) : (
          <span aria-disabled="true" className={cn(buttonClass, disabledClass, controlClassName)}>
            Next
          </span>
        )}
      </div>
    </div>
  );
}

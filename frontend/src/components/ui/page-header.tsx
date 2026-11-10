import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  highlight?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, highlight, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[2.5rem] leading-none tracking-[-0.03em] text-foreground sm:text-5xl">
          {title}
          {highlight ? (
            <>
              {" "}
              <span className="inline-block rounded-lg bg-gold-soft px-2 pb-1 pt-0.5 ring-1 ring-gold/25">{highlight}</span>
            </>
          ) : null}
        </h1>
        {description ? <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </div>
  );
}

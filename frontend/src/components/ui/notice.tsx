import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  warning:
    "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  danger: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100",
};

type NoticeProps = HTMLAttributes<HTMLElement> & {
  tone?: keyof typeof tones;
  title?: ReactNode;
  icon?: ReactNode;
};

export function Notice({ tone = "warning", title, icon, children, className, ...props }: NoticeProps) {
  return (
    <section className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)} {...props}>
      <div className="flex gap-2">
        {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
        <div className="min-w-0">
          {title ? <h2 className="font-semibold">{title}</h2> : null}
          {children}
        </div>
      </div>
    </section>
  );
}

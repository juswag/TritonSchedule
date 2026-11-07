import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, MoreHorizontal, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCourseCode } from "@/lib/courseLabels";
import {
  MAX_SAVED,
  WEEKDAYS,
  minutes,
  type PlanLibrary,
  type PlanSnapshot,
  type SavedPlan,
} from "@/lib/savedSchedules";

function NameForm({
  initial,
  rename,
  onSave,
  onCancel,
}: {
  initial: string;
  rename?: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <form
      className="plan-form"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave(name.trim());
      }}
    >
      <label className="text-xs font-medium">
        Schedule name
        <input
          ref={input}
          value={name}
          maxLength={48}
          required
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="plan-button quiet" onClick={onCancel}>
          Cancel
        </button>
        <button className="plan-button primary" disabled={!name.trim()}>
          {rename ? "Save name" : "Save"}
        </button>
      </div>
    </form>
  );
}

function MiniWeek({
  plan,
  start,
  end,
  days,
  colors,
}: {
  plan: SavedPlan;
  start: number;
  end: number;
  days: readonly string[];
  colors: Map<string, string>;
}) {
  const left = 26,
    top = 18,
    width = 236,
    height = 62;
  const col = width / days.length;
  const y = (m: number) => top + ((m - start) / (end - start)) * height;
  const ticks = [start, Math.round((start + end) / 120) * 60, end];
  return (
    <svg viewBox="0 0 266 86" className="plan-mini" aria-hidden="true">
      {days.map((day, i) => (
        <g key={day}>
          <text x={left + (i + 0.5) * col} y={11} textAnchor="middle">
            {day}
          </text>
          {i > 0 && (
            <line
              x1={left + i * col}
              x2={left + i * col}
              y1={top - 3}
              y2={top + height}
            />
          )}
        </g>
      ))}
      {ticks.map((m) => (
        <g key={m}>
          <text x={left - 6} y={y(m) + 3} textAnchor="end">
            {(m / 60) % 12 || 12}
            {m % 1440 < 720 ? "a" : "p"}
          </text>
          <line x1={left} x2={left + width} y1={y(m)} y2={y(m)} />
        </g>
      ))}
      {plan.events.map((e) => {
        const key =
          e.courseKey ||
          plan.courses.find((c) => c.code === getCourseCode(e.title))?.key;
        return (
          <rect
            key={e.id}
            x={left + days.indexOf(e.dayOfWeek) * col + 2}
            y={y(minutes(e.startTime))}
            width={col - 4}
            height={Math.max(
              2,
              y(minutes(e.endTime)) - y(minutes(e.startTime)),
            )}
            rx="1.6"
            fill={colors.get(key) || e.color}
            opacity=".78"
          />
        );
      })}
    </svg>
  );
}

interface ShelfProps {
  plans: SavedPlan[];
  activeId?: string;
  previewId?: string;
  colors: Map<string, string>;
  draft: PlanSnapshot | null;
  canSave: boolean;
  applying: boolean;
  error: string;
  onOpen: () => void;
  onCancel: () => void;
  onSaved: (plan: SavedPlan) => void;
  onPreview: (plan: SavedPlan) => void;
  update: (fn: (state: PlanLibrary) => PlanLibrary) => boolean;
}
export function SavedScheduleShelf({
  plans,
  activeId,
  previewId,
  draft,
  colors,
  canSave,
  applying,
  error,
  onOpen,
  onCancel,
  onSaved,
  onPreview,
  update,
}: ShelfProps) {
  const [rename, setRename] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<{
    plan: SavedPlan;
    index: number;
  } | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const focusCard = (id?: string) =>
    requestAnimationFrame(() => {
      const target = Array.from(
        list.current?.querySelectorAll<HTMLButtonElement>(".plan-pick") || [],
      ).find((button) => button.dataset.id === id);
      (target || addButton.current)?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
  const grid = useMemo(() => {
    const meetings = plans.flatMap((p) => p.events);
    return {
      start: Math.min(
        480,
        ...meetings.map((e) => Math.floor(minutes(e.startTime) / 60) * 60),
      ),
      end: Math.max(
        960,
        ...meetings.map((e) => Math.ceil(minutes(e.endTime) / 60) * 60),
      ),
      days: WEEKDAYS.filter(
        (d, i) => i < 5 || meetings.some((e) => e.dayOfWeek === d),
      ),
    };
  }, [plans]);

  function save(name: string) {
    if (!draft) return;
    const plan = { ...draft, name, id: crypto.randomUUID() };
    if (
      !update((s) => {
        if (s.plans.length >= MAX_SAVED)
          throw new RangeError("You can save up to 20 schedules per term.");
        return { ...s, plans: [...s.plans, plan] };
      })
    )
      return;
    onSaved(plan);
    focusCard(plan.id);
  }
  return (
    <section className="plan-shelf" aria-labelledby="saved-heading">
      <div className="flex min-h-9 items-center gap-2">
        <h2 id="saved-heading" tabIndex={-1} className="text-sm font-semibold">
          My Schedules
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {plans.length}
        </span>
        <button
          ref={addButton}
          type="button"
          className="plan-icon ml-auto text-primary"
          aria-label="Save displayed schedule"
          title="Save displayed schedule"
          disabled={!canSave || applying}
          onClick={onOpen}
        >
          <Plus size={16} />
        </button>
      </div>
      {error && (
        <p role="alert" className="my-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {draft && (
        <NameForm
          initial={`Schedule ${plans.length + 1}`}
          onSave={save}
          onCancel={() => {
            onCancel();
            focusCard();
          }}
        />
      )}
      {!plans.length && !draft && (
        <p className="my-3 text-sm text-muted-foreground">
          No saved schedules yet.
        </p>
      )}
      {plans.length >= MAX_SAVED && (
        <p className="my-1 text-xs text-muted-foreground">
          20 schedules saved. Delete one to save another.
        </p>
      )}
      {deleted && (
        <div className="my-1 flex items-center justify-between gap-2 text-xs">
          <span role="status" className="truncate">
            {deleted.plan.name} deleted.
          </span>
          <button
            type="button"
            className="plan-button quiet"
            aria-label="Undo delete"
            onClick={() => {
              if (
                update((s) => {
                  if (s.plans.length >= MAX_SAVED)
                    throw new RangeError(
                      "Delete a schedule to restore this one.",
                    );
                  const next = [...s.plans];
                  next.splice(deleted.index, 0, deleted.plan);
                  return { ...s, plans: next };
                })
              ) {
                setDeleted(null);
                focusCard(deleted.plan.id);
              }
            }}
          >
            Undo
          </button>
        </div>
      )}
      <div
        className="plan-list"
        ref={list}
        role="group"
        aria-label="Saved schedule previews"
      >
        {plans.map((p, i) => (
          <div
            className="plan-card"
            key={p.id}
            data-viewing={(previewId || activeId) === p.id}
          >
            {rename === p.id ? (
              <NameForm
                initial={p.name}
                rename
                onCancel={() => {
                  setRename(null);
                  focusCard(p.id);
                }}
                onSave={(name) => {
                  if (
                    update((s) => ({
                      ...s,
                      plans: s.plans.map((item) =>
                        item.id === p.id ? { ...item, name } : item,
                      ),
                    }))
                  ) {
                    setRename(null);
                    focusCard(p.id);
                  }
                }}
              />
            ) : (
              <>
                <button
                  type="button"
                  className="plan-pick"
                  data-id={p.id}
                  disabled={applying}
                  aria-label={`Preview ${p.name}`}
                  aria-describedby={`courses-${p.id}`}
                  aria-pressed={(previewId || activeId) === p.id}
                  onClick={() => onPreview(p)}
                >
                  <span className="plan-title">
                    <strong>{p.name}</strong>
                    {activeId === p.id ? (
                      <span className="plan-marker">
                        <Check size={12} />
                        Current
                      </span>
                    ) : (
                      previewId === p.id && (
                        <span className="plan-marker">
                          <Eye size={12} />
                          Preview
                        </span>
                      )
                    )}
                  </span>
                  <span className="plan-courses" id={`courses-${p.id}`}>
                    {p.courses.map((c) => (
                      <span key={c.key} title={c.title}>
                        <i style={{ backgroundColor: colors.get(c.key) }} />
                        {c.code}
                      </span>
                    ))}
                  </span>
                  <MiniWeek plan={p} colors={colors} {...grid} />
                </button>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="plan-more plan-icon"
                      aria-label={`Options for ${p.name}`}
                      disabled={applying}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        onCancel();
                        setRename(p.id);
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => {
                        if (
                          update((s) => ({
                            ...s,
                            plans: s.plans.filter((item) => item.id !== p.id),
                          }))
                        ) {
                          setDeleted({ plan: p, index: i });
                          focusCard(plans[i + 1]?.id || plans[i - 1]?.id);
                        }
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

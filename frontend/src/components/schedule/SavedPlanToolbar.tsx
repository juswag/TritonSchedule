import { Bookmark, Check, X } from "lucide-react";
import type { SavedPlan } from "@/lib/savedSchedules";

export function SavePlanButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className="plan-button"
      disabled={disabled}
      onClick={onClick}
    >
      <Bookmark size={15} />
      Save Schedule
    </button>
  );
}

export function SavedPlanToolbar({
  active,
  preview,
  onBack,
  onUse,
  onSave,
  canSave,
  applying,
}: {
  active?: SavedPlan;
  preview?: SavedPlan;
  onBack: () => void;
  onUse: () => void;
  onSave: () => void;
  canSave: boolean;
  applying: boolean;
}) {
  return (
    <div className="plan-toolbar">
      <div className="flex min-w-0 items-center gap-2">
        {preview && (
          <button
            type="button"
            aria-label="Back to current schedule"
            className="plan-icon"
            disabled={applying}
            onClick={onBack}
          >
            <X size={16} />
          </button>
        )}
        <h2 className="truncate text-base font-semibold">
          {preview?.name || active?.name || "Current schedule"}
        </h2>
        {preview ? (
          <span className="plan-marker">Preview</span>
        ) : (
          active && (
            <span className="plan-marker">
              <Check size={12} />
              Current
            </span>
          )
        )}
      </div>
      {preview ? (
        <button
          type="button"
          className="plan-button primary"
          disabled={applying}
          onClick={onUse}
        >
          <Check size={16} />
          {applying ? "Applying…" : "Use schedule"}
        </button>
      ) : (
        <SavePlanButton disabled={!canSave} onClick={onSave} />
      )}
    </div>
  );
}

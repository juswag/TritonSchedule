export const PREVIEW_MOTION_KEY = "tritonschedule:preview-motion";

/** Explicit local-preview opt-in; production always follows the system preference. */
export function hasPreviewMotionOverride(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(PREVIEW_MOTION_KEY) === "full";
  } catch {
    return false;
  }
}

export function shouldReduceScheduleMotion(): boolean {
  return (
    !hasPreviewMotionOverride() &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

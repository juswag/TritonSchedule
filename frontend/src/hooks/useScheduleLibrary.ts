import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { readLibrary, type PlanLibrary } from "@/lib/savedSchedules";

const refreshEvent = "saved-schedules-updated";

export function useScheduleLibrary(term: string) {
  const key = "savedSchedules:v1:" + term;
  const [writeError, setWriteError] = useState("");
  const subscribe = useCallback(
    (refresh: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (!event.key || event.key === key) refresh();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(refreshEvent, refresh);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(refreshEvent, refresh);
      };
    },
    [key],
  );
  const read = useCallback(() => {
    try {
      return term ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }, [term, key]);
  const raw = useSyncExternalStore(subscribe, read);
  const state = useMemo(() => {
    try {
      return { library: readLibrary(raw, term), error: "" };
    } catch {
      return {
        library: readLibrary(null, term),
        error: "Saved schedules could not be read.",
      };
    }
  }, [raw, term]);
  function update(change: (library: PlanLibrary) => PlanLibrary) {
    if (!term || state.error) return false;
    try {
      const next = change(readLibrary(localStorage.getItem(key), term));
      localStorage.setItem(key, JSON.stringify(next));
      setWriteError("");
      window.dispatchEvent(new Event(refreshEvent));
      return true;
    } catch (e) {
      setWriteError(
        e instanceof RangeError
          ? e.message
          : "Could not save this change in browser storage.",
      );
      return false;
    }
  }
  return { ...state.library, update, error: state.error || writeError };
}

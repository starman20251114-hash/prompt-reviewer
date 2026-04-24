import { useState } from "react";

const STORAGE_KEY = "prompt_reviewer_active_label_id";

export function getStoredActiveLabelId(): number | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = Number(stored);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

export function useActiveLabel() {
  const [activeLabelId, setActiveLabelIdState] = useState<number | null>(getStoredActiveLabelId);

  function setActiveLabelId(id: number | null) {
    try {
      if (id === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, String(id));
      }
    } catch {
      // localStorage unavailable
    }
    setActiveLabelIdState(id);
  }

  return { activeLabelId, setActiveLabelId };
}

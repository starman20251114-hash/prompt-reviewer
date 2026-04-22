import { useCallback, useEffect, useState } from "react";

const SHARED_API_KEY_STORAGE_KEY = "api_key_shared";

function resolveStorageKey(scope: number | string): string {
  if (scope === "shared") {
    return SHARED_API_KEY_STORAGE_KEY;
  }

  return `api_key_${scope}`;
}

function readApiKey(scope: number | string): string {
  const storageKey = resolveStorageKey(scope);
  const scopedKey = localStorage.getItem(storageKey);
  if (scopedKey) {
    return scopedKey;
  }

  if (typeof scope === "number") {
    return localStorage.getItem(SHARED_API_KEY_STORAGE_KEY) ?? "";
  }

  return "";
}

export function useApiKey(scope: number | string): {
  apiKey: string;
  hasApiKey: boolean;
  setApiKey: (key: string) => void;
} {
  const storageKey = resolveStorageKey(scope);

  const [apiKey, setApiKeyState] = useState<string>(() => {
    return readApiKey(scope);
  });

  useEffect(() => {
    setApiKeyState(readApiKey(scope));
  }, [scope]);

  const setApiKey = useCallback(
    (key: string) => {
      if (key) {
        localStorage.setItem(storageKey, key);
        if (typeof scope === "number") {
          localStorage.setItem(SHARED_API_KEY_STORAGE_KEY, key);
        }
      } else {
        localStorage.removeItem(storageKey);
        if (typeof scope === "number") {
          localStorage.removeItem(SHARED_API_KEY_STORAGE_KEY);
        }
      }
      setApiKeyState(key);
    },
    [scope, storageKey],
  );

  return {
    apiKey,
    hasApiKey: apiKey.trim().length > 0,
    setApiKey,
  };
}

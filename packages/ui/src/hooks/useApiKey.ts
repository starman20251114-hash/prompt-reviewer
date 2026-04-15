import { useCallback, useEffect, useState } from "react";

export function useApiKey(projectId: number): {
  apiKey: string;
  hasApiKey: boolean;
  setApiKey: (key: string) => void;
} {
  const storageKey = `api_key_${projectId}`;

  const [apiKey, setApiKeyState] = useState<string>(() => {
    return localStorage.getItem(storageKey) ?? "";
  });

  useEffect(() => {
    setApiKeyState(localStorage.getItem(storageKey) ?? "");
  }, [storageKey]);

  const setApiKey = useCallback(
    (key: string) => {
      if (key) {
        localStorage.setItem(storageKey, key);
      } else {
        localStorage.removeItem(storageKey);
      }
      setApiKeyState(key);
    },
    [storageKey],
  );

  return {
    apiKey,
    hasApiKey: apiKey.trim().length > 0,
    setApiKey,
  };
}

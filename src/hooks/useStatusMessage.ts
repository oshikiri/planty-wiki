import { useCallback, useState } from "preact/hooks";

type StatusUpdate = string | ((prev: string) => string);
type SetStatusMessage = (message: StatusUpdate) => void;
type StatusLogEntry = {
  message: string;
  timestamp: string;
};

const STATUS_LOG_KEY = "__plantyStatusLog";

/**
 * useStatusMessageはUI表示用のstatusMessageを管理しつつ、履歴をconsoleから参照できるよう記録する。
 *
 * @param initial 初期表示メッセージ
 * @returns [現在のメッセージ, 更新関数]
 */
export function useStatusMessage(initial = ""): [string, SetStatusMessage] {
  const [statusMessage, setStatusMessageState] = useState(initial);
  const setStatusMessage = useCallback<SetStatusMessage>((next) => {
    setStatusMessageState((prev) => {
      const nextValue = typeof next === "function" ? next(prev) : next;
      recordStatusMessage(nextValue);
      return nextValue;
    });
  }, []);
  return [statusMessage, setStatusMessage];
}

function recordStatusMessage(message: string): void {
  const entry: StatusLogEntry = {
    message,
    timestamp: new Date().toISOString(),
  };
  const log = ensureStatusLog();
  log.push(entry);
  if (log.length > 1000) {
    log.shift();
  }
  console.info("[Status]", entry.timestamp, message);
}

function ensureStatusLog(): StatusLogEntry[] {
  const globalScope = globalThis as typeof globalThis & {
    [STATUS_LOG_KEY]?: StatusLogEntry[];
  };
  const existing = globalScope[STATUS_LOG_KEY];
  if (Array.isArray(existing)) {
    return existing;
  }
  const initialized: StatusLogEntry[] = [];
  globalScope[STATUS_LOG_KEY] = initialized;
  return initialized;
}

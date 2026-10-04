import { SYNC_INPUT_LIMITS } from "../../../src/types/sync";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;

export type NoteMutation = {
  noteId: string;
  operationId: string;
  baseVersion: number;
  deleted: boolean;
  path?: string;
  title?: string;
  body?: string;
};

type InvalidRequest = {
  error: "invalid_request";
  field: string;
};

function invalidRequest(field: string): InvalidRequest {
  return { error: "invalid_request", field };
}

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function parseNonNegativeInteger(
  value: string | null,
  field: string,
): number | InvalidRequest {
  if (value === null || !SAFE_INTEGER_PATTERN.test(value)) {
    return invalidRequest(field);
  }

  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) ? numberValue : invalidRequest(field);
}

function normalizeAndValidatePath(value: unknown): string | InvalidRequest {
  if (typeof value !== "string") {
    return invalidRequest("path");
  }

  const path = value.normalize("NFC");
  const segments = path.split("/").slice(1);
  const hasInvalidSegment = segments.some(
    (segment) => segment === "" || segment === "." || segment === "..",
  );

  if (
    !path.startsWith("/pages/") ||
    path.endsWith("/") ||
    hasInvalidSegment ||
    /\p{Cc}/u.test(path) ||
    path.length > SYNC_INPUT_LIMITS.path
  ) {
    return invalidRequest("path");
  }

  return path;
}

export function parseNoteMutation(
  noteIdValue: string | undefined,
  payload: unknown,
): NoteMutation | InvalidRequest {
  if (!isUuidV4(noteIdValue)) {
    return invalidRequest("noteId");
  }

  if (!isRecord(payload)) {
    return invalidRequest("body");
  }

  if (!isUuidV4(payload.operationId)) {
    return invalidRequest("operationId");
  }

  const baseVersion = parseJsonNonNegativeInteger(payload.baseVersion);
  if (baseVersion === null) {
    return invalidRequest("baseVersion");
  }

  if (payload.deleted === true) {
    if ("path" in payload || "title" in payload || "body" in payload) {
      return invalidRequest("deleted");
    }

    return {
      noteId: noteIdValue,
      operationId: payload.operationId,
      baseVersion,
      deleted: true,
    };
  }

  if (
    payload.deleted !== false ||
    typeof payload.path !== "string" ||
    typeof payload.title !== "string" ||
    typeof payload.body !== "string" ||
    payload.title.length === 0 ||
    payload.title.length > SYNC_INPUT_LIMITS.title ||
    payload.body.length > SYNC_INPUT_LIMITS.body
  ) {
    return invalidRequest("body");
  }

  const path = normalizeAndValidatePath(payload.path);
  if (typeof path !== "string") {
    return path;
  }

  return {
    noteId: noteIdValue,
    operationId: payload.operationId,
    baseVersion,
    deleted: false,
    path,
    title: payload.title,
    body: payload.body,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

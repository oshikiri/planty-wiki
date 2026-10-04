import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSyncController } from "./sync-controller";
import type { CloudSyncResult } from "../types/sync";

const idle: CloudSyncResult = { status: "idle", syncedChanges: 0, receivedChanges: 0 };
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("resumes periodic sync after another tab restores authentication", async () => {
  const synchronize = vi
    .fn<() => Promise<CloudSyncResult>>()
    .mockResolvedValueOnce({ ...idle, status: "unauthenticated" })
    .mockResolvedValue(idle);
  const probe = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ready: true })));
  vi.stubGlobal("fetch", probe);
  const controller = createSyncController(synchronize, vi.fn());
  cleanups.push(controller.start());
  await vi.advanceTimersByTimeAsync(0);
  await expect(controller.run()).resolves.toMatchObject({ status: "unauthenticated" });
  expect(synchronize).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0);
  expect(probe).toHaveBeenCalledOnce();
  expect(synchronize).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(synchronize).toHaveBeenCalledTimes(3);
});

it("does not send pending changes until the authentication probe succeeds", async () => {
  const synchronize = vi
    .fn<() => Promise<CloudSyncResult>>()
    .mockResolvedValue({ ...idle, status: "unauthenticated" });
  const probe = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", probe);
  const controller = createSyncController(synchronize, vi.fn());
  cleanups.push(controller.start());
  await vi.advanceTimersByTimeAsync(60_000);
  await controller.run();
  expect(synchronize).toHaveBeenCalledOnce();
  expect(probe).toHaveBeenCalledTimes(2);
});

it("coalesces concurrent synchronization triggers", async () => {
  let complete!: (result: CloudSyncResult) => void;
  const synchronize = vi.fn(
    () =>
      new Promise<CloudSyncResult>((resolve) => {
        complete = resolve;
      }),
  );
  const controller = createSyncController(synchronize, vi.fn());
  const first = controller.run();
  const second = controller.run();
  expect(synchronize).toHaveBeenCalledOnce();
  complete(idle);
  await expect(first).resolves.toEqual(idle);
  await expect(second).resolves.toEqual(idle);
});

it("retries with exponential backoff without periodic sync bypassing the delay", async () => {
  const synchronize = vi
    .fn<() => Promise<CloudSyncResult>>()
    .mockResolvedValue({ ...idle, status: "unavailable" });
  const controller = createSyncController(synchronize, vi.fn());
  cleanups.push(controller.start());
  await vi.advanceTimersByTimeAsync(0);
  expect(synchronize).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(synchronize).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(synchronize).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(27_000);
  expect(synchronize).toHaveBeenCalledTimes(5);
});

// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  saveHistory,
  listHistory,
  historyState,
  deleteHistory,
} from "../history";
import { EMPTY_STATE } from "../stateIO";
describe("local recovery snapshots", () => {
  it("preserves prior data, drops a running timer and supports restore parsing", async () => {
    const state = {
      ...EMPTY_STATE,
      topics: [],
      activeSession: {
        topicId: null,
        mode: "free" as const,
        phase: "work" as const,
        cycle: 0,
        running: true,
        startedAt: 1,
        sessionStartedAt: 1,
        accumulatedMs: 0,
        totalStudyMs: 0,
      },
    };
    const id = await saveHistory(state, "before import");
    const entry = (await listHistory()).find((e) => e.id === id)!;
    expect(historyState(entry)?.activeSession).toBeNull();
    expect(entry.label).toBe("before import");
    expect(state.activeSession).not.toBeNull();
    await deleteHistory(id);
    expect((await listHistory()).some((e) => e.id === id)).toBe(false);
  });
  it("bounds history to eight entries", async () => {
    for (let i = 0; i < 12; i++) await saveHistory(EMPTY_STATE, `version ${i}`);
    const list = await listHistory();
    expect(list).toHaveLength(8);
    await Promise.all(list.map((e) => deleteHistory(e.id)));
  });
});

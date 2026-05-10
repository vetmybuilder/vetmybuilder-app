// tests/web/utils/flushPendingProject.test.ts
//
// Unit tests for the post-auth helper that picks up a guest's draft
// project from sessionStorage, POSTs it under the new uid, and returns
// the URL to navigate to. Used by SignupForm, signup/complete, and
// login.tsx in the engagement-first signup flow.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPendingProject } from "@/utils/flushPendingProject";

const KEY = "vmb:pendingProjectPayload";

function makeApi(post: any) {
  return { post } as any;
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("flushPendingProject", () => {
  it("returns null and does nothing when there's no pending payload", async () => {
    const post = vi.fn();
    const target = await flushPendingProject(makeApi(post));
    expect(target).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("posts the payload, clears storage, and returns the project URL on success", async () => {
    const payload = { name: "Bath refit", type: "Bath", location: "E4" };
    sessionStorage.setItem(KEY, JSON.stringify(payload));

    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: { project: { id: 99 } } });

    const target = await flushPendingProject(makeApi(post));

    expect(post).toHaveBeenCalledWith("/api/projects", payload);
    expect(target).toBe("/projects/99?justCreated=1");
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("clears the payload and returns null when the POST fails", async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ name: "X" }));
    const post = vi.fn().mockRejectedValueOnce(new Error("boom"));

    const target = await flushPendingProject(makeApi(post));

    expect(target).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("returns null when the POST succeeds but the response shape is unexpected", async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ name: "X" }));
    const post = vi.fn().mockResolvedValueOnce({ data: { project: {} } });

    const target = await flushPendingProject(makeApi(post));

    expect(target).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("clears the payload and returns null when JSON.parse fails on a corrupt entry", async () => {
    sessionStorage.setItem(KEY, "not-json");
    const post = vi.fn();

    const target = await flushPendingProject(makeApi(post));

    expect(target).toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});

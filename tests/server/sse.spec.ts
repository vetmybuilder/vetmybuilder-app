import { describe, it, expect, vi, beforeEach } from "vitest";

const { clientsByUser, sseSend, broadcastNotification } = require("../../server/lib/sse");

describe("sse", () => {
  beforeEach(() => {
    clientsByUser.clear();
  });

  describe("sseSend", () => {
    it("writes event and data to the response", () => {
      const chunks: string[] = [];
      const res = { write: (s: string) => chunks.push(s) };

      sseSend(res, "test-event", { hello: "world" });

      expect(chunks[0]).toBe("event: test-event\n");
      expect(chunks[1]).toContain('"hello":"world"');
    });
  });

  describe("broadcastNotification", () => {
    it("sends notification event to all connected clients for a user", () => {
      const chunks1: string[] = [];
      const chunks2: string[] = [];
      const res1 = { write: (s: string) => chunks1.push(s) };
      const res2 = { write: (s: string) => chunks2.push(s) };

      const set = new Set([res1, res2]);
      clientsByUser.set("user-1", set);

      broadcastNotification("user-1", {
        type: "recommendation_new",
        message: "New recommendation",
        projectId: 5,
        linkPath: "/projects/5",
      });

      expect(chunks1.some((c) => c.includes("notification"))).toBe(true);
      expect(chunks1.some((c) => c.includes("New recommendation"))).toBe(true);
      expect(chunks2.some((c) => c.includes("notification"))).toBe(true);
    });

    it("does nothing when user has no connected clients", () => {
      broadcastNotification("no-one", { type: "test", message: "hi" });
      // no error thrown
    });

    it("does not throw when a client write fails", () => {
      const badRes = {
        write: () => { throw new Error("broken pipe"); },
      };
      clientsByUser.set("user-2", new Set([badRes]));

      expect(() =>
        broadcastNotification("user-2", { type: "test", message: "hi" })
      ).not.toThrow();
    });

    it("includes createdAt in the payload", () => {
      const chunks: string[] = [];
      const res = { write: (s: string) => chunks.push(s) };
      clientsByUser.set("user-3", new Set([res]));

      broadcastNotification("user-3", { type: "test", message: "hi" });

      const dataLine = chunks.find((c) => c.startsWith("data:"));
      const payload = JSON.parse(dataLine!.replace("data: ", "").trim());
      expect(payload.createdAt).toBeDefined();
    });
  });
});

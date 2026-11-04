import { describe, expect, it } from "vitest";
import { autoAssign, nextStatus, normalizeSubject, threadKey } from "./thread";

describe("normalizeSubject / threadKey", () => {
  it("strips repeated reply/forward prefixes in any case", () => {
    expect(normalizeSubject("AW: WG: re: Fwd:  Standanfrage Neuss ")).toBe("standanfrage neuss");
  });
  it("joins replies to the same sender's conversation", () => {
    expect(threadKey("AW: Frage zu Standgebühr", "Petra@Example.com")).toBe(
      threadKey("Frage zu Standgebühr", "petra@example.com"),
    );
  });
});

describe("nextStatus", () => {
  it("send → wartet, sendAndClose → erledigt", () => {
    expect(nextStatus("offen", { kind: "send" })).toBe("wartet");
    expect(nextStatus("offen", { kind: "sendAndClose" })).toBe("erledigt");
  });
  it("an incoming reply reopens wartet and erledigt", () => {
    expect(nextStatus("wartet", { kind: "incoming" })).toBe("offen");
    expect(nextStatus("erledigt", { kind: "incoming" })).toBe("offen");
    expect(nextStatus("offen", { kind: "incoming" })).toBe("offen");
  });
  it("manual sets any status", () => {
    expect(nextStatus("offen", { kind: "manual", status: "erledigt" })).toBe("erledigt");
  });
});

describe("autoAssign", () => {
  it("keeps an existing assignee, else takes the sender", () => {
    expect(autoAssign("a", "b")).toBe("a");
    expect(autoAssign(null, "b")).toBe("b");
  });
});

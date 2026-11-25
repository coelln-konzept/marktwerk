import { describe, expect, it } from "vitest";
import { failureCode, NETWORK_ERROR, SERVER_ERROR } from "@/lib/call-action";
import { backDelta } from "@/lib/history-back";
import { isSingleCharacterKey } from "@/lib/single-keys";
import { pushToast, type StackToast } from "@/lib/toast-stack";
import { readUiStateClient } from "@/lib/ui-state";

const entry = (id: number, toast: StackToast) => ({ id, toast });

describe("pushToast (UX-031)", () => {
  it("keeps at most `max`, the newest last", () => {
    let stack = [
      entry(1, { message: "a" }),
      entry(2, { message: "b" }),
      entry(3, { message: "c" }),
    ];
    stack = pushToast(stack, entry(4, { message: "d" }), 3);
    expect(stack.map((e) => e.id)).toEqual([2, 3, 4]);
  });

  it("replaces an earlier toast about the same object", () => {
    const stack = pushToast(
      [entry(1, { message: "„Plakate“ erledigt", key: "task:1" }), entry(2, { message: "other" })],
      entry(3, { message: "Rückgängig gemacht: „Plakate“ erledigt", key: "task:1" }),
      3,
    );
    expect(stack.map((e) => e.id)).toEqual([2, 3]);
  });

  it("shows the same words once, but an error does not replace a success with the same text", () => {
    const stack = pushToast(
      [entry(1, { message: "Besprechung angelegt" }), entry(2, { message: "x", tone: "error" })],
      entry(3, { message: "Besprechung angelegt" }),
      3,
    );
    expect(stack.map((e) => e.id)).toEqual([2, 3]);
    const mixed = pushToast(stack, entry(4, { message: "x" }), 3);
    expect(mixed.map((e) => e.id)).toEqual([2, 3, 4]);
  });
});

describe("backDelta (UX-065)", () => {
  const list = "http://app/kontakte?buchstabe=M";
  const contact = "http://app/kontakte/42";

  it("goes back to the previous page when the history leads there", () => {
    expect(backDelta([list, contact], 1, "/kontakte")).toBe(-1);
  });

  it("skips entries of the current page (tabs, drawers)", () => {
    expect(backDelta([list, contact, `${contact}?tab=notizen`], 2, "/kontakte")).toBe(-2);
  });

  it("is null when the history leads somewhere else or nowhere", () => {
    expect(backDelta(["http://app/kalender", contact], 1, "/kontakte")).toBeNull();
    expect(backDelta([contact], 0, "/kontakte")).toBeNull();
    expect(backDelta([null, contact], 1, "/kontakte")).toBeNull();
  });
});

describe("isSingleCharacterKey (UX-054)", () => {
  const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey", boolean>> = {}) =>
    isSingleCharacterKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

  it("counts letters, digits and symbols without Strg/⌘/Alt", () => {
    for (const k of ["j", "K", "e", "?", "/", "1", "ß"]) expect(key(k)).toBe(true);
  });

  it("leaves modified keys and named keys alone", () => {
    expect(key("k", { ctrlKey: true })).toBe(false);
    expect(key("z", { metaKey: true })).toBe(false);
    expect(key("e", { altKey: true })).toBe(false);
    for (const k of [" ", "Enter", "Escape", "ArrowLeft", "Tab"]) expect(key(k)).toBe(false);
  });
});

describe("failureCode (UX-007)", () => {
  it("is network offline or when the request never got through", () => {
    expect(failureCode(new Error("boom"), false)).toBe(NETWORK_ERROR);
    expect(failureCode(new TypeError("Failed to fetch"), true)).toBe(NETWORK_ERROR);
  });

  it("is server when the server answered with an error", () => {
    expect(
      failureCode(new Error("An unexpected response was received from the server."), true),
    ).toBe(SERVER_ERROR);
  });
});

describe("readUiStateClient (UX-054)", () => {
  it("is true only for the cookie set to 1", () => {
    expect(readUiStateClient("mw_keys_off", "a=1; mw_keys_off=1; b=0")).toBe(true);
    expect(readUiStateClient("mw_keys_off", "mw_keys_off=0")).toBe(false);
    expect(readUiStateClient("mw_keys_off", "x_mw_keys_off=1")).toBe(false);
    expect(readUiStateClient("mw_keys_off", "")).toBe(false);
  });
});

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { safeNext } from "@/server/dev-auto-login";

describe("safeNext", () => {
  it("keeps same-origin paths with their query", () => {
    expect(safeNext("/genehmigungen?genehmigung=abc")).toBe("/genehmigungen?genehmigung=abc");
    expect(safeNext("/")).toBe("/");
  });

  it("refuses targets a browser reads as another origin", () => {
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

describe("proxy", () => {
  it("sends a signed-out visitor to the login page and keeps the query of the page asked for", () => {
    const response = proxy(
      new NextRequest("https://app.example/veranstaltungen/1?aufgabe=2", {
        headers: { host: "app.example" },
      }),
    );
    const target = new URL(response.headers.get("location") as string);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("next")).toBe("/veranstaltungen/1?aufgabe=2");
  });
});

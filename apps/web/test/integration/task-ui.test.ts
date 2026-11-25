import { describe, expect, it } from "vitest";
import { categoryFromSlug, TASK_CATEGORIES, TASK_CATEGORY_SLUGS } from "@/lib/task-ui";

describe("task category slugs (UX-052)", () => {
  it("puts German words in the URL", () => {
    expect(TASK_CATEGORY_SLUGS.permits).toBe("genehmigungen");
    expect(TASK_CATEGORY_SLUGS.office).toBe("buero");
    expect(new Set(Object.values(TASK_CATEGORY_SLUGS)).size).toBe(TASK_CATEGORIES.length);
  });

  it("reads the German slug and, for older links, the English key", () => {
    for (const c of TASK_CATEGORIES) {
      expect(categoryFromSlug(TASK_CATEGORY_SLUGS[c])).toBe(c);
      expect(categoryFromSlug(c)).toBe(c);
    }
  });

  it("ignores missing or unknown values", () => {
    expect(categoryFromSlug(undefined)).toBeUndefined();
    expect(categoryFromSlug("")).toBeUndefined();
    expect(categoryFromSlug("quatsch")).toBeUndefined();
  });
});

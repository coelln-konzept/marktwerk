import { describe, expect, it } from "vitest";
import { descendantIds, folderPath, removeFolder, sortedTree, wouldCycle } from "./folders";

const f = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId });
const folders = [f("a", "Märkte"), f("b", "Neuss", "a"), f("c", "2027", "b"), f("d", "Behörden")];

describe("folder tree", () => {
  it("lists descendants and the path", () => {
    expect(descendantIds(folders, "a").sort()).toEqual(["b", "c"]);
    expect(folderPath(folders, "c").map((x) => x.name)).toEqual(["Märkte", "Neuss", "2027"]);
  });
  it("sorts as an indented tree, alphabetically per level", () => {
    expect(sortedTree(folders).map((x) => `${x.depth}:${x.folder.name}`)).toEqual([
      "0:Behörden",
      "0:Märkte",
      "1:Neuss",
      "2:2027",
    ]);
  });
  it("refuses moving a folder into its own subtree", () => {
    expect(wouldCycle(folders, "a", "c")).toBe(true);
    expect(wouldCycle(folders, "c", "d")).toBe(false);
  });
  it("removing a folder lifts its children to its parent", () => {
    const r = removeFolder(folders, "b");
    expect(r.find((x) => x.id === "c")?.parentId).toBe("a");
    expect(r.some((x) => x.id === "b")).toBe(false);
  });
});

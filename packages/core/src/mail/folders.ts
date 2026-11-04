/** Custom mail folders that can live under folders (Postfach). Pure helpers, no I/O. */
export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
}

export function descendantIds(folders: readonly FolderNode[], id: string): string[] {
  const out: string[] = [];
  const walk = (parent: string) => {
    for (const f of folders) {
      if (f.parentId === parent) {
        out.push(f.id);
        walk(f.id);
      }
    }
  };
  walk(id);
  return out;
}

/** Root → folder, for breadcrumbs ("Märkte › Neuss › 2027"). */
export function folderPath<T extends FolderNode>(folders: readonly T[], id: string): T[] {
  const path: T[] = [];
  let cur = folders.find((f) => f.id === id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? folders.find((f) => f.id === cur?.parentId) : undefined;
  }
  return path;
}

/** Depth-first, alphabetical per level (German collation). */
export function sortedTree<T extends FolderNode>(
  folders: readonly T[],
): { folder: T; depth: number }[] {
  const out: { folder: T; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders
      .filter((x) => x.parentId === parent)
      .sort((a, b) => a.name.localeCompare(b.name, "de"))) {
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** True when moving `id` under `newParentId` would put it inside itself. */
export function wouldCycle(
  folders: readonly FolderNode[],
  id: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false;
  return newParentId === id || descendantIds(folders, id).includes(newParentId);
}

/** Deletes a folder; its subfolders move up to its parent (nothing is lost). */
export function removeFolder<T extends FolderNode>(folders: readonly T[], id: string): T[] {
  const gone = folders.find((f) => f.id === id);
  return folders
    .filter((f) => f.id !== id)
    .map((f) => (f.parentId === id ? { ...f, parentId: gone?.parentId ?? null } : f));
}

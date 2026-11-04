"use client";

import { useDroppable } from "@dnd-kit/core";
import { sortedTree } from "@marktwerk/core";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Folder,
  FolderPlus,
  Inbox,
  type LucideIcon,
  MapPinned,
  MoreHorizontal,
  PenLine,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MailFolder } from "./types";

/** Built-in folders; custom folders use their id (`f-…`). */
export type SystemFolder =
  | "posteingang"
  | "gesendet"
  | "entwuerfe"
  | "standanfragen"
  | "nichterkannt"
  | "spam";
export type FolderKey = SystemFolder | `f-${string}`;

type Editing = { mode: "new"; parentId: string | null } | { mode: "rename"; id: string } | null;

export function FolderNav({
  folders,
  active,
  counts,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  folders: MailFolder[];
  active: FolderKey;
  counts: Record<string, number>;
  onSelect: (key: FolderKey) => void;
  onCreate: (name: string, parentId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (folder: MailFolder) => void;
}) {
  const t = useTranslations("postfach.folders");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const tree = sortedTree(folders).filter(({ folder }) => {
    // hidden when any ancestor is collapsed
    let p = folder.parentId;
    while (p) {
      if (collapsed.has(p)) return false;
      p = folders.find((f) => f.id === p)?.parentId ?? null;
    }
    return true;
  });
  const hasChildren = (id: string) => folders.some((f) => f.parentId === id);

  const system = (key: SystemFolder, Icon: LucideIcon, droppable = false) => (
    <FolderRow
      key={key}
      id={key}
      droppable={droppable}
      label={t(key)}
      icon={Icon}
      count={counts[key] ?? 0}
      active={active === key}
      onClick={() => onSelect(key)}
    />
  );

  const editor = (depth: number, initial: string, onSave: (name: string) => void) => (
    <form
      className="flex items-center gap-1 py-0.5"
      style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
        if (name) onSave(name);
        setEditing(null);
      }}
    >
      <Input
        name="name"
        defaultValue={initial}
        autoFocus
        aria-label={t("name")}
        placeholder={t("namePlaceholder")}
        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
        onBlur={(e) => {
          const name = e.currentTarget.value.trim();
          if (name && name !== initial) onSave(name);
          setEditing(null);
        }}
        className="h-7 text-small"
      />
    </form>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between px-2">
          <h2 className="font-medium text-faint-foreground text-tiny uppercase tracking-wide">
            {t("title")}
          </h2>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("new")}
            title={t("new")}
            onClick={() => setEditing({ mode: "new", parentId: null })}
          >
            <FolderPlus />
          </Button>
        </div>
        {system("posteingang", Inbox, true)}
        {tree.map(({ folder, depth }) =>
          editing?.mode === "rename" && editing.id === folder.id ? (
            <div key={folder.id}>{editor(depth, folder.name, (n) => onRename(folder.id, n))}</div>
          ) : (
            <div key={folder.id}>
              <FolderRow
                id={folder.id}
                droppable
                depth={depth}
                label={folder.name}
                icon={Folder}
                count={counts[folder.id] ?? 0}
                active={active === folder.id}
                onClick={() => onSelect(folder.id as FolderKey)}
                toggle={
                  hasChildren(folder.id)
                    ? {
                        open: !collapsed.has(folder.id),
                        label: collapsed.has(folder.id)
                          ? t("expand", { name: folder.name })
                          : t("collapse", { name: folder.name }),
                        onToggle: () =>
                          setCollapsed((c) => {
                            const n = new Set(c);
                            if (n.has(folder.id)) n.delete(folder.id);
                            else n.add(folder.id);
                            return n;
                          }),
                      }
                    : undefined
                }
                menu={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("menu", { name: folder.name })}
                    aria-expanded={menuFor === folder.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFor((m) => (m === folder.id ? null : folder.id));
                    }}
                    className="opacity-60 hover:opacity-100"
                  >
                    <MoreHorizontal />
                  </Button>
                }
              />
              {menuFor === folder.id && (
                <div
                  className="my-0.5 flex flex-wrap gap-1 rounded-md border bg-card p-1"
                  style={{ marginLeft: `${0.5 + depth * 0.9}rem` }}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing({ mode: "new", parentId: folder.id });
                      setMenuFor(null);
                    }}
                  >
                    {t("newSub")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing({ mode: "rename", id: folder.id });
                      setMenuFor(null);
                    }}
                  >
                    {t("rename")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onDelete(folder);
                      setMenuFor(null);
                    }}
                  >
                    {t("delete")}
                  </Button>
                </div>
              )}
              {editing?.mode === "new" &&
                editing.parentId === folder.id &&
                editor(depth + 1, "", (n) => onCreate(n, folder.id))}
            </div>
          ),
        )}
        {editing?.mode === "new" &&
          editing.parentId === null &&
          editor(0, "", (n) => onCreate(n, null))}
        {system("gesendet", Send)}
        {system("entwuerfe", PenLine)}
      </div>
      <div className="flex flex-col gap-0.5">
        <h2 className="px-2 font-medium text-faint-foreground text-tiny uppercase tracking-wide">
          {t("smart")}
        </h2>
        {system("standanfragen", MapPinned)}
        {system("nichterkannt", CircleAlert)}
        {system("spam", ShieldAlert, true)}
      </div>
    </div>
  );
}

function FolderRow({
  id,
  droppable,
  depth = 0,
  label,
  icon: Icon,
  count,
  active,
  onClick,
  toggle,
  menu,
}: {
  id: string;
  droppable?: boolean;
  depth?: number;
  label: string;
  icon: LucideIcon;
  count: number;
  active: boolean;
  onClick: () => void;
  toggle?: { open: boolean; label: string; onToggle: () => void };
  menu?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder:${id}`, disabled: !droppable });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group flex items-center rounded-md text-small",
        active && "bg-selected font-semibold",
        isOver && "bg-accent-soft ring-2 ring-primary",
      )}
      style={{ paddingLeft: `${depth * 0.9}rem` }}
    >
      {toggle ? (
        <button
          type="button"
          aria-label={toggle.label}
          aria-expanded={toggle.open}
          onClick={toggle.onToggle}
          className="grid size-6 shrink-0 place-items-center rounded hover:bg-hover"
        >
          {toggle.open ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
      ) : (
        <span className="w-6 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-1 text-left hover:bg-hover"
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-muted-foreground tabular-nums">{count || ""}</span>
      </button>
      {menu}
    </div>
  );
}

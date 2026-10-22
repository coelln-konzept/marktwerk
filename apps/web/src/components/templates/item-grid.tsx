"use client";

import { Menu } from "@base-ui/react/menu";
import { offsetLabel } from "@marktwerk/core";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronDown,
  Copy,
  FileText,
  Filter,
  Link2,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  deleteItemAction,
  duplicateItemAction,
  moveItemAction,
} from "@/app/(app)/vorlagen/ablauf/actions";
import { useShell } from "@/components/shell/shell-context";
import { useConfirm } from "@/components/ui/confirm";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TGroup, TH, THead, TR } from "@/components/ui/table";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { PHASES } from "./labels";
import type { ItemView, RoleChoice } from "./types";

const MENU_ITEM =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-none data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-hover";

/**
 * The Excel-like grid of a template version (UX concept §4/§5): rows grouped by phase, one line each with
 * category, anchor + offset, role, time, priority, effort and evidence. A row opens the editor drawer
 * (`?zeile=<key>`); in the draft each row has a menu (up, down, duplicate, delete) instead of dragging.
 * Published and retired versions are shown read-only.
 */
export function ItemGrid({
  versionId,
  editable,
  items,
  roles,
  baseHref,
  selectedKey,
}: {
  versionId: string;
  editable: boolean;
  items: ItemView[];
  roles: RoleChoice[];
  /** Page URL with the version, e.g. `/vorlagen/ablauf/<id>?v=2`. */
  baseHref: string;
  selectedKey: string | undefined;
}) {
  const t = useTranslations("taskTemplates");
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const titleOf = new Map(items.map((i) => [i.key, i.title]));
  const { showToast } = useShell();
  const { confirm, dialog } = useConfirm();
  const [pending, startTransition] = useTransition();

  const href = (key: string) => `${baseHref}&zeile=${encodeURIComponent(key)}`;
  const anchorName = (key: string) =>
    t.has(`anchors.${key}` as never) ? t(`anchors.${key}` as never) : key;
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function minutes(n: number) {
    if (n <= 0) return "–";
    if (n < 60) return t("units.minutes", { n });
    return n % 60 === 0
      ? t("units.hours", { h: n / 60 })
      : t("units.hoursMinutes", { h: Math.floor(n / 60), m: n % 60 });
  }

  function run(work: () => Promise<{ ok: boolean; error?: string }>, message?: string) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) showToast({ message: errorText(result.error ?? "generic") });
      else if (message) showToast({ message });
    });
  }

  async function remove(item: ItemView) {
    const ok = await confirm({
      title: t("delete.title", { title: item.title }),
      description: t("delete.description"),
      confirmLabel: t("delete.confirm"),
      cancelLabel: t("delete.cancel"),
    });
    if (ok)
      run(() => deleteItemAction(versionId, item.key), t("delete.done", { title: item.title }));
  }

  let number = 0;
  return (
    <>
      <KeyboardRows>
        <Table>
          <caption className="sr-only">{t("grid.caption")}</caption>
          <THead>
            <tr>
              <TH className="w-10 text-right">#</TH>
              <TH>{t("grid.cols.title")}</TH>
              <TH>{t("grid.cols.category")}</TH>
              <TH>{t("grid.cols.due")}</TH>
              <TH>{t("grid.cols.time")}</TH>
              <TH>{t("grid.cols.role")}</TH>
              <TH>{t("grid.cols.priority")}</TH>
              {isModuleVisible("estimates") && (
                <TH className="text-right">{t("grid.cols.effort")}</TH>
              )}
              <TH>{t("grid.cols.evidence")}</TH>
              <TH>
                <span className="sr-only">{t("grid.cols.actions")}</span>
              </TH>
            </tr>
          </THead>
          {PHASES.map((phase) => {
            const rows = items.filter((i) => i.phase === phase);
            const total = rows.reduce((sum, r) => sum + r.estimateMinutes, 0);
            return (
              <tbody key={phase}>
                <TGroup colSpan={10}>
                  {t(`phases.${phase}`)} · {t("grid.count", { count: rows.length })}
                  {total > 0 && isModuleVisible("estimates") && <> · {minutes(total)}</>}
                </TGroup>
                {rows.map((item, indexInPhase) => {
                  number += 1;
                  const deps = item.dependsOnKeys.map((k) => titleOf.get(k) ?? k);
                  const conditionText = [
                    ...(item.condition?.eventTypeKeys ?? []),
                    ...(item.condition?.venueKinds ?? []).map((k) =>
                      t.has(`venueKinds.${k}` as never) ? t(`venueKinds.${k}` as never) : k,
                    ),
                    ...((item.condition?.venueIds ?? []).length > 0 ? [t("grid.venues")] : []),
                  ].join(", ");
                  return (
                    <TR
                      key={item.key}
                      tabIndex={0}
                      data-row
                      data-href={href(item.key)}
                      aria-selected={selectedKey === item.key}
                      className="outline-none focus-visible:bg-selected"
                    >
                      <TD className="tabular w-10 text-right text-muted-foreground">{number}</TD>
                      <TD className="min-w-56 max-w-96">
                        <Link
                          href={href(item.key) as never}
                          scroll={false}
                          tabIndex={-1}
                          className="font-semibold text-accent-soft-foreground hover:underline"
                        >
                          {item.title}
                        </Link>
                        {item.isKey && (
                          <span
                            className="ml-1.5 inline-flex align-middle text-muted-foreground"
                            title={t("grid.keyTask")}
                          >
                            <Star aria-hidden className="size-3.5" />
                            <span className="sr-only">{t("grid.keyTask")}</span>
                          </span>
                        )}
                        <span className="ml-2 inline-flex items-center gap-2 align-middle text-muted-foreground text-tiny">
                          {item.checkItems.length > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5"
                              title={t("grid.checkItems", { count: item.checkItems.length })}
                            >
                              <ListChecks aria-hidden className="size-3.5" />
                              {item.checkItems.length}
                              <span className="sr-only">
                                {t("grid.checkItems", { count: item.checkItems.length })}
                              </span>
                            </span>
                          )}
                          {deps.length > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5"
                              title={t("grid.dependsOn", { titles: deps.join(", ") })}
                            >
                              <Link2 aria-hidden className="size-3.5" />
                              {deps.length}
                              <span className="sr-only">
                                {t("grid.dependsOn", { titles: deps.join(", ") })}
                              </span>
                            </span>
                          )}
                          {conditionText && (
                            <span
                              className="inline-flex items-center"
                              title={t("grid.onlyFor", { what: conditionText })}
                            >
                              <Filter aria-hidden className="size-3.5" />
                              <span className="sr-only">
                                {t("grid.onlyFor", { what: conditionText })}
                              </span>
                            </span>
                          )}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap">{t(`categories.${item.category}`)}</TD>
                      <TD className="whitespace-nowrap">
                        <span className="tabular font-medium">{offsetLabel(item.offsetDays)}</span>{" "}
                        <span className="text-muted-foreground">
                          {anchorName(item.anchorKey)}
                          {item.dayMode === "business" && <> · {t("grid.businessDays")}</>}
                        </span>
                      </TD>
                      <TD className="tabular whitespace-nowrap">
                        {item.dueTime ?? (
                          <span className="text-faint-foreground">{t("grid.defaultTime")}</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {item.dutyRoleId ? (
                          (roleName.get(item.dutyRoleId) ?? "?")
                        ) : (
                          <span className="text-faint-foreground">–</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {item.priority === "high" ? (
                          <StatusBadge tone="warn" icon={ArrowUp}>
                            {t("priorities.high")}
                          </StatusBadge>
                        ) : item.priority === "low" ? (
                          <StatusBadge tone="neutral" icon={ArrowDown}>
                            {t("priorities.low")}
                          </StatusBadge>
                        ) : (
                          <span className="text-muted-foreground">{t("priorities.normal")}</span>
                        )}
                      </TD>
                      {isModuleVisible("estimates") && (
                        <TD className="tabular whitespace-nowrap text-right">
                          {minutes(item.estimateMinutes)}
                        </TD>
                      )}
                      <TD>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          {item.requiresPhoto && (
                            <span title={t("evidence.photo")}>
                              <Camera aria-hidden className="size-4" />
                              <span className="sr-only">{t("evidence.photo")}</span>
                            </span>
                          )}
                          {item.requiresNote && (
                            <span title={t("evidence.note")}>
                              <FileText aria-hidden className="size-4" />
                              <span className="sr-only">{t("evidence.note")}</span>
                            </span>
                          )}
                          {item.requiresAttachment && (
                            <span title={t("evidence.attachment")}>
                              <Paperclip aria-hidden className="size-4" />
                              <span className="sr-only">{t("evidence.attachment")}</span>
                            </span>
                          )}
                          {!item.requiresPhoto &&
                            !item.requiresNote &&
                            !item.requiresAttachment &&
                            "–"}
                        </span>
                      </TD>
                      <TD className="w-12">
                        <Menu.Root>
                          <Menu.Trigger
                            aria-label={t("grid.rowMenu", { title: item.title })}
                            aria-busy={pending}
                            className="grid size-7 cursor-pointer place-items-center rounded-md opacity-60 hover:bg-hover hover:opacity-100 focus-visible:opacity-100 group-hover/row:opacity-100"
                          >
                            <MoreHorizontal aria-hidden className="size-4" />
                          </Menu.Trigger>
                          <Menu.Portal>
                            <Menu.Positioner
                              side="bottom"
                              align="end"
                              sideOffset={4}
                              className="z-50"
                            >
                              <Menu.Popup className="flex min-w-48 flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-none">
                                <Menu.LinkItem
                                  className={MENU_ITEM}
                                  render={<Link href={href(item.key) as never} scroll={false} />}
                                >
                                  <Pencil aria-hidden className="size-4 text-muted-foreground" />
                                  {editable ? t("menu.edit") : t("menu.view")}
                                </Menu.LinkItem>
                                {editable && (
                                  <>
                                    <Menu.Item
                                      className={MENU_ITEM}
                                      disabled={indexInPhase === 0}
                                      onClick={() =>
                                        run(() => moveItemAction(versionId, item.key, "up"))
                                      }
                                    >
                                      <ArrowUp
                                        aria-hidden
                                        className="size-4 text-muted-foreground"
                                      />
                                      {t("menu.up")}
                                    </Menu.Item>
                                    <Menu.Item
                                      className={MENU_ITEM}
                                      disabled={indexInPhase === rows.length - 1}
                                      onClick={() =>
                                        run(() => moveItemAction(versionId, item.key, "down"))
                                      }
                                    >
                                      <ChevronDown
                                        aria-hidden
                                        className="size-4 text-muted-foreground"
                                      />
                                      {t("menu.down")}
                                    </Menu.Item>
                                    <Menu.Item
                                      className={MENU_ITEM}
                                      onClick={() =>
                                        run(
                                          () => duplicateItemAction(versionId, item.key),
                                          t("menu.duplicated", { title: item.title }),
                                        )
                                      }
                                    >
                                      <Copy aria-hidden className="size-4 text-muted-foreground" />
                                      {t("menu.duplicate")}
                                    </Menu.Item>
                                    <Menu.Separator className="my-1 h-px bg-border" />
                                    <Menu.Item
                                      className={cn(MENU_ITEM, "text-status-critical")}
                                      onClick={() => remove(item)}
                                    >
                                      <Trash2 aria-hidden className="size-4" />
                                      {t("menu.delete")}
                                    </Menu.Item>
                                  </>
                                )}
                              </Menu.Popup>
                            </Menu.Positioner>
                          </Menu.Portal>
                        </Menu.Root>
                      </TD>
                    </TR>
                  );
                })}
                {editable && (
                  <tr className="border-border-subtle border-b last:border-b-0">
                    <td colSpan={10} className="px-3 py-1">
                      <Link
                        href={`${baseHref}&zeile=neu&phase=${phase}` as never}
                        scroll={false}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 font-medium text-accent-soft-foreground hover:bg-hover"
                      >
                        <Plus aria-hidden className="size-4" />
                        {t("grid.add", { phase: t(`phases.${phase}`) })}
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </Table>
      </KeyboardRows>
      {dialog}
    </>
  );
}

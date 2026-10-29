"use server";

import { getLocale } from "next-intl/server";
import { isModuleHidden } from "@/lib/modules";
import { getActor } from "./actor";
import { type SearchHit, type SearchResult, searchAs } from "./search-core";

/** Command palette search (server action): the signed-in person's own permissions and scopes apply. */
export async function searchEverything(query: string): Promise<SearchResult> {
  const exclude: SearchHit["kind"][] = [];
  if (isModuleHidden("finance")) exclude.push("payable");
  if (isModuleHidden("team")) exclude.push("staff");
  return searchAs(await getActor(), await getLocale(), query, exclude);
}

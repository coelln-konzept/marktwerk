"use server";

import { getLocale } from "next-intl/server";
import { getActor } from "./actor";
import { type SearchHit, searchAs } from "./search-core";

/** Command palette search (server action): the signed-in person's own permissions and scopes apply. */
export async function searchEverything(query: string): Promise<SearchHit[]> {
  return searchAs(await getActor(), await getLocale(), query);
}

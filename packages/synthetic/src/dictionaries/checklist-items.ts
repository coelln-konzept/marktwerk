import type {
  AnchorKey,
  DutyRoleKey,
  EventTypeKey,
  TaskCategory,
  TaskPhase,
  TaskPriority,
  TemplateItemScope,
  TemplatePermitType,
} from "../types";

/*
 * Checklists from the client's own sheets (research 13 §1, November 2026): the Grundvorlage (the common core of
 * §1.3), the four markets that sent a sheet (Altstadt, Riehler Gürtel, Nippes, Hoffnungsthal) as owned copies of
 * it with their additions, and assumed additions for every other market until its sheet arrives.
 *
 * Shape (decided 2026-11-13): a heading with an offset is a task; its sub-lines are child items (subtasks,
 * ADR 0021, one level), which take the parent's duty role and due date unless the sheet says otherwise. Every
 * market-day line is its own task (phase `live`, on that market day, with its own duty role).
 * Units: months are 30-day steps; hours become a day offset plus a due time (research 13 §1.2).
 * Privacy: authority types (Stadt, DRK, Ortsring) are kept; private firms named in the sheets get fictional names.
 */

/**
 * The duty roles of the sheets' market-day lines (research 13 §4, part C added the four new roles):
 * - Einweisung → `briefing`
 * - Tageswache „Ordner“ → `steward`
 * - Nachtwache → `night_watch`
 * - Verkehr (regeln, Abflattern, Verkehrssicherung) → `traffic`
 * - Nachkassieren → `cash` (Kasse fits; no new role needed)
 */
export const CLIENT_DUTY = {
  briefing: "briefing",
  steward: "steward",
  nightWatch: "night_watch",
  traffic: "traffic",
  collection: "cash",
} as const satisfies Record<string, DutyRoleKey>;

/**
 * Season items (research 13 §1.2 kind 1, §6): "Termine planen" and "Genehmigung" happen once per market and
 * season, relative to its first date. They are template items with `scope: "season"` on the season anchor
 * `seasonStart`, and become tasks of the market's Saison record (`Task.seasonId`), not of an event. The UI labels
 * them "<Markt> · Saison <Jahr>", so the title carries no prefix. Their stable keys keep the `saison_` prefix they
 * had while the first event carried them (interim until R18), so existing tasks still match their items.
 */
export const SEASON_KEY_PREFIX = "saison_";

/** Description of the items a market without its own sheet gets on top of the Grundvorlage. */
export const ASSUMPTION_NOTE = "Annahme – vom Team noch nicht bestätigt";

export interface DueBlueprint {
  anchorKey: AnchorKey;
  /** Days relative to the anchor; negative = before. */
  offsetDays: number;
  /** Berlin wall-clock time; null = the company's default due time (09:00). */
  dueTime: string | null;
}

export interface ChildBlueprint {
  /** Suffix of the stable key: the child's key is `<parent key>__<key>`. */
  key: string;
  title: string;
  estimateMinutes: number;
  /** Own duty role; absent = the parent's. */
  dutyRoleKey?: DutyRoleKey;
  /** Own due date (`own_due`); absent = the parent's. */
  due?: DueBlueprint;
  permitType?: TemplatePermitType;
  description?: string;
}

export interface ItemBlueprint extends DueBlueprint {
  key: string;
  title: string;
  description?: string;
  phase: TaskPhase;
  category: TaskCategory;
  dutyRoleKey: DutyRoleKey;
  priority: TaskPriority;
  estimateMinutes: number;
  requiresPhoto?: boolean;
  /** Kernaufgabe. */
  isKey?: boolean;
  permitType?: TemplatePermitType;
  scope?: TemplateItemScope;
  children?: readonly ChildBlueprint[];
}

type Draft = Omit<ItemBlueprint, "anchorKey" | "dueTime" | "priority"> &
  Partial<Pick<ItemBlueprint, "anchorKey" | "dueTime" | "priority">>;

function item(draft: Draft): ItemBlueprint {
  return { anchorKey: "eventDay", dueTime: null, priority: "normal", ...draft };
}

/** A season item (see SEASON_KEY_PREFIX): due relative to the season's first date; the key gets its prefix here. */
function seasonItem(draft: Draft): ItemBlueprint {
  return item({
    anchorKey: "seasonStart",
    ...draft,
    key: `${SEASON_KEY_PREFIX}${draft.key}`,
    scope: "season",
  });
}

/** A line of the market day (phase `live`), on the first day unless `anchorKey` says otherwise. */
function marketDay(draft: Omit<Draft, "phase" | "offsetDays">): ItemBlueprint {
  return item({ phase: "live", offsetDays: 0, ...draft });
}

/* ------------------------------------------------------------------------------------- Grundvorlage */

const TERMINE_PLANEN = seasonItem({
  key: "termine_planen",
  title: "Termine planen",
  phase: "pre",
  category: "general",
  offsetDays: -240, // 8 months before the first date of the season
  dutyRoleKey: "market_lead",
  priority: "high",
  estimateMinutes: 120,
  isKey: true,
  children: [
    { key: "rhythmus", title: "Rhythmus festlegen (z. B. monatlich)", estimateMinutes: 30 },
    { key: "notiz", title: "Notiz zur Terminwahl anlegen", estimateMinutes: 15 },
  ],
});

const GENEHMIGUNG = seasonItem({
  key: "genehmigung",
  title: "Genehmigung beantragen",
  phase: "pre",
  category: "permits",
  offsetDays: -180, // 6 months before the first date of the season
  dutyRoleKey: "permits",
  priority: "high",
  estimateMinutes: 120,
  isKey: true,
  permitType: "market_permit",
  children: [
    { key: "antrag", title: "Antrag bei der Stadt stellen", estimateMinutes: 90 },
    {
      key: "festsetzung",
      title: "Festsetzung prüfen und Gebühr als Zahlung anlegen",
      estimateMinutes: 20,
      permitType: "market_fixing",
    },
  ],
});

const SCHICHTPLAN = item({
  key: "schichtplan",
  title: "Schichtplan erstellen",
  phase: "pre",
  category: "staff",
  offsetDays: -60,
  dutyRoleKey: "market_lead",
  estimateMinutes: 60,
  isKey: true,
});

const EINZEICHNEN = item({
  key: "einzeichnen",
  title: "Standplätze einzeichnen",
  phase: "pre",
  category: "logistics",
  offsetDays: -1,
  dutyRoleKey: "setup_crew",
  estimateMinutes: 120,
});

const BRINGTO_EINLADEN = item({
  key: "bringto_einladen",
  title: "Bringto einladen",
  phase: "pre",
  category: "logistics",
  offsetDays: -1,
  dutyRoleKey: "setup_crew",
  estimateMinutes: 90,
  isKey: true,
});

const EINWEISEN = marketDay({
  key: "einweisen",
  title: "Aussteller einweisen",
  category: "logistics",
  dueTime: "07:00",
  dutyRoleKey: CLIENT_DUTY.briefing,
  estimateMinutes: 120,
});

const TAGESWACHE = marketDay({
  key: "tageswache_ordner",
  title: "Tageswache „Ordner“ stellen",
  category: "staff",
  dueTime: "08:00",
  dutyRoleKey: CLIENT_DUTY.steward,
  estimateMinutes: 480,
});

const NACHKASSIEREN = marketDay({
  key: "nachkassieren",
  title: "Standgebühren nachkassieren",
  category: "finance",
  dueTime: "10:00",
  dutyRoleKey: CLIENT_DUTY.collection,
  estimateMinutes: 90,
});

const FLYER_VERTEILEN = marketDay({
  key: "flyer_verteilen",
  title: "Flyer verteilen",
  category: "communication",
  dueTime: "11:00",
  dutyRoleKey: "communication",
  estimateMinutes: 60,
});

const REINIGUNG = marketDay({
  key: "reinigung",
  title: "Platz reinigen",
  category: "logistics",
  dueTime: "17:00",
  dutyRoleKey: "setup_crew",
  estimateMinutes: 90,
  requiresPhoto: true,
});

const NACHBEREITUNG = item({
  key: "nachbereitung",
  title: "Nachbereitung",
  phase: "post",
  category: "general",
  anchorKey: "teardownDay", // the day after the last market day
  offsetDays: 1,
  dutyRoleKey: "market_lead",
  estimateMinutes: 30,
  children: [
    { key: "ausladen", title: "Bus ausladen", estimateMinutes: 60, dutyRoleKey: "setup_crew" },
    {
      key: "vorbuchungen",
      title: "Vorbuchungen organisieren",
      estimateMinutes: 45,
      dutyRoleKey: "office",
    },
    {
      key: "verbesserungen",
      title: "Verbesserungsvorschläge sammeln und in marktwerk übernehmen",
      estimateMinutes: 20,
    },
  ],
});

/** The master ("Grundvorlage"): the items all four client sheets share (research 13 §1.3). */
export const GRUNDVORLAGE: readonly ItemBlueprint[] = [
  TERMINE_PLANEN,
  GENEHMIGUNG,
  SCHICHTPLAN,
  EINZEICHNEN,
  BRINGTO_EINLADEN,
  EINWEISEN,
  TAGESWACHE,
  NACHKASSIEREN,
  FLYER_VERTEILEN,
  REINIGUNG,
  NACHBEREITUNG,
];

/* --------------------------------------------------------------- items the markets add to the core */

const VERKEHR_REGELN = marketDay({
  key: "verkehr_regeln",
  title: "Verkehr regeln",
  category: "logistics",
  dueTime: "07:00",
  dutyRoleKey: CLIENT_DUTY.traffic,
  estimateMinutes: 240,
});

const ABFLATTERN_VERKEHR = item({
  key: "abflattern_verkehr",
  title: "Abflattern und Verkehr vorbereiten",
  phase: "pre",
  category: "logistics",
  offsetDays: -1,
  dutyRoleKey: CLIENT_DUTY.traffic,
  estimateMinutes: 120,
});

const PVBT_WERBUNG_AUFHAENGEN = item({
  key: "pvbt_werbung_aufhaengen",
  title: "PVBT und Werbung aufhängen",
  phase: "pre",
  category: "logistics",
  offsetDays: -6,
  dutyRoleKey: "setup_crew",
  estimateMinutes: 180,
  children: [
    { key: "pvbt", title: "PVBT (Parkverbotsschilder) aufstellen", estimateMinutes: 90 },
    { key: "hohlkammerplatten", title: "Hohlkammerplatten aufhängen", estimateMinutes: 60 },
  ],
});

const PVBT_WERBUNG_ABHAENGEN = marketDay({
  key: "pvbt_werbung_abhaengen",
  title: "PVBT und Werbung abhängen",
  category: "logistics",
  dueTime: "17:00",
  dutyRoleKey: "setup_crew",
  estimateMinutes: 90,
});

const LEIHSTAENDE_AUFBAUEN = item({
  key: "leihstaende_aufbauen",
  title: "Leihstände aufbauen",
  phase: "pre",
  category: "logistics",
  offsetDays: -1,
  dutyRoleKey: "setup_crew",
  estimateMinutes: 180,
});

const LEIHSTAENDE_ABBAUEN = marketDay({
  key: "leihstaende_abbauen",
  title: "Leihstände abbauen",
  category: "logistics",
  anchorKey: "teardownDay",
  dueTime: "17:00",
  dutyRoleKey: "setup_crew",
  estimateMinutes: 120,
});

const STROM_WASSER_ABBAUEN = marketDay({
  key: "strom_wasser_abbauen",
  title: "Strom und Wasser abbauen",
  category: "logistics",
  anchorKey: "teardownDay",
  dueTime: "17:30",
  dutyRoleKey: "water_power",
  estimateMinutes: 60,
});

const NACHTWACHE = marketDay({
  key: "nachtwache",
  title: "Nachtwache stellen",
  category: "staff",
  dueTime: "20:00", // the night after the first market day
  dutyRoleKey: CLIENT_DUTY.nightWatch,
  estimateMinutes: 600,
});

const STANDROHR_BESTELLEN = item({
  key: "standrohr_bestellen",
  title: "Standrohr bestellen",
  phase: "pre",
  category: "logistics",
  offsetDays: -30,
  dutyRoleKey: "water_power",
  estimateMinutes: 20,
  permitType: "water", // ordering the standpipe is the application at the water supplier (part C)
  children: [{ key: "abholtermin", title: "Abholtermin vereinbaren", estimateMinutes: 10 }],
});

const WERBUNG_AUFHAENGEN = item({
  key: "werbung_aufhaengen",
  title: "Werbung aufhängen",
  phase: "pre",
  category: "communication",
  offsetDays: -30,
  dutyRoleKey: "setup_crew",
  estimateMinutes: 240,
  children: [
    {
      key: "aufkleber",
      title: "Hohlkammerplatten mit den Aufklebern der Stadt bekleben",
      estimateMinutes: 45,
    },
    { key: "banner", title: "Banner aufhängen", estimateMinutes: 60 },
    { key: "hohlkammerplatten", title: "Hohlkammerplatten aufhängen", estimateMinutes: 120 },
  ],
});

const STROM_WASSER_ORGANISIEREN = item({
  key: "strom_wasser_organisieren",
  title: "Strom und Wasser organisieren",
  phase: "pre",
  category: "logistics",
  offsetDays: -7,
  dutyRoleKey: "water_power",
  estimateMinutes: 60,
  children: [
    { key: "bedarf", title: "Strombedarf der Aussteller abfragen", estimateMinutes: 30 },
    { key: "bringto", title: "Kabel und Verteiler in die Bringto übernehmen", estimateMinutes: 15 },
  ],
});

/** A copy of a day-1 line for the last market day of a multi-day market. */
function lastDay(day1: ItemBlueprint): ItemBlueprint {
  return {
    ...day1,
    key: `${day1.key}_letzter_tag`,
    title: `${day1.title} (letzter Tag)`,
    anchorKey: "teardownDay",
  };
}

/* ------------------------------------------------------------------------------ building templates */

const PHASE_ORDER: Record<TaskPhase, number> = { pre: 0, live: 1, post: 2 };

/** Position on the timeline: teardown-day items sit after first-day items with the same offset. */
function position(blueprint: ItemBlueprint): number {
  return blueprint.offsetDays + (blueprint.anchorKey === "teardownDay" ? 0.5 : 0);
}

/** Template order: season items first, then by phase, day and due time (stable for ties). */
function timeline(items: readonly ItemBlueprint[]): ItemBlueprint[] {
  return items
    .map((blueprint, index) => ({ blueprint, index }))
    .sort((a, b) => {
      const scope =
        Number((a.blueprint.scope ?? "event") === "event") -
        Number((b.blueprint.scope ?? "event") === "event");
      if (scope !== 0) return scope;
      const phase = PHASE_ORDER[a.blueprint.phase] - PHASE_ORDER[b.blueprint.phase];
      if (phase !== 0) return phase;
      const day = position(a.blueprint) - position(b.blueprint);
      if (day !== 0) return day;
      const time = (a.blueprint.dueTime ?? "09:00").localeCompare(b.blueprint.dueTime ?? "09:00");
      return time !== 0 ? time : a.index - b.index;
    })
    .map(({ blueprint }) => blueprint);
}

interface MasterEdit {
  /** Changes to Grundvorlage items, by key (the key itself stays, so the item is still "the same"). */
  change?: Readonly<Record<string, Partial<Omit<ItemBlueprint, "key">>>>;
  /** Grundvorlage items this market does not have. */
  drop?: readonly string[];
  add?: readonly ItemBlueprint[];
}

/** A market's own copy of the Grundvorlage with its changes and additions, in timeline order. */
function fromMaster(edit: MasterEdit): ItemBlueprint[] {
  const masterKeys = new Set(GRUNDVORLAGE.map((blueprint) => blueprint.key));
  for (const key of [...Object.keys(edit.change ?? {}), ...(edit.drop ?? [])]) {
    if (!masterKeys.has(key)) throw new Error(`Unknown Grundvorlage item ${key}`);
  }
  const kept = GRUNDVORLAGE.filter((blueprint) => !edit.drop?.includes(blueprint.key)).map(
    (blueprint) => ({ ...blueprint, ...edit.change?.[blueprint.key] }),
  );
  return timeline([...kept, ...(edit.add ?? [])]);
}

/* ------------------------------------------------------------------------- the four client sheets */

/** The markets that sent their own sheet (research 13 §1.4), by the preset key part A gives them. */
export type ClientMarketKey = "altstadt" | "riehler-guertel" | "nippes" | "hoffnungsthal";

/** Altstadt, 2–3 days ("altstadt 2 day event"). */
const ALTSTADT = fromMaster({
  change: {
    [GENEHMIGUNG.key]: { offsetDays: -210 }, // 7 months
    einweisen: { title: "Aussteller einweisen (1. Tag)" },
    tageswache_ordner: { title: "Tageswache „Ordner“ stellen (1. Tag)" },
    nachkassieren: { title: "Standgebühren nachkassieren (1. Tag)" },
    flyer_verteilen: { title: "Flyer verteilen (1. Tag)" },
    reinigung: { anchorKey: "teardownDay" }, // only after the last day
  },
  drop: ["bringto_einladen"], // part of "Orga am Vortag" here
  add: [
    item({
      key: "elektriker_termin",
      title: "Termin an den Elektriker (Elektro Wendler) weitergeben",
      description: "Zeitpunkt steht nicht in der Checkliste; angenommen drei Monate vorher.",
      phase: "pre",
      category: "logistics",
      offsetDays: -90,
      dutyRoleKey: "water_power",
      estimateMinutes: 15,
    }),
    item({
      key: "orga_vortag",
      title: "Orga am Vortag",
      phase: "pre",
      category: "logistics",
      offsetDays: -1,
      dutyRoleKey: "market_lead",
      estimateMinutes: 30,
      children: [
        {
          key: "strom_wasser",
          title: "Strom und Wasser organisieren",
          estimateMinutes: 60,
          dutyRoleKey: "water_power",
        },
        {
          key: "bringto",
          title: "Bringto einladen",
          estimateMinutes: 90,
          dutyRoleKey: "setup_crew",
        },
      ],
    }),
    LEIHSTAENDE_AUFBAUEN,
    ABFLATTERN_VERKEHR,
    { ...VERKEHR_REGELN, title: "Verkehr regeln (1. Tag)" },
    NACHTWACHE,
    lastDay(EINWEISEN),
    lastDay(TAGESWACHE),
    lastDay(NACHKASSIEREN),
    lastDay(FLYER_VERTEILEN),
    lastDay(VERKEHR_REGELN),
    LEIHSTAENDE_ABBAUEN,
    STROM_WASSER_ABBAUEN,
  ],
});

/** Riehler Gürtel ("riehler gürtel"). */
const RIEHLER_GUERTEL = fromMaster({
  add: [PVBT_WERBUNG_AUFHAENGEN, ABFLATTERN_VERKEHR, PVBT_WERBUNG_ABHAENGEN],
});

/** Nippes, Wilhelmplatz ("nippes 1 day event"): nothing the day before; marked out on the morning. */
const NIPPES = fromMaster({
  change: {
    einzeichnen: { phase: "live", offsetDays: 0, dueTime: "05:30" },
  },
  drop: ["bringto_einladen"],
  add: [
    item({
      key: "material_transport",
      title: "Transport des Materials fürs Wochenende organisieren",
      phase: "pre",
      category: "logistics",
      offsetDays: -7,
      dutyRoleKey: "setup_crew",
      estimateMinutes: 30,
    }),
    VERKEHR_REGELN,
  ],
});

/** Hoffnungsthal ("hoffnungsthal - 1 day event", the newer sheet): co-organised with the Ortsring. */
const HOFFNUNGSTHAL = fromMaster({
  change: {
    [TERMINE_PLANEN.key]: {
      offsetDays: -350,
      children: [
        { key: "notiz", title: "Notiz zur Terminwahl anlegen", estimateMinutes: 15 },
        { key: "ortsring", title: "Termin mit dem Ortsring abstimmen", estimateMinutes: 30 },
      ],
    },
    [GENEHMIGUNG.key]: {
      title: "Anträge stellen",
      children: [
        { key: "antrag", title: "Antrag bei der Stadt stellen", estimateMinutes: 90 },
        {
          key: "festsetzung",
          title: "Festsetzung prüfen und Gebühr als Zahlung anlegen",
          estimateMinutes: 20,
          permitType: "market_fixing",
        },
        {
          key: "plakatierung",
          title: "Plakatierung beantragen",
          estimateMinutes: 30,
          permitType: "signage",
        },
      ],
    },
    flyer_verteilen: { title: "Flyer verteilen und Festplätze fürs nächste Jahr prüfen" },
  },
  drop: ["tageswache_ordner"], // not on this sheet
  add: [
    item({
      key: "termin_bestaetigen",
      title: "Termin von „geplant“ auf „bestätigt“ setzen",
      description: "Neue Termine starten als „geplant“.",
      phase: "pre",
      category: "general",
      offsetDays: -180,
      dutyRoleKey: "market_lead",
      estimateMinutes: 30,
      children: [
        { key: "abstimmen", title: "Mit Stadt und Ortsring sprechen", estimateMinutes: 30 },
        { key: "status", title: "Status auf „bestätigt“ ändern", estimateMinutes: 5 },
      ],
    }),
    item({
      key: "verkehrssicherung_beauftragen",
      title: "Verkehrssicherung beauftragen",
      phase: "pre",
      category: "logistics",
      offsetDays: -180,
      dutyRoleKey: CLIENT_DUTY.traffic,
      estimateMinutes: 30,
      children: [
        { key: "anfragen", title: "Signalbau Lindner anfragen", estimateMinutes: 15 },
        { key: "bestaetigung", title: "Auftragsbestätigung anfordern", estimateMinutes: 10 },
      ],
    }),
    item({
      key: "schule_toiletten",
      title: "Schule fragen, ob wir die Toiletten wieder nutzen dürfen",
      phase: "pre",
      category: "logistics",
      offsetDays: -120,
      dutyRoleKey: "market_lead",
      estimateMinutes: 20,
      children: [
        {
          key: "hausmeister",
          title: "Telefonnummer des Hausmeisters erfragen",
          estimateMinutes: 5,
        },
      ],
    }),
    item({
      key: "drk_anfragen",
      title: "DRK-Sanitätsdienst anfragen",
      phase: "pre",
      category: "general",
      offsetDays: -90,
      dutyRoleKey: "market_lead",
      estimateMinutes: 20,
      children: [
        { key: "mail", title: "DRK per Mail anfragen", estimateMinutes: 10 },
        { key: "bestaetigen", title: "Einsatz mit dem DRK bestätigen", estimateMinutes: 10 },
      ],
    }),
    item({
      key: "druckwerbung",
      title: "Druckwerbung vorbereiten",
      phase: "pre",
      category: "communication",
      offsetDays: -90,
      dutyRoleKey: "communication",
      estimateMinutes: 60,
      children: [
        { key: "banner_pruefen", title: "Banner prüfen: noch in Ordnung?", estimateMinutes: 15 },
        { key: "plakatdatum", title: "Datum auf den Plakaten ändern", estimateMinutes: 30 },
        {
          key: "hohlkammerplatten",
          title: "Hohlkammerplatten bestellen",
          estimateMinutes: 20,
        },
        {
          key: "festplatzschilder",
          title: "Festplatz-Schilder bestellen oder vom Vorjahr prüfen",
          estimateMinutes: 20,
        },
        {
          key: "bannerdatum",
          title: "Buchstaben fürs Banner-Datum bei Schilder Reuter bestellen (Versalhöhe)",
          estimateMinutes: 20,
        },
      ],
    }),
    item({
      key: "schaustellerliste",
      title: "Liste der aktuellen Schausteller an die Stadt senden",
      phase: "pre",
      category: "permits",
      offsetDays: -60,
      dutyRoleKey: "permits",
      estimateMinutes: 30,
      permitType: "other", // the Schaustellerliste permit of the market (part C)
    }),
    WERBUNG_AUFHAENGEN,
    STANDROHR_BESTELLEN,
    item({
      key: "toilettenschluessel",
      title: "Termin für die Toilettenschlüssel mit dem Hausmeister vereinbaren",
      phase: "pre",
      category: "logistics",
      offsetDays: -14,
      dutyRoleKey: "market_lead",
      estimateMinutes: 10,
    }),
    item({
      key: "ortsring_bedarf",
      title: "Mit dem Ortsring klären, was er braucht (Strom, Wasser, Ausstattung)",
      phase: "pre",
      category: "logistics",
      offsetDays: -7,
      dutyRoleKey: "market_lead",
      estimateMinutes: 30,
      children: [
        { key: "liste", title: "Liste erstellen", estimateMinutes: 15 },
        {
          key: "bringto",
          title: "Liste in die Bringto des Markts übernehmen",
          estimateMinutes: 10,
        },
      ],
    }),
    item({
      key: "pvbt_aufstellen",
      title: "PVBT aufstellen",
      description: "Frist: 96 Stunden vor Marktbeginn. Erinnerung 6 Tage vorher.",
      phase: "pre",
      category: "logistics",
      offsetDays: -4, // 96 hours before the 08:00 start
      dueTime: "08:00",
      dutyRoleKey: "setup_crew",
      priority: "high",
      estimateMinutes: 90,
    }),
    marketDay({
      key: "verkehrssicherung",
      title: "Verkehrssicherung aufbauen lassen (9 Uhr, nach dem Feuerwehreinsatz)",
      category: "logistics",
      dueTime: "09:00",
      dutyRoleKey: CLIENT_DUTY.traffic,
      estimateMinutes: 60,
    }),
    marketDay({
      key: "verkehrssicherung_abbau",
      title: "Verkehrssicherung abbauen lassen",
      category: "logistics",
      dueTime: "18:00",
      dutyRoleKey: CLIENT_DUTY.traffic,
      estimateMinutes: 45,
    }),
    PVBT_WERBUNG_ABHAENGEN,
  ],
});

export const CLIENT_CHECKLISTS: Readonly<Record<ClientMarketKey, readonly ItemBlueprint[]>> = {
  altstadt: ALTSTADT,
  "riehler-guertel": RIEHLER_GUERTEL,
  nippes: NIPPES,
  hoffnungsthal: HOFFNUNGSTHAL,
};

/** The preset each client sheet attaches to (part A's preset keys; the first key that exists wins). */
export const CLIENT_MARKET_PRESET_KEYS: Readonly<Record<ClientMarketKey, readonly string[]>> = {
  altstadt: ["altstadt"],
  "riehler-guertel": ["riehler-guertel"],
  nippes: ["nippes"],
  hoffnungsthal: ["hoffnungsthal"],
};

/* ------------------------------------------------------------- markets without their own sheet yet */

/**
 * What a market without its own sheet gets on top of the Grundvorlage, by event type: items from the client
 * sheets that markets of that kind plausibly need. Each carries ASSUMPTION_NOTE (research 13 §5 q5).
 */
const ASSUMED_BY_TYPE: Readonly<Record<EventTypeKey, readonly ItemBlueprint[]>> = {
  flea: [PVBT_WERBUNG_AUFHAENGEN, ABFLATTERN_VERKEHR, PVBT_WERBUNG_ABHAENGEN],
  antique: [WERBUNG_AUFHAENGEN, LEIHSTAENDE_AUFBAUEN, LEIHSTAENDE_ABBAUEN],
  city_festival: [
    STANDROHR_BESTELLEN,
    STROM_WASSER_ORGANISIEREN,
    ABFLATTERN_VERKEHR,
    NACHTWACHE,
    STROM_WASSER_ABBAUEN,
  ],
  food_wine: [
    STANDROHR_BESTELLEN,
    STROM_WASSER_ORGANISIEREN,
    LEIHSTAENDE_AUFBAUEN,
    LEIHSTAENDE_ABBAUEN,
    STROM_WASSER_ABBAUEN,
  ],
};

/** A market's copy of the Grundvorlage with the assumed items for its event type. */
export function assumedChecklist(eventType: EventTypeKey): ItemBlueprint[] {
  return fromMaster({
    add: ASSUMED_BY_TYPE[eventType].map((blueprint) => ({
      ...blueprint,
      description: ASSUMPTION_NOTE,
    })),
  });
}

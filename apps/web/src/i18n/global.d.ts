import type agreements from "../../messages/de/agreements.json";
import type contacts from "../../messages/de/contacts.json";
import type eventDetail from "../../messages/de/event-detail.json";
import type events from "../../messages/de/events.json";
import type generate from "../../messages/de/generate.json";
import type kalender from "../../messages/de/kalender.json";
import type overview from "../../messages/de/overview.json";
import type settings from "../../messages/de/settings.json";
import type shell from "../../messages/de/shell.json";
import type team from "../../messages/de/team.json";
import type templates from "../../messages/de/templates.json";
import type vendors from "../../messages/de/vendors.json";
import type venues from "../../messages/de/venues.json";
import type { Locale } from "./config";

// German is the reference locale; keep in sync with MESSAGE_AREAS in ./messages.ts.
type Messages = typeof shell &
  typeof events &
  typeof generate &
  typeof overview &
  typeof kalender &
  typeof eventDetail &
  typeof venues &
  typeof contacts &
  typeof team &
  typeof vendors &
  typeof templates &
  typeof settings &
  typeof agreements;

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}

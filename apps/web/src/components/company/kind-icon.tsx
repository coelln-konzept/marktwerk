import {
  ClipboardCheck,
  FileText,
  IdCard,
  Landmark,
  type LucideIcon,
  ShieldCheck,
  Umbrella,
  Wrench,
} from "lucide-react";

/** One icon per obligation kind, so a list can be scanned without reading every title. */
const ICONS: Record<string, LucideIcon> = {
  hu: ClipboardCheck,
  uvv: ShieldCheck,
  service: Wrench,
  tyres: Wrench,
  insurance: Umbrella,
  vehicle_tax: Landmark,
  licence_check: IdCard,
  report: FileText,
  other: ClipboardCheck,
};

export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = ICONS[kind] ?? ClipboardCheck;
  return <Icon aria-hidden className={className ?? "size-4 shrink-0 text-muted-foreground"} />;
}

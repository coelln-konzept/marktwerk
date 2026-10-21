import {
  Building2,
  CircleEllipsis,
  Fence,
  Landmark,
  LandPlot,
  type LucideIcon,
  Trees,
  Truck,
  Warehouse,
  Wrench,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

const VENUE_ICONS: Record<string, LucideIcon> = {
  outdoor_public: Trees,
  outdoor_private: Fence,
  indoor: Warehouse,
};

const CONTACT_ICONS: Record<string, LucideIcon> = {
  authority: Landmark,
  landowner: LandPlot,
  supplier: Truck,
  service: Wrench,
  other: CircleEllipsis,
};

/** Kind of venue as a neutral badge: icon + text, no colour coding. */
export function VenueKindBadge({ kind, label }: { kind: string; label: string }) {
  return (
    <StatusBadge tone="neutral" icon={VENUE_ICONS[kind] ?? Building2}>
      {label}
    </StatusBadge>
  );
}

/** Kind of contact as a neutral badge: icon + text. */
export function ContactKindBadge({ kind, label }: { kind: string; label: string }) {
  return (
    <StatusBadge tone="neutral" icon={CONTACT_ICONS[kind] ?? CircleEllipsis}>
      {label}
    </StatusBadge>
  );
}

export function contactKindIcon(kind: string): LucideIcon {
  return CONTACT_ICONS[kind] ?? CircleEllipsis;
}

import { redirect } from "next/navigation";
import { ARCHIVE_PATHS } from "@/components/archive/archive-frame";

/** `/archiv` opens its first section. */
export default function ArchivePage(): never {
  redirect(ARCHIVE_PATHS.events as never);
}

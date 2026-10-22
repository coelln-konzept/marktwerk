import { can, contractOn } from "@marktwerk/core";
import { getLocale, getTranslations } from "next-intl/server";
import { Facts } from "@/components/ui/vorschau";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Actor } from "@/server/actor";
import { listContracts, minimumWageOn } from "@/server/queries/hours";
import { ContractButton, type ContractView } from "./contract-button";

/** "Vertrag" in the person's Vorschau: the current contract, the history and (team:manage) editing. */
export async function ContractSection({
  staffMemberId,
  actor,
  today,
}: {
  staffMemberId: string;
  actor: Actor;
  today: string;
}) {
  const [t, locale, rows, minimumWage] = await Promise.all([
    getTranslations("hours.contract"),
    getLocale(),
    listContracts(staffMemberId),
    minimumWageOn(today),
  ]);
  const canManage = can(actor.role, "team", "manage");
  const contracts: ContractView[] = rows.map((c) => ({
    id: c.id,
    type: c.type,
    hourlyRateCents: c.hourlyRateCents,
    contractedHoursPerWeek: c.contractedHoursPerWeek,
    fixedMonthlyPayCents: c.fixedMonthlyPayCents,
    workingTimeAccount: c.workingTimeAccount,
    otherMinijobDeclared: c.otherMinijobDeclared,
    validFrom: c.validFrom,
    validUntil: c.validUntil,
  }));
  const current = contractOn(contracts, today);
  // Shown when none is valid today: the newest one (ended) or the next one (not started yet).
  const shown = current ?? contracts[0] ?? null;
  const history = contracts.filter((c) => c.id !== shown?.id);
  const openEnded = contracts.find((c) => c.validUntil === null) ?? null;
  const none = <span className="text-faint-foreground">{t("none")}</span>;
  const range = (c: ContractView) =>
    c.validUntil
      ? t("range", { from: formatDate(c.validFrom, locale), to: formatDate(c.validUntil, locale) })
      : t("since", { from: formatDate(c.validFrom, locale) });

  return (
    <section aria-labelledby="pv-contract" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="pv-contract" className="font-semibold text-muted-foreground text-tiny">
          {t("title")}
        </h3>
        {canManage && (
          <span className="flex items-center gap-1">
            {shown && (
              <ContractButton
                staffMemberId={staffMemberId}
                contract={shown}
                openEnded={openEnded}
                today={today}
                minimumWageCents={minimumWage}
              />
            )}
            <ContractButton
              staffMemberId={staffMemberId}
              contract={null}
              openEnded={openEnded}
              today={today}
              minimumWageCents={minimumWage}
            />
          </span>
        )}
      </div>
      {!shown ? (
        <p className="m-0 text-faint-foreground">{t("noContract")}</p>
      ) : (
        <>
          <p className="m-0 text-muted-foreground text-small">
            {current ? range(shown) : t("notCurrent", { range: range(shown) })}
          </p>
          <Facts
            items={[
              { label: t("type"), value: t(`types.${shown.type}`) },
              {
                label: t("rate"),
                value:
                  shown.hourlyRateCents !== null ? (
                    <span className="tabular">
                      {formatMoney(shown.hourlyRateCents, locale)} {t("perHour")}
                    </span>
                  ) : (
                    none
                  ),
              },
              {
                label: t("hoursPerWeek"),
                value:
                  shown.contractedHoursPerWeek !== null ? (
                    <span className="tabular">
                      {formatNumber(shown.contractedHoursPerWeek, locale, 2)} {t("perWeek")}
                    </span>
                  ) : (
                    none
                  ),
              },
              ...(shown.fixedMonthlyPayCents !== null
                ? [
                    {
                      label: t("fixedPay"),
                      value: (
                        <span className="tabular">
                          {formatMoney(shown.fixedMonthlyPayCents, locale)} {t("perMonth")}
                          {shown.workingTimeAccount ? ` · ${t("withAccount")}` : ""}
                        </span>
                      ),
                    },
                  ]
                : []),
              ...(shown.otherMinijobDeclared
                ? [{ label: t("otherMinijobShort"), value: t("declared") }]
                : []),
            ]}
          />
        </>
      )}
      {history.length > 0 && (
        <details className="text-small">
          <summary className="cursor-pointer text-muted-foreground">
            {t("history", { count: history.length })}
          </summary>
          <ul className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
            {history.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>
                  <span className="tabular">{range(c)}</span>
                  <span className="block text-muted-foreground text-tiny">
                    {t(`types.${c.type}`)}
                    {c.hourlyRateCents !== null
                      ? ` · ${formatMoney(c.hourlyRateCents, locale)} ${t("perHour")}`
                      : ""}
                    {c.fixedMonthlyPayCents !== null
                      ? ` · ${formatMoney(c.fixedMonthlyPayCents, locale)} ${t("perMonth")}`
                      : ""}
                  </span>
                </span>
                {canManage && (
                  <ContractButton
                    staffMemberId={staffMemberId}
                    contract={c}
                    openEnded={openEnded}
                    today={today}
                    minimumWageCents={minimumWage}
                  />
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

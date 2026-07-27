// Dose-log CSV export (competitor-review ask: "export logs as CSV"). One
// doctor-ready table: every shot with compound, amount, site, the side
// effects felt around it, and notes. The caller may pass an IANA timezone so
// date/time columns read in the user's local clock; anything invalid falls
// back to UTC (and says so in the header).

import { CompoundModel, DoseLogModel } from "../models";
import { toCsv } from "../lib/csv";

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

function makeFormatter(timeZone: string | undefined) {
  const zone = (() => {
    if (!timeZone) return "UTC";
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone });
      return timeZone;
    } catch {
      return "UTC";
    }
  })();
  // en-CA date parts give YYYY-MM-DD; 24h time keeps the column sortable.
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { zone, date, time };
}

export async function exportDoseLogsCsv(
  userId: string,
  timeZone?: string,
): Promise<string> {
  const [logs, compounds] = await Promise.all([
    DoseLogModel.find({ userId }).sort({ datetime: 1 }),
    CompoundModel.find({ userId }),
  ]);
  const compoundNames = new Map(
    compounds.map((compound) => [compound._id.toString(), compound.name]),
  );
  const { zone, date, time } = makeFormatter(timeZone);

  const rows = logs.map((log) => [
    date.format(log.datetime),
    time.format(log.datetime),
    compoundNames.get(log.compoundId.toString()) ?? "Unknown",
    String(log.amount),
    log.unit,
    log.injectionSite ? humanize(log.injectionSite) : "",
    (log.sideEffects ?? []).map(humanize).join("; "),
    log.notes ?? "",
  ]);

  return toCsv(
    [
      `date (${zone})`,
      "time",
      "compound",
      "amount",
      "unit",
      "injection site",
      "side effects",
      "notes",
    ],
    rows,
  );
}

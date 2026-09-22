import { KpiCard } from "@/components/dashboard/kpi-card";
import type { KpiCounts } from "@/lib/event-utils";

interface KpiSummaryCardsProps extends KpiCounts {
  loading?: boolean;
}

export function KpiSummaryCards({ critical, warning, info, total24h, loading }: KpiSummaryCardsProps) {
  if (loading) {
    return (
      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[58px] w-[104px] animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <KpiCard label="Critical" value={critical} variant="critical" />
      <KpiCard label="Warnings" value={warning} variant="warning" />
      <KpiCard label="Info" value={info} variant="info" />
      <KpiCard label="Total (24h)" value={total24h} variant="neutral" />
    </div>
  );
}

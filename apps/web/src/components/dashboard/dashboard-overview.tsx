import { DashboardTitle } from "@/components/dashboard/dashboard-title";
import { KpiSummaryCards } from "@/components/dashboard/kpi-summary-cards";
import type { KpiCounts } from "@/lib/event-utils";

export function DashboardOverview({ loading, ...kpis }: KpiCounts & { loading: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-6">
      <DashboardTitle />
      <KpiSummaryCards {...kpis} loading={loading} />
    </div>
  );
}

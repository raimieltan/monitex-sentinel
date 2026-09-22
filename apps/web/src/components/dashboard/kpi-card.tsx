interface KpiCardProps {
  label: string;
  value: number;
  variant: "critical" | "warning" | "info" | "neutral";
}

const VARIANT_STYLES: Record<KpiCardProps["variant"], string> = {
  critical: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-800",
  info: "bg-slate-100 text-slate-700",
  neutral: "bg-slate-50 text-slate-900",
};

export function KpiCard({ label, value, variant }: KpiCardProps) {
  return (
    <div className={`min-w-[104px] rounded-lg px-4 py-2.5 text-center ${VARIANT_STYLES[variant]}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}

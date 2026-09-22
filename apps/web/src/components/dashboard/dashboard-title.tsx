interface DashboardTitleProps {
  title?: string;
  subtitle?: string;
}

export function DashboardTitle({
  title = "Operator Dashboard",
  subtitle = "Live alarms from your sites, with AI triage",
}: DashboardTitleProps) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

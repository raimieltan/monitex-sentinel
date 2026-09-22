interface SiteFilterProps {
  value: string | "ALL";
  sites: Array<{ id: string; name: string }>;
  onChange: (siteId: string | "ALL") => void;
}

export function SiteFilter({ value, sites, onChange }: SiteFilterProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-500">
      Show:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#132A4C]"
      >
        <option value="ALL">All Sites</option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
    </label>
  );
}

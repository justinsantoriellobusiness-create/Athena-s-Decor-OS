import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { RefreshCw, CheckCircle2, AlertCircle, AlertTriangle, Info, Activity as ActivityIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const MODULE_LABELS: Record<string, string> = {
  seo: "SEO", blog: "Blog", inventory: "Inventory", fulfillment: "Fulfillment",
  accounting: "Accounting", shopify: "Shopify", ads: "Ads", audit: "Site Audit",
  site_audit: "Site Audit", product_sourcing: "Sourcing", email_scraper: "Prospect Scraper",
  email_campaigns: "Email Campaigns", backlinker: "Backlinker", general: "General",
};

function LevelIcon({ level }: { level: string }) {
  if (level === "success") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (level === "error") return <AlertCircle className="w-4 h-4 text-red-400" />;
  if (level === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
  return <Info className="w-4 h-4 text-blue-400" />;
}

export default function ActivityPage() {
  const [moduleFilter, setModuleFilter] = useState<string | undefined>(undefined);
  const { data: entries, isLoading, refetch, isFetching } = trpc.activity.getRecent.useQuery(
    { limit: 200, module: moduleFilter },
    { refetchInterval: 30000 }
  );

  const modules = Array.from(new Set((entries ?? []).map((e: any) => e.module)));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ActivityIcon className="w-6 h-6 text-violet-400" />
            Activity Feed
          </h1>
          <p className="text-white/40 text-sm mt-1">
            Real, timestamped proof of everything every automation has actually done — refreshes every 30s.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-white/10 text-white/60 hover:text-white">
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Module filter chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setModuleFilter(undefined)}
          className={cn("px-3 py-1.5 rounded-lg text-xs border transition-all",
            !moduleFilter ? "bg-violet-600 border-violet-500 text-white" : "bg-white/5 border-white/10 text-white/60 hover:text-white"
          )}
        >
          All
        </button>
        {modules.map((m: string) => (
          <button
            key={m}
            onClick={() => setModuleFilter(m)}
            className={cn("px-3 py-1.5 rounded-lg text-xs border transition-all",
              moduleFilter === m ? "bg-violet-600 border-violet-500 text-white" : "bg-white/5 border-white/10 text-white/60 hover:text-white"
            )}
          >
            {MODULE_LABELS[m] ?? m}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="glass rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
        ) : entries && entries.length > 0 ? (
          <div className="divide-y divide-white/5">
            {entries.map((entry: any) => (
              <div key={entry.id} className="px-5 py-4 flex items-start gap-3 hover:bg-white/[0.02] transition-colors">
                <div className="mt-0.5 flex-shrink-0"><LevelIcon level={entry.level} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-white/5 text-white/50">
                      {MODULE_LABELS[entry.module] ?? entry.module}
                    </span>
                    <p className="text-sm font-medium text-white">{entry.title}</p>
                  </div>
                  {entry.detail && (
                    <p className="text-xs text-white/40 mt-1 whitespace-pre-wrap">{entry.detail}</p>
                  )}
                </div>
                <span className="text-[10px] text-white/30 flex-shrink-0 whitespace-nowrap">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <ActivityIcon className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/40">No activity yet. Run an automation from the Automation Hub or Scheduler to see it show up here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

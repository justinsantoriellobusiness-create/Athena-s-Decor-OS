import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ShoppingBag, Search, FileText, Package, BarChart3, Megaphone, Settings,
  TrendingUp, Zap, CheckCircle2, AlertCircle, Clock, ArrowRight, RefreshCw,
  Activity, Truck, DollarSign, ShieldCheck, Sparkles, Check, X, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const moduleCards = [
  { key: "shopify", label: "Shopify", icon: ShoppingBag, href: "/shopify", color: "oklch(0.65 0.18 145)" },
  { key: "fulfillment", label: "Fulfillment", icon: Truck, href: "/fulfillment", color: "oklch(0.7 0.17 160)" },
  { key: "seo", label: "SEO", icon: Search, href: "/seo", color: "oklch(0.65 0.18 240)" },
  { key: "blog", label: "Blog", icon: FileText, href: "/blog", color: "oklch(0.78 0.15 65)" },
  { key: "sourcing", label: "Sourcing", icon: Package, href: "/sourcing", color: "oklch(0.72 0.18 300)" },
  { key: "inventory", label: "Inventory", icon: BarChart3, href: "/inventory", color: "oklch(0.82 0.12 85)" },
  { key: "accounting", label: "Accounting", icon: DollarSign, href: "/accounting", color: "oklch(0.72 0.16 145)" },
  { key: "ads", label: "Ads", icon: Megaphone, href: "/ads", color: "oklch(0.6 0.22 25)" },
  { key: "audit", label: "Site Audit", icon: ShieldCheck, href: "/audit", color: "oklch(0.68 0.15 200)" },
  { key: "scheduler", label: "Scheduler", icon: Settings, href: "/scheduler", color: "oklch(0.55 0.01 265)" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <span className="badge-success"><span className="status-dot active" />Active</span>;
  if (status === "running") return <span className="badge-warning"><span className="status-dot running" />Running</span>;
  if (status === "error") return <span className="badge-error"><span className="status-dot error" />Error</span>;
  return <span className="badge-info"><span className="status-dot idle" />Idle</span>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, refetch, isFetching } = trpc.dashboard.stats.useQuery();

  // Best-effort nudge to keep the suggestions feed fresh — the server
  // throttles actual LLM generation to roughly once every 2 hours
  // regardless of how often this fires, so it's safe to call on every load.
  const generateSuggestions = trpc.aiSuggestions.generate.useMutation({
    onSuccess: (result) => { if (result.created > 0) utils.aiSuggestions.getPending.invalidate(); },
  });
  useEffect(() => { generateSuggestions.mutate(); }, []);

  const getModuleStatus = (key: string) => {
    if (!data?.automationSettings) return "idle";
    const s = data.automationSettings.find((s: any) => s.module === key);
    if (!s) return "idle";
    if (!s.enabled) return "idle";
    return s.lastRunStatus || "idle";
  };

  const getModuleEnabled = (key: string) => {
    if (!data?.automationSettings) return false;
    return data.automationSettings.find((s: any) => s.module === key)?.enabled ?? false;
  };

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
            <span className="text-gold">{user?.name?.split(" ")[0] || "there"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your automation platform overview</p>
        </div>
        {/* Previously styled in muted grey with no click feedback, which read
            as a disabled/broken button. Now visibly active and spins while
            refetching everything the dashboard shows. */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetch(); utils.activity.getRecent.invalidate(); }}
          disabled={isFetching}
          className="gap-2 border-border/50 text-foreground hover:bg-secondary/50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* Stat Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Shopify Products"
              value={data?.shopifyProductCount ?? 0}
              icon={<ShoppingBag className="w-4 h-4" />}
              status={data?.shopifyConnected ? "connected" : "disconnected"}
              color="oklch(0.65 0.18 145)"
            />
            <StatCard
              label="Active Modules"
              value={`${data?.activeModules ?? 0}/${data?.totalModules ?? 9}`}
              icon={<Zap className="w-4 h-4" />}
              status="info"
              color="oklch(0.82 0.12 85)"
            />
            <StatCard
              label="Blog Posts"
              value={data?.recentPosts?.length ?? 0}
              icon={<FileText className="w-4 h-4" />}
              status="info"
              color="oklch(0.78 0.15 65)"
            />
            <StatCard
              label="Ad Campaigns"
              value={`${data?.activeCampaigns ?? 0} active`}
              icon={<Megaphone className="w-4 h-4" />}
              status="info"
              color="oklch(0.6 0.22 25)"
            />
          </>
        )}
      </div>

      {/* AI Suggestions — real LLM analysis of your actual store data, approve/deny */}
      <AiSuggestionsPanel />

      {/* Module Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Automation Modules</h2>
          <button
            onClick={() => setLocation("/scheduler")}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
          >
            Configure <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {moduleCards.map((mod) => {
            const Icon = mod.icon;
            const enabled = getModuleEnabled(mod.key);
            const status = getModuleStatus(mod.key);
            return (
              <button
                key={mod.key}
                onClick={() => setLocation(mod.href)}
                className="module-card text-left group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: `${mod.color}20`, color: mod.color }}
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className={cn("w-2 h-2 rounded-full mt-1", enabled ? "bg-green-500 shadow-[0_0_6px_oklch(0.65_0.18_145/0.6)]" : "bg-muted-foreground/30")} />
                </div>
                <p className="text-sm font-semibold text-foreground mb-1">{mod.label}</p>
                <StatusBadge status={enabled ? status : "idle"} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Activity Feed — real proof of what automations have done */}
        <LiveActivityPanel />

        {/* Recent Blog Posts */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Recent Blog Posts</h3>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : data?.recentPosts?.length ? (
            <div className="space-y-2">
              {data.recentPosts.map((post: any) => (
                <div key={post.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <span className="text-xs text-foreground truncate flex-1 mr-3">{post.title}</span>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full",
                    post.status === "published" ? "badge-success" :
                    post.status === "draft" ? "badge-info" : "badge-warning"
                  )}>{post.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No posts yet. Generate your first blog post.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AiSuggestionsPanel() {
  const utils = trpc.useUtils();
  const { data: suggestions, isLoading } = trpc.aiSuggestions.getPending.useQuery();

  const approveMutation = trpc.aiSuggestions.approve.useMutation({
    onSuccess: (result, vars) => {
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      utils.aiSuggestions.getPending.invalidate();
      utils.dashboard.stats.invalidate();
      utils.activity.getRecent.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const denyMutation = trpc.aiSuggestions.deny.useMutation({
    onSuccess: () => { utils.aiSuggestions.getPending.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  if (!isLoading && (!suggestions || suggestions.length === 0)) return null;

  return (
    <div className="glass rounded-xl p-6 border border-primary/20">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">AI Suggestions</h3>
        <span className="text-[10px] text-muted-foreground">Based on your real store data — approve to run, deny to dismiss</span>
      </div>
      {isLoading ? (
        <div className="space-y-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-3">
          {suggestions!.map((s: any) => {
            const busy = (approveMutation.isPending && approveMutation.variables?.id === s.id) ||
                         (denyMutation.isPending && denyMutation.variables?.id === s.id);
            return (
              <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40 border border-border/30">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{s.reasoning}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    size="sm" variant="outline"
                    onClick={() => approveMutation.mutate({ id: s.id })}
                    disabled={busy}
                    className="h-7 gap-1 text-[11px] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  >
                    {busy && approveMutation.variables?.id === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Approve
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => denyMutation.mutate({ id: s.id })}
                    disabled={busy}
                    className="h-7 gap-1 text-[11px] border-border/50 text-muted-foreground hover:bg-secondary/60"
                  >
                    {busy && denyMutation.variables?.id === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    Deny
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, status, color }: {
  label: string; value: string | number; icon: React.ReactNode; status: string; color: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20`, color }}>
          {icon}
        </div>
        {status === "connected" && <span className="badge-success text-[10px]">Connected</span>}
        {status === "disconnected" && <span className="badge-error text-[10px]">Disconnected</span>}
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function LiveActivityPanel() {
  const [, setLocation] = useLocation();
  const { data: entries, isLoading } = trpc.activity.getRecent.useQuery({ limit: 8 }, { refetchInterval: 20000 });
  return (
    <div className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Live Activity</h3>
        </div>
        <button onClick={() => setLocation("/activity")} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      {isLoading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
      ) : entries && entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry: any) => (
            <div key={entry.id} className="flex items-start gap-2.5 py-2 border-b border-border/30 last:border-0">
              {entry.level === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" /> :
               entry.level === "error" ? <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" /> :
               <Clock className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{entry.title}</p>
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">No activity yet. Enable an automation to see it appear here.</p>
      )}
    </div>
  );
}

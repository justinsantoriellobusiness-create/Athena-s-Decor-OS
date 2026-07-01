import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import {
  ShoppingBag, Search, FileText, Package, BarChart3, Megaphone, Settings,
  TrendingUp, Zap, CheckCircle2, AlertCircle, Clock, ArrowRight, RefreshCw,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const moduleCards = [
  { key: "shopify", label: "Shopify", icon: ShoppingBag, href: "/shopify", color: "oklch(0.65 0.18 145)" },
  { key: "seo", label: "SEO", icon: Search, href: "/seo", color: "oklch(0.65 0.18 240)" },
  { key: "blog", label: "Blog", icon: FileText, href: "/blog", color: "oklch(0.78 0.15 65)" },
  { key: "sourcing", label: "Sourcing", icon: Package, href: "/sourcing", color: "oklch(0.72 0.18 300)" },
  { key: "inventory", label: "Inventory", icon: BarChart3, href: "/inventory", color: "oklch(0.82 0.12 85)" },
  { key: "ads", label: "Ads", icon: Megaphone, href: "/ads", color: "oklch(0.6 0.22 25)" },
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
  const { data, isLoading, refetch } = trpc.dashboard.stats.useQuery();

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
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2 border-border/50 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
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
              value={`${data?.activeModules ?? 0}/${data?.totalModules ?? 5}`}
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
        {/* Recent Jobs */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Recent SEO Jobs</h3>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : data?.recentJobs?.length ? (
            <div className="space-y-2">
              {data.recentJobs.map((job: any) => (
                <div key={job.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2.5">
                    {job.status === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> :
                     job.status === "error" ? <AlertCircle className="w-3.5 h-3.5 text-red-500" /> :
                     <Clock className="w-3.5 h-3.5 text-yellow-500" />}
                    <span className="text-xs text-foreground capitalize">{job.type.replace(/_/g, " ")}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No jobs run yet. Start the SEO module.</p>
          )}
        </div>

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

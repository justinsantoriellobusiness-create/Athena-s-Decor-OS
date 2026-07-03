import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BarChart3, Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Package, TrendingDown, ToggleLeft, ToggleRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function StockBadge({ status }: { status: string }) {
  if (status === "in_stock") return <span className="badge-success"><CheckCircle2 className="w-3 h-3" />In Stock</span>;
  if (status === "low_stock") return <span className="badge-warning"><AlertTriangle className="w-3 h-3" />Low Stock</span>;
  if (status === "out_of_stock") return <span className="badge-error"><XCircle className="w-3 h-3" />Out of Stock</span>;
  return <span className="badge-info">Unknown</span>;
}

export default function InventoryPage() {
  const [filter, setFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const utils = trpc.useUtils();

  const { data: snapshots, isLoading } = trpc.inventory.getSnapshots.useQuery();

  const scanMutation = trpc.inventory.scan.useMutation({
    onSuccess: (data) => { toast.success(`Scanned ${data.scanned} variants`); utils.inventory.getSnapshots.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const markOutMutation = trpc.inventory.markOutOfStock.useMutation({
    onSuccess: () => { toast.success("Product marked as draft in Shopify"); utils.inventory.getSnapshots.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const filtered = (snapshots || []).filter((s: any) => filter === "all" || s.status === filter);

  const counts = {
    all: snapshots?.length ?? 0,
    in_stock: snapshots?.filter((s: any) => s.status === "in_stock").length ?? 0,
    low_stock: snapshots?.filter((s: any) => s.status === "low_stock").length ?? 0,
    out_of_stock: snapshots?.filter((s: any) => s.status === "out_of_stock").length ?? 0,
  };

  const { data: settings } = trpc.scheduler.getAll.useQuery();
  const updateScheduler = trpc.scheduler.update.useMutation({ onSuccess: () => toast.success("Automation updated") });
  const invSetting = settings?.find((s: any) => s.module === "inventory");

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Inventory Tracker</h1>
          <p className="text-white/40 text-sm mt-1">Track Shopify stock levels and auto-draft products when they run out</p>
        </div>
        <div className="flex items-center gap-3">
          {invSetting && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
              <Zap className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-xs text-white/70 font-medium">Auto-Sync</p>
                <p className="text-[10px] text-white/30">{invSetting.cronExpression || "Every 6h"}</p>
              </div>
              <button onClick={() => updateScheduler.mutate({ module: "inventory", enabled: !invSetting.enabled })}>
                {invSetting.enabled
                  ? <ToggleRight className="w-8 h-8 text-emerald-400" />
                  : <ToggleLeft className="w-8 h-8 text-white/20" />
                }
              </button>
            </div>
          )}
          <Button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="gap-2 font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {scanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Scan Now
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "all", label: "Total Variants", color: "oklch(0.55 0.01 265)", icon: Package },
          { key: "in_stock", label: "In Stock", color: "oklch(0.65 0.18 145)", icon: CheckCircle2 },
          { key: "low_stock", label: "Low Stock", color: "oklch(0.78 0.15 65)", icon: AlertTriangle },
          { key: "out_of_stock", label: "Out of Stock", color: "oklch(0.6 0.22 25)", icon: XCircle },
        ].map(({ key, label, color, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setFilter(key as any)}
            className={cn("stat-card text-left transition-all", filter === key && "ring-1 ring-primary/50")}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: `${color}20`, color }}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-foreground">{counts[key as keyof typeof counts]}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {filter === "all" ? "All Variants" : filter.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} ({filtered.length})
          </h3>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear filter
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
        ) : filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Product / Variant</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">SKU</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Shopify Stock</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-right px-5 py-3 text-muted-foreground font-medium">Last Checked</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((snap: any) => (
                  <tr key={snap.id} className="border-b border-border/20 hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground max-w-[200px] truncate">{snap.title}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">{snap.sku || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("font-semibold", snap.shopifyStock === 0 ? "text-red-400" : snap.shopifyStock < 10 ? "text-yellow-400" : "text-green-400")}>
                        {snap.shopifyStock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center"><StockBadge status={snap.status} /></td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      {snap.lastCheckedAt ? new Date(snap.lastCheckedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {snap.status === "out_of_stock" && (
                        <Button size="sm" variant="outline"
                          className="text-[10px] h-6 px-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                          onClick={() => markOutMutation.mutate({ shopifyProductId: snap.shopifyProductId })}
                          disabled={markOutMutation.isPending}>
                          <TrendingDown className="w-3 h-3 mr-1" />Mark Draft
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <BarChart3 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {snapshots?.length ? "No items match this filter." : "No inventory data yet. Connect Shopify and run a scan."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

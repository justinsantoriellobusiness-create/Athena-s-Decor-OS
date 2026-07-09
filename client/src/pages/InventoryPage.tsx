import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BarChart3, Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Package, ToggleLeft, ToggleRight, Zap, ExternalLink, EyeOff, Eye, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const { data: groups, isLoading } = trpc.inventory.getGrouped.useQuery();
  const { data: shopifyConfig } = trpc.shopify.getConfig.useQuery();

  const scanMutation = trpc.inventory.scan.useMutation({
    onSuccess: (data) => { toast.success(`Scanned ${data.scanned} products — ${data.outOfStockCount} out of stock`); utils.inventory.getGrouped.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const markOutMutation = trpc.inventory.markOutOfStock.useMutation({
    onSuccess: () => { toast.success("Product hidden (marked draft) in Shopify"); utils.inventory.getGrouped.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const republishMutation = trpc.inventory.republish.useMutation({
    onSuccess: () => { toast.success("Product republished (marked active) in Shopify"); utils.inventory.getGrouped.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const allGroups = groups || [];
  const filtered = allGroups
    .filter((g: any) => filter === "all" || g.status === filter)
    .filter((g: any) => !search || g.title.toLowerCase().includes(search.toLowerCase()));

  const counts = {
    all: allGroups.length,
    in_stock: allGroups.filter((g: any) => g.status === "in_stock").length,
    low_stock: allGroups.filter((g: any) => g.status === "low_stock").length,
    out_of_stock: allGroups.filter((g: any) => g.status === "out_of_stock").length,
  };

  const { data: settings } = trpc.scheduler.getAll.useQuery();
  const updateScheduler = trpc.scheduler.update.useMutation({ onSuccess: () => toast.success("Automation updated") });
  const invSetting = settings?.find((s: any) => s.module === "inventory");

  const shopifyAdminUrl = (productId: string) =>
    shopifyConfig?.storeDomain ? `https://${shopifyConfig.storeDomain}/admin/products/${productId}` : undefined;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Inventory Tracker</h1>
          <p className="text-white/40 text-sm mt-1">Live Shopify stock, product images, and manual show/hide controls</p>
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
          { key: "all", label: "Total Products", color: "oklch(0.55 0.01 265)", icon: Package },
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

      {/* Search + filter status */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-secondary/50 border-border/50"
          />
        </div>
        {filter !== "all" && (
          <button onClick={() => setFilter("all")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Clear status filter
          </button>
        )}
      </div>

      {/* Product grid with images */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      ) : filtered.length ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((group: any) => (
            <div key={group.shopifyProductId} className="glass rounded-xl overflow-hidden border border-border/30">
              {group.imageUrl ? (
                <div className="aspect-square bg-secondary/50 overflow-hidden">
                  <img src={group.imageUrl} alt={group.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              ) : (
                <div className="aspect-square bg-secondary/50 flex items-center justify-center">
                  <Package className="w-8 h-8 text-muted-foreground/30" />
                </div>
              )}
              <div className="p-3 space-y-2">
                <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug min-h-[2rem]">{group.title}</p>
                <div className="flex items-center justify-between">
                  <StockBadge status={group.status} />
                  <span className="text-[10px] text-muted-foreground">{group.totalStock} units</span>
                </div>
                {group.variants.length > 1 && (
                  <p className="text-[10px] text-muted-foreground/60">{group.variants.length} variants</p>
                )}
                <div className="flex items-center gap-1.5 pt-1">
                  {group.status === "out_of_stock" ? (
                    <Button size="sm" variant="outline"
                      className="flex-1 text-[10px] h-7 px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      onClick={() => republishMutation.mutate({ shopifyProductId: group.shopifyProductId })}
                      disabled={republishMutation.isPending}>
                      <Eye className="w-3 h-3 mr-1" />Republish
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline"
                      className="flex-1 text-[10px] h-7 px-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={() => markOutMutation.mutate({ shopifyProductId: group.shopifyProductId })}
                      disabled={markOutMutation.isPending}>
                      <EyeOff className="w-3 h-3 mr-1" />Hide
                    </Button>
                  )}
                  {shopifyAdminUrl(group.shopifyProductId) && (
                    <a href={shopifyAdminUrl(group.shopifyProductId)} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center h-7 w-7 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors flex-shrink-0"
                      title="Open in Shopify Admin">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                {group.lastCheckedAt && (
                  <p className="text-[9px] text-muted-foreground/50">Checked {new Date(group.lastCheckedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-xl p-12 text-center">
          <BarChart3 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {allGroups.length ? "No products match this filter." : "No inventory data yet. Connect Shopify and click Scan Now."}
          </p>
        </div>
      )}
    </div>
  );
}

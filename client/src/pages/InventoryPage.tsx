import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BarChart3, Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Package, ToggleLeft, ToggleRight, Zap, ExternalLink, EyeOff, Eye, Search, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert } from "lucide-react";
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

function timeAgo(date: string | Date | null | undefined) {
  if (!date) return null;
  const d = new Date(date).getTime();
  const diffMs = Date.now() - d;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function VariantRow({
  variant,
  onSet,
  isPending,
}: {
  variant: any;
  onSet: (quantity: number) => void;
  isPending: boolean;
}) {
  const [value, setValue] = useState(String(variant.shopifyStock ?? 0));
  const dirty = value !== String(variant.shopifyStock ?? 0);
  const hasSupplierData = variant.supplierSource === "cj";
  const supplierMismatch = hasSupplierData && variant.supplierStock === 0 && variant.shopifyStock > 0;

  return (
    <div className="border-t border-border/30 py-2 first:border-t-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] text-foreground/80 truncate max-w-[160px]" title={variant.title}>
            {variant.title?.split(" - ").slice(1).join(" - ") || variant.title}
          </p>
          {variant.sku && <p className="text-[9px] text-muted-foreground/60">SKU {variant.sku}</p>}
        </div>
        <StockBadge status={variant.status} />
      </div>

      <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[10px]">
        <span className="text-muted-foreground">Shopify: <span className="text-foreground/80 font-medium">{variant.shopifyStock}</span></span>
        {hasSupplierData ? (
          <span className={cn("flex items-center gap-1", supplierMismatch ? "text-red-400" : "text-emerald-400")}>
            {supplierMismatch ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
            CJ supplier: <span className="font-medium">{variant.supplierStock}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/50">Not CJ-mapped — Shopify count only</span>
        )}
      </div>
      {supplierMismatch && (
        <p className="text-[9px] text-red-400/80 mt-0.5">Supplier is actually out of stock — hidden automatically even though Shopify still showed it available.</p>
      )}

      <div className="flex items-center gap-1.5 mt-2">
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-7 text-[10px] w-20 bg-secondary/50 border-border/50"
          disabled={isPending}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10px]"
          disabled={isPending || !dirty || value === ""}
          onClick={() => onSet(Math.max(0, parseInt(value, 10) || 0))}
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Set"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10px] border-red-500/30 text-red-400 hover:bg-red-500/10"
          disabled={isPending || variant.shopifyStock === 0}
          onClick={() => { setValue("0"); onSet(0); }}
          title="Set this variant's Shopify inventory to 0"
        >
          0
        </Button>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const [filter, setFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastScan, setLastScan] = useState<{
    scanned: number; outOfStockCount: number; supplierOutOfStockCount: number;
    cjChecked: number; cjUnavailable: number; draftFailures: number; at: Date;
  } | null>(null);
  const utils = trpc.useUtils();

  const { data: groups, isLoading } = trpc.inventory.getGrouped.useQuery();
  const { data: shopifyConfig } = trpc.shopify.getConfig.useQuery();

  const scanMutation = trpc.inventory.scan.useMutation({
    onSuccess: (data) => {
      setLastScan({
        scanned: data.scanned, outOfStockCount: data.outOfStockCount,
        supplierOutOfStockCount: data.supplierOutOfStockCount, cjChecked: data.cjChecked,
        cjUnavailable: data.cjUnavailable, draftFailures: data.draftFailures, at: new Date(),
      });
      toast.success(
        data.supplierOutOfStockCount > 0
          ? `Scanned ${data.scanned} — ${data.outOfStockCount} out of stock (${data.supplierOutOfStockCount} caught by real CJ supplier stock)`
          : `Scanned ${data.scanned} products — ${data.outOfStockCount} out of stock`
      );
      if (data.draftFailures > 0) toast.error(`${data.draftFailures} out-of-stock product(s) failed to auto-hide — check Activity Feed`);
      utils.inventory.getGrouped.invalidate();
      utils.scheduler.getAll.invalidate();
    },
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
  const setStockMutation = trpc.inventory.setStock.useMutation({
    onSuccess: (data) => {
      toast.success(`Stock set to ${data.quantity} — now ${data.status.replace(/_/g, " ")}`);
      utils.inventory.getGrouped.invalidate();
    },
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

  const storefrontUrl = (handle: string | null | undefined) =>
    shopifyConfig?.storeDomain && handle ? `https://${shopifyConfig.storeDomain}/products/${handle}` : undefined;

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Inventory Tracker</h1>
          <p className="text-white/40 text-sm mt-1">Live Shopify stock, real CJ supplier stock, product images, and full manual controls</p>
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
            {scanMutation.isPending ? "Scanning…" : "Scan Now"}
          </Button>
        </div>
      </div>

      <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-4 py-3 text-xs text-white/50">
        <strong className="text-white/70">How automatic out-of-stock works:</strong> every scan — either{" "}
        <strong className="text-white/70">Scan Now</strong> above, or the <strong className="text-white/70">Auto-Sync</strong>{" "}
        schedule if it's on — checks each product's real Shopify stock (and real CJ supplier stock, for CJ-sourced
        products) and automatically hides (drafts) anything that's actually out of stock, so it can't be purchased.
        Nothing extra to set up — it already runs on every scan. You can also hide/republish a whole product, or set
        an exact stock quantity per variant yourself at any time, below.
      </div>

      {/* Scan-in-progress proof bar */}
      {scanMutation.isPending && (
        <div className="glass rounded-xl p-4 border border-emerald-500/20 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-foreground font-medium">Scanning Shopify catalog and checking real CJ supplier stock…</p>
            <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden mt-1.5">
              <div className="h-full w-1/3 bg-emerald-500 rounded-full animate-[loading-bar_1.2s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      )}

      {/* Proof of last scan */}
      {lastScan && !scanMutation.isPending && (
        <div className="glass rounded-xl p-4 border border-border/30 flex items-start gap-3 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-foreground font-medium">
              Last scan {timeAgo(lastScan.at)}: {lastScan.scanned} products checked, {lastScan.outOfStockCount} out of stock.
            </p>
            <p className="text-muted-foreground">
              {lastScan.cjChecked > 0
                ? `Real CJ supplier stock verified on ${lastScan.cjChecked} variant(s)${lastScan.cjUnavailable ? `, ${lastScan.cjUnavailable} check(s) failed (fell back to Shopify's count)` : ""}.`
                : "No verified CJ-sourced products found to check — only Shopify's own stock count was used."}
              {lastScan.supplierOutOfStockCount > 0 && (
                <span className="text-red-400"> {lastScan.supplierOutOfStockCount} product(s) hidden because the real supplier was out even though Shopify still showed available.</span>
              )}
              {lastScan.draftFailures > 0 && <span className="text-red-400"> {lastScan.draftFailures} product(s) failed to auto-hide — check manually.</span>}
            </p>
          </div>
        </div>
      )}
      {!lastScan && invSetting?.lastRunAt && (
        <div className="glass rounded-xl p-4 border border-border/30 flex items-start gap-3 text-xs">
          <BarChart3 className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-foreground font-medium">Last automated run: {timeAgo(invSetting.lastRunAt)} ({invSetting.lastRunStatus})</p>
            {invSetting.lastRunMessage && <p className="text-muted-foreground">{invSetting.lastRunMessage}</p>}
          </div>
        </div>
      )}

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
          {filtered.map((group: any) => {
            const isExpanded = expanded.has(group.shopifyProductId);
            const hasSupplierMismatch = group.variants.some((v: any) => v.supplierSource === "cj" && v.supplierStock === 0 && v.shopifyStock > 0);
            return (
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
                  {hasSupplierMismatch && (
                    <div className="flex items-center gap-1 text-[9px] text-red-400 bg-red-500/10 rounded px-1.5 py-1">
                      <ShieldAlert className="w-3 h-3 flex-shrink-0" />
                      Supplier out of stock
                    </div>
                  )}
                  {group.variants.length > 1 && (
                    <button
                      onClick={() => toggleExpanded(group.shopifyProductId)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {group.variants.length} variants
                    </button>
                  )}
                  {group.variants.length === 1 && (
                    <button
                      onClick={() => toggleExpanded(group.shopifyProductId)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      Edit stock
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 pt-1">
                    {group.status === "out_of_stock" ? (
                      <Button size="sm" variant="outline"
                        className="flex-1 text-[10px] h-7 px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => republishMutation.mutate({ shopifyProductId: group.shopifyProductId })}
                        disabled={republishMutation.isPending}>
                        {republishMutation.isPending && republishMutation.variables?.shopifyProductId === group.shopifyProductId
                          ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
                        Republish
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline"
                        className="flex-1 text-[10px] h-7 px-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={() => markOutMutation.mutate({ shopifyProductId: group.shopifyProductId })}
                        disabled={markOutMutation.isPending}>
                        {markOutMutation.isPending && markOutMutation.variables?.shopifyProductId === group.shopifyProductId
                          ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <EyeOff className="w-3 h-3 mr-1" />}
                        Hide
                      </Button>
                    )}
                    {storefrontUrl(group.productHandle) && (
                      <a href={storefrontUrl(group.productHandle)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center h-7 w-7 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors flex-shrink-0"
                        title="View live product page (what customers see)">
                        <Package className="w-3 h-3" />
                      </a>
                    )}
                    {shopifyAdminUrl(group.shopifyProductId) && (
                      <a href={shopifyAdminUrl(group.shopifyProductId)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center h-7 w-7 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors flex-shrink-0"
                        title="Edit in Shopify Admin">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {group.lastCheckedAt && (
                    <p className="text-[9px] text-muted-foreground/50">Checked {timeAgo(group.lastCheckedAt)}</p>
                  )}

                  {isExpanded && (
                    <div className="pt-1">
                      {group.variants.map((variant: any) => (
                        <VariantRow
                          key={variant.shopifyVariantId}
                          variant={variant}
                          isPending={setStockMutation.isPending && setStockMutation.variables?.shopifyVariantId === variant.shopifyVariantId}
                          onSet={(quantity) => setStockMutation.mutate({ shopifyVariantId: variant.shopifyVariantId, quantity })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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

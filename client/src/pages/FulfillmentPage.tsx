import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Truck, Loader2, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle,
  Package, ExternalLink, Search, Wallet, ArrowRight, DollarSign, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CJ_LOW_BALANCE_THRESHOLD } from "@shared/const";

const STATUS_META: Record<string, { label: string; badge: string }> = {
  pending: { label: "Pending", badge: "badge-info" },
  placed_with_cj: { label: "Placed with CJ", badge: "badge-info" },
  shipped: { label: "Shipped", badge: "badge-success" },
  routed_to_dsers: { label: "Routed to DSers", badge: "badge-info" },
  dsers_stuck: { label: "Stuck in DSers 48h+", badge: "badge-error" },
  needs_manual: { label: "Needs Manual Fulfillment", badge: "badge-warning" },
  cancelled: { label: "Cancelled", badge: "badge-info" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, badge: "badge-info" };
  return <span className={meta.badge}>{meta.label}</span>;
}

function timeAgo(date: string | Date | null | undefined) {
  if (!date) return null;
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// DSers has no public API, so there's no per-order deep link — this jumps
// to the DSers dashboard itself so you can find the order there manually.
const DSERS_DASHBOARD_URL = "https://www.dsers.com/";

export default function FulfillmentPage() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [spendOpen, setSpendOpen] = useState(false);
  const [lastRun, setLastRun] = useState<{
    ordersPlaced: number; ordersShipped: number; ordersRoutedToDsers: number;
    ordersSkipped: number; errors: string[]; lockedOut?: boolean; at: Date;
  } | null>(null);
  const utils = trpc.useUtils();

  const { data: ordersData, isLoading } = trpc.fulfillment.getOrders.useQuery(undefined, { refetchInterval: 60000 });
  const { data: balance, isLoading: balanceLoading } = trpc.fulfillment.getCjBalance.useQuery();
  const { data: cjSpend, isLoading: spendLoading } = trpc.fulfillment.getCjSpend.useQuery({ limit: 50 });
  const { data: shopifyConfig } = trpc.shopify.getConfig.useQuery();

  const runNowMutation = trpc.fulfillment.runNow.useMutation({
    onSuccess: (data) => {
      setLastRun({ ...data, at: new Date() });
      if (data.lockedOut) {
        toast.info("A fulfillment run was already in progress — this click didn't start a second one.");
      } else if (data.errors.length > 0) {
        toast.error(`Fulfillment run finished with ${data.errors.length} error(s) — see summary below`);
      } else {
        toast.success(`Fulfillment run complete: ${data.ordersPlaced} placed, ${data.ordersShipped} shipped, ${data.ordersRoutedToDsers} routed to DSers`);
      }
      utils.fulfillment.getOrders.invalidate();
      utils.activity.getRecent.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const orders = ordersData?.orders ?? [];
  const filtered = orders
    .filter((o: any) => filter === "all" || o.status === filter)
    .filter((o: any) => !search || String(o.orderNumber).includes(search) || o.customerName?.toLowerCase().includes(search.toLowerCase()));

  const counts: Record<string, number> = { all: orders.length };
  for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;

  const shopifyOrderUrl = (id: string) =>
    shopifyConfig?.storeDomain ? `https://${shopifyConfig.storeDomain}/admin/orders/${id}` : undefined;

  const lowBalance = balance?.amount != null && balance.amount < CJ_LOW_BALANCE_THRESHOLD;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Fulfillment</h1>
          <p className="text-white/40 text-sm mt-1">Every paid order and exactly what the auto-fulfillment engine did with it</p>
        </div>
        <Button
          onClick={() => runNowMutation.mutate()}
          disabled={runNowMutation.isPending}
          className="gap-2 font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {runNowMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {runNowMutation.isPending ? "Running…" : "Run Fulfillment Now"}
        </Button>
      </div>

      {/* CJ wallet balance — the thing that silently breaks orders if it runs dry */}
      <div className={cn(
        "glass rounded-xl p-4 border flex items-center gap-3",
        lowBalance ? "border-red-500/30" : "border-border/30"
      )}>
        <Wallet className={cn("w-4 h-4 flex-shrink-0", lowBalance ? "text-red-400" : "text-emerald-400")} />
        {balanceLoading ? (
          <Skeleton className="h-4 w-48" />
        ) : !balance?.connected ? (
          <p className="text-xs text-muted-foreground">CJ not connected — connect it in Integrations to see wallet balance and enable auto-fulfillment.</p>
        ) : balance.amount == null ? (
          <p className="text-xs text-muted-foreground">CJ wallet balance unavailable right now ({balance.error ?? "unknown error"}). This doesn't affect order placement itself.</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-foreground font-medium">
              CJ wallet balance: <span className={lowBalance ? "text-red-400" : "text-emerald-400"}>${balance.amount.toFixed(2)}</span>
              {balance.frozen ? <span className="text-muted-foreground"> ({balance.frozen.toFixed(2)} frozen)</span> : null}
            </p>
            {lowBalance && (
              <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 rounded px-1.5 py-0.5">
                <AlertTriangle className="w-3 h-3" /> Low — orders will start failing to place if this hits $0
              </span>
            )}
          </div>
        )}
      </div>

      {/* CJ spend — the real transactions Accounting recorded at order time, not an estimate shown twice */}
      <div className="glass rounded-xl border border-border/30 overflow-hidden">
        <button
          onClick={() => setSpendOpen((v) => !v)}
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/30 transition-colors"
        >
          <DollarSign className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          {spendLoading ? (
            <Skeleton className="h-4 w-48" />
          ) : (
            <p className="text-xs text-foreground font-medium flex-1">
              CJ spend to date: <span className="text-emerald-400">${(cjSpend?.total ?? 0).toFixed(2)}</span>
              <span className="text-muted-foreground"> across {cjSpend?.count ?? 0} order{cjSpend?.count === 1 ? "" : "s"}</span>
            </p>
          )}
          {spendOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {spendOpen && (
          <div className="border-t border-border/30 divide-y divide-border/20 max-h-80 overflow-y-auto">
            {!cjSpend?.transactions.length ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No CJ spend recorded yet — this fills in automatically as auto-fulfillment places orders.
              </p>
            ) : (
              cjSpend.transactions.map((t) => (
                <div key={t.id} className="flex items-center gap-4 px-4 py-2.5 flex-wrap">
                  <div className="min-w-[90px]">
                    <p className="text-[10px] text-muted-foreground">{new Date(t.date).toLocaleDateString()}</p>
                  </div>
                  <p className="text-xs text-foreground flex-1 min-w-[160px] truncate">{t.description}</p>
                  <p className="text-xs text-red-400 font-medium w-20 text-right">-${t.amount.toFixed(2)}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Run-in-progress proof bar */}
      {runNowMutation.isPending && (
        <div className="glass rounded-xl p-4 border border-emerald-500/20 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-foreground font-medium">Checking paid orders, placing CJ orders, and syncing tracking…</p>
            <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden mt-1.5">
              <div className="h-full w-1/3 bg-emerald-500 rounded-full animate-[loading-bar_1.2s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      )}

      {/* Proof of last run */}
      {lastRun && !runNowMutation.isPending && (
        <div className="glass rounded-xl p-4 border border-border/30 flex items-start gap-3 text-xs">
          {lastRun.errors.length > 0 ? <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />}
          <div className="space-y-0.5">
            <p className="text-foreground font-medium">
              {lastRun.lockedOut
                ? "A run was already in progress — this didn't start a second one."
                : `Run ${timeAgo(lastRun.at)}: ${lastRun.ordersPlaced} placed with CJ, ${lastRun.ordersShipped} marked shipped, ${lastRun.ordersRoutedToDsers} routed to DSers, ${lastRun.ordersSkipped} skipped.`}
            </p>
            {lastRun.errors.length > 0 && (
              <p className="text-red-400">{lastRun.errors.length} error(s): {lastRun.errors.slice(0, 3).join("; ")}{lastRun.errors.length > 3 ? "…" : ""}</p>
            )}
          </div>
        </div>
      )}

      {/* Status filter row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { key: "all", label: "All", icon: Package },
          { key: "pending", label: "Pending", icon: Clock },
          { key: "placed_with_cj", label: "Placed w/ CJ", icon: Truck },
          { key: "shipped", label: "Shipped", icon: CheckCircle2 },
          { key: "routed_to_dsers", label: "DSers", icon: ArrowRight },
          { key: "dsers_stuck", label: "Stuck 48h+", icon: AlertTriangle },
          { key: "needs_manual", label: "Needs Manual", icon: XCircle },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn("stat-card text-left transition-all", filter === key && "ring-1 ring-primary/50")}
          >
            <Icon className="w-4 h-4 text-muted-foreground mb-2" />
            <p className="text-lg font-bold text-foreground">{counts[key] ?? 0}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search order # or customer…"
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

      {/* Order list */}
      {isLoading ? (
        <div className="space-y-2">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : !ordersData?.connected ? (
        <div className="glass rounded-xl p-12 text-center">
          <Truck className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Shopify isn't connected — connect it to see orders here.</p>
        </div>
      ) : filtered.length ? (
        <div className="glass rounded-xl overflow-hidden border border-border/30">
          <div className="divide-y divide-border/30">
            {filtered.map((order: any) => (
              <div key={order.id} className="flex items-center gap-4 px-4 py-3 flex-wrap">
                <div className="min-w-[90px]">
                  <p className="text-xs font-semibold text-foreground">#{order.orderNumber}</p>
                  <p className="text-[10px] text-muted-foreground">{timeAgo(order.createdAt)}</p>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <p className="text-xs text-foreground truncate">{order.customerName}</p>
                  <p className="text-[10px] text-muted-foreground">{order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
                </div>
                <p className="text-xs text-foreground/80 w-16 text-right">${Number(order.total ?? 0).toFixed(2)}</p>
                <div className="min-w-[150px]">
                  <StatusBadge status={order.status} />
                  {order.cjOrderId && <p className="text-[9px] text-muted-foreground/60 mt-0.5">CJ order {order.cjOrderId}</p>}
                </div>
                {(order.status === "routed_to_dsers" || order.status === "dsers_stuck") && (
                  <a href={DSERS_DASHBOARD_URL} target="_blank" rel="noopener noreferrer"
                    className={cn(
                      "flex items-center justify-center h-7 w-7 rounded-md border transition-colors flex-shrink-0",
                      order.status === "dsers_stuck"
                        ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                        : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    )}
                    title="Open DSers dashboard — no per-order link since DSers has no public API, but this gets you there fast">
                    <Truck className="w-3 h-3" />
                  </a>
                )}
                {shopifyOrderUrl(order.id) && (
                  <a href={shopifyOrderUrl(order.id)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center h-7 w-7 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors flex-shrink-0"
                    title="Open in Shopify Admin">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="glass rounded-xl p-12 text-center">
          <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {orders.length ? "No orders match this filter." : "No paid orders yet."}
          </p>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cronLabel } from "@/lib/cron";
import { Button } from "@/components/ui/button";
import { Settings, Loader2, Search, FileText, Package, BarChart3, Megaphone, ShoppingBag, Clock, ToggleLeft, ToggleRight, Calendar, Truck, DollarSign, ShieldCheck, Zap, Power, PowerOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { unmetRequirements, CONNECTION_LABELS } from "@shared/automationRequirements";

const moduleInfo: Record<string, { label: string; description: string; icon: any; color: string }> = {
  seo: { label: "SEO Automation", description: "Daily keyword research + product optimization", icon: Search, color: "oklch(0.65 0.18 240)" },
  blog: { label: "Blog Generation", description: "Auto-generate and publish blog posts with AI", icon: FileText, color: "oklch(0.78 0.15 65)" },
  sourcing: { label: "Product Sourcing", description: "Scheduled scraping of DSers & CJ Dropshipping", icon: Package, color: "oklch(0.72 0.18 300)" },
  inventory: { label: "Inventory Sync", description: "Monitor supplier stock, auto-update Shopify", icon: BarChart3, color: "oklch(0.82 0.12 85)" },
  ads: { label: "Ad Optimization", description: "Auto-optimize budgets and refresh creatives", icon: Megaphone, color: "oklch(0.6 0.22 25)" },
  shopify: { label: "Shopify Sync", description: "Periodic product catalog synchronization", icon: ShoppingBag, color: "oklch(0.65 0.18 145)" },
  fulfillment: { label: "Order Fulfillment", description: "Auto-place paid orders with CJ/DSers, sync tracking back to Shopify", icon: Truck, color: "oklch(0.7 0.17 160)" },
  accounting: { label: "Accounting Sync", description: "Import transactions from Shopify, PayPal, eBay into P&L", icon: DollarSign, color: "oklch(0.72 0.16 145)" },
  audit: { label: "Site Audit", description: "Scan for SEO/CRO issues across store pages", icon: ShieldCheck, color: "oklch(0.68 0.15 200)" },
};

// Fallback so a seeded module without an entry still renders instead of vanishing.
function getModuleInfo(module: string) {
  return moduleInfo[module] ?? { label: module, description: "Automation module", icon: Zap, color: "oklch(0.55 0.01 265)" };
}

// Crons execute in UTC on the server; the owner works in Eastern Time, so
// presets are defined as ET times and converted to the equivalent UTC hour
// (DST-aware as of today) when saved.
function etHourToUtcHour(etHour: number): number {
  const now = new Date();
  for (let h = 0; h < 24; h++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0));
    const etH = Number(d.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" })) % 24;
    if (etH === etHour % 24) return h;
  }
  return etHour;
}

const cronPresets = [
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 9am ET", value: `0 ${etHourToUtcHour(9)} * * *` },
  { label: "Daily at midnight ET", value: `0 ${etHourToUtcHour(0)} * * *` },
  { label: "Twice daily (9am & 9pm ET)", value: `0 ${etHourToUtcHour(9)},${etHourToUtcHour(21)} * * *` },
  { label: "Weekly (Mon 9am ET)", value: `0 ${etHourToUtcHour(9)} * * 1` },
];

export default function SchedulerPage() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.scheduler.getAll.useQuery();
  const { data: connectionStatus } = trpc.scheduler.getConnectionStatus.useQuery();

  const updateMutation = trpc.scheduler.update.useMutation({
    onSuccess: () => { utils.scheduler.getAll.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const handleToggle = (module: string, enabled: boolean) => {
    if (enabled && connectionStatus) {
      const missing = unmetRequirements(module, connectionStatus);
      if (missing.length > 0) {
        toast.error(`Connect ${missing.map((k) => CONNECTION_LABELS[k]).join(" and ")} first`);
        return;
      }
    }
    updateMutation.mutate({ module, enabled });
    toast.success(`${getModuleInfo(module).label} ${enabled ? "enabled" : "disabled"}`);
  };

  const handleCronChange = (module: string, cronExpression: string) => {
    updateMutation.mutate({ module, cronExpression });
    toast.success("Schedule updated");
  };

  const getCronLabel = (cron: string) => {
    return cronPresets.find(p => p.value === cron)?.label || cronLabel(cron);
  };

  const [bulkToggling, setBulkToggling] = useState(false);
  const handleBulkToggle = async (enabled: boolean) => {
    if (!settings) return;
    setBulkToggling(true);
    let targets = settings.filter((s: any) => s.enabled !== enabled);
    let skipped = 0;
    if (enabled && connectionStatus) {
      const eligible = targets.filter((s: any) => unmetRequirements(s.module, connectionStatus).length === 0);
      skipped = targets.length - eligible.length;
      targets = eligible;
    }
    const outcomes = await Promise.allSettled(
      targets.map((s: any) => updateMutation.mutateAsync({ module: s.module, enabled }))
    );
    const failed = outcomes.filter(o => o.status === "rejected").length;
    utils.scheduler.getAll.invalidate();
    setBulkToggling(false);
    if (failed === 0) {
      const skippedNote = skipped > 0 ? ` (${skipped} skipped — not connected)` : "";
      toast.success((targets.length ? `${enabled ? "Enabled" : "Disabled"} ${targets.length} automation(s)` : `All automations already ${enabled ? "enabled" : "disabled"}`) + skippedNote);
    } else {
      toast.error(`${targets.length - failed} updated, ${failed} failed`);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Automation Scheduler</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure run schedules and enable/disable each automation module independently</p>
      </div>

      {/* Overview */}
      {!isLoading && settings && (
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{settings.filter((s: any) => s.enabled).length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
            <div className="w-px h-10 bg-border/50" />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{settings.filter((s: any) => !s.enabled).length}</p>
              <p className="text-xs text-muted-foreground">Paused</p>
            </div>
            <div className="w-px h-10 bg-border/50" />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{settings.length}</p>
              <p className="text-xs text-muted-foreground">Total Modules</p>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => handleBulkToggle(true)}
                disabled={bulkToggling}
                className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              >
                {bulkToggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                Enable All
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => handleBulkToggle(false)}
                disabled={bulkToggling}
                className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                {bulkToggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PowerOff className="w-3.5 h-3.5" />}
                Disable All
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Times shown in Eastern Time (ET)
            </div>
          </div>
        </div>
      )}

      {/* Module Cards */}
      <div className="space-y-3">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : settings?.length ? (
          settings.map((setting: any) => {
            const info = getModuleInfo(setting.module);
            const Icon = info.icon;
            const missing = connectionStatus ? unmetRequirements(setting.module, connectionStatus) : [];
            const blocked = !setting.enabled && missing.length > 0;

            return (
              <div key={setting.module} className={cn("glass rounded-xl p-5 transition-all", !setting.enabled && "opacity-60")}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${info.color}20`, color: info.color }}>
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{info.label}</h3>
                        {setting.enabled && (
                          <span className="badge-success text-[10px]">
                            <span className="status-dot active" />Running
                          </span>
                        )}
                        {blocked && (
                          <span className="badge-error text-[10px]" title={`Requires ${missing.map((k) => CONNECTION_LABELS[k]).join(" and ")} to be connected`}>
                            Not connected
                          </span>
                        )}
                      </div>
                      <Switch
                        checked={setting.enabled}
                        onCheckedChange={(v) => handleToggle(setting.module, v)}
                        disabled={updateMutation.isPending || blocked}
                        title={blocked ? `Connect ${missing.map((k) => CONNECTION_LABELS[k]).join(" and ")} first` : undefined}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{info.description}</p>
                    {blocked && (
                      <p className="text-[11px] text-red-400/80 mb-2">
                        Requires {missing.map((k) => CONNECTION_LABELS[k]).join(" and ")} to be connected before this can run.
                      </p>
                    )}

                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Schedule:</span>
                        <Select
                          value={setting.cronExpression || "0 9 * * *"}
                          onValueChange={(v) => handleCronChange(setting.module, v)}
                          disabled={!setting.enabled}
                        >
                          <SelectTrigger className="h-7 text-xs bg-secondary/50 border-border/50 w-44">
                            <SelectValue>{getCronLabel(setting.cronExpression || "0 9 * * *")}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {cronPresets.map(p => (
                              <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {setting.lastRunAt && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            Last run: {new Date(setting.lastRunAt).toLocaleString()}
                          </span>
                          {setting.lastRunStatus && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded",
                              setting.lastRunStatus === "success" ? "badge-success" :
                              setting.lastRunStatus === "error" ? "badge-error" : "badge-warning"
                            )}>{setting.lastRunStatus}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {setting.lastRunMessage && (
                      <p className="text-[11px] text-muted-foreground/70 mt-2 font-mono">{setting.lastRunMessage}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="glass rounded-xl p-12 text-center">
            <Settings className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">No automation settings found.</p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">How Automation Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: "Scheduled Triggers", desc: "Each module runs on its configured cron schedule via heartbeat jobs that call your automation endpoints." },
            { title: "AI-Powered Execution", desc: "When triggered, modules use AI to research keywords, generate content, optimize products, and create ad creatives." },
            { title: "Shopify Sync", desc: "All changes — SEO updates, blog posts, inventory status — are pushed directly to your connected Shopify store." },
          ].map(({ title, desc }) => (
            <div key={title} className="bg-secondary/50 rounded-lg p-4">
              <p className="text-xs font-semibold text-foreground mb-1.5">{title}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

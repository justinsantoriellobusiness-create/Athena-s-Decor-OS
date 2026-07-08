import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Bot, Search, ShieldCheck, FileText, Link2, Mail, Package, BarChart3,
  Megaphone, DollarSign, Play, Clock, CheckCircle2, AlertCircle, Zap,
  RefreshCw, Settings2, TrendingUp, Target
} from "lucide-react";

const MODULES = [
  {
    id: "seo" as const,
    label: "SEO Optimizer",
    icon: Search,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    description: "Auto-refresh keywords, optimize product pages, update meta tags",
    defaultFreq: 24,
  },
  {
    id: "site_audit" as const,
    label: "Site Audit",
    icon: ShieldCheck,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    description: "Scan for SEO/CRO issues, auto-fix eligible problems",
    defaultFreq: 168,
  },
  {
    id: "blog" as const,
    label: "Blog Content",
    icon: FileText,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    description: "Generate & publish SEO blog posts with product links",
    defaultFreq: 72,
  },
  {
    id: "backlinker" as const,
    label: "Backlinker",
    icon: Link2,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    description: "AI-suggested backlink targets and draft outreach messages for you to review and send",
    defaultFreq: 48,
  },
  {
    id: "email_scraper" as const,
    label: "Prospect Scraper",
    icon: Target,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    description: "AI-generates candidate customer personas for research (not real scraped contacts — import real customers via Email Campaigns instead)",
    defaultFreq: 48,
  },
  {
    id: "email_campaigns" as const,
    label: "Email Campaigns",
    icon: Mail,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    description: "Auto-create and send campaigns to new prospects",
    defaultFreq: 72,
  },
  {
    id: "product_sourcing" as const,
    label: "Product Sourcing",
    icon: Package,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    description: "Real product search on CJ Dropshipping if connected; AI-generated ideas for DSers/AliExpress (no public search API for those)",
    defaultFreq: 24,
  },
  {
    id: "inventory" as const,
    label: "Inventory Sync",
    icon: BarChart3,
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
    description: "Sync Shopify inventory, flag low-stock and out-of-stock",
    defaultFreq: 6,
  },
  {
    id: "ads" as const,
    label: "Ad Creatives",
    icon: Megaphone,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    description: "Generate high-converting ad creatives for top products",
    defaultFreq: 168,
  },
  {
    id: "accounting" as const,
    label: "Accounting Sync",
    icon: DollarSign,
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    description: "Auto-sync transactions from connected financial accounts",
    defaultFreq: 24,
  },
  // "AI Code Assistant" was removed: it prompted the LLM with a generic
  // description of the tech stack, never the actual codebase, so every
  // "issue" it reported was invented rather than derived from real code.
  // Not something worth presenting as a real automation.
] as const;

type ModuleId = typeof MODULES[number]["id"];

function formatFreq(hours: number) {
  if (hours < 24) return `Every ${hours}h`;
  if (hours === 24) return "Daily";
  if (hours === 48) return "Every 2 days";
  if (hours === 72) return "Every 3 days";
  if (hours === 168) return "Weekly";
  return `Every ${Math.round(hours / 24)}d`;
}

function formatRelative(date: Date | string | null | undefined) {
  if (!date) return "Never";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

export default function AutomationHubPage() {
  const { data: configs, refetch } = trpc.autonomous.getAll.useQuery();
  const upsertConfig = trpc.autonomous.update.useMutation({ onSuccess: () => refetch() });
  const runNow = trpc.autonomous.runNow.useMutation();

  const [runningModules, setRunningModules] = useState<Set<ModuleId>>(new Set());
  const [runResults, setRunResults] = useState<Record<string, string>>({});
  const [enablingAll, setEnablingAll] = useState(false);

  const getConfig = (moduleId: ModuleId) =>
    configs?.find((c) => c.module === moduleId);

  const handleToggle = (moduleId: ModuleId, enabled: boolean) => {
    const existing = getConfig(moduleId);
    upsertConfig.mutate({
      module: moduleId,
      enabled,
      frequencyHours: existing?.frequencyHours ?? MODULES.find(m => m.id === moduleId)?.defaultFreq ?? 24,
    });
    toast.success(`${MODULES.find(m => m.id === moduleId)?.label} automation ${enabled ? "enabled" : "disabled"}`);
  };

  const handleFrequencyChange = (moduleId: ModuleId, hours: number) => {
    const existing = getConfig(moduleId);
    upsertConfig.mutate({
      module: moduleId,
      enabled: existing?.enabled ?? false,
      frequencyHours: hours,
    });
  };

  const handleEnableAll = async () => {
    setEnablingAll(true);
    const targets = MODULES.filter(m => !getConfig(m.id)?.enabled);
    const outcomes = await Promise.allSettled(
      targets.map(m => upsertConfig.mutateAsync({ module: m.id, enabled: true, frequencyHours: m.defaultFreq }))
    );
    const failed = outcomes.filter(o => o.status === "rejected").length;
    refetch();
    setEnablingAll(false);
    if (failed === 0) {
      toast.success(targets.length ? `Enabled ${targets.length} automation(s)` : "All automations already enabled");
    } else {
      toast.error(`${targets.length - failed} enabled, ${failed} failed — check and retry the ones still off`);
    }
  };

  const handleRunNow = async (moduleId: ModuleId) => {
    setRunningModules(prev => new Set(prev).add(moduleId));
    setRunResults(prev => ({ ...prev, [moduleId]: "" }));
    try {
      const result = await runNow.mutateAsync({ module: moduleId, config: {} });
      setRunResults(prev => ({ ...prev, [moduleId]: result.message }));
      toast.success(result.message);
      refetch();
    } catch (err: any) {
      const msg = err?.message ?? "Run failed";
      setRunResults(prev => ({ ...prev, [moduleId]: msg }));
      toast.error(msg);
    } finally {
      setRunningModules(prev => { const s = new Set(prev); s.delete(moduleId); return s; });
    }
  };

  const enabledCount = configs?.filter(c => c.enabled).length ?? 0;
  const totalModules = MODULES.length;

  // Frequency slider options in hours
  const freqOptions = [1, 3, 6, 12, 24, 48, 72, 168];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            Automation Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Fully autonomous AI operations — set frequency, enable, and let it run.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1 px-3 py-1.5">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            {enabledCount}/{totalModules} active
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableAll}
            disabled={enablingAll}
          >
            {enablingAll ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
            Enable All
          </Button>
        </div>
      </div>

      {/* ROI Summary Bar */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium">Automation Goal: Maximize ROI, Sales & Conversions</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs text-muted-foreground">All modules work together — sourcing finds products → SEO optimizes them → ads promote them → email converts prospects → accounting tracks profit</span>
          </div>
        </CardContent>
      </Card>

      {/* Module Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODULES.map((module) => {
          const config = getConfig(module.id);
          const isEnabled = config?.enabled ?? false;
          const freqHours = config?.frequencyHours ?? module.defaultFreq;
          const isRunning = runningModules.has(module.id);
          const lastRun = config?.lastAutoRunAt;
          const nextRun = config?.nextAutoRunAt;
          const result = runResults[module.id];
          const Icon = module.icon;
          const freqIndex = freqOptions.indexOf(freqHours) !== -1 ? freqOptions.indexOf(freqHours) : freqOptions.findIndex(f => f >= freqHours);

          return (
            <Card
              key={module.id}
              className={`border transition-all ${isEnabled ? module.border : "border-border"} ${isEnabled ? module.bg : ""}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${module.bg}`}>
                      <Icon className={`w-5 h-5 ${module.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{module.label}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{module.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(v) => handleToggle(module.id, v)}
                    disabled={upsertConfig.isPending}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Frequency Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Frequency
                    </span>
                    <span className="font-medium">{formatFreq(freqHours)}</span>
                  </div>
                  <Slider
                    min={0}
                    max={freqOptions.length - 1}
                    step={1}
                    value={[freqIndex >= 0 ? freqIndex : 4]}
                    onValueChange={([idx]) => handleFrequencyChange(module.id, freqOptions[idx])}
                    disabled={!isEnabled}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>1h</span>
                    <span>6h</span>
                    <span>Daily</span>
                    <span>Weekly</span>
                  </div>
                </div>

                {/* Status Row */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Last: {formatRelative(lastRun)}
                    </span>
                    {nextRun && isEnabled && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-blue-400" />
                        Next: {formatRelative(nextRun)}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleRunNow(module.id)}
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    {isRunning ? "Running..." : "Run Now"}
                  </Button>
                </div>

                {/* Progress bar when running */}
                {isRunning && (
                  <Progress value={undefined} className="h-1 animate-pulse" />
                )}

                {/* Result message */}
                {result && !isRunning && (
                  <div className={`text-xs px-3 py-2 rounded-md flex items-start gap-2 ${result.includes("failed") || result.includes("error") ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                    {result.includes("failed") || result.includes("error") ? (
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    )}
                    {result}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Automation Strategy Note */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Settings2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Recommended Automation Strategy for Maximum ROI</p>
              <p>Enable <strong>Inventory Sync</strong> (every 6h) first to keep stock accurate. Then <strong>Product Sourcing</strong> (daily) to auto-fill your catalog. <strong>SEO Optimizer</strong> (daily) + <strong>Site Audit</strong> (weekly) ensure discoverability. <strong>Blog Content</strong> (every 3 days) + <strong>Backlinker</strong> (every 2 days) drive organic traffic. <strong>Prospect Scraper</strong> + <strong>Email Campaigns</strong> convert visitors. <strong>Ad Creatives</strong> (weekly) keep paid channels fresh. <strong>Accounting Sync</strong> (daily) tracks profit in real time.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

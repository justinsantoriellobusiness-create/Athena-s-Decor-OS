import { cronLabel } from "@/lib/cron";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Search, TrendingUp, TrendingDown, Minus, Loader2, Play, BarChart2,
  AlertTriangle, CheckCircle2, Info, Zap, Package, Clock, XCircle,
  ChevronDown, ChevronUp, Sparkles, StopCircle, LayoutGrid, List, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function DifficultyBar({ value }: { value: number }) {
  const color = value < 30 ? "oklch(0.65 0.18 145)" : value < 60 ? "oklch(0.78 0.15 65)" : "oklch(0.6 0.22 25)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs text-muted-foreground w-6">{value}</span>
    </div>
  );
}

function formatEta(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "Calculating…";
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `~${m}m ${s}s`;
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function DiffField({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-white/30 uppercase tracking-wider">{label}</p>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-start">
        <p className="text-sm text-white/40 line-through decoration-red-400/40">{before || <span className="italic">empty</span>}</p>
        <ArrowRight className="w-3.5 h-3.5 text-white/20 mt-1 hidden md:block" />
        <p className="text-sm text-emerald-300/90">{after || <span className="italic text-white/30">empty</span>}</p>
      </div>
    </div>
  );
}

function BulkOptimizerPanel() {
  const utils = trpc.useUtils();
  const [activeJobId, setActiveJobId] = useState<number | undefined>(undefined);
  const [polling, setPolling] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "catalog">("list");

  const { data: jobData, refetch: refetchJob } = trpc.seo.getBulkOptimizeJob.useQuery(
    { jobId: activeJobId },
    { enabled: polling, refetchInterval: polling ? 2000 : false }
  );

  useEffect(() => {
    if (jobData && (jobData.status === "completed" || jobData.status === "cancelled" || jobData.status === "failed")) {
      setPolling(false);
      if (jobData.status === "completed") {
        toast.success(`Bulk optimization complete! ${jobData.completed} products optimized.`);
      } else if (jobData.status === "failed") {
        toast.error("Bulk optimization job failed.");
      }
    }
  }, [jobData]);

  const startMutation = trpc.seo.startBulkOptimize.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      setPolling(true);
      toast.success(`Started optimizing ${data.totalProducts} products…`);
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMutation = trpc.seo.cancelBulkOptimize.useMutation({
    onSuccess: () => {
      setPolling(false);
      toast.info("Bulk optimization cancelled.");
      refetchJob();
    },
    onError: (err) => toast.error(err.message),
  });

  const isRunning = jobData?.status === "running" || startMutation.isPending;
  const progress = jobData && jobData.totalProducts > 0
    ? Math.round(((jobData.completed + (jobData.failed ?? 0)) / jobData.totalProducts) * 100)
    : 0;

  const toggleItem = (id: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="bg-[#0f0f1a] border-white/5">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-400" />
                Bulk Catalog Optimizer
              </h3>
              <p className="text-sm text-white/40 mt-1">
                AI rewrites title, description, meta title (≤60 chars), and meta description (≤160 chars) for every product — then pushes to Shopify automatically.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {isRunning && activeJobId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5 bg-transparent"
                  onClick={() => cancelMutation.mutate({ jobId: activeJobId })}
                  disabled={cancelMutation.isPending}
                >
                  <StopCircle className="w-4 h-4" />
                  Cancel
                </Button>
              )}
              <Button
                className="bg-violet-600 hover:bg-violet-500 gap-2"
                onClick={() => startMutation.mutate()}
                disabled={isRunning}
              >
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isRunning ? "Optimizing…" : "Optimize Entire Catalog"}
              </Button>
            </div>
          </div>

          {/* Progress section */}
          {jobData && (
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium">
                    {jobData.completed}/{jobData.totalProducts} products
                  </span>
                  {jobData.failed > 0 && (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">
                      {jobData.failed} failed
                    </Badge>
                  )}
                  <Badge className={`text-xs ${
                    jobData.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    jobData.status === "running" ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                    jobData.status === "cancelled" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                    "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>
                    {jobData.status === "running" && <Loader2 className="w-3 h-3 mr-1 animate-spin inline" />}
                    {jobData.status}
                  </Badge>
                </div>
                {jobData.status === "running" && (
                  <span className="text-white/40 text-xs flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    ETA: {formatEta(jobData.etaSeconds)}
                  </span>
                )}
                {jobData.status === "completed" && (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Complete
                  </span>
                )}
              </div>
              <Progress value={progress} className="h-2 bg-white/5" />
              <p className="text-xs text-white/30">
                {progress}% complete · Rate-limited at 600ms/product to respect Shopify API limits
              </p>
            </div>
          )}

          {!jobData && !isRunning && (
            <div className="mt-4 flex items-center gap-3 p-3 bg-white/3 border border-white/5 rounded-lg">
              <Info className="w-4 h-4 text-white/30 shrink-0" />
              <p className="text-xs text-white/40">
                Connect your Shopify store in Settings first. The optimizer will fetch all products, generate AI-optimized content, and push updates directly to Shopify.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-product status list / catalog */}
      {jobData?.queue && jobData.queue.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-xs text-white/30 uppercase tracking-wider">Product Queue</p>
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${viewMode === "list" ? "bg-violet-600/30 text-violet-200" : "text-white/40 hover:text-white/70"}`}
              >
                <List className="w-3 h-3" /> List
              </button>
              <button
                onClick={() => setViewMode("catalog")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${viewMode === "catalog" ? "bg-violet-600/30 text-violet-200" : "text-white/40 hover:text-white/70"}`}
              >
                <LayoutGrid className="w-3 h-3" /> Catalog
              </button>
            </div>
          </div>

          {viewMode === "catalog" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {jobData.queue.slice(0, 100).map((item: any) => (
                <button
                  key={item.id}
                  onClick={() => item.status === "completed" && toggleItem(item.id)}
                  className={`text-left border rounded-lg overflow-hidden transition-all ${
                    item.status === "completed" ? "border-emerald-500/15 bg-emerald-500/3" :
                    item.status === "failed" ? "border-red-500/15 bg-red-500/3" :
                    item.status === "processing" ? "border-violet-500/20 bg-violet-500/5" :
                    "border-white/5 bg-[#0f0f1a]"
                  }`}
                >
                  <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-6 h-6 text-white/15" />
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="text-xs text-white/70 truncate">{item.optimizedTitle || item.originalTitle || `Product #${item.shopifyProductId}`}</p>
                    <Badge className={`text-[10px] ${
                      item.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      item.status === "failed" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                      item.status === "processing" ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                      "bg-white/5 text-white/30 border-white/10"
                    }`}>
                      {item.status}
                    </Badge>
                  </div>
                  {item.status === "completed" && expandedItems.has(item.id) && (
                    <div className="border-t border-white/5 p-3 space-y-3">
                      <DiffField label="Title" before={item.originalTitle ?? ""} after={item.optimizedTitle ?? ""} />
                      <DiffField label="Meta title" before={item.originalMetaTitle ?? ""} after={item.metaTitle ?? ""} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <>
              {jobData.queue.slice(0, 50).map((item: any) => (
                <div
                  key={item.id}
                  className={`border rounded-lg overflow-hidden transition-all ${
                    item.status === "completed" ? "border-emerald-500/15 bg-emerald-500/3" :
                    item.status === "failed" ? "border-red-500/15 bg-red-500/3" :
                    item.status === "processing" ? "border-violet-500/20 bg-violet-500/5" :
                    "border-white/5 bg-[#0f0f1a]"
                  }`}
                >
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => item.status === "completed" && toggleItem(item.id)}
                  >
                    <div className="w-9 h-9 rounded-md bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-4 h-4 text-white/15" />
                      )}
                    </div>
                    <div className="shrink-0">
                      {item.status === "completed" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {item.status === "failed" && <XCircle className="w-4 h-4 text-red-400" />}
                      {item.status === "processing" && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
                      {(item.status === "pending" || item.status === "skipped") && <Package className="w-4 h-4 text-white/20" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">
                        {item.optimizedTitle || item.originalTitle || `Product #${item.shopifyProductId}`}
                      </p>
                      {item.status === "failed" && item.errorMessage && (
                        <p className="text-xs text-red-400/70 truncate">{item.errorMessage}</p>
                      )}
                      {item.status === "completed" && item.metaTitle && (
                        <p className="text-xs text-white/30 truncate">Meta: {item.metaTitle}</p>
                      )}
                    </div>
                    <Badge className={`text-xs shrink-0 ${
                      item.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      item.status === "failed" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                      item.status === "processing" ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                      "bg-white/5 text-white/30 border-white/10"
                    }`}>
                      {item.status}
                    </Badge>
                    {item.status === "completed" && (
                      expandedItems.has(item.id) ? <ChevronUp className="w-3 h-3 text-white/30" /> : <ChevronDown className="w-3 h-3 text-white/30" />
                    )}
                  </div>

                  {item.status === "completed" && expandedItems.has(item.id) && (
                    <div className="border-t border-white/5 p-4 space-y-4">
                      <DiffField label="Title" before={item.originalTitle ?? ""} after={item.optimizedTitle ?? ""} />
                      <DiffField label="Description" before={stripHtml(item.originalDescription)} after={stripHtml(item.optimizedDescription)} />
                      <DiffField label={`Meta title (${item.metaTitle?.length ?? 0} chars)`} before={item.originalMetaTitle ?? ""} after={item.metaTitle ?? ""} />
                      <DiffField label={`Meta description (${item.metaDescription?.length ?? 0} chars)`} before={item.originalMetaDescription ?? ""} after={item.metaDescription ?? ""} />
                    </div>
                  )}
                </div>
              ))}
              {jobData.queue.length > 50 && (
                <p className="text-xs text-white/30 text-center py-2">
                  Showing 50 of {jobData.queue.length} products
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SeoPage() {
  const [topic, setTopic] = useState("home decor");
  const [productId, setProductId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [auditResult, setAuditResult] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: keywords, isLoading: kwLoading } = trpc.seo.getKeywords.useQuery();
  const { data: jobs, isLoading: jobsLoading } = trpc.seo.getJobs.useQuery();

  const kwMutation = trpc.seo.runKeywordResearch.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.count} keywords`);
      utils.seo.getKeywords.invalidate();
      utils.seo.getJobs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const optimizeMutation = trpc.seo.optimizeProduct.useMutation({
    onSuccess: () => {
      toast.success("Product SEO optimized and pushed to Shopify");
      utils.seo.getJobs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const auditMutation = trpc.seo.runSiteAudit.useMutation({
    onSuccess: (data) => {
      setAuditResult(data.result);
      toast.success("Site audit complete");
      utils.seo.getJobs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: settings } = trpc.scheduler.getAll.useQuery();
  const updateScheduler = trpc.scheduler.update.useMutation({ onSuccess: () => toast.success("Automation updated") });
  const seoSetting = settings?.find((s: any) => s.module === "seo");

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">SEO Module</h1>
          <p className="text-white/40 text-sm mt-1">AI-powered keyword research, product optimization, and site audits</p>
        </div>
        {seoSetting && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/5 border border-amber-500/10 rounded-lg shrink-0">
            <Zap className="w-4 h-4 text-amber-400" />
            <div>
              <p className="text-xs text-amber-400 font-medium">Auto-SEO</p>
              <p className="text-xs text-white/30">{cronLabel(seoSetting.cronExpression) }</p>
            </div>
            <button
              onClick={() => updateScheduler.mutate({ module: "seo", enabled: !seoSetting.enabled })}
              className="ml-1"
            >
              {seoSetting.enabled
                ? <div className="w-8 h-4 bg-amber-500 rounded-full relative"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full" /></div>
                : <div className="w-8 h-4 bg-white/10 rounded-full relative"><div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white/40 rounded-full" /></div>
              }
            </button>
          </div>
        )}
      </div>

      <Tabs defaultValue="bulk">
        <TabsList className="bg-white/5 border border-white/5">
          <TabsTrigger value="bulk" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/50 gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Bulk Optimizer
          </TabsTrigger>
          <TabsTrigger value="keywords" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/50 gap-1.5">
            <Search className="w-3.5 h-3.5" /> Keywords {keywords && `(${keywords.length})`}
          </TabsTrigger>
          <TabsTrigger value="product" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/50 gap-1.5">
            <Package className="w-3.5 h-3.5" /> Single Product
          </TabsTrigger>
          <TabsTrigger value="audit" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/50 gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> Quick Audit
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/50 gap-1.5">
            <Clock className="w-3.5 h-3.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* ── Bulk Optimizer Tab ── */}
        <TabsContent value="bulk" className="mt-4">
          <BulkOptimizerPanel />
        </TabsContent>

        {/* ── Keywords Tab ── */}
        <TabsContent value="keywords" className="mt-4 space-y-4">
          <Card className="bg-[#0f0f1a] border-white/5">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Topic (e.g. home decor dropshipping)"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
                <Button
                  onClick={() => kwMutation.mutate({ topic })}
                  disabled={kwMutation.isPending}
                  className="bg-violet-600 hover:bg-violet-500 gap-2 shrink-0"
                >
                  {kwMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Research
                </Button>
              </div>
            </CardContent>
          </Card>

          {kwLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 bg-white/5" />)}</div>
          ) : (keywords || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/30 gap-2">
              <Search className="w-10 h-10" />
              <p className="text-sm">No keywords yet. Run keyword research to get started.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-white/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/3">
                    <th className="text-left p-3 text-white/40 font-medium">Keyword</th>
                    <th className="text-left p-3 text-white/40 font-medium">Volume</th>
                    <th className="text-left p-3 text-white/40 font-medium w-40">Difficulty</th>
                    <th className="text-left p-3 text-white/40 font-medium">Intent</th>
                    <th className="text-left p-3 text-white/40 font-medium">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {(keywords || []).map((kw: any) => (
                    <tr key={kw.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                      <td className="p-3 text-white font-medium">{kw.keyword}</td>
                      <td className="p-3 text-white/60">{(kw.searchVolume ?? 0).toLocaleString()}</td>
                      <td className="p-3"><DifficultyBar value={kw.difficulty ?? 0} /></td>
                      <td className="p-3">
                        <Badge className={`text-xs ${
                          kw.intent === "transactional" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          kw.intent === "commercial" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                          "bg-white/5 text-white/40 border-white/10"
                        }`}>{kw.intent}</Badge>
                      </td>
                      <td className="p-3 text-white/60">${(kw.cpc ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Single Product Tab ── */}
        <TabsContent value="product" className="mt-4">
          <Card className="bg-[#0f0f1a] border-white/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white">Optimize Single Product</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                placeholder="Shopify Product ID"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
              <Input
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
                placeholder="Product Title"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
              <textarea
                value={productDesc}
                onChange={(e) => setProductDesc(e.target.value)}
                placeholder="Current product description (optional)"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-md p-3 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <Button
                onClick={() => optimizeMutation.mutate({ productId, productTitle, productDescription: productDesc })}
                disabled={optimizeMutation.isPending || !productId || !productTitle}
                className="bg-violet-600 hover:bg-violet-500 gap-2 w-full"
              >
                {optimizeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {optimizeMutation.isPending ? "Optimizing…" : "Optimize & Push to Shopify"}
              </Button>
              {optimizeMutation.data?.result && (
                <div className="mt-2 p-4 bg-white/3 border border-white/5 rounded-lg space-y-2">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Results</p>
                  {Object.entries(optimizeMutation.data.result).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-xs text-white/30 capitalize w-32 shrink-0">{k.replace(/([A-Z])/g, " $1")}</span>
                      <span className="text-xs text-white/70">{Array.isArray(v) ? (v as string[]).join(", ") : String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Quick Audit Tab ── */}
        <TabsContent value="audit" className="mt-4 space-y-4">
          <Card className="bg-[#0f0f1a] border-white/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Quick SEO Audit</p>
                  <p className="text-xs text-white/40 mt-0.5">AI-generated checklist for your store</p>
                </div>
                <Button
                  onClick={() => auditMutation.mutate()}
                  disabled={auditMutation.isPending}
                  className="bg-violet-600 hover:bg-violet-500 gap-2"
                >
                  {auditMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {auditMutation.isPending ? "Auditing…" : "Run Audit"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {auditResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="text-4xl font-bold text-white">{auditResult.score}</div>
                <div>
                  <p className="text-sm text-white/60">SEO Score</p>
                  <p className="text-xs text-white/30">{auditResult.summary}</p>
                </div>
              </div>
              <div className="space-y-2">
                {(auditResult.issues || []).map((issue: any, i: number) => {
                  const Icon = issue.severity === "high" ? AlertTriangle : issue.severity === "medium" ? Minus : Info;
                  const color = issue.severity === "high" ? "text-red-400" : issue.severity === "medium" ? "text-amber-400" : "text-blue-400";
                  return (
                    <div key={i} className="flex gap-3 p-3 bg-white/3 border border-white/5 rounded-lg">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                      <div>
                        <p className="text-sm text-white font-medium">{issue.title}</p>
                        <p className="text-xs text-white/50 mt-0.5">{issue.description}</p>
                        <p className="text-xs text-violet-400 mt-1">{issue.recommendation}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="mt-4">
          {jobsLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 bg-white/5" />)}</div>
          ) : (jobs || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/30 gap-2">
              <Clock className="w-10 h-10" />
              <p className="text-sm">No SEO jobs yet</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-white/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/3">
                    <th className="text-left p-3 text-white/40 font-medium">Type</th>
                    <th className="text-left p-3 text-white/40 font-medium">Status</th>
                    <th className="text-left p-3 text-white/40 font-medium">Started</th>
                    <th className="text-left p-3 text-white/40 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {(jobs || []).map((job: any) => (
                    <tr key={job.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                      <td className="p-3 text-white capitalize">{(job.type || "").replace(/_/g, " ")}</td>
                      <td className="p-3">
                        <Badge className={`text-xs ${
                          job.status === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          job.status === "running" ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                          job.status === "error" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          "bg-white/5 text-white/40 border-white/10"
                        }`}>
                          {job.status === "running" && <Loader2 className="w-3 h-3 mr-1 animate-spin inline" />}
                          {job.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-white/50">{job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"}</td>
                      <td className="p-3 text-white/50">{job.completedAt ? new Date(job.completedAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

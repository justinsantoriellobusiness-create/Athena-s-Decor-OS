import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Package, Search, Plus, Trash2, Play, Star, Clock, TrendingUp,
  Download, Settings2, CheckCircle2, XCircle, RefreshCw,
  ShoppingCart, Heart, Send, ChevronDown, ChevronUp, Sparkles, Link2,
  Crown, Truck,
} from "lucide-react";

function SourceBadge({ source }: { source: string }) {
  if (source === "dsers") return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">DSers</Badge>;
  if (source === "aliexpress") return <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">AliExpress</Badge>;
  return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">CJ Drop</Badge>;
}

function VerifiedBadge({ isVerified }: { isVerified: boolean }) {
  return isVerified
    ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]" title="Real, live supplier listing — safe to auto-import and auto-fulfill">✓ Verified</Badge>
    : <Badge className="bg-white/10 text-white/50 border-white/10 text-[10px]" title="AI-generated idea, not a live listing — review before importing; can't auto-fulfill">AI idea</Badge>;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    : score >= 6 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
    : "text-red-400 bg-red-500/10 border-red-500/20";
  return <Badge className={`${color} text-[10px] font-bold`}>{score.toFixed(1)}/10</Badge>;
}

export default function SourcingPage() {
  const [activeTab, setActiveTab] = useState("products");
  const [selectedSpec, setSelectedSpec] = useState<number | null>(null);
  const [showNewSpec, setShowNewSpec] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [autoOptimize, setAutoOptimize] = useState(false);
  const [bestPicksOnly, setBestPicksOnly] = useState(true);
  const [bulkImportRunning, setBulkImportRunning] = useState(false);

  const [newSpec, setNewSpec] = useState({
    name: "",
    keywords: "",
    minPrice: "",
    maxPrice: "",
    maxShippingDays: "15",
    minRating: "4.0",
    minOrders: "100",
    sources: ["dsers", "cj", "aliexpress"] as string[],
    autoOptimizeBeforeImport: false,
  });

  const specsQuery = trpc.sourcing.getSpecs.useQuery();
  const resultsQuery = trpc.sourcing.getResults.useQuery(
    { specId: selectedSpec! },
    { enabled: !!selectedSpec }
  );
  const appCredsQuery = trpc.sourcing.getAppCredentials.useQuery();

  const createSpecMutation = trpc.sourcing.createSpec.useMutation({
    onSuccess: () => { specsQuery.refetch(); setShowNewSpec(false); toast.success("Sourcing spec created"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteSpecMutation = trpc.sourcing.deleteSpec.useMutation({
    onSuccess: () => { specsQuery.refetch(); setSelectedSpec(null); toast.success("Spec deleted"); },
  });
  const runScrapeMutation = trpc.sourcing.runScrape.useMutation({
    onSuccess: (d) => { resultsQuery.refetch(); specsQuery.refetch(); toast.success(`Found ${d.count} products`); },
    onError: (e) => toast.error(e.message),
  });
  const importMutation = trpc.sourcing.importProduct.useMutation({
    onSuccess: (d) => {
      resultsQuery.refetch();
      toast.success(d.optimized ? "Imported & SEO-optimized to Shopify ✨" : "Imported to Shopify as draft");
    },
    onError: (e) => toast.error(e.message),
  });
  const bulkImportMutation = trpc.sourcing.bulkImport.useMutation({
    onSuccess: (d) => {
      resultsQuery.refetch();
      setBulkImportRunning(false);
      toast.success(`Bulk import done: ${d.imported} imported, ${d.failed} failed`);
    },
    onError: (e) => { setBulkImportRunning(false); toast.error(e.message); },
  });
  // Kicks off the full Bulk Catalog Optimizer job (the SEO page's queue-based
  // optimizer, not the lighter inline rewrite the "Auto-Optimize SEO" toggle
  // does at import time) so "Import & Optimize All" is a genuine single click
  // instead of import-then-remember-to-go-optimize-separately.
  const startBulkOptimizeMutation = trpc.seo.startBulkOptimize.useMutation({
    onSuccess: (d) => {
      toast.success(`Optimizing ${d.totalProducts} catalog products — track progress on the SEO page.`);
    },
    onError: (e) => toast.error(`Import finished, but catalog optimization failed to start: ${e.message}`),
  });
  const [importAndOptimizeRunning, setImportAndOptimizeRunning] = useState(false);
  const pushToCjMutation = trpc.sourcing.pushToCjFavorites.useMutation({
    onSuccess: (d) => toast.success(`Added ${d.pushed} products to CJ Favorites`),
    onError: (e) => toast.error(e.message),
  });

  const specs = specsQuery.data || [];
  const products = resultsQuery.data || [];
  const appCreds = appCredsQuery.data || [];
  const cjConnected = appCreds.find((c) => c.app === "cj")?.isConnected;

  const toggleSource = (src: string) => {
    setNewSpec((prev) => ({
      ...prev,
      sources: prev.sources.includes(src)
        ? prev.sources.filter((s) => s !== src)
        : [...prev.sources, src],
    }));
  };

  const toggleProductSelect = (id: number) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkImport = () => {
    if (!selectedSpec) return;
    setBulkImportRunning(true);
    bulkImportMutation.mutate({ specId: selectedSpec, bestPicksOnly, autoOptimize });
  };

  const handleImportAndOptimizeAll = async () => {
    if (!selectedSpec) return;
    setImportAndOptimizeRunning(true);
    setBulkImportRunning(true);
    try {
      // Skip the per-product inline rewrite here — the catalog optimizer
      // that runs next already rewrites title/description/meta for every
      // product, so doing both would be a redundant, slower LLM pass.
      const importResult = await bulkImportMutation.mutateAsync({ specId: selectedSpec, bestPicksOnly, autoOptimize: false });
      setBulkImportRunning(false);
      if (importResult.imported > 0) {
        await startBulkOptimizeMutation.mutateAsync();
      } else {
        toast.warning("Nothing was imported, so catalog optimization wasn't started.");
      }
    } catch {
      // Errors are already surfaced via each mutation's onError toast.
    } finally {
      setImportAndOptimizeRunning(false);
    }
  };

  const handlePushToCj = (ids?: number[]) => {
    const productIds = ids || (selectedProducts.size > 0 ? Array.from(selectedProducts) : products.filter((p) => p.source === "cj").map((p) => p.id));
    pushToCjMutation.mutate({ productIds });
  };

  const pendingCount = products.filter((p) => p.importStatus === "pending" && (bestPicksOnly ? p.isBestPick : true)).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Product Sourcing</h1>
          <p className="text-white/40 text-sm mt-1">AI-powered scraper for DSers, CJ Dropshipping & AliExpress with smart product scoring</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setActiveTab("settings")} className="border-white/10 text-white/60 hover:text-white">
            <Settings2 className="w-4 h-4 mr-2" />App Connections
          </Button>
          <Button size="sm" onClick={() => setShowNewSpec(true)} className="bg-violet-600 hover:bg-violet-500">
            <Plus className="w-4 h-4 mr-2" />New Sourcing Spec
          </Button>
        </div>
      </div>

      <div className="bg-violet-500/5 border border-violet-500/10 rounded-lg px-4 py-3 text-xs text-white/50">
        <strong className="text-white/70">How this works:</strong> Create a spec below (keywords + price/rating filters) →
        click <strong className="text-white/70">Run Scrape</strong> → review results, each tagged{" "}
        <VerifiedBadge isVerified={true} /> (a real CJ Dropshipping listing — safe to import and auto-fulfill) or{" "}
        <VerifiedBadge isVerified={false} /> (an AI-generated idea to research manually — DSers/AliExpress have no public
        search API, so those results are always AI ideas) → click <strong className="text-white/70">Import</strong> on
        any product to push it live to Shopify.
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="products" className="data-[state=active]:bg-violet-600">Products</TabsTrigger>
          <TabsTrigger value="specs" className="data-[state=active]:bg-violet-600">Sourcing Specs</TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-violet-600">App Connections</TabsTrigger>
        </TabsList>

        {/* ── Products Tab ── */}
        <TabsContent value="products" className="space-y-4 mt-4">
          {/* Spec selector */}
          <div className="flex gap-2 flex-wrap">
            {specs.map((spec) => (
              <button
                key={spec.id}
                onClick={() => setSelectedSpec(spec.id)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${selectedSpec === spec.id ? "bg-violet-600 border-violet-500 text-white" : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20"}`}
              >
                {spec.name}
                <span className="ml-2 text-xs opacity-60">{spec.resultCount || 0}</span>
              </button>
            ))}
            {specs.length === 0 && (
              <p className="text-white/40 text-sm">No specs yet. Create one to start sourcing.</p>
            )}
          </div>

          {selectedSpec && (
            <>
              {!cjConnected && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-300">
                  <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  CJ Dropshipping isn't connected — scraping will only produce AI-generated ideas (marked "AI idea"), not real, importable listings.{" "}
                  <button onClick={() => setActiveTab("settings")} className="underline underline-offset-2 hover:text-amber-200">
                    Connect it in App Connections
                  </button>.
                </div>
              )}
              {/* Toolbar */}
              <div className="flex items-center gap-2 flex-wrap bg-white/3 border border-white/8 rounded-xl p-3">
                <Button
                  size="sm"
                  onClick={() => runScrapeMutation.mutate({ specId: selectedSpec })}
                  disabled={runScrapeMutation.isPending}
                  className="bg-violet-600 hover:bg-violet-500"
                >
                  {runScrapeMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                  {runScrapeMutation.isPending ? "Scraping..." : "Run Scrape"}
                </Button>

                <div className="h-6 w-px bg-white/10 mx-1" />

                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                  <Switch checked={autoOptimize} onCheckedChange={setAutoOptimize} id="auto-opt" className="scale-75" />
                  <Label htmlFor="auto-opt" className="text-xs text-white/70 cursor-pointer flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-violet-400" />Auto-Optimize SEO
                  </Label>
                </div>

                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                  <Switch checked={bestPicksOnly} onCheckedChange={setBestPicksOnly} id="best-picks" className="scale-75" />
                  <Label htmlFor="best-picks" className="text-xs text-white/70 cursor-pointer flex items-center gap-1">
                    <Crown className="w-3 h-3 text-yellow-400" />Best Picks Only
                  </Label>
                </div>

                <div className="h-6 w-px bg-white/10 mx-1" />

                <Button
                  size="sm"
                  onClick={handleBulkImport}
                  disabled={bulkImportMutation.isPending || importAndOptimizeRunning || pendingCount === 0}
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  {bulkImportMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Bulk Import {pendingCount > 0 ? `(${pendingCount})` : ""}
                </Button>

                <Button
                  size="sm"
                  onClick={handleImportAndOptimizeAll}
                  disabled={bulkImportMutation.isPending || importAndOptimizeRunning || pendingCount === 0}
                  title="Imports the selected products, then runs the full Bulk Catalog Optimizer on your whole Shopify catalog"
                  className="bg-gradient-to-r from-emerald-600 to-violet-600 hover:from-emerald-500 hover:to-violet-500"
                >
                  {importAndOptimizeRunning ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Import & Optimize All {pendingCount > 0 ? `(${pendingCount})` : ""}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePushToCj()}
                  disabled={pushToCjMutation.isPending || !cjConnected}
                  title={!cjConnected ? "Connect CJ in App Connections first" : "Add CJ products to Favorites"}
                  className={`border-white/10 text-white/70 hover:text-white ${!cjConnected ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {pushToCjMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Heart className="w-4 h-4 mr-2" />}
                  CJ Favorites
                </Button>

                {selectedProducts.size > 0 && (
                  <>
                    <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30">
                      {selectedProducts.size} selected
                    </Badge>
                    <button onClick={() => setSelectedProducts(new Set())} className="text-xs text-white/40 hover:text-white/70 transition-colors">
                      Clear
                    </button>
                  </>
                )}
              </div>

              {/* Bulk import progress */}
              {bulkImportRunning && (
                <Card className="bg-emerald-500/10 border-emerald-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-emerald-400 text-sm font-medium flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Bulk importing {autoOptimize ? "& optimizing" : ""}...
                      </span>
                      <span className="text-white/60 text-xs">{pendingCount} products queued</span>
                    </div>
                    <Progress value={undefined} className="h-2 animate-pulse" />
                    <p className="text-white/40 text-xs mt-2">Processing with 600ms delay between Shopify writes to respect rate limits</p>
                  </CardContent>
                </Card>
              )}

              {/* Products grid */}
              {resultsQuery.isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-48 bg-white/5 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-16 text-white/30">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="mb-3">No products yet. Run a scrape to find products.</p>
                  <Button size="sm" onClick={() => runScrapeMutation.mutate({ specId: selectedSpec })} className="bg-violet-600 hover:bg-violet-500">
                    <Play className="w-4 h-4 mr-2" />Run Scrape Now
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {products.map((product) => (
                    <Card
                      key={product.id}
                      className={`bg-white/5 border transition-all ${selectedProducts.has(product.id) ? "border-violet-500/50 bg-violet-500/5" : "border-white/10 hover:border-white/20"} ${product.isBestPick ? "ring-1 ring-emerald-500/30" : ""}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex gap-3">
                          <div className="relative flex-shrink-0">
                            <Checkbox
                              checked={selectedProducts.has(product.id)}
                              onCheckedChange={() => toggleProductSelect(product.id)}
                              className="absolute top-0 left-0 z-10 bg-black/50"
                            />
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.title} className="w-16 h-16 rounded-lg object-cover mt-5" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center mt-5">
                                <Package className="w-6 h-6 text-white/30" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1 mb-1">
                              <div className="flex gap-1 flex-wrap">
                                <SourceBadge source={product.source} />
                                <VerifiedBadge isVerified={!!product.isVerified} />
                                {product.isBestPick && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]"><Crown className="w-2.5 h-2.5 mr-0.5" />Best Pick</Badge>}
                              </div>
                              {product.aiScore != null && <ScoreBadge score={product.aiScore} />}
                            </div>
                            <p className="text-white text-sm font-medium line-clamp-2 mb-1">{product.title}</p>
                            <div className="flex items-center gap-3 text-xs text-white/50">
                              <span className="font-semibold text-white/80">${product.price?.toFixed(2)}</span>
                              {product.compareAtPrice && <span className="line-through">${product.compareAtPrice?.toFixed(2)}</span>}
                              {product.shippingDays != null && (
                                <span className="flex items-center gap-1">
                                  <Truck className="w-3 h-3" />{product.shippingDays}d
                                </span>
                              )}
                              {product.rating != null && (
                                <span className="flex items-center gap-1">
                                  <Star className="w-3 h-3 text-yellow-400" />{product.rating}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {expandedProduct === product.id && (
                          <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                            {product.aiScoreReason && (
                              <p className="text-xs text-white/50 italic">{product.aiScoreReason}</p>
                            )}
                            <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                              {product.supplier && <span>Supplier: {product.supplier}</span>}
                              {product.orders != null && <span><TrendingUp className="w-3 h-3 inline mr-1" />{product.orders} orders</span>}
                              {product.stockLevel != null && <span>Stock: {product.stockLevel}</span>}
                              {product.category && <span>Category: {product.category}</span>}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
                            className="text-white/40 hover:text-white/70 transition-colors"
                          >
                            {expandedProduct === product.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>

                          {product.importStatus === "pending" && (
                            <Button
                              size="sm"
                              className="flex-1 h-7 text-xs bg-violet-600 hover:bg-violet-500"
                              onClick={() => importMutation.mutate({ productId: product.id, autoOptimize })}
                              disabled={importMutation.isPending}
                            >
                              {autoOptimize ? <><Sparkles className="w-3 h-3 mr-1" />Import + Optimize</> : <><ShoppingCart className="w-3 h-3 mr-1" />Import</>}
                            </Button>
                          )}
                          {product.importStatus === "importing" && (
                            <Badge className="flex-1 justify-center bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-xs h-7">
                              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />Importing...
                            </Badge>
                          )}
                          {product.importStatus === "imported" && (
                            <Badge className="flex-1 justify-center bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs h-7">
                              <CheckCircle2 className="w-3 h-3 mr-1" />In Shopify
                            </Badge>
                          )}
                          {product.importStatus === "failed" && (
                            <Button
                              size="sm"
                              className="flex-1 h-7 text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/20"
                              onClick={() => importMutation.mutate({ productId: product.id, autoOptimize })}
                            >
                              <XCircle className="w-3 h-3 mr-1" />Retry
                            </Button>
                          )}

                          {cjConnected && product.source === "cj" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 border-white/10 text-white/50 hover:text-white"
                              title="Add to CJ Favorites"
                              onClick={() => handlePushToCj([product.id])}
                              disabled={pushToCjMutation.isPending}
                            >
                              <Heart className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Specs Tab ── */}
        <TabsContent value="specs" className="space-y-4 mt-4">
          <div className="grid gap-4">
            {specs.map((spec) => (
              <Card key={spec.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-medium">{spec.name}</h3>
                        <Badge className={`text-[10px] ${spec.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : spec.status === "running" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : spec.status === "error" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-white/10 text-white/50 border-white/10"}`}>
                          {spec.status}
                        </Badge>
                        {(spec as any).autoOptimizeBeforeImport && (
                          <Badge className="bg-violet-500/10 text-violet-400 border-violet-500/20 text-[10px]">
                            <Sparkles className="w-2.5 h-2.5 mr-1" />Auto-Optimize
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap mb-2">
                        {(spec.keywords as string[]).map((kw) => (
                          <Badge key={kw} className="bg-white/5 text-white/50 border-white/10 text-[10px]">{kw}</Badge>
                        ))}
                      </div>
                      <div className="flex gap-3 text-xs text-white/40 flex-wrap">
                        <span>Sources: {(spec.sources as string[]).join(", ")}</span>
                        {spec.resultCount ? <span>{spec.resultCount} products found</span> : null}
                        {spec.lastRunAt && <span>Last run: {new Date(spec.lastRunAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-white/10 text-white/60 hover:text-white"
                        onClick={() => { setSelectedSpec(spec.id); setActiveTab("products"); runScrapeMutation.mutate({ specId: spec.id }); }}
                        disabled={runScrapeMutation.isPending}
                      >
                        <Play className="w-3 h-3 mr-1" />Run
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/20 text-red-400 hover:bg-red-500/10"
                        onClick={() => deleteSpecMutation.mutate({ id: spec.id })}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {specs.length === 0 && (
              <div className="text-center py-12 text-white/30">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="mb-3">No sourcing specs yet.</p>
                <Button size="sm" onClick={() => setShowNewSpec(true)} className="bg-violet-600 hover:bg-violet-500">
                  <Plus className="w-4 h-4 mr-2" />Create First Spec
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── App Connections Tab ── */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          <p className="text-white/40 text-sm">Connect your sourcing apps to push products directly without manual copy-paste.</p>
          {/* AutoDS removed — account/connection discontinued by the owner. */}
          <AppConnectionCard
            app="cj"
            title="CJ Dropshipping"
            description="Add products directly to your CJ Favorites list for quick ordering and fulfillment"
            icon="📦"
            isConnected={!!cjConnected}
            fields={[
              { key: "apiKey", label: "CJ API Key", placeholder: "Your CJ Dropshipping API key", type: "password" },
              { key: "apiSecret", label: "CJ Account Email", placeholder: "The email you log into CJ Dropshipping with", type: "text" },
            ]}
            onRefetch={() => appCredsQuery.refetch()}
          />
          <AppConnectionCard
            app="dsers"
            title="DSers"
            description="Connect your DSers account to source products from AliExpress suppliers with automated order fulfillment"
            icon="🔗"
            isConnected={!!appCreds.find((c) => c.app === 'dsers')?.isConnected}
            fields={[
              { key: "apiKey", label: "DSers API Key", placeholder: "Your DSers API key from Settings > API", type: "password" },
              { key: "storeId", label: "Store ID", placeholder: "Your DSers Store ID", type: "text" },
            ]}
            onRefetch={() => appCredsQuery.refetch()}
          />
        </TabsContent>
      </Tabs>

      {/* New Spec Dialog */}
      <Dialog open={showNewSpec} onOpenChange={setShowNewSpec}>
        <DialogContent className="bg-[#1a1a2e] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>New Sourcing Spec</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-white/70 text-sm">Spec Name</Label>
              <Input
                value={newSpec.name}
                onChange={(e) => setNewSpec((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Home Decor Q3"
                className="bg-white/5 border-white/10 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-white/70 text-sm">Keywords (comma-separated)</Label>
              <Input
                value={newSpec.keywords}
                onChange={(e) => setNewSpec((p) => ({ ...p, keywords: e.target.value }))}
                placeholder="wall art, candles, vases"
                className="bg-white/5 border-white/10 text-white mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white/70 text-sm">Min Price ($)</Label>
                <Input value={newSpec.minPrice} onChange={(e) => setNewSpec((p) => ({ ...p, minPrice: e.target.value }))} placeholder="5" className="bg-white/5 border-white/10 text-white mt-1" />
              </div>
              <div>
                <Label className="text-white/70 text-sm">Max Price ($)</Label>
                <Input value={newSpec.maxPrice} onChange={(e) => setNewSpec((p) => ({ ...p, maxPrice: e.target.value }))} placeholder="100" className="bg-white/5 border-white/10 text-white mt-1" />
              </div>
              <div>
                <Label className="text-white/70 text-sm">Max Shipping Days</Label>
                <Input value={newSpec.maxShippingDays} onChange={(e) => setNewSpec((p) => ({ ...p, maxShippingDays: e.target.value }))} placeholder="15" className="bg-white/5 border-white/10 text-white mt-1" />
              </div>
              <div>
                <Label className="text-white/70 text-sm">Min Rating</Label>
                <Input value={newSpec.minRating} onChange={(e) => setNewSpec((p) => ({ ...p, minRating: e.target.value }))} placeholder="4.0" className="bg-white/5 border-white/10 text-white mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-white/70 text-sm mb-2 block">Sources</Label>
              <div className="flex gap-3 flex-wrap">
                {[
                  { key: "dsers", label: "DSers" },
                  { key: "cj", label: "CJ Dropshipping" },
                  { key: "aliexpress", label: "AliExpress" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={newSpec.sources.includes(key)}
                      onCheckedChange={() => toggleSource(key)}
                    />
                    <span className="text-sm text-white/70">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
              <Switch
                checked={newSpec.autoOptimizeBeforeImport}
                onCheckedChange={(v) => setNewSpec((p) => ({ ...p, autoOptimizeBeforeImport: v }))}
                id="auto-opt-spec"
              />
              <div>
                <Label htmlFor="auto-opt-spec" className="text-white/80 text-sm cursor-pointer flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />Auto-Optimize SEO Before Import
                </Label>
                <p className="text-white/40 text-xs mt-0.5">AI rewrites title, description & meta tags before pushing to Shopify</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSpec(false)} className="border-white/10 text-white/60">Cancel</Button>
            <Button
              onClick={() => createSpecMutation.mutate({
                name: newSpec.name,
                keywords: newSpec.keywords.split(",").map((k) => k.trim()).filter(Boolean),
                minPrice: newSpec.minPrice ? Number(newSpec.minPrice) : undefined,
                maxPrice: newSpec.maxPrice ? Number(newSpec.maxPrice) : undefined,
                maxShippingDays: newSpec.maxShippingDays ? Number(newSpec.maxShippingDays) : undefined,
                minRating: newSpec.minRating ? Number(newSpec.minRating) : undefined,
                minOrders: newSpec.minOrders ? Number(newSpec.minOrders) : undefined,
                sources: newSpec.sources as any,
                autoOptimizeBeforeImport: newSpec.autoOptimizeBeforeImport,
              })}
              disabled={!newSpec.name || !newSpec.keywords || createSpecMutation.isPending}
              className="bg-violet-600 hover:bg-violet-500"
            >
              {createSpecMutation.isPending ? "Creating..." : "Create Spec"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── App Connection Card ──────────────────────────────────────────────────────
function AppConnectionCard({
  app, title, description, icon, isConnected, fields, onRefetch,
}: {
  app: "autods" | "cj" | "dsers";
  title: string;
  description: string;
  icon: string;
  isConnected: boolean;
  fields: { key: string; label: string; placeholder: string; type: string }[];
  onRefetch: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(!isConnected);

  const saveMutation = trpc.sourcing.saveAppCredentials.useMutation({
    onSuccess: () => { onRefetch(); toast.success(`${title} credentials saved`); },
    onError: (e) => toast.error(e.message),
  });
  const testMutation = trpc.sourcing.testAppConnection.useMutation({
    onSuccess: (d) => { onRefetch(); toast.success(d.message); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-semibold">{title}</h3>
                {isConnected ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" />Connected
                  </Badge>
                ) : (
                  <Badge className="bg-white/5 text-white/40 border-white/10 text-[10px]">Not connected</Badge>
                )}
              </div>
              <p className="text-white/40 text-xs mt-0.5">{description}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {isConnected && (
              <Button
                size="sm"
                variant="outline"
                className="border-white/10 text-white/60 hover:text-white h-8"
                onClick={() => testMutation.mutate({ app })}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3 mr-1" />}
                Test
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="border-white/10 text-white/60 hover:text-white h-8"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <Settings2 className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 pt-4 border-t border-white/10">
            {fields.map((field) => (
              <div key={field.key}>
                <Label className="text-white/60 text-xs">{field.label}</Label>
                <Input
                  type={field.type}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="bg-white/5 border-white/10 text-white mt-1 text-sm"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => saveMutation.mutate({ app, ...values } as any)}
                disabled={saveMutation.isPending || Object.values(values).every((v) => !v)}
                className="bg-violet-600 hover:bg-violet-500"
              >
                {saveMutation.isPending ? "Saving..." : "Save Credentials"}
              </Button>
              {isConnected && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testMutation.mutate({ app })}
                  disabled={testMutation.isPending}
                  className="border-white/10 text-white/60 hover:text-white"
                >
                  Test Connection
                </Button>
              )}
            </div>
            {app === "cj" && (
              <p className="text-white/30 text-xs">Get your API Key from CJ Developer Portal → My Apps (the Account Email is the one you log into CJ with)</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

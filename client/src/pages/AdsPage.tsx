import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Megaphone, Plus, Loader2, Sparkles, Play, Pause, TrendingUp, DollarSign, MousePointer, Eye, Zap, ImageIcon, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const platforms = ["facebook", "instagram", "google", "tiktok"] as const;
const adTypes = [
  { value: "product_image", label: "Product Image" },
  { value: "ugc", label: "UGC Style" },
  { value: "carousel", label: "Carousel" },
  { value: "video_thumbnail", label: "Video Thumbnail" },
];

function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    facebook: "oklch(0.55 0.18 240)",
    instagram: "oklch(0.65 0.22 340)",
    google: "oklch(0.65 0.18 145)",
    tiktok: "oklch(0.55 0.01 265)",
  };
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
      style={{ background: `${colors[platform] || "oklch(0.55 0.01 265)"}20`, color: colors[platform] || "oklch(0.55 0.01 265)" }}>
      {platform}
    </span>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  if (status === "active") return <span className="badge-success"><span className="status-dot active" />Active</span>;
  if (status === "paused") return <span className="badge-warning">Paused</span>;
  if (status === "completed") return <span className="badge-info">Completed</span>;
  return <span className="badge-info">Draft</span>;
}

export default function AdsPage() {
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [creativeDialog, setCreativeDialog] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", platform: "instagram" as const, objective: "conversions", dailyBudget: "20" });
  const [newCreative, setNewCreative] = useState({ type: "product_image" as const, productTitle: "", productDescription: "", sourceImageUrl: "", platform: "instagram" as const, campaignId: undefined as number | undefined });
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: campaigns, isLoading: campLoading } = trpc.ads.getCampaigns.useQuery();
  const { data: creatives, isLoading: creatLoading } = trpc.ads.getCreatives.useQuery(
    { campaignId: selectedCampaign?.id },
  );

  const createCampaignMutation = trpc.ads.createCampaign.useMutation({
    onSuccess: () => { toast.success("Campaign created"); utils.ads.getCampaigns.invalidate(); setCampaignDialog(false); },
    onError: (err) => toast.error(err.message),
  });
  const updateCampaignMutation = trpc.ads.updateCampaign.useMutation({
    onSuccess: () => { utils.ads.getCampaigns.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const publishCampaignMutation = trpc.ads.publishCampaign.useMutation({
    onSuccess: (data) => { toast.success(data.message); utils.ads.getCampaigns.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const generateCreativeMutation = trpc.ads.generateCreative.useMutation({
    onSuccess: () => { toast.success("Creative generated!"); utils.ads.getCreatives.invalidate(); setCreativeDialog(false); },
    onError: (err) => toast.error(err.message),
  });
  const optimizeMutation = trpc.ads.optimizeBudget.useMutation({
    onSuccess: (data) => { toast.success(`Budget optimized: $${data.result.recommendedDailyBudget}/day`); utils.ads.getCampaigns.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const { data: settings } = trpc.scheduler.getAll.useQuery();
  const updateScheduler = trpc.scheduler.update.useMutation({ onSuccess: () => toast.success("Automation updated") });
  const adsSetting = settings?.find((s: any) => s.module === "ads");

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Ad Automation</h1>
          <p className="text-white/40 text-sm mt-1">AI-generated creatives, auto-launch campaigns, and intelligent budget optimization</p>
        </div>
        <div className="flex items-center gap-3">
          {adsSetting && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-pink-500/5 border border-pink-500/10 rounded-lg">
              <Zap className="w-4 h-4 text-pink-400" />
              <div>
                <p className="text-xs text-white/70 font-medium">Auto-Optimize</p>
                <p className="text-[10px] text-white/30">{adsSetting.cronExpression || "Daily 6am"}</p>
              </div>
              <button onClick={() => updateScheduler.mutate({ module: "ads", enabled: !adsSetting.enabled })}>
                {adsSetting.enabled
                  ? <ToggleRight className="w-8 h-8 text-pink-400" />
                  : <ToggleLeft className="w-8 h-8 text-white/20" />
                }
              </button>
            </div>
          )}
          <div className="flex gap-2">
          <Dialog open={creativeDialog} onOpenChange={setCreativeDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-border/50 text-sm">
                <Sparkles className="w-4 h-4" />Generate Creative
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border/50 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground">Generate Ad Creative</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Ad Type</label>
                    <Select value={newCreative.type} onValueChange={(v) => setNewCreative(p => ({ ...p, type: v as any }))}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{adTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Platform</label>
                    <Select value={newCreative.platform} onValueChange={(v) => setNewCreative(p => ({ ...p, platform: v as any }))}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{platforms.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Product Title</label>
                  <Input value={newCreative.productTitle} onChange={e => setNewCreative(p => ({ ...p, productTitle: e.target.value }))} placeholder="e.g. Minimalist Wall Clock" className="bg-secondary/50 border-border/50 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Product Description</label>
                  <textarea value={newCreative.productDescription} onChange={e => setNewCreative(p => ({ ...p, productDescription: e.target.value }))} placeholder="Brief product description..." rows={3} className="w-full bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Source Image URL (optional, for UGC)</label>
                  <Input value={newCreative.sourceImageUrl} onChange={e => setNewCreative(p => ({ ...p, sourceImageUrl: e.target.value }))} placeholder="https://..." className="bg-secondary/50 border-border/50 text-sm" />
                </div>
                <Button className="w-full font-semibold gap-2"
                  style={{ background: "linear-gradient(135deg, oklch(0.82 0.12 85), oklch(0.72 0.1 70))", color: "black" }}
                  onClick={() => generateCreativeMutation.mutate({ ...newCreative, sourceImageUrl: newCreative.sourceImageUrl || undefined })}
                  disabled={generateCreativeMutation.isPending}>
                  {generateCreativeMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate</>}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={campaignDialog} onOpenChange={setCampaignDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2 font-semibold" style={{ background: "linear-gradient(135deg, oklch(0.82 0.12 85), oklch(0.72 0.1 70))", color: "black" }}>
                <Plus className="w-4 h-4" />New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border/50 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground">Create Ad Campaign</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Campaign Name</label>
                  <Input value={newCampaign.name} onChange={e => setNewCampaign(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Summer Home Decor" className="bg-secondary/50 border-border/50 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Platform</label>
                    <Select value={newCampaign.platform} onValueChange={(v) => setNewCampaign(p => ({ ...p, platform: v as any }))}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{platforms.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Daily Budget ($)</label>
                    <Input type="number" value={newCampaign.dailyBudget} onChange={e => setNewCampaign(p => ({ ...p, dailyBudget: e.target.value }))} placeholder="20" className="bg-secondary/50 border-border/50 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Objective</label>
                  <Select value={newCampaign.objective} onValueChange={(v) => setNewCampaign(p => ({ ...p, objective: v }))}>
                    <SelectTrigger className="bg-secondary/50 border-border/50 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["conversions", "traffic", "awareness", "engagement", "catalog_sales"].map(o => <SelectItem key={o} value={o} className="capitalize">{o.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full font-semibold"
                  style={{ background: "linear-gradient(135deg, oklch(0.82 0.12 85), oklch(0.72 0.1 70))", color: "black" }}
                  onClick={() => createCampaignMutation.mutate({ ...newCampaign, dailyBudget: Number(newCampaign.dailyBudget) })}
                  disabled={!newCampaign.name || createCampaignMutation.isPending}>
                  {createCampaignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create Campaign
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList className="bg-secondary/50 border border-border/50 p-1 rounded-lg">
          <TabsTrigger value="campaigns" className="text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">Campaigns</TabsTrigger>
          <TabsTrigger value="creatives" className="text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">Creatives</TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="mt-6 space-y-4">
          {campLoading ? (
            <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : campaigns?.length ? (
            <div className="space-y-3">
              {campaigns.map((camp: any) => (
                <div key={camp.id} className="glass rounded-xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Megaphone className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{camp.name}</p>
                          <PlatformBadge platform={camp.platform} />
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">{camp.objective?.replace(/_/g, " ")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CampaignStatusBadge status={camp.status} />
                      {camp.status === "active" ? (
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs border-border/50 h-7"
                          onClick={() => updateCampaignMutation.mutate({ id: camp.id, status: "paused" })}>
                          <Pause className="w-3 h-3" />Pause
                        </Button>
                      ) : camp.status === "draft" && (camp.platform === "facebook" || camp.platform === "instagram" || camp.platform === "tiktok") ? (
                        <Button size="sm" className="gap-1.5 text-xs h-7 font-semibold"
                          style={{ background: "linear-gradient(135deg, oklch(0.82 0.12 85), oklch(0.72 0.1 70))", color: "black" }}
                          disabled={publishCampaignMutation.isPending}
                          onClick={() => publishCampaignMutation.mutate({ campaignId: camp.id })}>
                          {publishCampaignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}Publish (paused)
                        </Button>
                      ) : camp.status === "draft" || camp.status === "paused" ? (
                        <Button size="sm" className="gap-1.5 text-xs h-7 font-semibold"
                          style={{ background: "linear-gradient(135deg, oklch(0.82 0.12 85), oklch(0.72 0.1 70))", color: "black" }}
                          onClick={() => updateCampaignMutation.mutate({ id: camp.id, status: "active" })}>
                          <Play className="w-3 h-3" />Launch
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: "Daily Budget", value: `$${camp.dailyBudget}`, icon: DollarSign },
                      { label: "Impressions", value: (camp.impressions || 0).toLocaleString(), icon: Eye },
                      { label: "Clicks", value: (camp.clicks || 0).toLocaleString(), icon: MousePointer },
                      { label: "CTR", value: `${camp.ctr || 0}%`, icon: TrendingUp },
                      { label: "ROAS", value: `${camp.roas || 0}x`, icon: Zap },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="bg-secondary/50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{label}</span>
                        </div>
                        <p className="text-sm font-semibold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs border-border/50"
                      onClick={() => optimizeMutation.mutate({ campaignId: camp.id })}
                      disabled={optimizeMutation.isPending}>
                      {optimizeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      AI Optimize Budget
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs border-border/50"
                      onClick={() => setSelectedCampaign(camp)}>
                      View Creatives
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass rounded-xl p-12 text-center">
              <Megaphone className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No campaigns yet. Create your first campaign.</p>
            </div>
          )}
        </TabsContent>

        {/* Creatives Tab */}
        <TabsContent value="creatives" className="mt-6">
          {creatLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
            </div>
          ) : creatives?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {creatives.map((creative: any) => (
                <div key={creative.id} className="glass rounded-xl overflow-hidden">
                  <div className="aspect-square bg-secondary/50 overflow-hidden">
                    {creative.imageUrl ? (
                      <img src={creative.imageUrl} alt={creative.headline} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{creative.headline}</span>
                      <span className="badge-info text-[10px] capitalize">{creative.type?.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{creative.bodyText}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">{creative.ctaText}</span>
                      <span className={cn("text-[10px]", creative.status === "ready" ? "badge-success" : "badge-info")}>{creative.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass rounded-xl p-12 text-center">
              <Sparkles className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No creatives yet. Generate your first ad creative.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

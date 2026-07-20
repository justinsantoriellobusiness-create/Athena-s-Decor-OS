import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Link2, Plus, Search, Globe, TrendingUp, CheckCircle2, Clock, XCircle,
  Send, FileText, Zap, Settings2, RefreshCw, ExternalLink, Copy, Trash2,
  BarChart3, Target, BookOpen, ChevronDown, ChevronUp
} from "lucide-react";

type OpportunityStatus = "new" | "outreach_sent" | "linked" | "rejected" | "pending";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  outreach_sent: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  linked: "bg-green-500/10 text-green-600 border-green-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
  pending: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

const SEO_VALUE_COLORS: Record<string, string> = {
  high: "bg-green-500/10 text-green-600",
  medium: "bg-yellow-500/10 text-yellow-600",
  low: "bg-gray-500/10 text-gray-500",
};

export default function BacklinkerPage() {
  const [activeTab, setActiveTab] = useState("campaigns");
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [expandedOpportunity, setExpandedOpportunity] = useState<number | null>(null);
  const [generatedPost, setGeneratedPost] = useState<any>(null);

  // Campaign form state
  const [form, setForm] = useState({
    name: "",
    targetUrl: "",
    anchorText: "",
    keywords: "",
    niche: "home decor",
    automationEnabled: false,
    frequencyDays: 7,
  });

  // Post generation form
  const [discoveryNiche, setDiscoveryNiche] = useState("home decor");
  const [discoveryKeywords, setDiscoveryKeywords] = useState("");
  const [discoveryCount, setDiscoveryCount] = useState(30);
  const [bestSites, setBestSites] = useState<any[]>([]);

  const [postForm, setPostForm] = useState({
    topic: "",
    targetKeywords: "",
    storeUrl: "",
    productHighlights: "",
    emotionalAngle: "",
    wordCount: 1200,
  });

  const { data: campaigns, refetch: refetchCampaigns } = trpc.backlinker.getCampaigns.useQuery();
  const { data: campaignDetail, refetch: refetchDetail } = trpc.backlinker.getCampaign.useQuery(
    { id: selectedCampaignId! },
    { enabled: !!selectedCampaignId }
  );

  const createCampaign = trpc.backlinker.createCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campaign created!");
      setCreateDialogOpen(false);
      setForm({ name: "", targetUrl: "", anchorText: "", keywords: "", niche: "home decor", automationEnabled: false, frequencyDays: 7 });
      refetchCampaigns();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCampaign = trpc.backlinker.deleteCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campaign deleted.");
      setSelectedCampaignId(null);
      refetchCampaigns();
    },
    onError: (err) => toast.error(err.message),
  });

  const discoverOpportunities = trpc.backlinker.discoverOpportunities.useMutation({
    onSuccess: (data) => {
      toast.success(`Discovered ${data.discovered} backlink opportunities!`);
      refetchDetail();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateOpportunity = trpc.backlinker.updateOpportunity.useMutation({
    onSuccess: () => {
      toast.success("Updated.");
      refetchDetail();
    },
    onError: (err) => toast.error(err.message),
  });

  const generatePost = trpc.backlinker.generateBacklinkPost.useMutation({
    onSuccess: (data) => {
      setGeneratedPost(data);
      toast.success("Blog post generated!");
    },
    onError: (err) => toast.error(err.message),
  });

  const discoverBestSites = trpc.backlinker.discoverBestSites.useMutation({
    onSuccess: (data: any) => {
      setBestSites(data.sites || []);
    },
  });

  const updateCampaign = trpc.backlinker.updateCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campaign updated.");
      refetchCampaigns();
      refetchDetail();
    },
    onError: (err) => toast.error(err.message),
  });

  const opportunities = campaignDetail?.opportunities || [];
  const linkedCount = opportunities.filter(o => o.status === "linked").length;
  const outreachCount = opportunities.filter(o => o.status === "outreach_sent").length;
  const newCount = opportunities.filter(o => o.status === "new").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Link2 className="h-6 w-6 text-primary" />
            Backlinker
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build SEO backlinks by connecting your store, products, and stories to relevant news and blog sites.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="opportunities">
            Opportunities {opportunities.length > 0 ? `(${opportunities.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="content">Content Generator</TabsTrigger>
        </TabsList>

        {/* ── Campaigns Tab ── */}
        <TabsContent value="campaigns" className="space-y-4">
          {!campaigns || campaigns.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Link2 className="h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="font-semibold text-lg mb-1">No backlink campaigns yet</h3>
                <p className="text-muted-foreground text-sm mb-4 max-w-sm">
                  Create a campaign to start discovering relevant news sites, blogs, and directories to build backlinks from.
                </p>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Campaign
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campaigns.map(campaign => (
                <Card
                  key={campaign.id}
                  className={`cursor-pointer transition-all hover:border-primary/50 ${selectedCampaignId === campaign.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => { setSelectedCampaignId(campaign.id); setActiveTab("opportunities"); }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{campaign.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5 truncate max-w-[200px]">{campaign.targetUrl}</CardDescription>
                      </div>
                      <Badge variant="outline" className={campaign.status === "active" ? "text-green-600 border-green-500/30" : "text-muted-foreground"}>
                        {campaign.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div className="rounded bg-muted/50 p-2">
                        <div className="text-lg font-bold text-green-600">{(campaign as any).totalLinksBuilt || 0}</div>
                        <div className="text-xs text-muted-foreground">Linked</div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <div className="text-lg font-bold text-yellow-600">{campaign.totalOutreachSent || 0}</div>
                        <div className="text-xs text-muted-foreground">Outreach</div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <div className="text-lg font-bold">{campaign.totalLinksFound || 0}</div>
                        <div className="text-xs text-muted-foreground">Found</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Settings2 className="h-3 w-3" />
                        Every {campaign.frequencyDays}d
                        {campaign.automationEnabled && <Badge variant="secondary" className="text-xs py-0 px-1 ml-1">Auto</Badge>}
                      </span>
                      {campaign.lastRunAt && (
                        <span>Last: {new Date(campaign.lastRunAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Opportunities Tab ── */}
        <TabsContent value="opportunities" className="space-y-4">
          {!selectedCampaignId ? (
            <>
              {/* Standalone AI Best-Site Discovery */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">AI Best-Site Discovery</h3>
                      <p className="text-sm text-muted-foreground">Find the best sites to post backlinks — no campaign required</p>
                    </div>
                    <Button
                      onClick={() => discoverBestSites.mutate({
                        niche: discoveryNiche,
                        keywords: discoveryKeywords,
                        count: discoveryCount,
                      })}
                      disabled={discoverBestSites.isPending}
                    >
                      {discoverBestSites.isPending ? (
                        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Discovering...</>
                      ) : (
                        <><Search className="h-4 w-4 mr-2" />Discover Best Sites</>
                      )}
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Niche</label>
                      <Input value={discoveryNiche} onChange={e => setDiscoveryNiche(e.target.value)} placeholder="home decor" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Keywords</label>
                      <Input value={discoveryKeywords} onChange={e => setDiscoveryKeywords(e.target.value)} placeholder="interior design, furniture" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Count</label>
                      <Select value={String(discoveryCount)} onValueChange={v => setDiscoveryCount(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10 sites</SelectItem>
                          <SelectItem value="25">25 sites</SelectItem>
                          <SelectItem value="50">50 sites</SelectItem>
                          <SelectItem value="100">100 sites</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {/* Results */}
              {bestSites.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{bestSites.length} sites discovered</h4>
                  </div>
                  {discoverBestSites.data && !(discoverBestSites.data as any).realSearchUsed && (
                    <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      These are AI-generated candidates, not confirmed real sites — set <code className="font-mono">FIRECRAWL_API_KEY</code> in Railway Variables to get live-searched, verified sites instead.
                    </div>
                  )}
                  {bestSites.map((site: any, i: number) => (
                    <Card key={i} className="overflow-hidden">
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate flex items-center gap-1.5">
                              {site.siteName}
                              {site.verified ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]" title="Found via live web search — a real, reachable site">✓ Real site</Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground text-[10px]" title="AI-generated candidate, not confirmed real — verify before outreach">AI idea</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{site.pageTitle}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{site.type}</Badge>
                          <Badge className={`text-xs ${site.seoValue === 'high' ? 'bg-green-600' : site.seoValue === 'medium' ? 'bg-yellow-600' : 'bg-gray-500'}`}>
                            DA {site.domainAuthority}
                          </Badge>
                          <a href={site.pageUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /></Button>
                          </a>
                        </div>
                      </div>
                      {site.whyBest && (
                        <div className="px-4 pb-3 text-xs text-muted-foreground border-t pt-2">
                          <strong>Why:</strong> {site.whyBest}
                          {site.outreachMessage && <><br /><strong>Pitch:</strong> {site.outreachMessage}</>}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : campaignDetail && (
            <>
              {/* Campaign header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{campaignDetail.campaign.name}</h2>
                  <p className="text-xs text-muted-foreground">{campaignDetail.campaign.targetUrl}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => discoverOpportunities.mutate({
                      campaignId: selectedCampaignId,
                      storeUrl: campaignDetail.campaign.targetUrl,
                      count: 20,
                    })}
                    disabled={discoverOpportunities.isPending}
                  >
                    {discoverOpportunities.isPending ? (
                      <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Discovering...</>
                    ) : (
                      <><Search className="h-3.5 w-3.5 mr-1.5" />Discover More</>
                    )}
                  </Button>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      checked={campaignDetail.campaign.automationEnabled}
                      onCheckedChange={(checked) => updateCampaign.mutate({ id: selectedCampaignId, automationEnabled: checked })}
                    />
                    <span>Auto every {campaignDetail.campaign.frequencyDays}d</span>
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Total Found", value: opportunities.length, color: "text-foreground" },
                  { label: "Linked", value: linkedCount, color: "text-green-600" }, // totalLinksBuilt not in schema
                  { label: "Outreach Sent", value: outreachCount, color: "text-yellow-600" },
                  { label: "New", value: newCount, color: "text-blue-600" },
                ].map(stat => (
                  <Card key={stat.label} className="p-3 text-center">
                    <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </Card>
                ))}
              </div>

              {/* Opportunities list */}
              {opportunities.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                    <Search className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="font-medium mb-1">No opportunities discovered yet</p>
                    <p className="text-sm text-muted-foreground mb-3">Click "Discover More" to find relevant sites for backlinking.</p>
                    <Button
                      size="sm"
                      onClick={() => discoverOpportunities.mutate({ campaignId: selectedCampaignId, count: 20 })}
                      disabled={discoverOpportunities.isPending}
                    >
                      {discoverOpportunities.isPending ? "Discovering..." : "Discover Opportunities"}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {opportunities.map(opp => (
                    <Card key={opp.id} className="overflow-hidden">
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedOpportunity(expandedOpportunity === opp.id ? null : opp.id)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate flex items-center gap-1.5">
                              {opp.siteName}
                              {(opp as any).isVerified ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]" title="Found via live web search — a real, reachable site">✓ Real site</Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground text-[10px]" title="AI-generated candidate, not confirmed real — verify before outreach">AI idea</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{opp.pageTitle}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <Badge variant="outline" className="text-xs">DA {opp.domainAuthority}</Badge>
                          <Badge variant="outline" className={`text-xs ${SEO_VALUE_COLORS[opp.seoValue ?? ""] || ""}`}>
                            {opp.seoValue}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[opp.status as OpportunityStatus] || ""}`}>
                            {opp.status.replace("_", " ")}
                          </Badge>
                          {expandedOpportunity === opp.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>

                      {expandedOpportunity === opp.id && (
                        <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/20">
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground text-xs">Site URL</span>
                              <div className="flex items-center gap-1">
                                <a href={opp.siteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate">
                                  {opp.siteUrl}
                                </a>
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">Type</span>
                              <div className="text-xs capitalize">{opp.type}</div>
                            </div>
                            {opp.outreachEmail && (
                              <div>
                                <span className="text-muted-foreground text-xs">Contact Email</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs">{opp.outreachEmail}</span>
                                  <button onClick={() => { navigator.clipboard.writeText(opp.outreachEmail!); toast.success("Copied!"); }}>
                                    <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                  </button>
                                </div>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground text-xs">Relevance Score</span>
                              <div className="flex items-center gap-2">
                                <Progress value={opp.relevanceScore} className="h-1.5 flex-1" />
                                <span className="text-xs">{opp.relevanceScore}%</span>
                              </div>
                            </div>
                          </div>

                          {opp.outreachMessage && (
                            <div>
                              <span className="text-muted-foreground text-xs">Suggested Outreach Message</span>
                              <div className="mt-1 rounded bg-muted p-2 text-xs leading-relaxed relative">
                                {opp.outreachMessage}
                                <button
                                  className="absolute top-1 right-1"
                                  onClick={() => { navigator.clipboard.writeText(opp.outreachMessage!); toast.success("Copied!"); }}
                                >
                                  <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            {opp.status === "new" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateOpportunity.mutate({ id: opp.id, status: "outreach_sent", outreachSentAt: new Date() })}
                              >
                                <Send className="h-3.5 w-3.5 mr-1.5" />
                                Mark Outreach Sent
                              </Button>
                            )}
                            {opp.status === "outreach_sent" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600"
                                onClick={() => updateOpportunity.mutate({ id: opp.id, status: "linked", linkedAt: new Date() })}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                Mark as Linked
                              </Button>
                            )}
                            {opp.status !== "rejected" && opp.status !== "linked" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => updateOpportunity.mutate({ id: opp.id, status: "rejected" })}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                                Reject
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

        </TabsContent>

        {/* ── Content Generator Tab ── */}
        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4" />
                SEO Blog Post Generator
              </CardTitle>
              <CardDescription>
                Generate fully optimized blog posts with embedded backlinks to your store, products, and emotional stories.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Post Topic</Label>
                  <Input
                    placeholder="e.g. 10 Ways to Transform Your Living Room on a Budget"
                    value={postForm.topic}
                    onChange={e => setPostForm(f => ({ ...f, topic: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target Keywords (comma-separated)</Label>
                  <Input
                    placeholder="home decor ideas, living room makeover, affordable furniture"
                    value={postForm.targetKeywords}
                    onChange={e => setPostForm(f => ({ ...f, targetKeywords: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Your Store URL</Label>
                  <Input
                    placeholder="https://yourstore.myshopify.com"
                    value={postForm.storeUrl}
                    onChange={e => setPostForm(f => ({ ...f, storeUrl: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Word Count</Label>
                  <Select
                    value={String(postForm.wordCount)}
                    onValueChange={v => setPostForm(f => ({ ...f, wordCount: parseInt(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="500">500 words (short)</SelectItem>
                      <SelectItem value="800">800 words</SelectItem>
                      <SelectItem value="1200">1,200 words (recommended)</SelectItem>
                      <SelectItem value="2000">2,000 words (long-form)</SelectItem>
                      <SelectItem value="3000">3,000 words (pillar post)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Products to Highlight</Label>
                  <Input
                    placeholder="velvet throw pillows, abstract wall art, minimalist bookshelf"
                    value={postForm.productHighlights}
                    onChange={e => setPostForm(f => ({ ...f, productHighlights: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Emotional Angle</Label>
                  <Input
                    placeholder="creating a cozy sanctuary, expressing personal style"
                    value={postForm.emotionalAngle}
                    onChange={e => setPostForm(f => ({ ...f, emotionalAngle: e.target.value }))}
                  />
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => {
                  if (!postForm.topic || !postForm.targetKeywords) {
                    toast.error("Please fill in topic and keywords");
                    return;
                  }
                  generatePost.mutate({
                    campaignId: selectedCampaignId || 0,
                    ...postForm,
                  });
                }}
                disabled={generatePost.isPending || !postForm.topic}
              >
                {generatePost.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating Post...</>
                ) : (
                  <><Zap className="h-4 w-4 mr-2" />Generate SEO Blog Post</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Generated post output */}
          {generatedPost && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{generatedPost.title}</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedPost.content);
                      toast.success("HTML content copied!");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy HTML
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded bg-muted p-3">
                    <div className="text-xs text-muted-foreground mb-1">Meta Title ({generatedPost.metaTitle?.length || 0} chars)</div>
                    <div className="text-sm font-medium">{generatedPost.metaTitle}</div>
                  </div>
                  <div className="rounded bg-muted p-3">
                    <div className="text-xs text-muted-foreground mb-1">Meta Description ({generatedPost.metaDescription?.length || 0} chars)</div>
                    <div className="text-sm">{generatedPost.metaDescription}</div>
                  </div>
                </div>

                {generatedPost.suggestedAnchorTexts?.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Suggested Anchor Texts</div>
                    <div className="flex flex-wrap gap-2">
                      {generatedPost.suggestedAnchorTexts.map((text: string, i: number) => (
                        <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied!"); }}>
                          {text}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Post Preview (HTML)</div>
                  <div
                    className="rounded border bg-white dark:bg-muted/30 p-4 text-sm max-h-64 overflow-y-auto prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: generatedPost.content }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Campaign Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Backlink Campaign</DialogTitle>
            <DialogDescription>Set up a campaign to discover and track backlink opportunities for your store.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Campaign Name</Label>
              <Input
                placeholder="Home Decor Blog Outreach"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Target URL (page to build links to)</Label>
              <Input
                placeholder="https://yourstore.myshopify.com/collections/all"
                value={form.targetUrl}
                onChange={e => setForm(f => ({ ...f, targetUrl: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Preferred Anchor Text</Label>
                <Input
                  placeholder="shop home decor"
                  value={form.anchorText}
                  onChange={e => setForm(f => ({ ...f, anchorText: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Niche</Label>
                <Input
                  placeholder="home decor"
                  value={form.niche}
                  onChange={e => setForm(f => ({ ...f, niche: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Keywords (comma-separated)</Label>
              <Input
                placeholder="home decor, interior design, furniture"
                value={form.keywords}
                onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Automation</div>
                <div className="text-xs text-muted-foreground">Auto-discover new opportunities on a schedule</div>
              </div>
              <Switch
                checked={form.automationEnabled}
                onCheckedChange={v => setForm(f => ({ ...f, automationEnabled: v }))}
              />
            </div>
            {form.automationEnabled && (
              <div className="space-y-2">
                <Label>Frequency (days between runs)</Label>
                <Select
                  value={String(form.frequencyDays)}
                  onValueChange={v => setForm(f => ({ ...f, frequencyDays: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Daily</SelectItem>
                    <SelectItem value="3">Every 3 days</SelectItem>
                    <SelectItem value="7">Weekly</SelectItem>
                    <SelectItem value="14">Bi-weekly</SelectItem>
                    <SelectItem value="30">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createCampaign.mutate(form)}
              disabled={!form.name || !form.targetUrl || createCampaign.isPending}
            >
              {createCampaign.isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  Mail, Plus, Send, Users, BarChart3, Search, Trash2, RefreshCw,
  Zap, Eye, MousePointer, XCircle, CheckCircle2, Clock, Settings2,
  UserPlus, Globe, TrendingUp, AlertCircle
} from "lucide-react";

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  promotional: "Promotional",
  newsletter: "Newsletter",
  drip: "Drip",
  winback: "Win-Back",
  abandoned_cart: "Abandoned Cart",
  welcome: "Welcome",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-600",
  scheduled: "bg-blue-500/10 text-blue-600",
  sending: "bg-yellow-500/10 text-yellow-600",
  sent: "bg-green-500/10 text-green-600",
  paused: "bg-orange-500/10 text-orange-600",
};

export default function EmailCampaignsPage() {
  const [activeTab, setActiveTab] = useState("analytics");
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  // Campaign form
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    subject: "",
    previewText: "",
    type: "promotional" as const,
    fromName: "",
    fromEmail: "",
    automationEnabled: false,
    frequencyDays: 30,
    bodyHtml: "",
    bodyText: "",
  });

  // Scrape form
  const [scrapeForm, setScrapeForm] = useState({
    competitorDomain: "",
    method: "review_sites" as const,
    count: 25,
  });

  const { data: analytics, refetch: refetchAnalytics } = trpc.emailCampaigns.getAnalytics.useQuery();
  const { data: prospects, refetch: refetchProspects } = trpc.emailCampaigns.getProspects.useQuery({});
  const { data: scrapJobs, refetch: refetchScrapJobs } = trpc.emailCampaigns.getScrapJobs.useQuery();

  const createCampaign = trpc.emailCampaigns.createCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campaign created!");
      setCreateCampaignOpen(false);
      setCampaignForm({ name: "", subject: "", previewText: "", type: "promotional", fromName: "", fromEmail: "", automationEnabled: false, frequencyDays: 30, bodyHtml: "", bodyText: "" });
      refetchAnalytics();
    },
    onError: (err) => toast.error(err.message),
  });

  const generateContent = trpc.emailCampaigns.generateCampaignContent.useMutation({
    onSuccess: (data) => {
      setCampaignForm(f => ({ ...f, subject: data.subject, previewText: data.previewText, bodyHtml: data.bodyHtml, bodyText: data.bodyText }));
      toast.success("Content generated! Review and save.");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCampaign = trpc.emailCampaigns.deleteCampaign.useMutation({
    onSuccess: () => { toast.success("Campaign deleted."); refetchAnalytics(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteProspect = trpc.emailCampaigns.deleteProspect.useMutation({
    onSuccess: () => { toast.success("Prospect removed."); refetchProspects(); },
    onError: (err) => toast.error(err.message),
  });

  const scrapeProspects = trpc.emailCampaigns.scrapeProspects.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.prospectsFound} AI prospect ideas modeled on ${scrapeForm.competitorDomain}'s likely customers`);
      setScrapeDialogOpen(false);
      refetchProspects();
      refetchScrapJobs();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendCampaign = trpc.emailCampaigns.sendCampaign.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setSendDialogOpen(false);
      refetchAnalytics();
    },
    onError: (err) => toast.error(err.message),
  });

  const campaigns = analytics?.campaigns || [];
  const activeProspects = (prospects || []).filter(p => p.status === "active");
  const totalProspects = (prospects || []).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Email Campaigns
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build prospect lists, run AI-generated campaigns, and track every open, click, and conversion.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setScrapeDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Scrape Prospects
          </Button>
          <Button onClick={() => setCreateCampaignOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="prospects">Prospects ({totalProspects})</TabsTrigger>
          <TabsTrigger value="scraper">Prospect Scraper</TabsTrigger>
        </TabsList>

        {/* ── Analytics Tab ── */}
        <TabsContent value="analytics" className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total Sent", value: analytics?.totals.sent || 0, icon: Send, color: "text-blue-500" },
              { label: "Opened", value: analytics?.totals.opened || 0, icon: Eye, color: "text-green-500" },
              { label: "Clicked", value: analytics?.totals.clicked || 0, icon: MousePointer, color: "text-purple-500" },
              { label: "Open Rate", value: `${analytics?.openRate || 0}%`, icon: TrendingUp, color: "text-yellow-500" },
              { label: "Click Rate", value: `${analytics?.clickRate || 0}%`, icon: BarChart3, color: "text-orange-500" },
            ].map(kpi => (
              <Card key={kpi.label} className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                </div>
                <div className="text-2xl font-bold">{kpi.value}</div>
              </Card>
            ))}
          </div>

          {/* Prospects summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Prospect List</span>
              </div>
              <div className="text-3xl font-bold">{activeProspects.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Active prospects · {totalProspects} total</div>
              <Progress value={totalProspects > 0 ? (activeProspects.length / totalProspects) * 100 : 0} className="h-1.5 mt-2" />
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Campaigns</span>
              </div>
              <div className="text-3xl font-bold">{analytics?.campaignCount || 0}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {campaigns.filter(c => c.automationEnabled).length} automated
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Deliverability</span>
              </div>
              <div className="text-3xl font-bold">
                {analytics?.totals.sent
                  ? `${(100 - ((analytics.totals.bounced / analytics.totals.sent) * 100)).toFixed(1)}%`
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {analytics?.totals.bounced || 0} bounced · {analytics?.totals.unsubscribed || 0} unsubscribed
              </div>
            </Card>
          </div>

          {/* Campaign performance table */}
          {campaigns.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Campaign Performance</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Opened</TableHead>
                      <TableHead className="text-right">Clicked</TableHead>
                      <TableHead className="text-right">Open Rate</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map(c => {
                      const sent = c.stats?.sent || 0;
                      const opened = c.stats?.opened || 0;
                      const clicked = c.stats?.clicked || 0;
                      const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : "0";
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{CAMPAIGN_TYPE_LABELS[c.type] || c.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{sent}</TableCell>
                          <TableCell className="text-right">{opened}</TableCell>
                          <TableCell className="text-right">{clicked}</TableCell>
                          <TableCell className="text-right">{openRate}%</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] || ""}`}>
                              {c.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {campaigns.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <Mail className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium">No campaigns yet</p>
                <p className="text-sm text-muted-foreground mt-1 mb-3">Create your first campaign to start tracking email performance.</p>
                <Button size="sm" onClick={() => setCreateCampaignOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Campaign
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Campaigns Tab ── */}
        <TabsContent value="campaigns" className="space-y-3">
          {campaigns.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <Mail className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="font-medium">No campaigns yet</p>
                <Button size="sm" className="mt-3" onClick={() => setCreateCampaignOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />New Campaign
                </Button>
              </CardContent>
            </Card>
          ) : (
            campaigns.map(c => (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">{c.subject}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] || ""}`}>{c.status}</Badge>
                      <Badge variant="secondary" className="text-xs">{CAMPAIGN_TYPE_LABELS[c.type] || c.type}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-4 gap-2 text-center mb-3">
                    {[
                      { label: "Sent", value: c.stats?.sent || 0 },
                      { label: "Opened", value: c.stats?.opened || 0 },
                      { label: "Clicked", value: c.stats?.clicked || 0 },
                      { label: "Bounced", value: c.stats?.bounced || 0 },
                    ].map(s => (
                      <div key={s.label} className="rounded bg-muted/50 p-2">
                        <div className="text-lg font-bold">{s.value}</div>
                        <div className="text-xs text-muted-foreground">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {c.status === "draft" && (
                      <Button
                        size="sm"
                        onClick={() => { setSelectedCampaignId(c.id); setSendDialogOpen(true); }}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        Send Campaign
                      </Button>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                      {c.automationEnabled && (
                        <Badge variant="secondary" className="text-xs">
                          <Settings2 className="h-3 w-3 mr-1" />
                          Auto every {c.frequencyDays}d
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteCampaign.mutate({ id: c.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Prospects Tab ── */}
        <TabsContent value="prospects" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {activeProspects.length} active · {(prospects || []).filter(p => p.status === "unsubscribed").length} unsubscribed · {(prospects || []).filter(p => p.status === "bounced").length} bounced
            </div>
            <Button variant="outline" size="sm" onClick={() => setScrapeDialogOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Add Prospects
            </Button>
          </div>

          {!prospects || prospects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <Users className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium">No prospects yet</p>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                  Use the Prospect Scraper to find potential customers from competitor sites.
                </p>
                <Button size="sm" onClick={() => setScrapeDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Scrape Prospects
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(prospects || []).slice(0, 100).map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.email}</TableCell>
                        <TableCell className="text-sm">{[p.firstName, p.lastName].filter(Boolean).join(" ") || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {p.source?.replace("_", " ") || "manual"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {p.tags?.split(",").slice(0, 2).map((tag, i) => (
                              <Badge key={i} variant="outline" className="text-xs py-0">{tag.trim()}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Progress value={p.score || 0} className="h-1.5 w-12" />
                            <span className="text-xs">{p.score}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${p.status === "active" ? "text-green-600 border-green-500/30" : "text-muted-foreground"}`}>
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteProspect.mutate({ id: p.id })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {(prospects || []).length > 100 && (
                  <div className="p-3 text-center text-xs text-muted-foreground border-t">
                    Showing 100 of {(prospects || []).length} prospects
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Scraper Tab ── */}
        <TabsContent value="scraper" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" />
                AI Prospect Ideas
              </CardTitle>
              <CardDescription>
                AI generates example customer personas based on who's likely to buy from a competitor — for targeting research and inspiration, not real people.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>This does not scrape real people — every profile and email address below is AI-invented. Campaigns will not actually be sent to these addresses. For real outreach, add verified contacts manually or import your Shopify customers instead.</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Competitor Domain</Label>
                  <Input
                    placeholder="competitor-store.com"
                    value={scrapeForm.competitorDomain}
                    onChange={e => setScrapeForm(f => ({ ...f, competitorDomain: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Persona Style</Label>
                  <Select
                    value={scrapeForm.method}
                    onValueChange={v => setScrapeForm(f => ({ ...f, method: v as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="review_sites">Review-site shopper</SelectItem>
                      <SelectItem value="social_followers">Social follower</SelectItem>
                      <SelectItem value="blog_comments">Blog reader</SelectItem>
                      <SelectItem value="forum_posts">Forum participant</SelectItem>
                      <SelectItem value="linkedin">Professional (LinkedIn-style)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ideas to Generate</Label>
                  <Select
                    value={String(scrapeForm.count)}
                    onValueChange={v => setScrapeForm(f => ({ ...f, count: parseInt(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 ideas</SelectItem>
                      <SelectItem value="25">25 ideas</SelectItem>
                      <SelectItem value="50">50 ideas</SelectItem>
                      <SelectItem value="100">100 ideas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => {
                  if (!scrapeForm.competitorDomain) {
                    toast.error("Please enter a competitor domain");
                    return;
                  }
                  scrapeProspects.mutate(scrapeForm);
                }}
                disabled={scrapeProspects.isPending || !scrapeForm.competitorDomain}
              >
                {scrapeProspects.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating ideas...</>
                ) : (
                  <><Zap className="h-4 w-4 mr-2" />Generate {scrapeForm.count} AI Prospect Ideas</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Scrape job history */}
          {scrapJobs && scrapJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Scrape History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Competitor</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Found</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scrapJobs.map(job => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium text-sm">{job.competitorDomain}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {job.method.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold">{job.prospectsFound}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${job.status === "completed" ? "text-green-600 border-green-500/30" : job.status === "running" ? "text-yellow-600" : "text-red-600"}`}>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {job.startedAt ? new Date(job.startedAt).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Campaign Dialog */}
      <Dialog open={createCampaignOpen} onOpenChange={setCreateCampaignOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Email Campaign</DialogTitle>
            <DialogDescription>Create a campaign manually or use AI to generate the content.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input
                  placeholder="Summer Sale Blast"
                  value={campaignForm.name}
                  onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={campaignForm.type}
                  onValueChange={v => setCampaignForm(f => ({ ...f, type: v as any }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CAMPAIGN_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>From Name</Label>
                <Input
                  placeholder="Athena's Decor"
                  value={campaignForm.fromName}
                  onChange={e => setCampaignForm(f => ({ ...f, fromName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>From Email</Label>
                <Input
                  type="email"
                  placeholder="hello@yourstore.com"
                  value={campaignForm.fromEmail}
                  onChange={e => setCampaignForm(f => ({ ...f, fromEmail: e.target.value }))}
                />
              </div>
            </div>

            {/* AI generate button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => generateContent.mutate({
                type: campaignForm.type,
                tone: "friendly",
              })}
              disabled={generateContent.isPending}
            >
              {generateContent.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating...</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" />AI Generate Content</>
              )}
            </Button>

            <div className="space-y-2">
              <Label>Subject Line</Label>
              <Input
                placeholder="Your dream home is waiting..."
                value={campaignForm.subject}
                onChange={e => setCampaignForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Preview Text</Label>
              <Input
                placeholder="Exclusive deals on home decor this week only"
                value={campaignForm.previewText}
                onChange={e => setCampaignForm(f => ({ ...f, previewText: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Email Body (HTML)</Label>
              <Textarea
                placeholder="<p>Your email content here...</p>"
                className="font-mono text-xs min-h-[120px]"
                value={campaignForm.bodyHtml}
                onChange={e => setCampaignForm(f => ({ ...f, bodyHtml: e.target.value }))}
              />
            </div>

            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Automation</div>
                <div className="text-xs text-muted-foreground">Send this campaign on a recurring schedule</div>
              </div>
              <Switch
                checked={campaignForm.automationEnabled}
                onCheckedChange={v => setCampaignForm(f => ({ ...f, automationEnabled: v }))}
              />
            </div>
            {campaignForm.automationEnabled && (
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={String(campaignForm.frequencyDays)}
                  onValueChange={v => setCampaignForm(f => ({ ...f, frequencyDays: parseInt(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Weekly</SelectItem>
                    <SelectItem value="14">Bi-weekly</SelectItem>
                    <SelectItem value="30">Monthly</SelectItem>
                    <SelectItem value="90">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCampaignOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createCampaign.mutate(campaignForm)}
              disabled={!campaignForm.name || !campaignForm.subject || createCampaign.isPending}
            >
              {createCampaign.isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scrape Dialog */}
      <Dialog open={scrapeDialogOpen} onOpenChange={setScrapeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scrape Prospects</DialogTitle>
            <DialogDescription>Find potential customers from a competitor's audience.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Competitor Domain</Label>
              <Input
                placeholder="competitor-store.com"
                value={scrapeForm.competitorDomain}
                onChange={e => setScrapeForm(f => ({ ...f, competitorDomain: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={scrapeForm.method} onValueChange={v => setScrapeForm(f => ({ ...f, method: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="review_sites">Review Sites</SelectItem>
                  <SelectItem value="social_followers">Social Followers</SelectItem>
                  <SelectItem value="blog_comments">Blog Comments</SelectItem>
                  <SelectItem value="forum_posts">Forum Posts</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Count</Label>
              <Select value={String(scrapeForm.count)} onValueChange={v => setScrapeForm(f => ({ ...f, count: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScrapeDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => scrapeProspects.mutate(scrapeForm)}
              disabled={!scrapeForm.competitorDomain || scrapeProspects.isPending}
            >
              {scrapeProspects.isPending ? "Scraping..." : "Scrape Prospects"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Campaign Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Campaign</DialogTitle>
            <DialogDescription>
              This will send the campaign to all {activeProspects.length} active prospects.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="font-medium mb-1">Recipients: {activeProspects.length} active prospects</div>
              <div className="text-xs text-muted-foreground">Unsubscribed and bounced contacts are automatically excluded.</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedCampaignId) {
                  sendCampaign.mutate({ campaignId: selectedCampaignId, testMode: false });
                }
              }}
              disabled={sendCampaign.isPending || activeProspects.length === 0}
            >
              {sendCampaign.isPending ? "Sending..." : `Send to ${activeProspects.length} Prospects`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

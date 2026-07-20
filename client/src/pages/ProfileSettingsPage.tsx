import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Palette, Building2, Upload, Trash2, Check, Sparkles } from "lucide-react";
import { DASHBOARD_THEMES } from "@/lib/themes";

export default function ProfileSettingsPage() {
  const settingsQuery = trpc.settings.get.useQuery();
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => { toast.success("Saved"); settingsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const uploadLogoMutation = trpc.settings.uploadLogo.useMutation({
    onSuccess: () => { toast.success("Logo updated"); settingsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const removeLogoMutation = trpc.settings.removeLogo.useMutation({
    onSuccess: () => { toast.success("Logo removed"); settingsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [appName, setAppName] = useState("");
  const [profile, setProfile] = useState({
    businessName: "", niche: "", targetAudience: "", brandVoice: "",
    priceTier: "" as "" | "budget" | "mid_range" | "premium" | "luxury",
    keyCategories: "", competitors: "", uniqueValue: "", website: "", additionalNotes: "",
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const d = settingsQuery.data;
    setAppName(d.appName || "");
    setProfile({
      businessName: d.businessName, niche: d.niche, targetAudience: d.targetAudience,
      brandVoice: d.brandVoice, priceTier: (d.priceTier as any) || "",
      keyCategories: d.keyCategories, competitors: d.competitors,
      uniqueValue: d.uniqueValue, website: d.website, additionalNotes: d.additionalNotes,
    });
  }, [settingsQuery.data]);

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo must be under 2MB"); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      uploadLogoMutation.mutate({ dataUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const saveBranding = () => {
    updateMutation.mutate({ appName: appName.trim() || undefined });
  };

  const saveTheme = (themeId: string) => {
    updateMutation.mutate({ themeId });
  };

  const saveProfile = () => {
    updateMutation.mutate({
      businessName: profile.businessName || undefined,
      niche: profile.niche || undefined,
      targetAudience: profile.targetAudience || undefined,
      brandVoice: profile.brandVoice || undefined,
      priceTier: profile.priceTier || undefined,
      keyCategories: profile.keyCategories || undefined,
      competitors: profile.competitors || undefined,
      uniqueValue: profile.uniqueValue || undefined,
      website: profile.website || undefined,
      additionalNotes: profile.additionalNotes || undefined,
    });
  };

  if (settingsQuery.isLoading) {
    return <div className="p-6 flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-white/30" /></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Profile & Branding</h1>
        <p className="text-white/40 text-sm mt-1">Customize how the dashboard looks, and tell the AI about your business so its suggestions (sourcing, backlinks, blog, SEO) stay relevant.</p>
      </div>

      <Tabs defaultValue="branding">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="branding" className="data-[state=active]:bg-violet-600"><Palette className="w-3.5 h-3.5 mr-1.5" />Branding</TabsTrigger>
          <TabsTrigger value="business" className="data-[state=active]:bg-violet-600"><Building2 className="w-3.5 h-3.5 mr-1.5" />Business Profile</TabsTrigger>
        </TabsList>

        {/* ── Branding ── */}
        <TabsContent value="branding" className="space-y-4 mt-4">
          <Card className="bg-white/5 border-white/10">
            <CardHeader><CardTitle className="text-white text-base">App Name & Logo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-white/50">App Name</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Athena's OS" className="bg-white/5 border-white/10 text-white" maxLength={120} />
                  <Button onClick={saveBranding} disabled={updateMutation.isPending} className="bg-violet-600 hover:bg-violet-500 flex-shrink-0">
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
                <p className="text-white/30 text-xs mt-1">Shown in the sidebar in place of "Athena's OS".</p>
              </div>

              <div>
                <Label className="text-xs text-white/50">Logo</Label>
                <div className="flex items-center gap-3 mt-1">
                  {settingsQuery.data?.logoUrl ? (
                    <img src={settingsQuery.data.logoUrl} alt="Logo" className="w-12 h-12 rounded-lg object-cover border border-white/10" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/20 text-xs">None</div>
                  )}
                  <label>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoFile} />
                    <Button variant="outline" size="sm" asChild disabled={uploadLogoMutation.isPending} className="border-white/10 text-white/70 hover:text-white">
                      <span>
                        {uploadLogoMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                        Upload Logo
                      </span>
                    </Button>
                  </label>
                  {settingsQuery.data?.logoUrl && (
                    <Button variant="outline" size="sm" onClick={() => removeLogoMutation.mutate()} disabled={removeLogoMutation.isPending} className="border-red-500/20 text-red-400 hover:bg-red-500/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-white/30 text-xs mt-1">PNG, JPEG, WebP, or SVG. Max 2MB. Replaces the gradient icon in the sidebar.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-base">Dashboard Theme</CardTitle>
              <p className="text-white/40 text-xs mt-1">
                Reskins the sidebar, active nav highlight, and avatar. Most individual pages (e.g. Accounting's revenue/expense colors) intentionally
                keep their own fixed colors for readability and won't change with the theme.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {DASHBOARD_THEMES.map((t) => {
                  const active = (settingsQuery.data?.themeId || "violet") === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => saveTheme(t.id)}
                      disabled={updateMutation.isPending}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${active ? "border-white/40 bg-white/10" : "border-white/10 hover:border-white/20 bg-white/5"}`}
                    >
                      <div className="relative w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, ${t.gradientFrom}, ${t.gradientTo})` }}>
                        {active && <Check className="w-4 h-4 text-white" />}
                      </div>
                      <span className="text-[11px] text-white/60 text-center leading-tight">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Business Profile ── */}
        <TabsContent value="business" className="space-y-4 mt-4">
          <div className="bg-violet-500/5 border border-violet-500/10 rounded-lg px-4 py-3 text-xs text-white/50 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
            <span>Fill this in once — it's automatically included as context for AI-generated sourcing spec suggestions, backlink targets, blog posts, and SEO copy, so results reflect your actual store instead of generic home-decor boilerplate.</span>
          </div>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-white/50">Business Name</Label>
                  <Input value={profile.businessName} onChange={(e) => setProfile((p) => ({ ...p, businessName: e.target.value }))} className="bg-white/5 border-white/10 text-white mt-1" placeholder="Athena's Decor" />
                </div>
                <div>
                  <Label className="text-xs text-white/50">Website</Label>
                  <Input value={profile.website} onChange={(e) => setProfile((p) => ({ ...p, website: e.target.value }))} className="bg-white/5 border-white/10 text-white mt-1" placeholder="athenasdecor.com" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-white/50">Niche / Specialty</Label>
                <Input value={profile.niche} onChange={(e) => setProfile((p) => ({ ...p, niche: e.target.value }))} className="bg-white/5 border-white/10 text-white mt-1" placeholder="e.g. boho-modern wall art and small-space decor" />
              </div>
              <div>
                <Label className="text-xs text-white/50">Target Audience</Label>
                <Textarea value={profile.targetAudience} onChange={(e) => setProfile((p) => ({ ...p, targetAudience: e.target.value }))} className="bg-white/5 border-white/10 text-white mt-1" placeholder="e.g. renters and first-apartment buyers, 22-35, budget-conscious but design-aware" rows={2} />
              </div>
              <div>
                <Label className="text-xs text-white/50">Brand Voice / Tone</Label>
                <Textarea value={profile.brandVoice} onChange={(e) => setProfile((p) => ({ ...p, brandVoice: e.target.value }))} className="bg-white/5 border-white/10 text-white mt-1" placeholder="e.g. warm, cozy, aspirational but approachable — never salesy" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-white/50">Price Positioning</Label>
                  <Select value={profile.priceTier || undefined} onValueChange={(v) => setProfile((p) => ({ ...p, priceTier: v as any }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="budget">Budget</SelectItem>
                      <SelectItem value="mid_range">Mid-range</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="luxury">Luxury</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-white/50">Key Product Categories</Label>
                  <Input value={profile.keyCategories} onChange={(e) => setProfile((p) => ({ ...p, keyCategories: e.target.value }))} className="bg-white/5 border-white/10 text-white mt-1" placeholder="wall art, candles, vases, throw pillows" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-white/50">Known Competitors</Label>
                <Input value={profile.competitors} onChange={(e) => setProfile((p) => ({ ...p, competitors: e.target.value }))} className="bg-white/5 border-white/10 text-white mt-1" placeholder="e.g. Urban Outfitters Home, West Elm, Etsy sellers in this niche" />
              </div>
              <div>
                <Label className="text-xs text-white/50">Unique Value Proposition</Label>
                <Textarea value={profile.uniqueValue} onChange={(e) => setProfile((p) => ({ ...p, uniqueValue: e.target.value }))} className="bg-white/5 border-white/10 text-white mt-1" placeholder="What makes this store different from competitors?" rows={2} />
              </div>
              <div>
                <Label className="text-xs text-white/50">Additional Context</Label>
                <Textarea value={profile.additionalNotes} onChange={(e) => setProfile((p) => ({ ...p, additionalNotes: e.target.value }))} className="bg-white/5 border-white/10 text-white mt-1" placeholder="Anything else the AI should know — seasonal focus, upcoming launches, tone to avoid, etc." rows={3} />
              </div>
              <Button onClick={saveProfile} disabled={updateMutation.isPending} className="bg-violet-600 hover:bg-violet-500">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Business Profile
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

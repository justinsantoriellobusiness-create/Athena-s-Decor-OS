import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, ExternalLink, RefreshCw, Unplug, Plug,
  ShoppingBag, Package, CreditCard, BarChart3, Megaphone, Video, Truck, Store
} from "lucide-react";

type Platform = "shopify" | "ebay" | "paypal" | "google" | "facebook" | "tiktok" | "autods" | "cj_dropshipping";

interface PlatformConfig {
  id: Platform;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  category: "ecommerce" | "payments" | "analytics" | "ads" | "fulfillment";
  oauthSupported: boolean;
  helpUrl: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "shopify",
    name: "Shopify",
    description: "Sync products, orders, inventory, and SEO metadata directly to your store.",
    icon: ShoppingBag,
    color: "text-green-500",
    category: "ecommerce",
    oauthSupported: true,
    helpUrl: "https://help.shopify.com/en/manual/apps",
  },
  {
    id: "ebay",
    name: "eBay",
    description: "Manage eBay listings, orders, and fees from your dashboard.",
    icon: Package,
    color: "text-yellow-500",
    category: "ecommerce",
    oauthSupported: true,
    helpUrl: "https://developer.ebay.com/api-docs/static/oauth-tokens.html",
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Pull PayPal transaction data into your accounting module.",
    icon: CreditCard,
    color: "text-blue-500",
    category: "payments",
    oauthSupported: true,
    helpUrl: "https://developer.paypal.com/api/rest/",
  },
  {
    id: "google",
    name: "Google Analytics & Search Console",
    description: "Import real traffic, keyword rankings, and search performance data.",
    icon: BarChart3,
    color: "text-red-500",
    category: "analytics",
    oauthSupported: true,
    helpUrl: "https://developers.google.com/analytics",
  },
  {
    id: "facebook",
    name: "Facebook / Meta Ads",
    description: "Sync Meta ad campaigns, spend, and ROAS into your Ads module.",
    icon: Megaphone,
    color: "text-blue-600",
    category: "ads",
    oauthSupported: true,
    helpUrl: "https://developers.facebook.com/docs/marketing-apis/",
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    description: "Connect TikTok Ads Manager to track campaign performance.",
    icon: Video,
    color: "text-pink-500",
    category: "ads",
    oauthSupported: true,
    helpUrl: "https://ads.tiktok.com/marketing_api/docs",
  },
  {
    id: "autods",
    name: "AutoDS",
    description: "Push sourced products directly to your AutoDS import list.",
    icon: Truck,
    color: "text-purple-500",
    category: "fulfillment",
    oauthSupported: false,
    helpUrl: "https://help.autods.com/en/articles/api",
  },
  {
    id: "cj_dropshipping",
    name: "CJ Dropshipping",
    description: "Add products to your CJ favorites and manage fulfillment.",
    icon: Store,
    color: "text-orange-500",
    category: "fulfillment",
    oauthSupported: false,
    helpUrl: "https://developers.cjdropshipping.com/",
  },
];

const CATEGORIES = [
  { id: "ecommerce", label: "E-Commerce" },
  { id: "payments", label: "Payments" },
  { id: "analytics", label: "Analytics" },
  { id: "ads", label: "Advertising" },
  { id: "fulfillment", label: "Fulfillment" },
];

export default function IntegrationsPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformConfig | null>(null);
  const [shopDomain, setShopDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [storeId, setStoreId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connectInstructions, setConnectInstructions] = useState<string | null>(null);
  const [requiresApiKey, setRequiresApiKey] = useState(false);

  const { data: tokens, refetch: refetchTokens } = trpc.integrations.getAll.useQuery();

  const initOAuth = trpc.integrations.initiateOAuth.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank", "width=600,height=700,scrollbars=yes");
        toast.info("OAuth window opened — complete authorization in the popup.");
        setDialogOpen(false);
      } else {
        setConnectInstructions(data.instructions ?? null);
        setRequiresApiKey(data.requiresApiKey ?? false);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const saveApiKey = trpc.integrations.saveApiKey.useMutation({
    onSuccess: () => {
      toast.success("API key saved successfully!");
      setDialogOpen(false);
      setApiKey("");
      setStoreId("");
      refetchTokens();
    },
    onError: (err) => toast.error(err.message),
  });

  const disconnect = trpc.integrations.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Platform disconnected.");
      refetchTokens();
    },
    onError: (err) => toast.error(err.message),
  });

  const testConnection = trpc.integrations.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.warning(data.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const connectedPlatforms = new Set((tokens || []).map(t => t.platform));

  const handleConnect = (platform: PlatformConfig) => {
    setSelectedPlatform(platform);
    setConnectInstructions(null);
    setRequiresApiKey(false);
    setApiKey("");
    setStoreId("");
    setShopDomain("");
    setDialogOpen(true);
  };

  const handleInitiateOAuth = () => {
    if (!selectedPlatform) return;
    initOAuth.mutate({
      platform: selectedPlatform.id,
      shopDomain: selectedPlatform.id === "shopify" ? shopDomain : undefined,
      origin: window.location.origin,
    });
  };

  const handleSaveApiKey = () => {
    if (!selectedPlatform || !apiKey.trim()) return;
    saveApiKey.mutate({
      platform: selectedPlatform.id as "autods" | "cj_dropshipping",
      apiKey: apiKey.trim(),
      storeId: storeId.trim() || undefined,
    });
  };

  const connectedCount = connectedPlatforms.size;
  const totalCount = PLATFORMS.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect your platforms to replace mock data with real live data across all modules.
          </p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {connectedCount} / {totalCount} Connected
        </Badge>
      </div>

      {/* Status banner */}
      {connectedCount === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          <strong>No platforms connected.</strong> Connect at least Shopify to enable real data across SEO, Audit, Blog, Sourcing, Inventory, and Accounting modules.
        </div>
      )}

      {/* Platform cards by category */}
      {CATEGORIES.map(category => {
        const categoryPlatforms = PLATFORMS.filter(p => p.category === category.id);
        return (
          <div key={category.id}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category.label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryPlatforms.map(platform => {
                const isConnected = connectedPlatforms.has(platform.id);
                const token = (tokens || []).find(t => t.platform === platform.id);
                const Icon = platform.icon;
                return (
                  <Card key={platform.id} className={`transition-all ${isConnected ? "border-green-500/40 bg-green-500/5" : ""}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg bg-muted ${platform.color}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{platform.name}</CardTitle>
                            {isConnected ? (
                              <div className="flex items-center gap-1 mt-0.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Connected</span>
                                {token?.connectedAt && (
                                  <span className="text-xs text-muted-foreground ml-1">
                                    · {new Date(token.connectedAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 mt-0.5">
                                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Not connected</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <a
                          href={platform.helpUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <CardDescription className="text-xs mb-4">{platform.description}</CardDescription>
                      <div className="flex items-center gap-2">
                        {isConnected ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => testConnection.mutate({ platform: platform.id })}
                              disabled={testConnection.isPending}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                              Test
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-destructive hover:text-destructive"
                              onClick={() => disconnect.mutate({ platform: platform.id })}
                              disabled={disconnect.isPending}
                            >
                              <Unplug className="h-3.5 w-3.5 mr-1.5" />
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => handleConnect(platform)}
                          >
                            <Plug className="h-3.5 w-3.5 mr-1.5" />
                            {platform.oauthSupported ? "Connect with OAuth" : "Connect with API Key"}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Connect Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect {selectedPlatform?.name}</DialogTitle>
            <DialogDescription>
              {connectInstructions || (selectedPlatform?.oauthSupported
                ? `Authorize Athena's OS to access your ${selectedPlatform?.name} account securely via OAuth.`
                : `Enter your ${selectedPlatform?.name} API credentials.`)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Shopify needs shop domain first */}
            {selectedPlatform?.id === "shopify" && !connectInstructions && (
              <div className="space-y-2">
                <Label htmlFor="shopDomain">Your Shopify Store Domain</Label>
                <Input
                  id="shopDomain"
                  placeholder="yourstore.myshopify.com"
                  value={shopDomain}
                  onChange={e => setShopDomain(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Enter your .myshopify.com domain (without https://)</p>
              </div>
            )}

            {/* API key input for AutoDS / CJ */}
            {(requiresApiKey || (!selectedPlatform?.oauthSupported)) && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="apiKey">
                    {selectedPlatform?.id === "autods" ? "AutoDS API Key" : "CJ Access Token"}
                  </Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="Paste your API key here"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                  />
                </div>
                {selectedPlatform?.id === "autods" && (
                  <div className="space-y-2">
                    <Label htmlFor="storeId">AutoDS Store ID</Label>
                    <Input
                      id="storeId"
                      placeholder="Your AutoDS store ID"
                      value={storeId}
                      onChange={e => setStoreId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Find it in AutoDS → Settings → My Stores
                    </p>
                  </div>
                )}
                <Separator />
                <p className="text-xs text-muted-foreground">
                  <strong>How to get your key:</strong>{" "}
                  <a href={selectedPlatform?.helpUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {selectedPlatform?.name} API documentation →
                  </a>
                </p>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            {requiresApiKey || !selectedPlatform?.oauthSupported ? (
              <Button
                onClick={handleSaveApiKey}
                disabled={!apiKey.trim() || saveApiKey.isPending}
              >
                {saveApiKey.isPending ? "Saving..." : "Save & Connect"}
              </Button>
            ) : (
              <Button
                onClick={handleInitiateOAuth}
                disabled={
                  initOAuth.isPending ||
                  (selectedPlatform?.id === "shopify" && !shopDomain.trim())
                }
              >
                {initOAuth.isPending ? "Redirecting..." : `Connect with ${selectedPlatform?.name}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

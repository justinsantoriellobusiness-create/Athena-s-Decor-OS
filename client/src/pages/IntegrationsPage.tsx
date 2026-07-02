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
  CheckCircle2, XCircle, ExternalLink, RefreshCw, Unplug, LogIn,
  ShoppingBag, Package, CreditCard, BarChart3, Megaphone, Video, Truck, Store, Globe
} from "lucide-react";

type Platform = "shopify" | "ebay" | "paypal" | "google" | "facebook" | "tiktok" | "autods" | "cj_dropshipping" | "dsers";

interface PlatformConfig {
  id: Platform;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  category: "ecommerce" | "payments" | "analytics" | "ads" | "fulfillment";
  fields: { key: string; label: string; placeholder: string; type?: string; required?: boolean }[];
  instructions: string;
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
    fields: [
      { key: "shopDomain", label: "Store Domain", placeholder: "yourstore.myshopify.com", required: true },
      { key: "apiKey", label: "Admin API Access Token", placeholder: "shpat_xxxxxxxxxxxxx", type: "password", required: true },
    ],
    instructions: "Go to Shopify Admin → Settings → Apps and sales channels → Develop apps → Create an app → Configure Admin API scopes (select all) → Install app → Copy the Admin API access token.",
    helpUrl: "https://help.shopify.com/en/manual/apps/app-types/custom-apps",
  },
  {
    id: "ebay",
    name: "eBay",
    description: "Manage eBay listings, orders, and fees from your dashboard.",
    icon: Package,
    color: "text-yellow-500",
    category: "ecommerce",
    fields: [
      { key: "apiKey", label: "User Access Token", placeholder: "v^1.1#i^1#p^3#...", type: "password", required: true },
    ],
    instructions: "Go to eBay Developer Portal → Application Keys → Get a User Token → Sign in to eBay → Copy the User Access Token.",
    helpUrl: "https://developer.ebay.com/api-docs/static/oauth-tokens.html",
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Pull PayPal transaction data into your accounting module.",
    icon: CreditCard,
    color: "text-blue-500",
    category: "payments",
    fields: [
      { key: "apiKey", label: "Client ID", placeholder: "AX...", required: true },
      { key: "apiSecret", label: "Client Secret", placeholder: "EL...", type: "password", required: true },
    ],
    instructions: "Go to PayPal Developer Dashboard → My Apps & Credentials → Create App (or select existing) → Copy Client ID and Secret from the Live tab.",
    helpUrl: "https://developer.paypal.com/api/rest/",
  },
  {
    id: "google",
    name: "Google Analytics & Search Console",
    description: "Validates and stores your token — not used anywhere else in the app yet (no traffic/keyword data is pulled in).",
    icon: BarChart3,
    color: "text-red-500",
    category: "analytics",
    fields: [
      { key: "apiKey", label: "OAuth Access Token", placeholder: "ya29.a0...", type: "password", required: true },
      { key: "accountId", label: "Property ID (optional)", placeholder: "GA4: 123456789" },
    ],
    instructions: "Go to Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client → Use OAuth Playground to get an access token with Analytics and Search Console scopes.",
    helpUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries",
  },
  {
    id: "facebook",
    name: "Facebook / Meta Ads",
    description: "Sync Meta ad campaigns, spend, and ROAS into your Ads module.",
    icon: Megaphone,
    color: "text-blue-600",
    category: "ads",
    fields: [
      { key: "apiKey", label: "System User Access Token", placeholder: "EAABs...", type: "password", required: true },
      { key: "accountId", label: "Ad Account ID", placeholder: "act_123456789", required: true },
    ],
    instructions: "Go to Meta Business Suite → Settings → Business Settings → System Users → Generate Token with ads_read and ads_management permissions. Copy your Ad Account ID from Ads Manager.",
    helpUrl: "https://developers.facebook.com/docs/marketing-apis/overview/authentication",
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    description: "Connect TikTok Ads Manager to track campaign performance.",
    icon: Video,
    color: "text-pink-500",
    category: "ads",
    fields: [
      { key: "apiKey", label: "Access Token", placeholder: "your-tiktok-access-token", type: "password", required: true },
      { key: "accountId", label: "Advertiser ID", placeholder: "123456789", required: true },
    ],
    instructions: "Go to TikTok for Business → Marketing API → My Apps → Create App → Get Authorized → Copy the long-lived Access Token and your Advertiser ID.",
    helpUrl: "https://ads.tiktok.com/marketing_api/docs?id=1738855176671234",
  },
  {
    id: "autods",
    name: "AutoDS",
    description: "Push sourced products directly to your AutoDS import list for automated fulfillment.",
    icon: Truck,
    color: "text-purple-500",
    category: "fulfillment",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "your-autods-api-key", type: "password", required: true },
      { key: "storeId", label: "Store ID", placeholder: "12345", required: true },
    ],
    instructions: "Go to AutoDS Dashboard → Settings → API → Generate API Key. Your Store ID is visible in the URL when you're in your store dashboard.",
    helpUrl: "https://help.autods.com/en/articles/api",
  },
  {
    id: "cj_dropshipping",
    name: "CJ Dropshipping",
    description: "Add products to your CJ favorites and manage fulfillment directly.",
    icon: Store,
    color: "text-orange-500",
    category: "fulfillment",
    fields: [
      { key: "apiKey", label: "CJ Access Token", placeholder: "your-cj-access-token", type: "password", required: true },
    ],
    instructions: "Go to CJ Developer Portal (developers.cjdropshipping.com) → Register/Login → My Apps → Create App → Copy the Access Token.",
    helpUrl: "https://developers.cjdropshipping.com/",
  },
  {
    id: "dsers",
    name: "DSers",
    description: "Source products from AliExpress via DSers and manage supplier orders.",
    icon: Globe,
    color: "text-cyan-500",
    category: "fulfillment",
    fields: [
      { key: "apiKey", label: "DSers API Key", placeholder: "your-dsers-api-key", type: "password", required: true },
      { key: "storeId", label: "Store ID (optional)", placeholder: "your-dsers-store-id" },
    ],
    instructions: "Go to DSers Dashboard → Settings → API Access → Generate API Key. Your Store ID is shown in your account settings.",
    helpUrl: "https://www.dsers.com/",
  },
];

const CATEGORIES = [
  { id: "ecommerce", label: "E-Commerce" },
  { id: "payments", label: "Payments" },
  { id: "analytics", label: "Analytics" },
  { id: "ads", label: "Advertising" },
  { id: "fulfillment", label: "Fulfillment & Sourcing" },
];

export default function IntegrationsPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformConfig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: tokens, refetch: refetchTokens } = trpc.integrations.getAll.useQuery();

  const connectMutation = trpc.integrations.connect.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setDialogOpen(false);
      setFormValues({});
      refetchTokens();
    },
    onError: (err) => {
      toast.error(err.message);
      setIsConnecting(false);
    },
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
    setFormValues({});
    setIsConnecting(false);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!selectedPlatform) return;
    setIsConnecting(true);

    // Validate required fields
    for (const field of selectedPlatform.fields) {
      if (field.required && !formValues[field.key]?.trim()) {
        toast.error(`${field.label} is required`);
        setIsConnecting(false);
        return;
      }
    }

    connectMutation.mutate({
      platform: selectedPlatform.id,
      credentials: {
        apiKey: formValues.apiKey || "",
        apiSecret: formValues.apiSecret || undefined,
        shopDomain: formValues.shopDomain || undefined,
        storeId: formValues.storeId || undefined,
        accountId: formValues.accountId || undefined,
      },
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
            Connect your platforms to enable real data across all modules. All connections use secure API key authentication.
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

      {connectedCount > 0 && connectedCount < totalCount && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600 dark:text-green-400">
          <strong>{connectedCount} platform{connectedCount > 1 ? "s" : ""} connected.</strong> All connected modules are pulling real data. Connect more platforms to unlock additional features.
        </div>
      )}

      {/* Platform cards by category */}
      {CATEGORIES.map(category => {
        const categoryPlatforms = PLATFORMS.filter(p => p.category === category.id);
        return (
          <div key={category.id}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category.label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryPlatforms.map(platform => {
                const isConnected = connectedPlatforms.has(platform.id);
                const token = (tokens || []).find(t => t.platform === platform.id);
                const Icon = platform.icon;
                return (
                  <Card key={platform.id} className={`transition-all ${isConnected ? "border-green-500/40 bg-green-500/5" : "hover:border-muted-foreground/30"}`}>
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
                            <LogIn className="h-3.5 w-3.5 mr-1.5" />
                            Log In
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedPlatform && <selectedPlatform.icon className={`h-5 w-5 ${selectedPlatform.color}`} />}
              Connect {selectedPlatform?.name}
            </DialogTitle>
            <DialogDescription>
              Enter your credentials below. The connection will be tested automatically before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Instructions */}
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">How to get your credentials:</strong>
              <p className="mt-1">{selectedPlatform?.instructions}</p>
              <a
                href={selectedPlatform?.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                View documentation
              </a>
            </div>

            <Separator />

            {/* Dynamic form fields */}
            {selectedPlatform?.fields.map(field => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  id={field.key}
                  type={field.type || "text"}
                  placeholder={field.placeholder}
                  value={formValues[field.key] || ""}
                  onChange={e => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={isConnecting || connectMutation.isPending}
            >
              {isConnecting || connectMutation.isPending ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Testing & Connecting...
                </>
              ) : (
                <>
                  <LogIn className="h-3.5 w-3.5 mr-1.5" />
                  Connect
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

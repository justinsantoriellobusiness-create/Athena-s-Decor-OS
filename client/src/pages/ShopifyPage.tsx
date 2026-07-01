import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ShoppingBag, CheckCircle2, XCircle, RefreshCw, Loader2, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShopifyPage() {
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const utils = trpc.useUtils();

  const { data: config, isLoading } = trpc.shopify.getConfig.useQuery();
  const connectMutation = trpc.shopify.connect.useMutation({
    onSuccess: (data) => {
      toast.success(`Connected to ${data.shopName} — ${data.productCount} products synced`);
      utils.shopify.getConfig.invalidate();
      setDomain(""); setToken("");
    },
    onError: (err) => toast.error(err.message),
  });
  const disconnectMutation = trpc.shopify.disconnect.useMutation({
    onSuccess: () => { toast.success("Disconnected from Shopify"); utils.shopify.getConfig.invalidate(); },
  });
  const syncMutation = trpc.shopify.syncProducts.useMutation({
    onSuccess: (data) => { toast.success(`Synced ${data.productCount} products`); utils.shopify.getConfig.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const isConnected = config?.isConnected;

  return (
    <div className="p-8 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Shopify Integration</h1>
        <p className="text-sm text-muted-foreground mt-1">Connect your Shopify store to enable all automation modules</p>
      </div>

      {/* Status Card */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
            <ShoppingBag className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Store Connection</h2>
            <p className="text-xs text-muted-foreground">Shopify Admin API via access token</p>
          </div>
          <div className="ml-auto">
            {isLoading ? <Skeleton className="h-6 w-24 rounded-full" /> :
              isConnected ?
                <span className="badge-success">
                  <CheckCircle2 className="w-3 h-3" />Connected
                </span> :
                <span className="badge-error">
                  <XCircle className="w-3 h-3" />Not Connected
                </span>
            }
          </div>
        </div>

        {isConnected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Store Domain</p>
                <p className="text-sm font-medium text-foreground">{config?.storeDomain}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Products Synced</p>
                <p className="text-sm font-medium text-foreground">{config?.productCount ?? 0}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Last Sync</p>
                <p className="text-sm font-medium text-foreground">
                  {config?.lastSyncAt ? new Date(config.lastSyncAt).toLocaleString() : "Never"}
                </p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">API Token</p>
                <p className="text-sm font-medium text-foreground font-mono">{config?.accessToken}</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="gap-2 border-border/50"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync Products
              </Button>
              <Button
                variant="outline"
                className="gap-2 border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                <Unlink className="w-4 h-4" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Store Domain</Label>
                <Input
                  placeholder="yourstore.myshopify.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="bg-secondary/50 border-border/50 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Admin API Access Token</Label>
                <Input
                  type="password"
                  placeholder="shpat_••••••••••••••••"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="bg-secondary/50 border-border/50 text-sm"
                />
              </div>
            </div>
            <Button
              className="gap-2 font-semibold"
              style={{ background: "linear-gradient(135deg, oklch(0.82 0.12 85), oklch(0.72 0.1 70))", color: "black" }}
              onClick={() => connectMutation.mutate({ storeDomain: domain, accessToken: token })}
              disabled={!domain || !token || connectMutation.isPending}
            >
              {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Connect Store
            </Button>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">How to get your API token</h3>
        <ol className="space-y-2 text-sm text-muted-foreground">
          {[
            "Go to your Shopify Admin → Settings → Apps and sales channels",
            "Click Develop apps → Create an app",
            "Configure Admin API scopes: read/write products, inventory, blogs, articles",
            "Install the app and copy the Admin API access token",
            "Paste the token above along with your store domain",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ShoppingBag, Search, FileText, Package, BarChart3, Megaphone,
  Settings, Zap, ChevronRight, LogOut, Loader2, ShieldCheck, Bot, TrendingUp, DollarSign,
  Link2, Mail, Plug, Activity, Truck, UserCog,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import ErrorBoundary from "@/components/ErrorBoundary";
import { getTheme } from "@/lib/themes";

const navSections = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/analytics", label: "Analytics", icon: TrendingUp },
      { href: "/automation", label: "Automation Hub", icon: Zap },
      { href: "/activity", label: "Activity Feed", icon: Activity },
      { href: "/assistant", label: "AI Assistant", icon: Bot },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/seo", label: "SEO Optimizer", icon: Search },
      { href: "/audit", label: "Site Audit", icon: ShieldCheck },
      { href: "/blog", label: "Blog & Content", icon: FileText },
      { href: "/backlinker", label: "Backlinker", icon: Link2 },
      { href: "/email-campaigns", label: "Email Campaigns", icon: Mail },
      { href: "/ads", label: "Ads", icon: Megaphone },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/sourcing", label: "Sourcing", icon: Package },
      { href: "/inventory", label: "Inventory", icon: BarChart3 },
      { href: "/fulfillment", label: "Fulfillment", icon: Truck },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/accounting", label: "Accounting", icon: DollarSign },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings", label: "Profile & Branding", icon: UserCog },
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/shopify", label: "Shopify", icon: ShoppingBag },
      { href: "/scheduler", label: "Scheduler", icon: Settings },
    ],
  },
];

interface AppLayoutProps {
  children: React.ReactNode;
  noPadding?: boolean;
}

export default function AppLayout({ children, noPadding }: AppLayoutProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { setLocation("/login"); },
  });
  // enabled: isAuthenticated — settings.get is a protectedProcedure, so
  // firing it before auth resolves would 401 and log noise on every load.
  const settingsQuery = trpc.settings.get.useQuery(undefined, { enabled: isAuthenticated });
  const theme = getTheme(settingsQuery.data?.themeId);
  const appName = settingsQuery.data?.appName || "Athena's OS";
  const logoUrl = settingsQuery.data?.logoUrl;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08080f]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-violet-400" />
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-white/30" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <div className="min-h-screen flex bg-[#08080f]">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-white/5 bg-[#0a0a14]">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt={appName} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `linear-gradient(to bottom right, ${theme.gradientFrom}, ${theme.gradientTo})` }}
              >
                <Zap className="w-4 h-4 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-white truncate">{appName}</p>
              <p className="text-[10px] text-white/30 leading-tight">Automation Platform</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="px-3 text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-1.5">{section.label}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  return (
                    <button
                      key={item.href}
                      onClick={() => setLocation(item.href)}
                      style={isActive ? { backgroundColor: theme.activeBg, color: theme.activeText } : undefined}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                        isActive ? "font-medium" : "text-white/40 hover:text-white/70 hover:bg-white/5"
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {isActive && <ChevronRight className="w-3 h-3 opacity-50" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: theme.activeBg }}>
              <span className="text-xs font-semibold" style={{ color: theme.activeText }}>
                {user?.name?.charAt(0)?.toUpperCase() || "A"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.name || "Admin"}</p>
              <p className="text-[10px] text-white/30 truncate">{user?.email || ""}</p>
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              className="text-white/30 hover:text-white/60 transition-colors"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      {/* Per-page boundary: a crash inside one page shows its error inline
          while the sidebar/nav stay usable — previously any page exception
          (e.g. the Accounting tab crash) replaced the entire app. */}
      <main className={cn("flex-1 overflow-auto", !noPadding && "")}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}

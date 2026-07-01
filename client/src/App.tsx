import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import ShopifyPage from "./pages/ShopifyPage";
import SeoPage from "./pages/SeoPage";
import BlogPage from "./pages/BlogPage";
import SourcingPage from "./pages/SourcingPage";
import InventoryPage from "./pages/InventoryPage";
import AdsPage from "./pages/AdsPage";
import SchedulerPage from "./pages/SchedulerPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import AssistantPage from "./pages/AssistantPage";
import AuditPage from "./pages/AuditPage";
import LoginPage from "./pages/LoginPage";
import AccountingPage from "./pages/AccountingPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import BacklinkerPage from "./pages/BacklinkerPage";
import EmailCampaignsPage from "./pages/EmailCampaignsPage";
import AutomationHubPage from "./pages/AutomationHubPage";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={() => <AppLayout><Dashboard /></AppLayout>} />
      <Route path="/dashboard" component={() => <AppLayout><Dashboard /></AppLayout>} />
      <Route path="/shopify" component={() => <AppLayout><ShopifyPage /></AppLayout>} />
      <Route path="/seo" component={() => <AppLayout><SeoPage /></AppLayout>} />
      <Route path="/audit" component={() => <AppLayout><AuditPage /></AppLayout>} />
      <Route path="/blog" component={() => <AppLayout><BlogPage /></AppLayout>} />
      <Route path="/sourcing" component={() => <AppLayout><SourcingPage /></AppLayout>} />
      <Route path="/inventory" component={() => <AppLayout><InventoryPage /></AppLayout>} />
      <Route path="/ads" component={() => <AppLayout><AdsPage /></AppLayout>} />
      <Route path="/scheduler" component={() => <AppLayout><SchedulerPage /></AppLayout>} />
      <Route path="/analytics" component={() => <AppLayout><AnalyticsPage /></AppLayout>} />
      <Route path="/assistant" component={() => <AppLayout noPadding><AssistantPage /></AppLayout>} />
      <Route path="/accounting" component={() => <AppLayout><AccountingPage /></AppLayout>} />
      <Route path="/integrations" component={() => <AppLayout><IntegrationsPage /></AppLayout>} />
      <Route path="/backlinker" component={() => <AppLayout><BacklinkerPage /></AppLayout>} />
      <Route path="/email-campaigns" component={() => <AppLayout><EmailCampaignsPage /></AppLayout>} />
      <Route path="/automation" component={() => <AppLayout><AutomationHubPage /></AppLayout>} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

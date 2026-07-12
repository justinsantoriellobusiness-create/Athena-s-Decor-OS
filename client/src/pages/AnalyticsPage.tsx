import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import {
  TrendingUp, Search, FileText, Package, Megaphone, ShieldCheck, AlertTriangle, CheckCircle2, Activity, DollarSign, Eye, MousePointerClick,
} from "lucide-react";

const COLORS = ["#a78bfa", "#34d399", "#f87171", "#fbbf24", "#60a5fa"];

function StatCard({ icon: Icon, label, value, sub, color = "violet" }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    violet: "text-violet-400",
    green: "text-emerald-400",
    red: "text-red-400",
    yellow: "text-amber-400",
    blue: "text-blue-400",
  };
  return (
    <Card className="bg-[#0f0f1a] border-white/5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-3xl font-bold text-white">{value}</p>
            {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-white/5 ${colorMap[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#ffffff10" strokeWidth="6" />
        <circle
          cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 44 44)"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
        <text x="44" y="49" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">{score}</text>
      </svg>
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );
}

const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);

export default function AnalyticsPage() {
  const { data: overview, isLoading } = trpc.analytics.getOverview.useQuery();
  const { data: auditHistory } = trpc.analytics.getAuditHistory.useQuery();
  const { data: keywords } = trpc.analytics.getKeywordTrends.useQuery();
  const { data: sales, isLoading: salesLoading } = trpc.analytics.getSalesOverview.useQuery();
  const { data: pl } = trpc.accounting.getPL.useQuery({ startDate: thirtyDaysAgo, endDate: today });

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64 bg-white/5" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 bg-white/5" />)}
        </div>
      </div>
    );
  }

  const ov = overview;

  // Audit history chart data
  const auditChartData = (auditHistory || []).slice(0, 10).reverse().map((run, i) => ({
    name: `Run ${i + 1}`,
    overall: run.overallScore ?? 0,
    seo: run.seoScore ?? 0,
    cro: run.croScore ?? 0,
    tech: run.technicalScore ?? 0,
  }));

  // Keyword volume chart
  const keywordData = (keywords || []).slice(0, 10).map((k) => ({
    name: k.keyword.length > 16 ? k.keyword.substring(0, 16) + "…" : k.keyword,
    volume: k.searchVolume,
    difficulty: k.difficulty,
  }));

  // Inventory pie
  const inventoryPie = ov ? [
    { name: "In Stock", value: ov.inventory.inStock },
    { name: "Low Stock", value: ov.inventory.lowStock },
    { name: "Out of Stock", value: ov.inventory.outOfStock },
  ] : [];

  // Blog breakdown
  const blogPie = ov ? [
    { name: "Published", value: ov.blog.published },
    { name: "Draft", value: ov.blog.draft },
  ] : [];

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Analytics</h1>
        <p className="text-white/40 text-sm mt-1">Business-wide performance overview</p>
      </div>

      {/* Sales Performance — real Shopify revenue, not automation activity counts */}
      <div>
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest mb-3">Sales Performance</h2>
        {salesLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 bg-white/5" />)}
          </div>
        ) : !sales?.connected ? (
          <Card className="bg-[#0f0f1a] border-white/5">
            <CardContent className="p-8 text-center text-white/30 text-sm">Connect Shopify to see real sales data here.</CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard icon={DollarSign} label="Revenue (30d)" value={`$${sales.revenue30d.toLocaleString()}`} sub={`$${sales.revenue7d.toLocaleString()} last 7d`} color="green" />
              <StatCard icon={Package} label="Orders (30d)" value={sales.orders30d} sub={`${sales.orders7d} last 7d`} color="blue" />
              <StatCard icon={TrendingUp} label="Avg Order Value" value={`$${sales.aov30d.toFixed(2)}`} sub={`$${sales.aov7d.toFixed(2)} last 7d`} color="violet" />
              <StatCard
                icon={DollarSign}
                label="Net Profit (30d)"
                value={pl ? `$${pl.netProfit.toLocaleString()}` : "—"}
                sub={pl ? `${pl.grossRevenue > 0 ? Math.round((pl.netProfit / pl.grossRevenue) * 100) : 0}% margin` : "Run Accounting Sync first"}
                color={pl && pl.netProfit >= 0 ? "green" : "red"}
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="bg-[#0f0f1a] border-white/5 col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-white/60 uppercase tracking-widest">Revenue — Last 30 Days</CardTitle>
                </CardHeader>
                <CardContent>
                  {sales.dailySeries.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={sales.dailySeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                        <XAxis dataKey="date" tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(d) => d.slice(5)} />
                        <YAxis tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff15", borderRadius: 8, color: "#fff" }} />
                        <Bar dataKey="revenue" fill="#34d399" radius={[4, 4, 0, 0]} name="Revenue ($)" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-44 text-white/30 text-sm">No paid orders yet</div>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-[#0f0f1a] border-white/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-white/60 uppercase tracking-widest">Top Products (30d)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sales.topProducts.length > 0 ? sales.topProducts.slice(0, 6).map((p) => (
                    <div key={p.title} className="flex items-center justify-between text-xs">
                      <span className="text-white/60 truncate mr-2">{p.title}</span>
                      <span className="text-white font-medium flex-shrink-0">${p.revenue.toLocaleString()}</span>
                    </div>
                  )) : (
                    <p className="text-white/30 text-sm text-center py-4">No sales yet</p>
                  )}
                </CardContent>
              </Card>
            </div>
            <p className="text-[10px] text-white/20 mt-2">Based on the last {sales.ordersSampled} paid orders from Shopify.</p>
          </>
        )}
      </div>

      {/* Top KPIs — automation activity, not sales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Active Automations" value={`${ov?.automations.active ?? 0}/${ov?.automations.total ?? 0}`} sub="modules running" color="violet" />
        <StatCard icon={Search} label="Keywords Tracked" value={ov?.seo.keywordCount ?? 0} sub="in database" color="blue" />
        <StatCard icon={FileText} label="Blog Posts" value={ov?.blog.total ?? 0} sub={`${ov?.blog.published ?? 0} published`} color="green" />
        <StatCard icon={Megaphone} label="Ad Campaigns" value={ov?.ads.campaigns ?? 0} sub={`${ov?.ads.active ?? 0} active`} color="yellow" />
        <StatCard icon={Package} label="Products Tracked" value={ov?.inventory.total ?? 0} sub={`${ov?.inventory.healthPercent ?? 0}% in stock`} color="green" />
        <StatCard icon={DollarSign} label="Daily Ad Spend" value={`$${ov?.ads.dailySpend?.toFixed(2) ?? "0.00"}`} sub={`${ov?.ads.avgRoas ?? 0}x ROAS`} color="yellow" />
        <StatCard icon={AlertTriangle} label="Open SEO Issues" value={ov?.seo.openIssues ?? 0} sub={`${ov?.seo.criticalIssues ?? 0} critical`} color="red" />
        <StatCard icon={ShieldCheck} label="Audit Score" value={ov?.seo.auditScore != null ? `${ov.seo.auditScore}/100` : "—"} sub="overall health" color="violet" />
      </div>

      {/* SEO Scores + Audit History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score rings */}
        <Card className="bg-[#0f0f1a] border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60 uppercase tracking-widest">Latest Audit Scores</CardTitle>
          </CardHeader>
          <CardContent>
            {ov?.seo.auditScore != null ? (
              <div className="flex justify-around py-2">
                <ScoreRing score={ov.seo.auditScore} label="Overall" color="#a78bfa" />
                <ScoreRing score={ov.seo.auditSeoScore ?? 0} label="SEO" color="#60a5fa" />
                <ScoreRing score={ov.seo.auditCroScore ?? 0} label="CRO" color="#34d399" />
                <ScoreRing score={ov.seo.auditTechScore ?? 0} label="Tech" color="#fbbf24" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-white/30 gap-2">
                <ShieldCheck className="w-8 h-8" />
                <p className="text-sm">No audit run yet</p>
                <p className="text-xs">Go to SEO → Site Audit to run your first audit</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audit score history chart */}
        <Card className="bg-[#0f0f1a] border-white/5 col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60 uppercase tracking-widest">Audit Score History</CardTitle>
          </CardHeader>
          <CardContent>
            {auditChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={auditChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="name" tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff15", borderRadius: 8, color: "#fff" }} />
                  <Line type="monotone" dataKey="overall" stroke="#a78bfa" strokeWidth={2} dot={false} name="Overall" />
                  <Line type="monotone" dataKey="seo" stroke="#60a5fa" strokeWidth={2} dot={false} name="SEO" />
                  <Line type="monotone" dataKey="cro" stroke="#34d399" strokeWidth={2} dot={false} name="CRO" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-white/30 text-sm">
                Run site audits to see score history
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Keyword Volume + Inventory + Blog */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Keyword volume bar chart */}
        <Card className="bg-[#0f0f1a] border-white/5 col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60 uppercase tracking-widest">Top Keywords by Search Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {keywordData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={keywordData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#ffffff60", fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff15", borderRadius: 8, color: "#fff" }} />
                  <Bar dataKey="volume" fill="#a78bfa" radius={[0, 4, 4, 0]} name="Search Volume" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-44 text-white/30 text-sm">
                Run keyword research to see data here
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inventory pie */}
        <div className="space-y-4">
          <Card className="bg-[#0f0f1a] border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/60 uppercase tracking-widest">Inventory Health</CardTitle>
            </CardHeader>
            <CardContent>
              {ov && ov.inventory.total > 0 ? (
                <div className="flex items-center gap-4">
                  <PieChart width={80} height={80}>
                    <Pie data={inventoryPie} cx={36} cy={36} innerRadius={22} outerRadius={36} dataKey="value" strokeWidth={0}>
                      {inventoryPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                  </PieChart>
                  <div className="space-y-1 text-xs">
                    {inventoryPie.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} />
                        <span className="text-white/60">{item.name}</span>
                        <span className="text-white font-medium ml-auto">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-white/30 text-sm text-center py-4">No inventory data yet</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0f0f1a] border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/60 uppercase tracking-widest">Blog Status</CardTitle>
            </CardHeader>
            <CardContent>
              {ov && ov.blog.total > 0 ? (
                <div className="flex items-center gap-4">
                  <PieChart width={80} height={80}>
                    <Pie data={blogPie} cx={36} cy={36} innerRadius={22} outerRadius={36} dataKey="value" strokeWidth={0}>
                      {blogPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                  </PieChart>
                  <div className="space-y-1 text-xs">
                    {blogPie.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} />
                        <span className="text-white/60">{item.name}</span>
                        <span className="text-white font-medium ml-auto">{item.value}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                      <div className="w-2 h-2 rounded-full bg-violet-400/40" />
                      <span className="text-white/60">AI Generated</span>
                      <span className="text-white font-medium ml-auto">{ov.blog.aiGenerated}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-white/30 text-sm text-center py-4">No blog posts yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Ad performance */}
      {ov && ov.ads.campaigns > 0 && (
        <Card className="bg-[#0f0f1a] border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60 uppercase tracking-widest">Ad Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-white">{ov.ads.campaigns}</p>
                <p className="text-xs text-white/40 mt-1">Total Campaigns</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-400">{ov.ads.active}</p>
                <p className="text-xs text-white/40 mt-1">Active</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-400">${ov.ads.dailySpend.toFixed(2)}</p>
                <p className="text-xs text-white/40 mt-1">Daily Budget</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-violet-400">{ov.ads.avgRoas}x</p>
                <p className="text-xs text-white/40 mt-1">Avg ROAS</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

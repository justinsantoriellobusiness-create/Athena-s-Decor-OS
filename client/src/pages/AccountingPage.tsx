import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  DollarSign, TrendingUp, TrendingDown, PieChart, RefreshCw,
  Plus, Trash2, Edit3, Download, Calculator, Building2,
  ShoppingCart, CreditCard, Wallet, BarChart3, FileText,
  AlertCircle, CheckCircle2, Loader2, ChevronDown, ChevronUp,
  Receipt, Tag, Calendar, Droplets
} from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart as RPieChart, Pie, Cell, Legend
} from "recharts";

const PROVIDER_ICONS: Record<string, string> = {
  shopify: "🛍️", paypal: "🅿️", ebay: "🔵", stripe: "💳",
  bank: "🏦", credit_card: "💳", amazon: "📦", etsy: "🎨",
  dsers: "📋", cj_dropshipping: "🚚", facebook_ads: "📘",
  google_ads: "🔍", tiktok_ads: "🎵", other: "💼",
};

const PROVIDER_COLORS: Record<string, string> = {
  shopify: "#96bf48", paypal: "#003087", ebay: "#e53238",
  stripe: "#635bff", bank: "#2563eb", facebook_ads: "#1877f2",
  google_ads: "#4285f4", tiktok_ads: "#ff0050", other: "#6b7280",
};

const EXPENSE_COLORS = [
  "#f59e0b","#ef4444","#8b5cf6","#06b6d4","#10b981",
  "#f97316","#ec4899","#6366f1","#14b8a6","#84cc16",
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ─── Overview KPIs ────────────────────────────────────────────────────────────
function OverviewTab({ year }: { year: number }) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const { data: pl, isLoading: plLoading } = trpc.accounting.getPL.useQuery({ startDate: start, endDate: end });
  const { data: cashFlow, isLoading: cfLoading } = trpc.accounting.getCashFlow.useQuery({ year });

  const kpis = pl ? [
    { label: "Gross Revenue", value: fmt(pl.grossRevenue), icon: TrendingUp, color: "text-emerald-400", sub: `${fmtPct(pl.grossMarginPct)} margin` },
    { label: "Net Profit", value: fmt(pl.netProfit), icon: DollarSign, color: pl.netProfit >= 0 ? "text-emerald-400" : "text-red-400", sub: `${fmtPct(pl.netMarginPct)} net margin` },
    { label: "Total COGS", value: fmt(pl.totalCOGS), icon: ShoppingCart, color: "text-amber-400", sub: "Cost of goods sold" },
    { label: "Total Expenses", value: fmt(pl.totalOperatingExpenses), icon: TrendingDown, color: "text-red-400", sub: "Operating expenses" },
    { label: "Ad Spend", value: fmt(pl.adSpend), icon: BarChart3, color: "text-purple-400", sub: "Total advertising" },
    { label: "Platform Fees", value: fmt(pl.platformFees + pl.paymentProcessing), icon: CreditCard, color: "text-blue-400", sub: "Shopify + eBay + PayPal" },
  ] : [];

  const expenseBreakdown = pl ? [
    { name: "Product Cost", value: pl.productCost },
    { name: "Advertising", value: pl.advertising },
    { name: "Platform Fees", value: pl.platformFees },
    { name: "Payment Processing", value: pl.paymentProcessing },
    { name: "Shipping", value: pl.shippingCost },
    { name: "Software", value: pl.softwareSubscriptions },
    { name: "Returns", value: pl.returnsRefunds },
    { name: "Other", value: pl.otherExpense + pl.bankCharges + pl.insurance + pl.packaging + pl.storageFulfillment + pl.taxesLicenses + pl.professionalServices + pl.officeSupplies },
  ].filter(e => e.value > 0) : [];

  const sourceBreakdown = pl ? [
    { name: "Shopify", revenue: pl.shopifyRevenue, fees: pl.shopifyFees },
    { name: "eBay", revenue: pl.ebayRevenue, fees: pl.ebayFees },
    { name: "PayPal Fees", revenue: 0, fees: pl.paypalFees },
  ].filter(s => s.revenue > 0 || s.fees > 0) : [];

  if (plLoading || cfLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <k.icon className={`w-4 h-4 ${k.color}`} />
                <span className="text-xs text-white/50">{k.label}</span>
              </div>
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-white/40 mt-1">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue vs Expenses Chart */}
      {cashFlow && cashFlow.length > 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/70">Monthly Cash Flow — {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={cashFlow}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: number) => fmt(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} name="Expenses" />
                <Area type="monotone" dataKey="netProfit" stroke="#f59e0b" fill="none" strokeWidth={2} strokeDasharray="4 2" name="Net Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expense Breakdown Pie */}
        {expenseBreakdown.length > 0 && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/70">Expense Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <RPieChart>
                  <Pie data={expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {expenseBreakdown.map((_, i) => <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                </RPieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Source Breakdown */}
        {sourceBreakdown.length > 0 && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/70">Revenue by Platform</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sourceBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[4,4,0,0]} />
                  <Bar dataKey="fees" fill="#ef4444" name="Fees" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* No data state */}
      {!pl || pl.grossRevenue === 0 ? (
        <Card className="bg-white/5 border-white/10 border-dashed">
          <CardContent className="p-8 text-center">
            <BarChart3 className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/50 text-sm">No transactions yet for {year}.</p>
            <p className="text-white/30 text-xs mt-1">Connect your accounts and sync to see your financial overview.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ─── P&L Statement ────────────────────────────────────────────────────────────
function PLTab({ year }: { year: number }) {
  const [startDate, setStartDate] = useState(`${year}-01-01`);
  const [endDate, setEndDate] = useState(`${year}-12-31`);
  const { data: pl, isLoading, refetch } = trpc.accounting.getPL.useQuery({ startDate, endDate });

  const sections = pl ? [
    {
      title: "Revenue", color: "text-emerald-400",
      rows: [
        { label: "Product Sales", value: pl.productSales, scheduleC: "Line 1" },
        { label: "Shipping Collected", value: pl.shippingCollected, scheduleC: "Line 1" },
        { label: "Other Income", value: pl.otherIncome, scheduleC: "Line 6" },
      ],
      total: { label: "Gross Revenue", value: pl.grossRevenue },
    },
    {
      title: "Cost of Goods Sold (COGS)", color: "text-amber-400",
      rows: [
        { label: "Product Cost", value: pl.productCost, scheduleC: "Line 4" },
        { label: "Shipping Cost", value: pl.shippingCost, scheduleC: "Line 4" },
        { label: "Supplier Fees", value: pl.supplierFees, scheduleC: "Line 4" },
      ],
      total: { label: "Total COGS", value: pl.totalCOGS },
    },
    {
      title: "Operating Expenses", color: "text-red-400",
      rows: [
        { label: "Platform Fees (Shopify, eBay, Etsy)", value: pl.platformFees, scheduleC: "Line 10" },
        { label: "Payment Processing (PayPal, Stripe)", value: pl.paymentProcessing, scheduleC: "Line 10" },
        { label: "Advertising (Facebook, Google, TikTok)", value: pl.advertising, scheduleC: "Line 8" },
        { label: "Software Subscriptions", value: pl.softwareSubscriptions, scheduleC: "Line 27a" },
        { label: "Office Supplies", value: pl.officeSupplies, scheduleC: "Line 18" },
        { label: "Professional Services", value: pl.professionalServices, scheduleC: "Line 17" },
        { label: "Bank Charges", value: pl.bankCharges, scheduleC: "Line 27a" },
        { label: "Returns & Refunds", value: pl.returnsRefunds, scheduleC: "Line 2" },
        { label: "Packaging", value: pl.packaging, scheduleC: "Line 22" },
        { label: "Storage & Fulfillment", value: pl.storageFulfillment, scheduleC: "Line 27a" },
        { label: "Taxes & Licenses", value: pl.taxesLicenses, scheduleC: "Line 23" },
        { label: "Insurance", value: pl.insurance, scheduleC: "Line 15" },
        { label: "Education & Training", value: pl.educationTraining, scheduleC: "Line 27a" },
        { label: "Travel", value: pl.travel, scheduleC: "Line 24a" },
        { label: "Utilities", value: pl.utilities, scheduleC: "Line 25" },
        { label: "Other Expense", value: pl.otherExpense, scheduleC: "Line 27a" },
      ].filter(r => r.value > 0),
      total: { label: "Total Operating Expenses", value: pl.totalOperatingExpenses },
    },
  ] : [];

  return (
    <div className="space-y-4">
      {/* Date range picker */}
      <div className="flex gap-3 items-end">
        <div>
          <Label className="text-xs text-white/50">From</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-white/5 border-white/10 text-white w-40" />
        </div>
        <div>
          <Label className="text-xs text-white/50">To</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-white/5 border-white/10 text-white w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="border-white/20 text-white/70 hover:bg-white/10">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
      ) : pl ? (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base">Profit & Loss Statement</CardTitle>
            <p className="text-xs text-white/40">{pl.period}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {sections.map(section => (
              <div key={section.title}>
                <h3 className={`text-sm font-semibold ${section.color} mb-2`}>{section.title}</h3>
                <div className="space-y-1">
                  {section.rows.map(row => (
                    <div key={row.label} className="flex justify-between items-center py-1 border-b border-white/5">
                      <div>
                        <span className="text-sm text-white/70">{row.label}</span>
                        {row.scheduleC && <span className="ml-2 text-xs text-white/30">({row.scheduleC})</span>}
                      </div>
                      <span className="text-sm text-white font-mono">{fmt(row.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-2 font-semibold">
                    <span className={`text-sm ${section.color}`}>{section.total.label}</span>
                    <span className={`text-sm font-mono ${section.color}`}>{fmt(section.total.value)}</span>
                  </div>
                </div>
              </div>
            ))}

            <Separator className="bg-white/10" />

            {/* Gross Profit */}
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-white">Gross Profit</span>
              <span className={`text-sm font-mono font-bold ${pl.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(pl.grossProfit)}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-white/40">
              <span>Gross Margin</span>
              <span>{pl.grossMarginPct.toFixed(1)}%</span>
            </div>

            <Separator className="bg-white/10" />

            {/* Net Profit */}
            <div className="flex justify-between items-center py-2 bg-white/5 rounded-lg px-3">
              <span className="text-base font-bold text-white">Net Profit / Loss</span>
              <span className={`text-xl font-bold font-mono ${pl.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(pl.netProfit)}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-white/40 px-3">
              <span>Net Margin</span>
              <span>{pl.netMarginPct.toFixed(1)}%</span>
            </div>

            {/* Platform breakdown */}
            <div className="mt-4 p-3 bg-white/5 rounded-lg space-y-2">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Platform Breakdown</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between"><span className="text-white/50">Shopify Revenue</span><span className="text-white font-mono">{fmt(pl.shopifyRevenue)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Shopify Fees</span><span className="text-red-400 font-mono">-{fmt(pl.shopifyFees)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">eBay Revenue</span><span className="text-white font-mono">{fmt(pl.ebayRevenue)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">eBay Fees</span><span className="text-red-400 font-mono">-{fmt(pl.ebayFees)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">PayPal Fees</span><span className="text-red-400 font-mono">-{fmt(pl.paypalFees)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Total Ad Spend</span><span className="text-red-400 font-mono">-{fmt(pl.adSpend)}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ─── Transactions Ledger ──────────────────────────────────────────────────────
function TransactionsTab({ accounts }: { accounts: any[] }) {
  const [selectedAccount, setSelectedAccount] = useState<number | undefined>();
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    accountId: accounts[0]?.id ?? 0,
    date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    type: "expense" as const,
    category: "other_expense" as const,
    source: "manual" as const,
    taxDeductible: false,
    notes: "",
    ebayFeeType: undefined as "final_value_fee"|"insertion_fee"|"promoted_listing_fee"|"shipping_label_fee"|"international_fee"|"dispute_fee"|"store_subscription"|"other_ebay_fee"|undefined,
  });

  const { data: txns, isLoading, refetch } = trpc.accounting.getTransactions.useQuery({
    accountId: selectedAccount,
    type: typeFilter as any || undefined,
    limit: 200,
  });

  const addMutation = trpc.accounting.addTransaction.useMutation({
    onSuccess: () => { toast.success("Transaction added"); setAddOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.accounting.deleteTransaction.useMutation({
    onSuccess: () => { toast.success("Deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const reconcileMutation = trpc.accounting.updateTransaction.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  const CATEGORIES = [
    "product_sales","shipping_collected","other_income",
    "product_cost","shipping_cost","supplier_fees","platform_fees",
    "payment_processing","advertising","software_subscriptions",
    "office_supplies","professional_services","bank_charges",
    "returns_refunds","packaging","storage_fulfillment",
    "taxes_licenses","insurance","education_training","travel","utilities","other_expense",
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <Select value={selectedAccount ? String(selectedAccount) : "all"} onValueChange={v => setSelectedAccount(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="bg-white/5 border-white/10 text-white w-44">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{PROVIDER_ICONS[a.provider]} {a.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="bg-white/5 border-white/10 text-white w-36">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="fee">Fee</SelectItem>
            <SelectItem value="refund">Refund</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => refetch()} variant="outline" size="sm" className="border-white/20 text-white/70 hover:bg-white/10">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black ml-auto">
              <Plus className="w-3 h-3 mr-1" /> Add Transaction
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0f0f1a] border-white/10 text-white max-w-lg">
            <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-white/50">Account</Label>
                <Select value={String(form.accountId)} onValueChange={v => setForm(f => ({ ...f, accountId: Number(v) }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{PROVIDER_ICONS[a.provider]} {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-white/50">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="bg-white/5 border-white/10 text-white" />
              </div>
              <div>
                <Label className="text-xs text-white/50">Amount ($)</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="0.00" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-white/50">Description</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-white/5 border-white/10 text-white" />
              </div>
              <div>
                <Label className="text-xs text-white/50">Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["income","expense","refund","fee","transfer","adjustment"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-white/50">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as any }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-white/50">Source</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v as any }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["shopify","paypal","ebay","stripe","bank","credit_card","facebook_ads","google_ads","tiktok_ads","dsers","cj_dropshipping","manual","other"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <Switch checked={form.taxDeductible} onCheckedChange={v => setForm(f => ({ ...f, taxDeductible: v }))} />
                <Label className="text-xs text-white/50">Tax Deductible</Label>
              </div>
              {(form.source as string) === "ebay" && (
                <>
                  <div className="col-span-2">
                    <Label className="text-xs text-white/50">eBay Fee Type</Label>
                    <Select value={form.ebayFeeType ?? ""} onValueChange={v => setForm(f => ({ ...f, ebayFeeType: (v || undefined) as typeof f.ebayFeeType }))}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Select eBay fee type" /></SelectTrigger>
                      <SelectContent>
                        {["final_value_fee","insertion_fee","promoted_listing_fee","shipping_label_fee","international_fee","dispute_fee","store_subscription","other_ebay_fee"].map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.ebayFeeType === "final_value_fee" && form.amount && parseFloat(form.amount) > 0 && (
                    <div className="col-span-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <p className="text-xs font-medium text-amber-400 mb-1">eBay FVF Auto-Calculator</p>
                      <p className="text-xs text-white/50">Sale amount: <span className="text-white">${parseFloat(form.amount).toFixed(2)}</span></p>
                      <p className="text-xs text-white/50">FVF (13.25% + $0.30): <span className="text-red-400 font-mono">-${(parseFloat(form.amount) * 0.1325 + 0.30).toFixed(2)}</span></p>
                      <p className="text-xs text-white/50 mt-1">Net after fee: <span className="text-emerald-400 font-mono">${(parseFloat(form.amount) - parseFloat(form.amount) * 0.1325 - 0.30).toFixed(2)}</span></p>
                      <Button size="sm" variant="outline" className="mt-2 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10" onClick={() => setForm(f => ({ ...f, amount: String((parseFloat(f.amount) * 0.1325 + 0.30).toFixed(2)), description: f.description || `eBay FVF on sale`, type: "fee" as any, category: "marketplace_fees" as any, taxDeductible: true }))}>
                        Auto-fill fee amount
                      </Button>
                    </div>
                  )}
                </>
              )}
              <div className="col-span-2">
                <Label className="text-xs text-white/50">Notes</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-black mt-2"
              disabled={addMutation.isPending || !form.description || !form.amount}
              onClick={() => addMutation.mutate({ ...form, amount: parseFloat(form.amount) })}
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Add Transaction
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
      ) : (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left p-3 text-white/40 font-medium text-xs">Date</th>
                    <th className="text-left p-3 text-white/40 font-medium text-xs">Description</th>
                    <th className="text-left p-3 text-white/40 font-medium text-xs">Source</th>
                    <th className="text-left p-3 text-white/40 font-medium text-xs">Category</th>
                    <th className="text-right p-3 text-white/40 font-medium text-xs">Amount</th>
                    <th className="text-center p-3 text-white/40 font-medium text-xs">Tax</th>
                    <th className="text-center p-3 text-white/40 font-medium text-xs">Reconciled</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {txns && txns.length > 0 ? txns.map(t => (
                    <tr key={t.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${(t as any).isDuplicate ? "bg-amber-500/5" : ""}`}>
                      <td className="p-3 text-white/50 text-xs">{new Date(t.date).toLocaleDateString()}</td>
                      <td className="p-3 text-white/80 max-w-[200px] truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{t.description}</span>
                          {(t as any).isDuplicate && (
                            <span title={(t as any).duplicateReason ?? "Possible cross-platform duplicate"} className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-help">⚠ Dup</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                          {PROVIDER_ICONS[t.source]} {t.source}
                        </span>
                      </td>
                      <td className="p-3 text-white/50 text-xs">{t.category?.replace(/_/g, " ")}</td>
                      <td className={`p-3 text-right font-mono font-semibold ${t.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fmt(t.amount)}
                      </td>
                      <td className="p-3 text-center">
                        {t.taxDeductible ? <CheckCircle2 className="w-3 h-3 text-emerald-400 mx-auto" /> : <span className="text-white/20 text-xs">—</span>}
                      </td>
                      <td className="p-3 text-center">
                        <Switch
                          checked={t.isReconciled ?? false}
                          onCheckedChange={v => reconcileMutation.mutate({ id: t.id, isReconciled: v })}
                          className="scale-75"
                        />
                      </td>
                      <td className="p-3">
                        <Button variant="ghost" size="icon" className="w-6 h-6 text-white/30 hover:text-red-400" onClick={() => deleteMutation.mutate({ id: t.id })}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-white/30 text-sm">
                        No transactions found. Sync an account or add manually.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tax Summary ──────────────────────────────────────────────────────────────
function TaxTab({ year }: { year: number }) {
  const { data: tax, isLoading } = trpc.accounting.getTaxSummary.useQuery({ taxYear: year });
  const { data: settings } = trpc.accounting.getTaxSettings.useQuery({ taxYear: year });
  const saveMutation = trpc.accounting.saveTaxSettings.useMutation({
    onSuccess: () => toast.success("Tax settings saved"),
    onError: (e) => toast.error(e.message),
  });
  const [settingsForm, setSettingsForm] = useState({
    businessName: "", ein: "", filingStatus: "sole_proprietor" as const,
    stateCode: "", selfEmploymentTaxRate: 15.3, incomeTaxBracketRate: 22,
    stateTaxRate: 0, homeOfficeDeduction: false, homeOfficePercent: 0,
    vehicleDeduction: false, vehicleMiles: 0,
  });
  const [showSettings, setShowSettings] = useState(false);

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">Tax Year {year} Summary</h3>
        <Button variant="outline" size="sm" className="border-white/20 text-white/70 hover:bg-white/10" onClick={() => setShowSettings(!showSettings)}>
          <Edit3 className="w-3 h-3 mr-1" /> Tax Settings
        </Button>
      </div>

      {showSettings && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader><CardTitle className="text-sm text-white/70">Tax Configuration</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-white/50">Business Name</Label>
              <Input value={settingsForm.businessName} onChange={e => setSettingsForm(f => ({ ...f, businessName: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="Athena's Decor" />
            </div>
            <div>
              <Label className="text-xs text-white/50">EIN (optional)</Label>
              <Input value={settingsForm.ein} onChange={e => setSettingsForm(f => ({ ...f, ein: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="XX-XXXXXXX" />
            </div>
            <div>
              <Label className="text-xs text-white/50">Filing Status</Label>
              <Select value={settingsForm.filingStatus} onValueChange={v => setSettingsForm(f => ({ ...f, filingStatus: v as any }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sole_proprietor">Sole Proprietor</SelectItem>
                  <SelectItem value="llc_single">LLC (Single Member)</SelectItem>
                  <SelectItem value="llc_partnership">LLC (Partnership)</SelectItem>
                  <SelectItem value="s_corp">S-Corp</SelectItem>
                  <SelectItem value="c_corp">C-Corp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-white/50">State Code</Label>
              <Input value={settingsForm.stateCode} onChange={e => setSettingsForm(f => ({ ...f, stateCode: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="CA" maxLength={2} />
            </div>
            <div>
              <Label className="text-xs text-white/50">SE Tax Rate (%)</Label>
              <Input type="number" value={settingsForm.selfEmploymentTaxRate} onChange={e => setSettingsForm(f => ({ ...f, selfEmploymentTaxRate: parseFloat(e.target.value) }))} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-xs text-white/50">Federal Income Tax Bracket (%)</Label>
              <Input type="number" value={settingsForm.incomeTaxBracketRate} onChange={e => setSettingsForm(f => ({ ...f, incomeTaxBracketRate: parseFloat(e.target.value) }))} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-xs text-white/50">State Tax Rate (%)</Label>
              <Input type="number" value={settingsForm.stateTaxRate} onChange={e => setSettingsForm(f => ({ ...f, stateTaxRate: parseFloat(e.target.value) }))} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Switch checked={settingsForm.homeOfficeDeduction} onCheckedChange={v => setSettingsForm(f => ({ ...f, homeOfficeDeduction: v }))} />
              <Label className="text-xs text-white/50">Home Office Deduction</Label>
            </div>
            <div className="col-span-2">
              <Button className="bg-amber-500 hover:bg-amber-600 text-black" onClick={() => saveMutation.mutate({ taxYear: year, ...settingsForm })}>
                Save Tax Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tax ? (
        <div className="space-y-4">
          {/* Tax estimate cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Gross Revenue", value: fmt(tax.grossRevenue), color: "text-emerald-400" },
              { label: "Net Profit", value: fmt(tax.netProfit), color: tax.netProfit >= 0 ? "text-emerald-400" : "text-red-400" },
              { label: "Self-Employment Tax", value: fmt(tax.selfEmploymentTax), color: "text-amber-400" },
              { label: "Estimated Total Tax", value: fmt(tax.estimatedTotalTax), color: "text-red-400" },
            ].map(k => (
              <Card key={k.label} className="bg-white/5 border-white/10">
                <CardContent className="p-3">
                  <div className="text-xs text-white/40 mb-1">{k.label}</div>
                  <div className={`text-lg font-bold font-mono ${k.color}`}>{k.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tax breakdown */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader><CardTitle className="text-sm text-white/70">Tax Calculation Breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { label: "Gross Revenue", value: fmt(tax.grossRevenue), indent: false },
                { label: "Total Deductible Expenses", value: `- ${fmt(tax.totalDeductibleExpenses)}`, indent: false },
                { label: "Net Profit (Schedule C)", value: fmt(tax.netProfit), indent: false, bold: true },
                { label: "SE Tax (15.3% × 92.35%)", value: `- ${fmt(tax.selfEmploymentTax)}`, indent: true },
                { label: "SE Deduction (50% of SE Tax)", value: `- ${fmt(tax.seDeduction)}`, indent: true },
                { label: "Adjusted Net Income", value: fmt(tax.adjustedNetIncome), indent: false, bold: true },
                { label: "Federal Income Tax", value: `- ${fmt(tax.estimatedFederalTax)}`, indent: true },
                { label: "State Income Tax", value: `- ${fmt(tax.estimatedStateTax)}`, indent: true },
                { label: "Estimated Total Tax Liability", value: fmt(tax.estimatedTotalTax), indent: false, bold: true, highlight: true },
                { label: "Effective Tax Rate", value: `${tax.effectiveTaxRate.toFixed(1)}%`, indent: false },
              ].map((row, i) => (
                <div key={i} className={`flex justify-between py-1 border-b border-white/5 ${row.indent ? "pl-4" : ""} ${row.highlight ? "bg-amber-500/10 rounded px-2" : ""}`}>
                  <span className={row.bold ? "font-semibold text-white" : "text-white/60"}>{row.label}</span>
                  <span className={`font-mono ${row.bold ? "font-bold text-white" : "text-white/80"}`}>{row.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quarterly estimates */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader><CardTitle className="text-sm text-white/70">Quarterly Estimated Tax Payments (IRS Form 1040-ES)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {tax.quarterlyEstimates.map(q => (
                  <div key={q.quarter} className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-xs text-white/40 mb-1">{q.quarter} Due</div>
                    <div className="text-xs text-amber-400 mb-2">{q.dueDate}</div>
                    <div className="text-lg font-bold text-white font-mono">{fmt(q.amount)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Schedule C deductions */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader><CardTitle className="text-sm text-white/70">Schedule C Deductions by Category</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {tax.deductibleByCategory.map(d => (
                  <div key={d.category} className="flex justify-between items-center py-1 border-b border-white/5">
                    <div>
                      <span className="text-sm text-white/70">{d.category}</span>
                      <span className="ml-2 text-xs text-white/30">({d.scheduleC})</span>
                    </div>
                    <span className="text-sm font-mono text-emerald-400">{fmt(d.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 font-semibold">
                  <span className="text-sm text-white">Total Deductions</span>
                  <span className="text-sm font-mono text-emerald-400">{fmt(tax.totalDeductibleExpenses)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
            <AlertCircle className="w-3 h-3 inline mr-1" />
            <strong>Disclaimer:</strong> These estimates are for planning purposes only. Consult a licensed CPA or tax professional for accurate tax advice and filing. Tax laws change frequently.
          </div>
        </div>
      ) : (
        <Card className="bg-white/5 border-white/10 border-dashed">
          <CardContent className="p-8 text-center">
            <FileText className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/50 text-sm">No transactions for {year} yet.</p>
            <p className="text-white/30 text-xs mt-1">Add transactions or sync your accounts to generate a tax summary.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── eBay Fee Calculator ──────────────────────────────────────────────────────
function EbayFeeTab() {
  const [salePrice, setSalePrice] = useState("50");
  const [shippingCharged, setShippingCharged] = useState("0");
  const [isPromoted, setIsPromoted] = useState(false);
  const [promotedRate, setPromotedRate] = useState("3");
  const [result, setResult] = useState<any>(null);

  const calcMutation = trpc.accounting.calcEbayFees.useMutation({
    onSuccess: setResult,
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-lg">
      <Card className="bg-white/5 border-white/10">
        <CardHeader><CardTitle className="text-sm text-white/70">eBay Fee Calculator</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-white/50">Sale Price ($)</Label>
            <Input type="number" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)} className="bg-white/5 border-white/10 text-white" />
          </div>
          <div>
            <Label className="text-xs text-white/50">Shipping Charged to Buyer ($)</Label>
            <Input type="number" step="0.01" value={shippingCharged} onChange={e => setShippingCharged(e.target.value)} className="bg-white/5 border-white/10 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isPromoted} onCheckedChange={setIsPromoted} />
            <Label className="text-xs text-white/50">Promoted Listing</Label>
          </div>
          {isPromoted && (
            <div>
              <Label className="text-xs text-white/50">Promoted Rate (%)</Label>
              <Input type="number" step="0.1" value={promotedRate} onChange={e => setPromotedRate(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
          )}
          <Button
            className="w-full bg-amber-500 hover:bg-amber-600 text-black"
            disabled={calcMutation.isPending}
            onClick={() => calcMutation.mutate({ salePrice: parseFloat(salePrice), shippingCharged: parseFloat(shippingCharged), isPromoted, promotedRate: parseFloat(promotedRate) })}
          >
            {calcMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calculator className="w-4 h-4 mr-2" />}
            Calculate Fees
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader><CardTitle className="text-sm text-white/70">Fee Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { label: "Sale Price", value: fmt(result.salePrice) },
              { label: "Shipping Charged", value: fmt(result.shippingCharged) },
              { label: "Final Value Fee (13.25% + $0.30)", value: `- ${fmt(result.finalValueFee)}`, color: "text-red-400" },
              { label: "Promoted Listing Fee", value: `- ${fmt(result.promotedListingFee)}`, color: "text-red-400" },
              { label: "Total eBay Fees", value: `- ${fmt(result.totalFees)}`, color: "text-red-400", bold: true },
              { label: "Fee Percentage", value: `${result.feePercent}%`, color: "text-amber-400" },
              { label: "Net Payout to You", value: fmt(result.netPayout), color: "text-emerald-400", bold: true },
            ].map((row, i) => (
              <div key={i} className={`flex justify-between py-1 border-b border-white/5`}>
                <span className={row.bold ? "font-semibold text-white" : "text-white/60"}>{row.label}</span>
                <span className={`font-mono ${row.color ?? "text-white"} ${row.bold ? "font-bold" : ""}`}>{row.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Account Management ───────────────────────────────────────────────────────
function AccountsTab() {
  const { data: accounts, isLoading, refetch } = trpc.accounting.getAccounts.useQuery();
  const [addOpen, setAddOpen] = useState(false);
  type AccountProvider = "shopify"|"paypal"|"ebay"|"stripe"|"bank"|"credit_card"|"amazon"|"etsy"|"dsers"|"cj_dropshipping"|"facebook_ads"|"google_ads"|"tiktok_ads"|"other";
  type AccountType = "revenue"|"expense"|"bank"|"credit_card"|"marketplace"|"ad_platform"|"payment_processor";
  const [form, setForm] = useState<{ name: string; provider: AccountProvider; accountType: AccountType; currency: string; notes: string; credentials: Record<string, string> }>({ name: "", provider: "shopify", accountType: "revenue", currency: "USD", notes: "", credentials: {} });
  const [credsAccountId, setCredsAccountId] = useState<number | null>(null);
  const [credsForm, setCredsForm] = useState<Record<string, string>>({});

  const addMutation = trpc.accounting.addAccount.useMutation({
    onSuccess: () => { toast.success("Account added"); setAddOpen(false); setForm(f => ({ ...f, credentials: {} })); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.accounting.deleteAccount.useMutation({
    onSuccess: () => { toast.success("Account removed"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const syncMutation = trpc.accounting.syncShopify.useMutation({
    onSuccess: (r) => { toast.success(`Synced ${r.imported} transactions from ${r.orders} orders`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const syncPayPalMutation = trpc.accounting.syncPayPal.useMutation({
    onSuccess: (r) => { toast.success(`Synced ${r.imported} PayPal transactions`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const syncEbayMutation = trpc.accounting.syncEbay.useMutation({
    onSuccess: (r) => { toast.success(`Synced ${r.imported} eBay transactions`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.accounting.updateAccount.useMutation({
    onSuccess: () => { toast.success("Credentials saved"); setCredsAccountId(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Field sets for providers whose sync actually uses stored credentials.
  const CREDENTIAL_FIELDS: Partial<Record<AccountProvider, Array<{ key: string; label: string; placeholder?: string }>>> = {
    paypal: [
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client Secret" },
    ],
    ebay: [
      { key: "clientId", label: "Client ID (App ID)" },
      { key: "clientSecret", label: "Client Secret (Cert ID)" },
      { key: "refreshToken", label: "Refresh Token", placeholder: "Obtained once via eBay's OAuth consent flow" },
    ],
  };

  const PROVIDER_SUGGESTIONS: Array<{ provider: AccountProvider; accountType: AccountType; name: string; desc: string }> = [
    { provider: "shopify", accountType: "revenue", name: "Shopify Store", desc: "Sales revenue, refunds, payment fees" },
    { provider: "paypal", accountType: "payment_processor", name: "PayPal Business", desc: "PayPal transactions and fees" },
    { provider: "ebay", accountType: "marketplace", name: "eBay Seller Account", desc: "eBay sales, FVF, insertion fees, promoted listing fees" },
    { provider: "facebook_ads", accountType: "ad_platform", name: "Facebook / Meta Ads", desc: "Ad spend tracking" },
    { provider: "google_ads", accountType: "ad_platform", name: "Google Ads", desc: "Google ad spend" },
    { provider: "tiktok_ads", accountType: "ad_platform", name: "TikTok Ads", desc: "TikTok ad spend" },
    { provider: "dsers", accountType: "expense", name: "DSers", desc: "Supplier costs and fees" },
    { provider: "cj_dropshipping", accountType: "expense", name: "CJ Dropshipping", desc: "Supplier costs and fees" },
    { provider: "bank", accountType: "bank", name: "Business Bank Account", desc: "Bank transactions" },
    { provider: "credit_card", accountType: "credit_card", name: "Business Credit Card", desc: "Credit card expenses" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">Connect your financial accounts to sync transactions automatically.</p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black">
              <Plus className="w-3 h-3 mr-1" /> Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0f0f1a] border-white/10 text-white max-w-md">
            <DialogHeader><DialogTitle>Add Financial Account</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-white/50">Account Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="e.g. Shopify Store" />
              </div>
              <div>
                <Label className="text-xs text-white/50">Provider</Label>
                <Select value={form.provider} onValueChange={v => setForm(f => ({ ...f, provider: v as any }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["shopify","paypal","ebay","stripe","bank","credit_card","amazon","etsy","dsers","cj_dropshipping","facebook_ads","google_ads","tiktok_ads","other"].map(p => (
                      <SelectItem key={p} value={p}>{PROVIDER_ICONS[p]} {p.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-white/50">Account Type</Label>
                <Select value={form.accountType} onValueChange={v => setForm(f => ({ ...f, accountType: v as any }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["revenue","expense","bank","credit_card","marketplace","ad_platform","payment_processor"].map(t => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {CREDENTIAL_FIELDS[form.provider] && (
                <div className="space-y-2 p-3 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-xs text-white/50">
                    {form.provider === "ebay"
                      ? "Create a keyset at developer.ebay.com, then run eBay's OAuth consent flow once to get a refresh token."
                      : "Create a REST API app at developer.paypal.com for your own account."}
                  </p>
                  {CREDENTIAL_FIELDS[form.provider]!.map(f => (
                    <div key={f.key}>
                      <Label className="text-xs text-white/50">{f.label}</Label>
                      <Input
                        type="password"
                        value={form.credentials[f.key] ?? ""}
                        onChange={e => setForm(fm => ({ ...fm, credentials: { ...fm.credentials, [f.key]: e.target.value } }))}
                        className="bg-white/5 border-white/10 text-white"
                        placeholder={f.placeholder}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div>
                <Label className="text-xs text-white/50">Notes</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="Optional notes" />
              </div>
              <Button
                className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                disabled={addMutation.isPending || !form.name}
                onClick={() => addMutation.mutate({ ...form, credentials: Object.keys(form.credentials).length > 0 ? form.credentials : undefined })}
              >
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Add Account
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick-add suggestions */}
      {(!accounts || accounts.length === 0) && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader><CardTitle className="text-sm text-white/70">Suggested Accounts to Add</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {PROVIDER_SUGGESTIONS.map(s => (
              <button
                key={s.provider}
                className="flex items-start gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left border border-white/5 hover:border-white/20"
                onClick={() => { setForm({ name: s.name, provider: s.provider, accountType: s.accountType, currency: "USD", notes: "", credentials: {} }); setAddOpen(true); }}
              >
                <span className="text-2xl">{PROVIDER_ICONS[s.provider]}</span>
                <div>
                  <div className="text-sm font-medium text-white">{s.name}</div>
                  <div className="text-xs text-white/40 mt-0.5">{s.desc}</div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Connected accounts */}
      {isLoading ? (
        <div className="flex items-center justify-center h-20"><Loader2 className="w-5 h-5 animate-spin text-amber-400" /></div>
      ) : accounts && accounts.length > 0 ? (
        <div className="space-y-2">
          {accounts.map(a => (
            <Card key={a.id} className="bg-white/5 border-white/10">
              <CardContent className="p-4 flex items-center gap-4">
                <span className="text-2xl">{PROVIDER_ICONS[a.provider]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{a.name}</span>
                    <Badge variant="outline" className={`text-xs border-0 ${a.isConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/40"}`}>
                      {a.isConnected ? "Connected" : "Not Connected"}
                    </Badge>
                    <Badge variant="outline" className="text-xs border-white/10 text-white/40 bg-white/5">
                      {a.accountType.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {a.lastSyncedAt && (
                    <p className="text-xs text-white/30 mt-0.5">Last synced: {new Date(a.lastSyncedAt).toLocaleString()}</p>
                  )}
                  {a.notes && <p className="text-xs text-white/30 mt-0.5">{a.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {a.provider === "shopify" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-white/70 hover:bg-white/10 text-xs"
                      disabled={syncMutation.isPending}
                      onClick={() => syncMutation.mutate({ accountId: a.id })}
                    >
                      {syncMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                      Sync Orders
                    </Button>
                  )}
                  {(a.provider === "paypal" || a.provider === "ebay") && CREDENTIAL_FIELDS[a.provider] && (
                    <>
                      {a.hasCredentials ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/20 text-white/70 hover:bg-white/10 text-xs"
                          disabled={a.provider === "paypal" ? syncPayPalMutation.isPending : syncEbayMutation.isPending}
                          onClick={() => a.provider === "paypal" ? syncPayPalMutation.mutate({ accountId: a.id }) : syncEbayMutation.mutate({ accountId: a.id })}
                        >
                          {(a.provider === "paypal" ? syncPayPalMutation.isPending : syncEbayMutation.isPending)
                            ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                          Sync Transactions
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs"
                          onClick={() => { setCredsAccountId(a.id); setCredsForm({}); }}
                        >
                          Add Credentials
                        </Button>
                      )}
                    </>
                  )}
                  <Switch
                    checked={a.isActive}
                    onCheckedChange={v => updateMutation.mutate({ id: a.id, isActive: v })}
                  />
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-white/30 hover:text-red-400" onClick={() => deleteMutation.mutate({ id: a.id })}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Add/update credentials for an existing PayPal or eBay account */}
      <Dialog open={credsAccountId !== null} onOpenChange={open => !open && setCredsAccountId(null)}>
        <DialogContent className="bg-[#0f0f1a] border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle>Connect Account</DialogTitle></DialogHeader>
          {(() => {
            const account = accounts?.find(a => a.id === credsAccountId);
            if (!account) return null;
            const fields = CREDENTIAL_FIELDS[account.provider as AccountProvider] ?? [];
            return (
              <div className="space-y-3">
                <p className="text-xs text-white/50">
                  {account.provider === "ebay"
                    ? "Create a keyset at developer.ebay.com, then run eBay's OAuth consent flow once to get a refresh token."
                    : "Create a REST API app at developer.paypal.com for your own account."}
                </p>
                {fields.map(f => (
                  <div key={f.key}>
                    <Label className="text-xs text-white/50">{f.label}</Label>
                    <Input
                      type="password"
                      value={credsForm[f.key] ?? ""}
                      onChange={e => setCredsForm(cf => ({ ...cf, [f.key]: e.target.value }))}
                      className="bg-white/5 border-white/10 text-white"
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                  disabled={updateMutation.isPending || fields.some(f => !credsForm[f.key])}
                  onClick={() => updateMutation.mutate({ id: account.id, credentials: credsForm })}
                >
                  {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Credentials
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Instructions */}
      <Card className="bg-white/5 border-amber-500/20 border">
        <CardContent className="p-4 space-y-2">
          <h4 className="text-sm font-semibold text-amber-400">How to Connect Accounts</h4>
          <div className="space-y-1 text-xs text-white/50">
            <p><strong className="text-white/70">Shopify:</strong> Add your Shopify account, then click "Sync Orders" — it pulls all paid orders directly via your connected Shopify API key.</p>
            <p><strong className="text-white/70">eBay:</strong> Add your eBay account and manually enter transactions, or use the eBay Fee Calculator to estimate fees per sale.</p>
            <p><strong className="text-white/70">PayPal:</strong> Add your PayPal account and manually log PayPal transactions, or export from PayPal and import via manual entry.</p>
            <p><strong className="text-white/70">Ad Platforms:</strong> Add Facebook, Google, or TikTok Ads accounts and manually log your monthly ad spend as expense transactions.</p>
            <p><strong className="text-white/70">Bank / Credit Card:</strong> Add your bank or card account and manually enter business expenses for a complete picture.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Cash Flow Tab ──────────────────────────────────────────────────────────────
function CashFlowTab({ year }: { year: number }) {
  const { data: cashFlow, isLoading } = trpc.accounting.getCashFlow.useQuery({ year });

  if (isLoading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
    </div>
  );

  if (!cashFlow || cashFlow.length === 0) return (
    <Card className="bg-white/5 border-white/10 border-dashed">
      <CardContent className="p-8 text-center">
        <Droplets className="w-10 h-10 text-white/20 mx-auto mb-3" />
        <p className="text-white/50 text-sm">No cash flow data for {year} yet.</p>
        <p className="text-white/30 text-xs mt-1">Sync your accounts to generate monthly cash flow.</p>
      </CardContent>
    </Card>
  );

  const totalRevenue = cashFlow.reduce((s, m) => s + m.revenue, 0);
  const totalExpenses = cashFlow.reduce((s, m) => s + m.expenses, 0);
  const totalNet = cashFlow.reduce((s, m) => s + m.netProfit, 0);
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Revenue", value: fmt(totalRevenue), color: "text-emerald-400" },
          { label: "Total Expenses", value: fmt(totalExpenses), color: "text-red-400" },
          { label: "Net Profit", value: fmt(totalNet), color: totalNet >= 0 ? "text-emerald-400" : "text-red-400" },
        ].map(k => (
          <Card key={k.label} className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="text-xs text-white/40 mb-1">{k.label}</div>
              <div className={`text-xl font-bold font-mono ${k.color}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly Bar Chart */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/70">Monthly Revenue vs Expenses — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cashFlow} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                formatter={(v: number, name: string) => [new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v), name]}
              />
              <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[4,4,0,0]} />
              <Bar dataKey="expenses" fill="#ef4444" name="Expenses" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Net Profit Line Chart */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/70">Monthly Net Profit — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={cashFlow}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                formatter={(v: number) => [new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v), "Net Profit"]}
              />
              <Line type="monotone" dataKey="netProfit" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 4 }} activeDot={{ r: 6 }} name="Net Profit" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly Breakdown Table */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/70">Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-3 text-white/40 font-medium text-xs">Month</th>
                <th className="text-right p-3 text-white/40 font-medium text-xs">Revenue</th>
                <th className="text-right p-3 text-white/40 font-medium text-xs">Expenses</th>
                <th className="text-right p-3 text-white/40 font-medium text-xs">Net Profit</th>
                <th className="text-right p-3 text-white/40 font-medium text-xs">Margin</th>
              </tr>
            </thead>
            <tbody>
              {cashFlow.map((m, i) => {
                const margin = m.revenue > 0 ? ((m.netProfit / m.revenue) * 100) : 0;
                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-3 text-white/70 font-medium">{m.month}</td>
                    <td className="p-3 text-right font-mono text-emerald-400">{fmt(m.revenue)}</td>
                    <td className="p-3 text-right font-mono text-red-400">{fmt(m.expenses)}</td>
                    <td className={`p-3 text-right font-mono font-semibold ${m.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(m.netProfit)}</td>
                    <td className={`p-3 text-right text-xs ${margin >= 0 ? "text-white/50" : "text-red-400"}`}>{margin.toFixed(1)}%</td>
                  </tr>
                );
              })}
              <tr className="border-t border-white/20 bg-white/5 font-semibold">
                <td className="p-3 text-white">Total</td>
                <td className="p-3 text-right font-mono text-emerald-400">{fmt(totalRevenue)}</td>
                <td className="p-3 text-right font-mono text-red-400">{fmt(totalExpenses)}</td>
                <td className={`p-3 text-right font-mono ${totalNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(totalNet)}</td>
                <td className="p-3 text-right text-xs text-white/50">{totalRevenue > 0 ? ((totalNet / totalRevenue) * 100).toFixed(1) : "0.0"}%</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Accounting Page ─────────────────────────────────────────────────────
export default function AccountingPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { data: accounts } = trpc.accounting.getAccounts.useQuery();

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Accounting</h1>
            <p className="text-white/40 text-sm mt-1">Revenue, expenses, P&L, and tax summaries — all in one place</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white w-28">
                <Calendar className="w-3 h-3 mr-2 text-amber-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="overview" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-white/60">
              <BarChart3 className="w-3 h-3 mr-1.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="pl" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-white/60">
              <TrendingUp className="w-3 h-3 mr-1.5" /> P&L Statement
            </TabsTrigger>
            <TabsTrigger value="transactions" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-white/60">
              <Receipt className="w-3 h-3 mr-1.5" /> Transactions
            </TabsTrigger>
            <TabsTrigger value="tax" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-white/60">
              <FileText className="w-3 h-3 mr-1.5" /> Tax Summary
            </TabsTrigger>
            <TabsTrigger value="ebay" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-white/60">
              <Calculator className="w-3 h-3 mr-1.5" /> eBay Fees
            </TabsTrigger>
            <TabsTrigger value="accounts" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-white/60">
              <Building2 className="w-3 h-3 mr-1.5" /> Accounts
            </TabsTrigger>
            <TabsTrigger value="cashflow" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-white/60">
              <Droplets className="w-3 h-3 mr-1.5" /> Cash Flow
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab year={year} />
          </TabsContent>
          <TabsContent value="pl" className="mt-4">
            <PLTab year={year} />
          </TabsContent>
          <TabsContent value="transactions" className="mt-4">
            <TransactionsTab accounts={accounts ?? []} />
          </TabsContent>
          <TabsContent value="tax" className="mt-4">
            <TaxTab year={year} />
          </TabsContent>
          <TabsContent value="ebay" className="mt-4">
            <EbayFeeTab />
          </TabsContent>
          <TabsContent value="accounts" className="mt-4">
            <AccountsTab />
          </TabsContent>
          <TabsContent value="cashflow" className="mt-4">
            <CashFlowTab year={year} />
          </TabsContent>
        </Tabs>
    </div>
  );
}

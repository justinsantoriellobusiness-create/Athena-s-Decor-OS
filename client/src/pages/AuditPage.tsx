import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ShieldCheck, Play, Zap, AlertTriangle, Info, CheckCircle2, XCircle,
  Eye, Loader2, ChevronDown, ChevronUp, Clock, Wrench, Bot, History,
  RotateCcw,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const severityConfig = {
  critical: { color: "text-red-400 bg-red-400/10 border-red-400/20", icon: XCircle, label: "Critical" },
  warning: { color: "text-amber-400 bg-amber-400/10 border-amber-400/20", icon: AlertTriangle, label: "Warning" },
  info: { color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: Info, label: "Info" },
};

const issueTypeLabels: Record<string, string> = {
  missing_title: "Missing Title", short_title: "Title Too Short", long_title: "Title Too Long",
  missing_meta: "Missing Meta Description", short_meta: "Meta Too Short", long_meta: "Meta Too Long",
  missing_alt: "Missing Alt Text", duplicate_content: "Duplicate Content", thin_content: "Thin Content",
  missing_h1: "Missing H1", keyword_stuffing: "Keyword Stuffing", low_readability: "Low Readability",
  missing_schema: "Missing Schema", broken_link: "Broken Link", slow_page: "Slow Page",
  low_cro: "Low CRO Score", weak_cta: "Weak CTA", poor_description: "Poor Description",
  missing_alt_text: "Missing Alt Text", missing_meta_description: "Missing Meta Description",
  missing_meta_title: "Missing Meta Title", short_meta_description: "Meta Description Too Short",
  long_meta_description: "Meta Description Too Long", short_meta_title: "Meta Title Too Short",
  long_meta_title: "Meta Title Too Long", duplicate_title: "Duplicate Title",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-white/50">{label}</span>
        <span className="font-medium" style={{ color }}>{score}/100</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

function IssueRow({
  issue, onFix, onIgnore, isFixing, showFixButton,
}: {
  issue: any; onFix: () => void; onIgnore: () => void; isFixing: boolean; showFixButton: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = severityConfig[issue.severity as keyof typeof severityConfig] || severityConfig.info;
  const SevIcon = sev.icon;

  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${
      issue.status === "fixed" ? "border-emerald-500/20 bg-emerald-500/5 opacity-60" :
      issue.status === "ignored" ? "border-white/5 opacity-40" :
      "border-white/5 bg-[#0f0f1a]"
    }`}>
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <Badge className={`text-xs shrink-0 ${sev.color}`}>
          <SevIcon className="w-3 h-3 mr-1" />
          {sev.label}
        </Badge>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/80 font-medium truncate">{issueTypeLabels[issue.issueType] || issue.issueType}</p>
          <p className="text-xs text-white/40 truncate">{issue.pageTitle} · {issue.pageType}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {issue.status === "fixed" && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">Fixed</Badge>}
          {issue.status === "ignored" && <Badge className="bg-white/5 text-white/30 border-white/10 text-xs">Ignored</Badge>}
          {issue.status === "open" && (
            <>
              <Button
                size="sm" variant="outline"
                className="h-7 text-xs border-white/10 text-white/50 hover:text-white hover:border-white/20 bg-transparent"
                onClick={(e) => { e.stopPropagation(); onIgnore(); }}
              >
                Ignore
              </Button>
              {showFixButton && (
                <Button
                  size="sm"
                  className="h-7 text-xs bg-violet-600 hover:bg-violet-500"
                  onClick={(e) => { e.stopPropagation(); onFix(); }}
                  disabled={isFixing}
                >
                  {isFixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                  {isFixing ? "Fixing…" : "Auto-Fix"}
                </Button>
              )}
            </>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 p-4 space-y-3">
          <p className="text-sm text-white/70">{issue.description}</p>
          <p className="text-sm text-white/50"><span className="text-white/30">Suggestion: </span>{issue.suggestion}</p>
          {issue.currentValue && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                <p className="text-xs text-red-400/60 mb-1 uppercase tracking-wider">Current</p>
                <p className="text-xs text-white/60 break-words">{issue.currentValue}</p>
              </div>
              {issue.suggestedValue && (
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3">
                  <p className="text-xs text-emerald-400/60 mb-1 uppercase tracking-wider">Suggested Fix</p>
                  <p className="text-xs text-white/60 break-words">{issue.suggestedValue}</p>
                </div>
              )}
            </div>
          )}
          {issue.pageUrl && (
            <a href={issue.pageUrl} target="_blank" rel="noreferrer" className="text-xs text-violet-400 hover:underline flex items-center gap-1">
              <Eye className="w-3 h-3" /> View page
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AuditPage() {
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning" | "info">("all");
  const [fixingId, setFixingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("auto_fixable");

  const utils = trpc.useUtils();
  const { data: runs, isLoading: runsLoading } = trpc.audit.getRuns.useQuery();
  const { data: latestRun } = trpc.audit.getLatest.useQuery();

  const activeRunId = selectedRunId ?? latestRun?.id ?? null;

  // Fetch all issues (with category flag)
  const { data: allIssues, isLoading: issuesLoading } = trpc.audit.getIssues.useQuery(
    { runId: activeRunId!, category: "all" },
    { enabled: activeRunId !== null }
  );

  // Fetch fix log
  const { data: fixLog, isLoading: fixLogLoading } = trpc.audit.getFixLog.useQuery(
    { runId: activeRunId! },
    { enabled: activeRunId !== null }
  );

  const runAuditMutation = trpc.audit.runAudit.useMutation({
    onSuccess: (data) => {
      toast.success(`Audit complete! Found ${data.issueCount} issues. Score: ${data.overallScore}/100`);
      utils.audit.getRuns.invalidate();
      utils.audit.getLatest.invalidate();
    },
    onError: (err) => toast.error("Audit failed: " + err.message),
  });

  const applyFixMutation = trpc.audit.applyFix.useMutation({
    onSuccess: () => {
      toast.success("Fix applied to Shopify");
      utils.audit.getIssues.invalidate({ runId: activeRunId!, category: "all" });
      utils.audit.getFixLog.invalidate({ runId: activeRunId! });
      setFixingId(null);
    },
    onError: (err) => { toast.error("Fix failed: " + err.message); setFixingId(null); },
  });

  const applyAllMutation = trpc.audit.applyAllFixes.useMutation({
    onSuccess: (data) => {
      toast.success(`Applied ${data.fixed} fixes${data.failed > 0 ? `, ${data.failed} failed` : ""}`);
      utils.audit.getIssues.invalidate({ runId: activeRunId!, category: "all" });
      utils.audit.getFixLog.invalidate({ runId: activeRunId! });
    },
    onError: (err) => toast.error("Bulk fix failed: " + err.message),
  });

  const ignoreMutation = trpc.audit.ignoreIssue.useMutation({
    onSuccess: () => utils.audit.getIssues.invalidate({ runId: activeRunId!, category: "all" }),
  });

  const activeRun = runs?.find((r) => r.id === activeRunId) ?? latestRun;

  // Split issues into categories
  const autoFixableIssues = (allIssues || []).filter((i) => i.fixCategory === "auto_fixable");
  const manualIssues = (allIssues || []).filter((i) => i.fixCategory === "manual");

  const applyFilter = (list: any[]) =>
    severityFilter === "all" ? list : list.filter((i) => i.severity === severityFilter);

  const filteredAutoFixable = applyFilter(autoFixableIssues);
  const filteredManual = applyFilter(manualIssues);

  const openAutoFixable = autoFixableIssues.filter((i) => i.status === "open").length;
  const openManual = manualIssues.filter((i) => i.status === "open").length;
  const fixedCount = (allIssues || []).filter((i) => i.status === "fixed").length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-violet-400" />
            Site Audit
          </h1>
          <p className="text-white/40 text-sm mt-1">AI-powered SEO, CRO & technical analysis with one-click auto-fixes</p>
        </div>
        <Button
          onClick={() => runAuditMutation.mutate()}
          disabled={runAuditMutation.isPending}
          className="bg-violet-600 hover:bg-violet-500 gap-2"
        >
          {runAuditMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {runAuditMutation.isPending ? "Auditing…" : "Run New Audit"}
        </Button>
      </div>

      {/* Score summary */}
      {activeRun && activeRun.status === "completed" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-[#0f0f1a] border-white/5 col-span-2 lg:col-span-1">
            <CardContent className="p-5">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Overall Score</p>
              <p className="text-5xl font-bold text-white">{activeRun.overallScore}</p>
              <p className="text-xs text-white/30 mt-1">out of 100</p>
            </CardContent>
          </Card>
          <Card className="bg-[#0f0f1a] border-white/5">
            <CardContent className="p-5 space-y-3">
              <ScoreBar score={activeRun.seoScore ?? 0} label="SEO" color="#60a5fa" />
              <ScoreBar score={activeRun.croScore ?? 0} label="CRO" color="#34d399" />
              <ScoreBar score={activeRun.technicalScore ?? 0} label="Technical" color="#fbbf24" />
            </CardContent>
          </Card>
          <Card className="bg-[#0f0f1a] border-white/5">
            <CardContent className="p-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-red-400">Critical</span>
                <span className="text-white font-bold">{activeRun.criticalCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-amber-400">Warnings</span>
                <span className="text-white font-bold">{activeRun.warningCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-blue-400">Info</span>
                <span className="text-white font-bold">{activeRun.infoCount}</span>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-white/5">
                <span className="text-emerald-400">Fixed</span>
                <span className="text-white font-bold">{fixedCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0f0f1a] border-white/5">
            <CardContent className="p-5">
              <p className="text-xs text-white/40 mb-2">Pages Audited</p>
              <p className="text-3xl font-bold text-white">{activeRun.pageCount}</p>
              <p className="text-xs text-white/30 mt-1">{activeRun.issueCount} total issues</p>
              {activeRun.summary && <p className="text-xs text-white/40 mt-2 line-clamp-2">{activeRun.summary}</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList className="bg-white/5 border border-white/5">
            <TabsTrigger value="auto_fixable" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/50 gap-1.5">
              <Bot className="w-3.5 h-3.5" />
              Auto-Fixable
              {openAutoFixable > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-violet-500/30 rounded-full">{openAutoFixable}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="manual" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/50 gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              Manual Fix Required
              {openManual > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded-full">{openManual}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="log" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/50 gap-1.5">
              <History className="w-3.5 h-3.5" />
              Execution Log
              {(fixLog || []).length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded-full">{(fixLog || []).length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="runs" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/50 gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Audit History
            </TabsTrigger>
          </TabsList>

          {/* Severity filter + bulk action */}
          {activeRunId && (activeTab === "auto_fixable" || activeTab === "manual") && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {(["all", "critical", "warning", "info"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeverityFilter(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      severityFilter === s
                        ? "bg-violet-600 text-white"
                        : "bg-white/5 text-white/40 hover:text-white/70"
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              {activeTab === "auto_fixable" && openAutoFixable > 0 && (
                <Button
                  size="sm"
                  className="bg-violet-600/80 hover:bg-violet-600 gap-1.5"
                  onClick={() => applyAllMutation.mutate({ runId: activeRunId! })}
                  disabled={applyAllMutation.isPending}
                >
                  {applyAllMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  {applyAllMutation.isPending ? "Fixing…" : `Auto-Fix All (${openAutoFixable})`}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── Auto-Fixable Issues ── */}
        <TabsContent value="auto_fixable" className="mt-4">
          {!activeRunId ? (
            <EmptyState icon={<Bot className="w-12 h-12" />} title="No audit runs yet" subtitle='Click "Run New Audit" to analyze your store' />
          ) : issuesLoading ? (
            <LoadingSkeleton />
          ) : filteredAutoFixable.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-10 h-10 text-emerald-400/40" />} title="No auto-fixable issues" subtitle="All auto-fixable issues have been resolved" />
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 p-3 bg-violet-500/5 border border-violet-500/10 rounded-lg">
                <Bot className="w-4 h-4 text-violet-400 shrink-0" />
                <p className="text-xs text-white/50">
                  These issues can be automatically resolved by the AI — missing meta tags, short descriptions, alt text, etc. Click <strong className="text-white/70">Auto-Fix</strong> on individual items or <strong className="text-white/70">Auto-Fix All</strong> to resolve all at once.
                </p>
              </div>
              <div className="space-y-2">
                {filteredAutoFixable.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    isFixing={fixingId === issue.id}
                    showFixButton={true}
                    onFix={() => {
                      setFixingId(issue.id);
                      applyFixMutation.mutate({ issueId: issue.id, runId: activeRunId! });
                    }}
                    onIgnore={() => ignoreMutation.mutate({ issueId: issue.id })}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Manual Fix Required ── */}
        <TabsContent value="manual" className="mt-4">
          {!activeRunId ? (
            <EmptyState icon={<Wrench className="w-12 h-12" />} title="No audit runs yet" subtitle='Click "Run New Audit" to analyze your store' />
          ) : issuesLoading ? (
            <LoadingSkeleton />
          ) : filteredManual.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-10 h-10 text-emerald-400/40" />} title="No manual issues found" subtitle="No structural or server issues detected" />
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-xs text-white/50">
                  These issues require manual intervention — server configuration, structural layout problems, broken links, or schema issues that cannot be safely auto-resolved.
                </p>
              </div>
              <div className="space-y-2">
                {filteredManual.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    isFixing={false}
                    showFixButton={false}
                    onFix={() => {}}
                    onIgnore={() => ignoreMutation.mutate({ issueId: issue.id })}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Execution Log ── */}
        <TabsContent value="log" className="mt-4">
          {!activeRunId ? (
            <EmptyState icon={<History className="w-12 h-12" />} title="No audit selected" subtitle="Select or run an audit to see the execution log" />
          ) : fixLogLoading ? (
            <LoadingSkeleton />
          ) : (fixLog || []).length === 0 ? (
            <EmptyState icon={<History className="w-10 h-10 text-white/20" />} title="No fixes applied yet" subtitle="Auto-fix actions will appear here with full details for rollback reference" />
          ) : (
            <div className="space-y-2">
              <div className="mb-3 flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                <RotateCcw className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-xs text-white/50">
                  Complete record of all auto-fix changes. Use the <strong className="text-white/70">Old Value</strong> column as a rollback reference if any generated fix is undesirable.
                </p>
              </div>
              <div className="overflow-hidden rounded-lg border border-white/5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/3">
                      <th className="text-left p-3 text-white/40 font-medium">Page</th>
                      <th className="text-left p-3 text-white/40 font-medium">Field Changed</th>
                      <th className="text-left p-3 text-white/40 font-medium">Old Value</th>
                      <th className="text-left p-3 text-white/40 font-medium">New Value</th>
                      <th className="text-left p-3 text-white/40 font-medium">Status</th>
                      <th className="text-left p-3 text-white/40 font-medium">Applied At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fixLog || []).map((entry: any) => (
                      <tr key={entry.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                        <td className="p-3">
                          <p className="text-white/70 text-xs font-medium truncate max-w-[140px]">{entry.pageTitle || "—"}</p>
                          <p className="text-white/30 text-xs">{entry.pageType}</p>
                        </td>
                        <td className="p-3">
                          <Badge className="bg-white/5 text-white/50 border-white/10 text-xs">
                            {entry.fieldChanged}
                          </Badge>
                        </td>
                        <td className="p-3 max-w-[180px]">
                          <p className="text-xs text-red-400/70 break-words line-clamp-2">{entry.oldValue || <span className="text-white/20 italic">empty</span>}</p>
                        </td>
                        <td className="p-3 max-w-[180px]">
                          <p className="text-xs text-emerald-400/70 break-words line-clamp-2">{entry.newValue}</p>
                        </td>
                        <td className="p-3">
                          <Badge className={`text-xs ${
                            entry.status === "applied" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            entry.status === "failed" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                            "bg-white/5 text-white/40 border-white/10"
                          }`}>
                            {entry.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-white/40 text-xs whitespace-nowrap">
                          {entry.appliedAt ? new Date(entry.appliedAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Audit History ── */}
        <TabsContent value="runs" className="mt-4">
          {runsLoading ? (
            <LoadingSkeleton />
          ) : (runs || []).length === 0 ? (
            <EmptyState icon={<Clock className="w-10 h-10" />} title="No audit history yet" subtitle='Click "Run New Audit" to get started' />
          ) : (
            <div className="space-y-2">
              {(runs || []).map((run) => (
                <button
                  key={run.id}
                  onClick={() => { setSelectedRunId(run.id); setActiveTab("auto_fixable"); }}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    run.id === activeRunId
                      ? "border-violet-500/30 bg-violet-500/5"
                      : "border-white/5 bg-[#0f0f1a] hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        run.status === "completed" ? "bg-emerald-400" :
                        run.status === "running" ? "bg-amber-400 animate-pulse" : "bg-red-400"
                      }`} />
                      <div>
                        <p className="text-sm text-white font-medium">Audit #{run.id}</p>
                        <p className="text-xs text-white/40">{new Date(run.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      {run.status === "completed" && (
                        <>
                          <span className="text-white/60">{run.pageCount} pages</span>
                          <span className="text-red-400">{run.criticalCount} critical</span>
                          <span className="text-2xl font-bold text-white">{run.overallScore}</span>
                        </>
                      )}
                      {run.status === "running" && <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Running…</Badge>}
                      {run.status === "error" && <Badge className="bg-red-500/10 text-red-400 border-red-500/20">Error</Badge>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-white/30 gap-3">
      {icon}
      <p className="text-lg font-medium text-white/40">{title}</p>
      <p className="text-sm">{subtitle}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 bg-white/5" />)}
    </div>
  );
}

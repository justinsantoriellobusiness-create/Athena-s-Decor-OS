import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity, Loader2, CheckCircle2, AlertTriangle, XCircle, MinusCircle, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_META = {
  ok: { icon: CheckCircle2, cls: "text-emerald-400", border: "border-emerald-500/30", label: "Working" },
  warn: { icon: AlertTriangle, cls: "text-yellow-400", border: "border-yellow-500/30", label: "Attention" },
  fail: { icon: XCircle, cls: "text-red-400", border: "border-red-500/30", label: "Broken" },
  skipped: { icon: MinusCircle, cls: "text-muted-foreground", border: "border-border/50", label: "Not set up" },
} as const;

export default function SystemCheckPage() {
  const run = trpc.systemCheck.run.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const report = run.data;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-500" />
          <h1 className="text-xl font-semibold">System Check</h1>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          <span className="ml-1.5">{run.isPending ? "Testing…" : "Run check"}</span>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Makes a real call to every connected service and reports what came back. This is the
        difference between "credentials are saved" and "it actually works".
      </p>

      {!report && !run.isPending && (
        <p className="text-sm text-muted-foreground">Hit “Run check” to test everything.</p>
      )}

      {report && (
        <>
          <div
            className={cn(
              "rounded-lg border p-4",
              report.readyToOperate ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
            )}
          >
            <p className="font-medium text-sm">
              {report.readyToOperate
                ? "Ready to operate — everything required to take and fulfil an order is working."
                : "Not ready — something required to take or fulfil an order is broken."}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {report.summary.ok} working · {report.summary.warn} need attention ·{" "}
              {report.summary.fail} broken · {report.summary.skipped} not set up
            </p>
          </div>

          <div className="space-y-2">
            {report.results.map((r) => {
              const meta = STATUS_META[r.status];
              const Icon = meta.icon;
              return (
                <div key={r.key} className={cn("rounded-lg border p-3 flex items-start gap-3", meta.border)}>
                  <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", meta.cls)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium">{r.label}</p>
                      <span className={cn("text-[10px] uppercase tracking-wide", meta.cls)}>{meta.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">{r.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Last run {new Date(report.ranAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}

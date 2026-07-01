import { getLoginUrl } from "@/const";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-10" style={{ background: "radial-gradient(ellipse, oklch(0.82 0.12 85), transparent)" }} />
      </div>

      <div className="relative z-10 w-full max-w-sm mx-auto px-6">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{ background: "linear-gradient(135deg, oklch(0.82 0.12 85), oklch(0.72 0.1 70))" }}>
            <Zap className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Athena's OS</h1>
          <p className="text-sm text-muted-foreground">Your complete dropshipping automation platform</p>
        </div>

        <div className="glass rounded-2xl p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in to access your automation dashboard</p>
          </div>

          <Button
            className="w-full h-11 font-semibold"
            style={{ background: "linear-gradient(135deg, oklch(0.82 0.12 85), oklch(0.72 0.1 70))", color: "black" }}
            onClick={() => { window.location.href = getLoginUrl(); }}
          >
            <Zap className="w-4 h-4 mr-2" />
            Sign in with Manus
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Athena's Decor Automation OS · Powered by AI
        </p>
      </div>
    </div>
  );
}

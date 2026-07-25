import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Lock, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// sessionStorage (not localStorage) is deliberate: closing the tab or the app
// drops the unlock, which is half of what "lock when idle or closed" means.
const UNLOCK_KEY = "athena.pinUnlocked";
const IDLE_MS = 15 * 60_000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

export default function PinLock({ children }: { children: React.ReactNode }) {
  const statusQuery = trpc.auth.pinStatus.useQuery();
  const [, setLocation] = useLocation();
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(UNLOCK_KEY) === "1");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lockActive = !!statusQuery.data?.enabled && !!statusQuery.data?.isSet;

  const lock = useCallback(() => {
    sessionStorage.removeItem(UNLOCK_KEY);
    setUnlocked(false);
  }, []);

  useEffect(() => {
    if (!lockActive || !unlocked) return;
    const reset = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(lock, IDLE_MS);
    };
    reset();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(idleTimer.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [lockActive, unlocked, lock]);

  const verifyMutation = trpc.auth.verifyPin.useMutation({
    onSuccess: () => {
      sessionStorage.setItem(UNLOCK_KEY, "1");
      setUnlocked(true);
      setPin("");
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
      setPin("");
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      sessionStorage.removeItem(UNLOCK_KEY);
      setLocation("/login");
    },
  });

  if (statusQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08080f]">
        <Loader2 className="w-5 h-5 animate-spin text-white/30" />
      </div>
    );
  }

  if (!lockActive || unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08080f] px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pin) verifyMutation.mutate({ pin });
        }}
        className="w-full max-w-xs flex flex-col items-center gap-5"
      >
        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
          <Lock className="w-5 h-5 text-violet-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">Locked</p>
          <p className="text-xs text-white/40 mt-1">Enter your PIN to continue</p>
        </div>
        <Input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setError(null);
          }}
          placeholder="••••"
          className="text-center tracking-[0.5em] text-lg"
        />
        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        <Button type="submit" className="w-full" disabled={!pin || verifyMutation.isPending}>
          {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unlock"}
        </Button>
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Forgot PIN? Sign out and use your password
        </button>
        <div className="flex items-center gap-1.5 text-[10px] text-white/20">
          <Zap className="w-3 h-3" />
          <span>Athena's OS</span>
        </div>
      </form>
    </div>
  );
}

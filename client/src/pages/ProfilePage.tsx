import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { User, Loader2, Camera, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const THEME_PRESETS: { key: string; label: string; swatch: string }[] = [
  { key: "gold", label: "Gold", swatch: "oklch(0.82 0.12 85)" },
  { key: "emerald", label: "Emerald", swatch: "oklch(0.72 0.17 155)" },
  { key: "sapphire", label: "Sapphire", swatch: "oklch(0.68 0.16 245)" },
  { key: "rose", label: "Rose", swatch: "oklch(0.68 0.19 15)" },
  { key: "violet", label: "Violet", swatch: "oklch(0.65 0.19 300)" },
];

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const utils = trpc.useUtils();
  const [name, setName] = useState(user?.name ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Profile updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadAvatar = trpc.auth.uploadAvatar.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Photo updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const currentTheme = (user as any)?.themePreset || "gold";
  const avatarUrl = (user as any)?.avatarUrl as string | undefined;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      uploadAvatar.mutate({ dataUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const nameChanged = name.trim() && name.trim() !== (user?.name ?? "");

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Your name, photo, and how the site looks for you</p>
      </div>

      {/* Photo + name */}
      <div className="glass rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ background: "var(--color-primary-a15)" }}
            >
              {uploadAvatar.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--color-primary)" }} />
              ) : avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6" style={{ color: "var(--color-primary)" }} />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadAvatar.isPending}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center hover:bg-secondary/80 transition-colors"
              title="Upload a photo"
            >
              <Camera className="w-3 h-3 text-foreground" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user?.name || "Admin"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="display-name" className="text-xs text-muted-foreground">Display name</Label>
          <div className="flex items-center gap-2">
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="bg-secondary/50 border-border/50"
            />
            <Button
              size="sm"
              onClick={() => updateProfile.mutate({ name: name.trim() })}
              disabled={!nameChanged || updateProfile.isPending}
              className="gap-1.5 flex-shrink-0"
            >
              {updateProfile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Color theme */}
      <div className="glass rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Color theme</h3>
          <p className="text-xs text-muted-foreground mt-1">Applies to the sidebar, badges, and accents across the whole site.</p>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {THEME_PRESETS.map((preset) => {
            const active = currentTheme === preset.key;
            return (
              <button
                key={preset.key}
                onClick={() => updateProfile.mutate({ themePreset: preset.key as any })}
                disabled={updateProfile.isPending}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                  active ? "border-border bg-secondary/50" : "border-border/30 hover:bg-secondary/30"
                )}
              >
                <div className="relative w-8 h-8 rounded-full" style={{ background: preset.swatch }}>
                  {active && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Check className="w-4 h-4 text-black/70" />
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

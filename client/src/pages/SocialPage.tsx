import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Megaphone, Loader2, Send, Sparkles, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const MAX_LEN = 280;

export default function SocialPage() {
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const channels = trpc.social.listChannels.useQuery();
  const draft = trpc.social.draft.useMutation({
    onSuccess: (d) => {
      // Hashtags are appended here rather than asked of the model as one
      // string, so the character count stays predictable.
      setText([d.text, d.hashtags.join(" ")].filter(Boolean).join("\n\n"));
      toast.success("Draft ready — edit before posting");
    },
    onError: (e) => toast.error(e.message),
  });
  const publish = trpc.social.publish.useMutation({
    onSuccess: (r) => {
      if (r.succeeded === r.total) {
        toast.success(`Posted to ${r.succeeded} channel${r.succeeded === 1 ? "" : "s"}`);
        setText("");
        setSelected([]);
      } else {
        const failed = r.results.filter((x) => !x.ok);
        toast.error(`${r.succeeded}/${r.total} posted — ${failed[0]?.error ?? "some channels failed"}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const over = text.length > MAX_LEN;

  if (channels.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (channels.data && !channels.data.connected) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
          <AlertCircle className="w-4 h-4 mt-0.5 text-yellow-500 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Buffer isn't connected</p>
            <p className="text-muted-foreground mt-1">
              Add your Buffer API key in <span className="font-medium">Integrations</span>, then connect
              your social accounts as channels inside Buffer. They'll appear here automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const list = channels.data?.channels ?? [];

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-indigo-500" />
        <h1 className="text-xl font-semibold">Social</h1>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Buffer is connected but has no channels yet — add your social accounts in Buffer first.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Channels</p>
          <div className="flex flex-wrap gap-2">
            {list.map((c) => (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md border text-xs transition-colors",
                  selected.includes(c.id)
                    ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                    : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                {c.name} <span className="opacity-60">· {c.service}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Topic for an AI draft (optional)"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!topic.trim() || draft.isPending}
            onClick={() => draft.mutate({ topic })}
          >
            {draft.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            <span className="ml-1.5">Draft</span>
          </Button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="What are you posting?"
          className="w-full rounded-md border border-border/50 bg-background p-3 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        />
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            Buffer honours each channel's approval setting — a channel set to "Requires Approval"
            receives this as a draft.
          </span>
          <span className={cn(over ? "text-red-400" : "text-muted-foreground")}>
            {text.length}/{MAX_LEN}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Image URL (optional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        <div className="relative">
          <Clock className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="datetime-local"
            className="pl-8"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            title="Leave empty to add to Buffer's queue"
          />
        </div>
      </div>

      <Button
        disabled={!text.trim() || selected.length === 0 || over || publish.isPending}
        onClick={() =>
          publish.mutate({
            channelIds: selected,
            text,
            imageUrl: imageUrl.trim() || undefined,
            // datetime-local has no timezone; convert to a real instant.
            scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          })
        }
      >
        {publish.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        <span className="ml-1.5">
          {scheduledAt ? "Schedule" : "Add to queue"}
          {selected.length > 0 && ` · ${selected.length} channel${selected.length === 1 ? "" : "s"}`}
        </span>
      </Button>
    </div>
  );
}

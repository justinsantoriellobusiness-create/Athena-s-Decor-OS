import { useState } from "react";
import { ToggleLeft, ToggleRight, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles, Send, Trash2, Eye, Clock, CheckCircle2, AlertCircle, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const toneOptions = [
  { value: "informative", label: "Informative" },
  { value: "inspirational", label: "Inspirational" },
  { value: "promotional", label: "Promotional" },
  { value: "storytelling", label: "Storytelling" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "published") return <span className="badge-success"><CheckCircle2 className="w-3 h-3" />Published</span>;
  if (status === "scheduled") return <span className="badge-warning"><Clock className="w-3 h-3" />Scheduled</span>;
  if (status === "failed") return <span className="badge-error"><AlertCircle className="w-3 h-3" />Failed</span>;
  return <span className="badge-info"><FileText className="w-3 h-3" />Draft</span>;
}

export default function BlogPage() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<"informative" | "inspirational" | "promotional" | "storytelling">("informative");
  const [wordCount, setWordCount] = useState(800);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: posts, isLoading } = trpc.blog.list.useQuery();

  const generateMutation = trpc.blog.generate.useMutation({
    onSuccess: () => { toast.success("Blog post generated!"); utils.blog.list.invalidate(); setTopic(""); },
    onError: (err) => toast.error(err.message),
  });
  const suggestTopicsMutation = trpc.blog.suggestTopics.useMutation({
    onError: (err) => toast.error(err.message),
  });
  const publishMutation = trpc.blog.publish.useMutation({
    onSuccess: () => { toast.success("Published to Shopify!"); utils.blog.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.blog.delete.useMutation({
    onSuccess: () => { toast.success("Post deleted"); utils.blog.list.invalidate(); setSelectedPost(null); },
    onError: (err) => toast.error(err.message),
  });

  const { data: settings } = trpc.scheduler.getAll.useQuery();
  const updateSchedulerMutation = trpc.scheduler.update.useMutation({
    onSuccess: () => toast.success("Automation updated"),
  });
  const blogSetting = settings?.find((s: any) => s.module === "blog");

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Blog Automation</h1>
          <p className="text-white/40 text-sm mt-1">AI-generated blog posts with branded images, auto-published to your Shopify store</p>
        </div>
        {blogSetting && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-violet-500/5 border border-violet-500/10 rounded-lg shrink-0">
            <Zap className="w-4 h-4 text-violet-400" />
            <div>
              <p className="text-xs text-white/70 font-medium">Auto-Generate</p>
              <p className="text-[10px] text-white/30">{blogSetting.cronExpression || "Weekly Mon 8am"}</p>
            </div>
            <button onClick={() => updateSchedulerMutation.mutate({ module: "blog", enabled: !blogSetting.enabled })}>
              {blogSetting.enabled
                ? <ToggleRight className="w-8 h-8 text-violet-400" />
                : <ToggleLeft className="w-8 h-8 text-white/20" />
              }
            </button>
          </div>
        )}
      </div>

      {/* Generator */}
      <div className="bg-[#0f0f1a] border border-white/5 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-white">Generate New Post</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted-foreground">Topic / Title Idea (optional)</label>
              <button
                type="button"
                onClick={() => suggestTopicsMutation.mutate()}
                disabled={suggestTopicsMutation.isPending}
                className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1 disabled:opacity-50"
              >
                {suggestTopicsMutation.isPending
                  ? <><Loader2 className="w-2.5 h-2.5 animate-spin" />Thinking…</>
                  : <><Sparkles className="w-2.5 h-2.5" />Suggest ideas</>}
              </button>
            </div>
            <Input
              placeholder="Leave blank to let AI pick a topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-white/5 border-white/10 text-white text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Tone</label>
            <Select value={tone} onValueChange={(v) => setTone(v as any)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {toneOptions.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Word Count</label>
            <Select value={String(wordCount)} onValueChange={(v) => setWordCount(Number(v))}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[400, 600, 800, 1000, 1500].map((n) => <SelectItem key={n} value={String(n)}>{n} words</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {suggestTopicsMutation.data && suggestTopicsMutation.data.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestTopicsMutation.data.topics.map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-full border transition-colors text-left",
                  topic === t ? "bg-violet-600 border-violet-500 text-white" : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <Button
          onClick={() => generateMutation.mutate({ topic: topic || undefined, tone, wordCount })}
          disabled={generateMutation.isPending}
          className="gap-2 bg-violet-600 hover:bg-violet-500"
        >
          {generateMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Generating post + image…</>
          ) : topic ? (
            <><Sparkles className="w-4 h-4" />Generate Post</>
          ) : (
            <><Sparkles className="w-4 h-4" />Generate Post (AI picks a topic)</>
          )}
        </Button>
      </div>

      {/* Posts List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List */}
        <div className="bg-[#0f0f1a] border border-white/5 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h3 className="text-xs font-semibold text-white/60 uppercase tracking-widest">Posts ({posts?.length ?? 0})</h3>
          </div>
          {isLoading ? (
            <div className="p-5 space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : posts?.length ? (
            <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto">
              {posts.map((post: any) => (
                <button
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className={cn(
                    "w-full px-5 py-4 text-left hover:bg-secondary/30 transition-colors",
                    selectedPost?.id === post.id && "bg-secondary/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{post.title}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        {new Date(post.createdAt).toLocaleDateString()}
                        {post.generatedByAi && " · AI Generated"}
                      </p>
                    </div>
                    <StatusBadge status={post.status} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No posts yet. Generate your first post above.</p>
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="bg-[#0f0f1a] border border-white/5 rounded-xl overflow-hidden">
          {selectedPost ? (
            <div className="flex flex-col h-full">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white truncate flex-1 mr-3">{selectedPost.title}</h3>
                <StatusBadge status={selectedPost.status} />
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {selectedPost.featuredImageUrl ? (
                  <div className="space-y-2">
                    <div className="rounded-lg overflow-hidden aspect-video bg-white/5">
                      <img
                        src={selectedPost.featuredImageUrl}
                        alt={selectedPost.featuredImageAlt || selectedPost.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {selectedPost.featuredImageAlt && (
                      <div className="bg-white/5 border border-white/5 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-white/30 mb-0.5 uppercase tracking-wider">Image Alt Text</p>
                        <p className="text-xs text-white/60 italic">"{selectedPost.featuredImageAlt}"</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg aspect-video bg-white/5 flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-white/10" />
                  </div>
                )}
                <div className="space-y-2">
                  {selectedPost.excerpt && (
                    <div className="bg-white/5 rounded-lg p-3">
                      <p className="text-[10px] text-white/30 mb-1">Excerpt</p>
                      <p className="text-xs text-white/70">{selectedPost.excerpt}</p>
                    </div>
                  )}
                  {selectedPost.seoTitle && (
                    <div className="bg-white/5 rounded-lg p-3">
                      <p className="text-[10px] text-white/30 mb-1">SEO Title</p>
                      <p className="text-xs text-white/70">{selectedPost.seoTitle}</p>
                    </div>
                  )}
                  {selectedPost.tags && (
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedPost.tags as string[]).map((tag: string) => (
                        <span key={tag} className="badge-gold text-[10px]">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="px-5 py-4 border-t border-white/5 flex gap-2">
                {selectedPost.status === "draft" && (
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs font-semibold flex-1 bg-violet-600 hover:bg-violet-500"
                    onClick={() => publishMutation.mutate({ id: selectedPost.id })}
                    disabled={publishMutation.isPending}
                  >
                    {publishMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Publish to Shopify
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/10 bg-transparent"
                  onClick={() => deleteMutation.mutate({ id: selectedPost.id })}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center">
                <Eye className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a post to preview</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

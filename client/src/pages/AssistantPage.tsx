import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import {
  Send, Bot, User, Sparkles, Zap, Search, FileText, Package, Megaphone, ShieldCheck, BarChart3, RefreshCw, Loader2,
} from "lucide-react";

type Message = { role: "user" | "assistant"; content: string; actions?: string[] };

const QUICK_ACTIONS = [
  { label: "Run Site Audit", icon: ShieldCheck, action: "run_audit", color: "violet", description: "Scan all pages for SEO & CRO issues" },
  { label: "Apply Critical Fixes", icon: Zap, action: "apply_critical_fixes", color: "red", description: "Fix all critical issues automatically" },
  { label: "Generate Blog Post", icon: FileText, action: "generate_blog", color: "blue", description: "Create AI blog post with image" },
  { label: "Scan Inventory", icon: Package, action: "scan_inventory", color: "green", description: "Check all product stock levels" },
  { label: "Run SEO Research", icon: Search, action: "run_seo", color: "yellow", description: "Research new keywords" },
  { label: "Optimize Ad Budgets", icon: Megaphone, action: "optimize_ads", color: "orange", description: "Auto-adjust campaign budgets" },
];

const SUGGESTIONS = [
  "What's the current SEO score of my store?",
  "Run a full site audit and fix all critical issues",
  "Generate a blog post about summer home decor trends",
  "Which products are out of stock right now?",
  "How are my ad campaigns performing?",
  "Optimize all product descriptions for better conversions",
  "What keywords should I target for home decor?",
  "Enable all automation modules",
];

const colorMap: Record<string, string> = {
  violet: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  red: "text-red-400 bg-red-400/10 border-red-400/20",
  blue: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  green: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  yellow: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  orange: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm **Athena**, your AI business assistant. I have full access to your store and can execute actions across all modules — from running site audits and fixing SEO issues to generating blog posts, scanning inventory, and optimizing ad campaigns.\n\nWhat would you like to do today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.assistant.chat.useMutation();
  const executeMutation = trpc.assistant.executeAction.useMutation();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsTyping(true);

    try {
      const result = await chatMutation.mutateAsync({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
      });

      const assistantMsg: Message = {
        role: "assistant",
        content: result.reply,
        actions: result.actions,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Auto-execute detected actions
      for (const action of result.actions || []) {
        try {
          const execResult = await executeMutation.mutateAsync({ action: action as any });
          if (execResult.success) {
            toast.success(`Action executed: ${action.replace(/_/g, " ")}`);
          }
        } catch {
          // Silent — action execution is best-effort
        }
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "I encountered an error processing your request. Please try again.",
      }]);
      toast.error("Failed to get response");
    } finally {
      setIsTyping(false);
    }
  };

  const executeQuickAction = async (action: string, label: string) => {
    const userMsg: Message = { role: "user", content: `Execute: ${label}` };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const execResult = await executeMutation.mutateAsync({ action: action as any });
      const assistantMsg: Message = {
        role: "assistant",
        content: execResult.success
          ? `✅ **${label}** — ${execResult.message}`
          : `❌ **${label}** failed: ${execResult.message}`,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (execResult.success) toast.success(label + " started");
    } catch (err: any) {
      toast.error("Action failed: " + err.message);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sidebar: Quick Actions + Suggestions */}
      <div className="w-72 border-r border-white/5 flex flex-col bg-[#08080f] overflow-y-auto shrink-0">
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">Quick Actions</span>
          </div>
          <p className="text-xs text-white/30">Execute actions with one click</p>
        </div>
        <div className="p-3 space-y-2">
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.action}
              onClick={() => executeQuickAction(qa.action, qa.label)}
              disabled={isTyping}
              className={`w-full text-left p-3 rounded-lg border transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed ${colorMap[qa.color]}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <qa.icon className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">{qa.label}</span>
              </div>
              <p className="text-xs opacity-60 pl-5">{qa.description}</p>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-white/5 mt-2">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-white/40" />
            <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">Try Asking</span>
          </div>
          <div className="space-y-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                disabled={isTyping}
                className="w-full text-left text-xs text-white/40 hover:text-white/70 hover:bg-white/5 rounded-md px-2 py-1.5 transition-colors disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-[#0a0a14] shrink-0">
          <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <Bot className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Athena AI</p>
            <p className="text-xs text-white/40">Full store access · Can execute actions</p>
          </div>
          <div className="ml-auto">
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">Online</Badge>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                msg.role === "assistant"
                  ? "bg-violet-500/20 border border-violet-500/30"
                  : "bg-white/10 border border-white/10"
              }`}>
                {msg.role === "assistant"
                  ? <Bot className="w-4 h-4 text-violet-400" />
                  : <User className="w-4 h-4 text-white/60" />
                }
              </div>

              {/* Bubble */}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === "assistant"
                  ? "bg-[#0f0f1a] border border-white/5 text-white/90"
                  : "bg-violet-600/20 border border-violet-500/20 text-white"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-invert prose-sm max-w-none text-white/90 [&_p]:text-white/90 [&_li]:text-white/80 [&_strong]:text-white [&_code]:text-violet-300 [&_code]:bg-violet-500/10 [&_code]:px-1 [&_code]:rounded">
                    <Streamdown>{msg.content}</Streamdown>
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}

                {/* Action badges */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/10">
                    {msg.actions.map((a) => (
                      <Badge key={a} className="bg-violet-500/10 text-violet-400 border-violet-500/20 text-xs">
                        <Zap className="w-3 h-3 mr-1" />
                        {a.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-violet-400" />
              </div>
              <div className="bg-[#0f0f1a] border border-white/5 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                <span className="text-xs text-white/40">Athena is thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/5 bg-[#0a0a14] shrink-0">
          <div className="flex gap-3 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Athena anything or give a command… (Enter to send, Shift+Enter for new line)"
              className="flex-1 min-h-[44px] max-h-32 resize-none bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50 rounded-xl text-sm"
              rows={1}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isTyping}
              className="h-11 w-11 p-0 bg-violet-600 hover:bg-violet-500 rounded-xl shrink-0"
            >
              {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-white/20 mt-2 text-center">
            Athena can execute actions directly — always confirm before major changes
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  History,
  ListTodo,
  Loader2,
  MessageSquare,
  Monitor,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  AGENT_ROLES,
  hasComputer,
  type AgentRoleId,
  type WorkerRoleId,
} from "@/lib/agent-roles";
import type { LiveStatusResponse } from "@/lib/orchestration";
import { ComputerPanel, TeamComputers } from "@/components/sandbox/computer-panel";

interface ChatMessage {
  id: number;
  agentId: string;
  sender: "user" | "agent";
  text: string;
  metadata?: {
    planId?: number;
    images?: string[];
    postIds?: number[];
  };
  createdAt: string;
}

interface PlanRow {
  id: number;
  title: string;
  request: string;
  status: string;
  summary: string | null;
  error: string | null;
  createdAt: string;
}

interface TaskRow {
  id: number;
  planId: number;
  agentId: string;
  position: number;
  title: string;
  instructions: string;
  status: string;
  currentStep: string | null;
  output: string | null;
  error: string | null;
  updatedAt: string;
}

interface ArtifactRow {
  id: number;
  taskId: number | null;
  agentId: string;
  type: string;
  name: string;
  url: string | null;
  sandboxPath: string | null;
}

const MASTER_STARTERS = [
  "Generate a 9:16 launch video reel using Google Flow and schedule it on Facebook and Instagram for 9:00 AM tomorrow",
  "Create two Instagram & Facebook posts for a coffee shop launch and schedule them for 8:00 AM on two consecutive mornings",
  "Analyze our campaign's published post performance and recommend next week's content angles",
];

export function AgentPanel({
  agentId,
  campaignId,
  liveStatus,
  onStatusRefresh,
  onBackToOverview,
}: {
  agentId: AgentRoleId;
  campaignId: number;
  liveStatus?: LiveStatusResponse | null;
  onStatusRefresh?: () => void;
  onBackToOverview?: () => void;
}) {
  const role = AGENT_ROLES[agentId];
  const [activeTab, setActiveTab] = useState<
    "chat" | "tasks" | "computer" | "history" | "settings"
  >("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingChat, setLoadingChat] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);

  const [customInstructions, setCustomInstructions] = useState("");
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Reset tab if switching to an agent without Tasks or Computer tab
  useEffect(() => {
    if (activeTab === "tasks" && agentId !== "master") {
      setActiveTab("chat");
    }
    if (
      activeTab === "computer" &&
      agentId !== "master" &&
      !hasComputer(agentId)
    ) {
      setActiveTab("chat");
    }
  }, [agentId, activeTab]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/chat?agent=${agentId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
      setHasMore(Boolean(data.hasMore));
      setCustomInstructions(data.customInstructions || "");
      setAgentEnabled(data.enabled ?? true);
    } finally {
      setLoadingChat(false);
    }
  }, [agentId]);

  const fetchTasksAndHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/tasks?agent=${agentId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setPlans(data.plans || []);
      setTasks(data.tasks || []);
      setArtifacts(data.artifacts || []);
    } catch {
      // Ignore transient errors
    }
  }, [agentId]);

  useEffect(() => {
    setLoadingChat(true);
    void fetchMessages();
    void fetchTasksAndHistory();
  }, [agentId, campaignId, fetchMessages, fetchTasksAndHistory]);

  // Refresh messages & tasks automatically while plans are active
  useEffect(() => {
    const busy =
      (liveStatus?.activePlanCount || 0) > 0 ||
      Object.values(liveStatus?.agents || {}).some(
        (a) => a.status === "running" || a.status === "queued"
      );
    if (!busy) return;
    const id = setInterval(() => {
      void fetchMessages();
      void fetchTasksAndHistory();
    }, 1800);
    return () => clearInterval(id);
  }, [liveStatus, fetchMessages, fetchTasksAndHistory]);

  async function loadOlderMessages() {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const oldestId = messages[0].id;
      const res = await fetch(
        `/api/agents/chat?agent=${agentId}&beforeId=${oldestId}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      setMessages((prev) => [...(data.messages || []), ...prev]);
      setHasMore(Boolean(data.hasMore));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSend(customPrompt?: string) {
    const text = (customPrompt ?? input).trim();
    if (!text || sending) return;
    if (!customPrompt) setInput("");
    setSending(true);

    const optimistic: ChatMessage = {
      id: Date.now(),
      agentId,
      sender: "user",
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", agentId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent could not reply");
      await fetchMessages();
      await fetchTasksAndHistory();
      onStatusRefresh?.();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The agent couldn't reply right now."
      );
    } finally {
      setSending(false);
    }
  }

  async function handleCancelPlan(planId: number) {
    try {
      await fetch("/api/agents/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel-plan", planId }),
      });
      toast.success("Plan cancelled");
      await fetchTasksAndHistory();
      onStatusRefresh?.();
    } catch {
      toast.error("Failed to cancel plan");
    }
  }

  async function handleRetryTask(taskId: number) {
    try {
      await fetch("/api/agents/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry-task", taskId }),
      });
      toast.success("Task re-queued");
      await fetchTasksAndHistory();
      onStatusRefresh?.();
    } catch {
      toast.error("Failed to retry task");
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-settings",
          agentId,
          customInstructions,
          enabled: agentEnabled,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(`Saved ${role.name} settings`);
    } catch {
      toast.error("Could not save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleClearChat() {
    await fetch("/api/agents/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", agentId }),
    });
    setMessages([]);
    toast.success("Cleared conversation");
  }

  const workerLive =
    agentId !== "master" ? liveStatus?.agents?.[agentId as WorkerRoleId] : null;
  const showComputerTab = agentId === "master" || hasComputer(agentId);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
      {/* Agent Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBackToOverview && (
            <button
              type="button"
              onClick={onBackToOverview}
              className="rounded-xl border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
              title="Back to Campaign Overview"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img
              src={role.avatar}
              alt={role.name}
              className="h-full w-full object-cover object-top"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 truncate">
                {role.emoji} {role.name}
              </h2>
              {workerLive?.status === "running" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Working
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate">
              {workerLive?.currentStep || role.tagline}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === "chat"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>

          {agentId === "master" && (
            <button
              type="button"
              onClick={() => setActiveTab("tasks")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === "tasks"
                  ? "bg-white text-blue-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ListTodo className="h-3.5 w-3.5" />
              Tasks
              {tasks.some((t) => t.status === "in_progress" || t.status === "queued") && (
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />
              )}
            </button>
          )}

          {showComputerTab && (
            <button
              type="button"
              onClick={() => setActiveTab("computer")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === "computer"
                  ? "bg-white text-blue-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              {agentId === "master" ? "Computers" : "Computer"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === "history"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">History</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === "settings"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tab Body */}
      {activeTab === "chat" && (
        <div className="flex flex-1 flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {hasMore && (
              <div className="text-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={loadOlderMessages}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  {loadingMore ? "Loading..." : "Load 10 older messages"}
                </button>
              </div>
            )}

            {loadingChat ? (
              <div className="flex h-40 items-center justify-center text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2 text-blue-600" />
                Loading conversation...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl mb-3">
                  {role.emoji}
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Chat with {role.name}
                </h3>
                <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
                  {role.description}
                </p>

                {agentId === "master" && (
                  <div className="mt-5 w-full max-w-md space-y-2 text-left">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">
                      Try a one-prompt team workflow
                    </div>
                    {MASTER_STARTERS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleSend(prompt)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 transition cursor-pointer"
                      >
                        <Sparkles className="inline h-3.5 w-3.5 text-blue-600 mr-1.5 -mt-0.5" />
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.sender === "user";
                const linkedPlan = msg.metadata?.planId
                  ? plans.find((p) => p.id === msg.metadata?.planId)
                  : undefined;
                const planTasks = linkedPlan
                  ? tasks.filter((t) => t.planId === linkedPlan.id)
                  : [];

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                        isUser
                          ? "bg-blue-600 text-white rounded-br-sm shadow-xs"
                          : "bg-slate-100/90 text-slate-800 rounded-bl-sm border border-slate-200/70"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.text}</div>

                      {/* Inline Live Plan Card */}
                      {linkedPlan && planTasks.length > 0 && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs text-slate-900">
                              📋 {linkedPlan.title}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                linkedPlan.status === "completed"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : linkedPlan.status === "failed"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {linkedPlan.status.replace("_", " ")}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {planTasks.map((t) => {
                              const tRole = AGENT_ROLES[t.agentId as AgentRoleId];
                              return (
                                <div
                                  key={t.id}
                                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]"
                                >
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-800 truncate">
                                      {tRole?.emoji} {tRole?.shortName}: {t.title}
                                    </div>
                                    {t.currentStep && (
                                      <div className="text-[10px] text-blue-600 truncate">
                                        ↳ {t.currentStep}
                                      </div>
                                    )}
                                  </div>
                                  <span className="shrink-0 text-[10px] font-medium text-slate-500">
                                    {t.status === "completed" ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    ) : t.status === "in_progress" ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                                    ) : (
                                      t.status
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Generated Images Preview inside Chat */}
                      {msg.metadata?.images && msg.metadata.images.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {msg.metadata.images.map((imgUrl, idx) => (
                            <a
                              key={idx}
                              href={imgUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded-xl border border-slate-200 bg-white"
                            >
                              <img
                                src={imgUrl}
                                alt={`Generated asset ${idx + 1}`}
                                className="aspect-square w-full object-cover hover:scale-105 transition"
                              />
                            </a>
                          ))}
                        </div>
                      )}

                      {msg.metadata?.postIds && msg.metadata.postIds.length > 0 && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <Link
                            href="/dashboard/posts"
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                          >
                            View Scheduled Posts →
                          </Link>
                          <Link
                            href="/dashboard/calendar"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Open Calendar
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="border-t border-slate-100 p-3 bg-white"
          >
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={
                  agentId === "master"
                    ? "Describe what posts to research, generate & schedule..."
                    : `Ask ${role.name} a question...`
                }
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "tasks" && agentId === "master" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {plans.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No task plans yet. Give the Master Agent an instruction in Chat!
            </div>
          ) : (
            plans.map((plan) => {
              const pTasks = tasks.filter((t) => t.planId === plan.id);
              return (
                <div
                  key={plan.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Plan #{plan.id} — {plan.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {plan.request}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          plan.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : plan.status === "in_progress"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {plan.status}
                      </span>
                      {plan.status === "in_progress" && (
                        <button
                          type="button"
                          onClick={() => handleCancelPlan(plan.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-100 cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {pTasks.map((t) => {
                      const tRole = AGENT_ROLES[t.agentId as AgentRoleId];
                      const tArts = artifacts.filter((a) => a.taskId === t.id);
                      return (
                        <div
                          key={t.id}
                          className="rounded-xl border border-slate-200 bg-white p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900">
                              {tRole?.emoji} {tRole?.name} — {t.title}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {t.status === "failed" && (
                                <button
                                  type="button"
                                  onClick={() => handleRetryTask(t.id)}
                                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 cursor-pointer"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Retry
                                </button>
                              )}
                              <span className="text-[10px] font-semibold text-slate-500">
                                {t.status}
                              </span>
                            </div>
                          </div>

                          {t.currentStep && (
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Right now: {t.currentStep}
                            </div>
                          )}

                          {tArts.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {tArts.map((a) =>
                                a.type === "image" && a.url ? (
                                  <img
                                    key={a.id}
                                    src={a.url}
                                    alt={a.name}
                                    className="h-14 w-14 rounded-lg object-cover border border-slate-200"
                                  />
                                ) : (
                                  <span
                                    key={a.id}
                                    className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-mono text-slate-600"
                                  >
                                    {a.sandboxPath || a.name}
                                  </span>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "computer" && showComputerTab && (
        <div className="flex-1 overflow-y-auto p-4">
          {agentId === "master" ? (
            <TeamComputers
              sandboxes={liveStatus?.sandboxes}
              onUpdated={onStatusRefresh}
            />
          ) : (
            <ComputerPanel
              agentId={agentId as "research" | "creator"}
              sandbox={liveStatus?.sandboxes?.find((s) => s.agentId === agentId)}
              onUpdated={onStatusRefresh}
            />
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tasks.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No completed task history for {role.name} yet.
            </div>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">{t.title}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                    {t.status === "completed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : t.status === "failed" ? (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-blue-500" />
                    )}
                    {t.status}
                  </span>
                </div>
                {t.output && (
                  <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-5">
                    {t.output}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <form
          onSubmit={handleSaveSettings}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-xs font-bold text-slate-800">
              Default Role Prompt
            </div>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {role.defaultInstructions}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Custom Campaign Instructions for {role.name}
            </label>
            <textarea
              rows={4}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Add brand-specific tone rules, banned phrases, or formatting preferences..."
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleClearChat}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
              Clear Chat History
            </button>

            <button
              type="submit"
              disabled={savingSettings}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              {savingSettings ? "Saving..." : "Save Agent Settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

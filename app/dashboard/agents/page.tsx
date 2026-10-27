"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { AgentPanel } from "@/components/agents/agent-panel";
import { AgentOffice } from "@/components/office/agent-office";
import {
  AGENT_ROLES,
  WORKER_ORDER,
  type AgentRoleId,
  type WorkerRoleId,
} from "@/lib/agent-roles";

function AgentsWorkspaceInner() {
  const searchParams = useSearchParams();
  const initialParam = searchParams.get("agent") as AgentRoleId | null;

  const { campaign, liveStatus, refreshStatus } = useDashboard();
  const [selectedAgent, setSelectedAgent] = useState<AgentRoleId>(
    initialParam && AGENT_ROLES[initialParam] ? initialParam : "master"
  );

  useEffect(() => {
    if (initialParam && AGENT_ROLES[initialParam]) {
      setSelectedAgent(initialParam);
    }
  }, [initialParam]);

  const masterBusy = (liveStatus?.activePlanCount || 0) > 0;

  return (
    <div className="h-full p-4 lg:p-5">
      <div className="flex h-full min-h-[calc(100vh-6.25rem)] gap-4">
        {/* Left Vertical Agent Selector Rail */}
        <div className="w-16 sm:w-56 shrink-0 flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-2xs overflow-y-auto">
          {/* Highlighted Master Agent Coordinator Card */}
          <button
            type="button"
            onClick={() => setSelectedAgent("master")}
            className={`w-full flex items-center gap-2.5 rounded-xl p-2.5 text-left transition cursor-pointer ${
              selectedAgent === "master"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
                : "bg-blue-50/70 text-slate-900 hover:bg-blue-100/70 border border-blue-200/70"
            }`}
          >
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-white/90 border border-white/40 flex items-center justify-center text-lg">
              🧠
              <span
                className={`absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full ${
                  masterBusy ? "bg-emerald-400 animate-ping" : "bg-emerald-500"
                }`}
              />
            </div>
            <div className="hidden sm:block min-w-0">
              <div className="text-xs font-extrabold truncate">Master Agent</div>
              <div
                className={`text-[10px] truncate ${
                  selectedAgent === "master" ? "text-blue-100" : "text-blue-700"
                }`}
              >
                {masterBusy ? "Coordinating plan..." : "Team Coordinator"}
              </div>
            </div>
          </button>

          <div className="px-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden sm:block">
            Specialist Agents
          </div>

          {/* 4 Worker Agents */}
          <div className="space-y-1.5">
            {WORKER_ORDER.map((workerId: WorkerRoleId) => {
              const role = AGENT_ROLES[workerId];
              const st = liveStatus?.agents?.[workerId]?.status || "idle";
              const isSelected = selectedAgent === workerId;

              return (
                <button
                  key={workerId}
                  type="button"
                  onClick={() => setSelectedAgent(workerId)}
                  className={`w-full flex items-center gap-2.5 rounded-xl p-2 text-left transition cursor-pointer ${
                    isSelected
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-700 hover:bg-slate-100/80"
                  }`}
                >
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img
                      src={role.avatar}
                      alt={role.name}
                      className="h-full w-full object-cover object-top"
                    />
                    <span
                      className={`absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full ring-1 ring-white ${
                        st === "running"
                          ? "bg-emerald-500 animate-ping"
                          : st === "done"
                          ? "bg-emerald-500"
                          : st === "failed"
                          ? "bg-red-500"
                          : "bg-slate-400"
                      }`}
                    />
                  </div>
                  <div className="hidden sm:block min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold truncate">
                        {role.emoji} {role.shortName}
                      </span>
                      {st === "running" && (
                        <span className="text-[9px] font-bold text-emerald-400">
                          LIVE
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[10px] truncate ${
                        isSelected ? "text-slate-300" : "text-slate-400"
                      }`}
                    >
                      {liveStatus?.agents?.[workerId]?.currentStep ||
                        role.tagline}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center Active Agent Panel */}
        <div className="flex-1 min-w-0">
          <AgentPanel
            agentId={selectedAgent}
            campaignId={campaign.id}
            liveStatus={liveStatus}
            onStatusRefresh={refreshStatus}
          />
        </div>

        {/* Right Synchronized Interactive Office Preview */}
        <div className="hidden xl:block xl:w-[44%] shrink-0">
          <AgentOffice
            officeKey={campaign.officeImage}
            selectedAgentId={selectedAgent}
            onSelectAgent={(id) => setSelectedAgent(id)}
            liveStatus={liveStatus}
          />
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading AI Agent Team...
        </div>
      }
    >
      <AgentsWorkspaceInner />
    </Suspense>
  );
}

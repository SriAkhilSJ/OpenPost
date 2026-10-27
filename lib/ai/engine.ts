import "server-only";
import OpenAI from "openai";
import { Agent, run, setDefaultOpenAIClient } from "@openai/agents";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agentSettings, userIntegrations } from "@/db/schema";
import { AGENT_ROLES, type AgentRoleId } from "@/lib/agent-roles";
import { decryptSecret } from "@/lib/crypto/secrets";
import { buildBriefPromptBlock } from "@/lib/campaign-brief";

export interface ResolvedAiClient {
  client: OpenAI;
  model: string;
  provider: "openai" | "gemini";
  geminiKey?: string;
}

export async function resolveAiClientForUser(
  userId: string
): Promise<ResolvedAiClient | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userIntegrations)
    .where(eq(userIntegrations.userId, userId));

  let userOpenAiKey: string | undefined;
  let userGeminiKey: string | undefined;
  for (const r of rows) {
    try {
      if (r.provider === "openai") userOpenAiKey = decryptSecret(r.apiKeyEncrypted);
      if (r.provider === "gemini") userGeminiKey = decryptSecret(r.apiKeyEncrypted);
    } catch {
      continue;
    }
  }

  const openAiKey = userOpenAiKey || process.env.OPENAI_API_KEY?.trim();
  const geminiKey = userGeminiKey || process.env.GEMINI_API_KEY?.trim();

  if (openAiKey) {
    const client = new OpenAI({
      apiKey: openAiKey,
      timeout: 90_000,
      maxRetries: 2,
    });
    return {
      client,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      provider: "openai",
      geminiKey,
    };
  }

  if (geminiKey) {
    const client = new OpenAI({
      apiKey: geminiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      timeout: 90_000,
      maxRetries: 2,
    });
    return {
      client,
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      provider: "gemini",
      geminiKey,
    };
  }

  return null;
}

export async function getAgentSystemInstructions(
  campaignId: number,
  agentId: AgentRoleId
): Promise<string> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(agentSettings)
    .where(eq(agentSettings.campaignId, campaignId));
  const found = rows.find((r) => r.agentId === agentId);
  const role = AGENT_ROLES[agentId];
  const brief = await buildBriefPromptBlock(campaignId);

  const workerBoundary =
    agentId !== "master"
      ? `\n\nIMPORTANT ROLE RULES:\n- You are ONLY the ${role.name}. Refuse work outside ${role.tagline}.\n- You only execute formal multi-step campaign tasks when assigned by the Master Agent. In direct user chat, answer domain questions helpfully and advise the user to message the Master Agent if they want a full multi-agent workflow planned and scheduled.`
      : "";

  return [
    role.defaultInstructions,
    found?.customInstructions ? `\nCustom Campaign Instructions:\n${found.customInstructions}` : "",
    brief ? `\n${brief}` : "",
    workerBoundary,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runAgentSdkChat(params: {
  userId: string;
  campaignId: number;
  agentId: AgentRoleId;
  history: Array<{ sender: string; text: string }>;
  userMessage: string;
}): Promise<string> {
  const instructions = await getAgentSystemInstructions(
    params.campaignId,
    params.agentId
  );
  const ai = await resolveAiClientForUser(params.userId);

  if (ai) {
    try {
      if (ai.provider === "openai") {
        setDefaultOpenAIClient(
          ai.client as unknown as Parameters<typeof setDefaultOpenAIClient>[0]
        );
        const sdkAgent = new Agent({
          name: AGENT_ROLES[params.agentId].name,
          instructions,
          model: ai.model,
        });
        const contextTranscript = params.history
          .slice(-8)
          .map((m) => `${m.sender === "user" ? "User" : "Agent"}: ${m.text}`)
          .join("\n");
        const fullInput = contextTranscript
          ? `Recent conversation:\n${contextTranscript}\n\nUser: ${params.userMessage}`
          : params.userMessage;
        const result = await run(sdkAgent, fullInput);
        if (result.finalOutput) return String(result.finalOutput);
      } else {
        const completion = await ai.client.chat.completions.create({
          model: ai.model,
          messages: [
            { role: "system", content: instructions },
            ...params.history.slice(-8).map((m) => ({
              role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
              content: m.text,
            })),
            { role: "user", content: params.userMessage },
          ],
        });
        const reply = completion.choices[0]?.message?.content;
        if (reply) return reply;
      }
    } catch {
      // Fall back cleanly to built-in specialist intelligence
    }
  }

  return buildSmartFallbackWorkerReply(params.agentId, params.userMessage);
}

function buildSmartFallbackWorkerReply(
  agentId: AgentRoleId,
  userMessage: string
): string {
  const lower = userMessage.toLowerCase();
  const role = AGENT_ROLES[agentId];

  // Enforce strict role boundaries just like Chapter 7 & 8
  if (
    agentId !== "master" &&
    /\b(create\s+\d+\s+post|schedule\s+them|full\s+campaign|plan\s+and\s+publish)\b/i.test(
      lower
    )
  ) {
    return `I'm the **${role.name}** (${role.tagline}). I only accept full campaign task assignments from our **Master Agent** so the whole team stays coordinated.\n\nSwitch to **Master Agent** on the left and send that exact request — the Master Agent will build the plan and assign my part automatically!`;
  }

  if (agentId === "research") {
    return `Here are high-performing social media research angles for **"${userMessage.slice(0, 80)}"**:\n\n1. **Scroll-Stopping Hook Pattern**: Open with a specific sensory or counter-intuitive statement in the first 1.5 seconds / 90 characters.\n2. **Content Pillars**: Behind-the-scenes craft, founder story / day-one reveal, and interactive community poll.\n3. **Recommended Hashtags**: \`#BrandLaunch\` \`#CreatorEconomy\` \`#BehindTheScenes\` \`#CommunityFirst\` \`#TrendingNow\`\n\nWant me to run a full research-to-scheduled-posts pipeline? Send the request to our **Master Agent**!`;
  }

  if (agentId === "creator") {
    return `As your **Creator Agent**, here's a punchy draft concept for **"${userMessage.slice(0, 80)}"**:\n\n**Hook:** Something special has been brewing behind closed doors...\n**Body:** Every detail was designed around your daily ritual. Drop by, take a first look, and tell us what you want to see next.\n**CTA:** Save this post & tag someone you're bringing on Day 1!\n\nTo have me generate AI studio images + save drafts and hand them to the **Scheduler Agent**, ask the **Master Agent** to kick off a campaign plan!`;
  }

  if (agentId === "scheduler") {
    return `As your **Scheduler Agent**, I manage optimal posting slots, timezone alignment, and **Blotato / OpenPost MCP** delivery.\n\n- **Peak Morning Window:** 8:00 AM – 9:30 AM local time\n- **Peak Evening Window:** 6:00 PM – 7:30 PM local time\n\nAsk the **Master Agent** when you're ready to schedule new posts onto your **Posts** & **Calendar** pages, or drag-and-drop any existing post directly in **Calendar**!`;
  }

  if (agentId === "analytics") {
    return `As your **Analytics Agent**, I track **Total Posts Published**, **Views**, **Publishing Success Rate**, and **Platform Breakdown** synced from connected **Blotato / OpenPost MCP** accounts.\n\nHead to the **Analytics** tab to click **Sync Now**, or ask the **Master Agent** to assign me a full campaign performance review!`;
  }

  return `I'm ready to coordinate your AI agent team! Tell me what content you'd like to research, create, and schedule — for example:\n\n> *"Create two Instagram posts for a coffee shop launch and schedule them for 8:00 AM on two consecutive mornings."*`;
}

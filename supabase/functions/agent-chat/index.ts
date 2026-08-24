import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatRequest {
  agent_id: number;
  messages: { role: "user" | "assistant"; content: string }[];
  stream?: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const body: ChatRequest = await req.json();
    const { agent_id, messages, stream } = body;

    if (!agent_id || !messages?.length) {
      return new Response(
        JSON.stringify({ error: "Missing agent_id or messages" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch agent config
    const { data: agent } = await supabaseClient
      .from("agents")
      .select("id, name, model_id, temperature, max_tokens")
      .eq("id", agent_id)
      .maybeSingle();

    if (!agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch consultant config
    const { data: config } = await supabaseClient
      .from("agent_consultant_configs")
      .select("*")
      .eq("agent_id", agent_id)
      .maybeSingle();

    // Build system prompt from config
    let systemPrompt = `你是${agent.name}，一位专业的AI顾问。`;

    if (config) {
      if (config.role_definition) {
        systemPrompt += `\n\n角色定位：${config.role_definition}`;
      }
      if (config.communication_style) {
        const styleMap: Record<string, string> = {
          professional: "请使用专业、权威的表达方式。",
          friendly: "请使用亲和、易懂的表达方式。",
          lively: "请使用活泼、有趣的表达方式。",
          concise: "请使用简洁、干练的表达方式。",
        };
        systemPrompt += `\n表达风格：${styleMap[config.communication_style] || config.communication_style}`;
      }
      if (config.address_term) {
        systemPrompt += `\n对用户的称呼：${config.address_term}`;
      }
      if (config.workflow_sop) {
        systemPrompt += `\n对话流程指引：\n${config.workflow_sop}`;
      }
      if (config.boundary_constraints) {
        systemPrompt += `\n边界约束：\n${config.boundary_constraints}`;
      }

      // Load C library content
      if (config.c_library_files?.length > 0) {
        const cIds = config.c_library_files.map((f: string) => parseInt(f, 10)).filter(Boolean);
        if (cIds.length > 0) {
          const { data: cLibs } = await supabaseClient
            .from("c_libraries")
            .select("content")
            .in("id", cIds);
          if (cLibs?.length) {
            systemPrompt += "\n\n能力参考：\n" + cLibs.map((c: any) => c.content).join("\n---\n");
          }
        }
      }

      // Load K library content
      if (config.k_library_files?.length > 0) {
        const kIds = config.k_library_files.map((f: string) => parseInt(f, 10)).filter(Boolean);
        if (kIds.length > 0) {
          const { data: kLibs } = await supabaseClient
            .from("k_libraries")
            .select("content")
            .in("id", kIds);
          if (kLibs?.length) {
            systemPrompt += "\n\n知识参考：\n" + kLibs.map((k: any) => k.content).join("\n---\n");
          }
        }
      }
    }

    // Fetch model config
    let modelCode = "deepseek-v3";
    let temperature = 0.7;
    let maxTokens = 2048;
    let provider = "deepseek";

    if (agent.model_id) {
      const { data: model } = await supabaseClient
        .from("ai_models")
        .select("*")
        .eq("id", agent.model_id)
        .maybeSingle();
      if (model?.is_enabled) {
        modelCode = model.model_code;
        temperature = parseFloat(model.default_temp || "0.7");
        maxTokens = model.default_max_tokens || 2048;
        provider = model.provider;
      }
    }

    const modelTemp = agent.temperature !== null && agent.temperature !== undefined
      ? parseFloat(String(agent.temperature))
      : temperature;
    const modelMaxTokens = agent.max_tokens || maxTokens;

    // Build messages for AI
    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Call AI based on provider
    let reply = "";
    let tokensUsed = 0;

    if (provider === "deepseek") {
      const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
      if (!apiKey) {
        throw new Error("DeepSeek API key not configured");
      }
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelCode,
          messages: aiMessages,
          temperature: modelTemp,
          max_tokens: modelMaxTokens,
        }),
      });
      const json = await resp.json();
      if (json.error) throw new Error(json.error.message || "DeepSeek API error");
      reply = json.choices?.[0]?.message?.content || "";
      tokensUsed = json.usage?.total_tokens || 0;
    } else if (provider === "openai") {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) {
        throw new Error("OpenAI API key not configured");
      }
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelCode,
          messages: aiMessages,
          temperature: modelTemp,
          max_tokens: modelMaxTokens,
        }),
      });
      const json = await resp.json();
      if (json.error) throw new Error(json.error.message || "OpenAI API error");
      reply = json.choices?.[0]?.message?.content || "";
      tokensUsed = json.usage?.total_tokens || 0;
    } else if (provider === "anthropic") {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) {
        throw new Error("Anthropic API key not configured");
      }
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelCode,
          system: systemPrompt,
          messages: messages.map((m: any) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
          max_tokens: modelMaxTokens,
        }),
      });
      const json = await resp.json();
      if (json.error) throw new Error(json.error.message || "Anthropic API error");
      reply = json.content?.[0]?.text || "";
      tokensUsed = json.usage?.input_tokens + json.usage?.output_tokens || 0;
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Log call
    await supabaseClient.from("ai_call_logs").insert({
      tool_id: agent_id,
      user_id: (await supabaseClient.auth.getUser()).data.user?.id || null,
      input_text: messages[messages.length - 1]?.content?.slice(0, 500) || "",
      output_text: reply.slice(0, 500),
      tokens_used: tokensUsed,
    });

    return new Response(
      JSON.stringify({ reply, tokens_used: tokensUsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Agent chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

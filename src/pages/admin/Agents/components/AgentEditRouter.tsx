import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import ConsultantAgentForm from "@/pages/admin/Agents/components/ConsultantAgentForm";
import ToolAgentForm from "@/pages/admin/Agents/components/ToolAgentForm";

export default function AgentEditRouter() {
  const { id } = useParams<{ id: string }>();
  const [agentType, setAgentType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    supabase.from("agents").select("agent_type").eq("id", id).maybeSingle().then(({ data }) => {
      setAgentType(data?.agent_type || "tool");
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
      </div>
    );
  }

  if (agentType === "consultant") return <ConsultantAgentForm />;
  return <ToolAgentForm />;
}
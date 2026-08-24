import { useState, useEffect, useCallback } from "react";
import SectionRenderer, { SectionConfig } from "@/components/homepage/SectionRenderer";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSections = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (data) setSections(data as SectionConfig[]);
    } catch (_) {
      // fallback to empty
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <i className="ri-loader-4-line animate-spin text-3xl text-foreground-400"></i>
      </div>
    );
  }

  return (
    <div className="pt-16 pb-20 md:pb-0">
      {sections.map((section, idx) => (
        <SectionRenderer key={section.id || idx} section={section} />
      ))}
    </div>
  );
}
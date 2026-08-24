import { useState } from "react";

interface RichTextConfig {
  content?: string;
  backgroundColor?: string;
  padding?: string;
}

export function RichTextRenderer({ config, isPreview = false }: { config: RichTextConfig; isPreview?: boolean }) {
  const paddingMap: Record<string, string> = { small: "py-3 px-3", medium: "py-4 px-3", large: "py-6 px-4" };
  return (
    <section style={{ backgroundColor: config.backgroundColor || "#ffffff" }} className={`${isPreview ? paddingMap[config.padding || "medium"] : "py-6 px-4 md:py-10 md:px-6"} ${isPreview ? "" : "max-w-4xl mx-auto rounded-2xl my-6"}`}>
      {isPreview ? (
        <>
          <style>{`
            .rich-text-preview,
            .rich-text-preview * {
              max-width: 100% !important;
              word-break: break-word;
              overflow-wrap: break-word;
            }
            .rich-text-preview h1,
            .rich-text-preview h2,
            .rich-text-preview h3,
            .rich-text-preview h4 { font-size: 14px !important; line-height: 1.4 !important; margin: 8px 0 4px !important; font-weight: 600 !important; color: #1a1a1a !important; }
            .rich-text-preview h1 { font-size: 16px !important; }
            .rich-text-preview h2 { font-size: 15px !important; }
            .rich-text-preview h3 { font-size: 14px !important; }
            .rich-text-preview h4 { font-size: 13px !important; }
            .rich-text-preview p,
            .rich-text-preview span,
            .rich-text-preview div,
            .rich-text-preview li { font-size: 12px !important; line-height: 1.6 !important; margin: 3px 0 !important; color: #444 !important; }
            .rich-text-preview a { font-size: 12px !important; color: #e67e22 !important; text-decoration: underline !important; }
            .rich-text-preview ul,
            .rich-text-preview ol { padding-left: 18px !important; margin: 4px 0 !important; }
            .rich-text-preview li { margin: 1px 0 !important; }
            .rich-text-preview img { max-width: 100% !important; height: auto !important; display: block !important; margin: 6px auto !important; border-radius: 6px !important; }
            .rich-text-preview table { width: 100% !important; font-size: 10px !important; border-collapse: collapse !important; margin: 6px 0 !important; }
            .rich-text-preview table td,
            .rich-text-preview table th { padding: 4px 6px !important; border: 1px solid #e0e0e0 !important; font-size: 10px !important; line-height: 1.4 !important; }
            .rich-text-preview blockquote { border-left: 2px solid #e67e22 !important; padding: 4px 8px !important; margin: 6px 0 !important; font-size: 11px !important; color: #666 !important; background: #fafafa !important; }
            .rich-text-preview blockquote p,
            .rich-text-preview blockquote span { font-size: 11px !important; margin: 0 !important; }
            .rich-text-preview pre,
            .rich-text-preview code { font-size: 10px !important; background: #f5f5f5 !important; padding: 2px 4px !important; border-radius: 3px !important; white-space: pre-wrap !important; word-break: break-all !important; }
            .rich-text-preview hr { margin: 8px 0 !important; border: none !important; border-top: 1px solid #e0e0e0 !important; }
          `}</style>
          <div className="rich-text-preview" dangerouslySetInnerHTML={{ __html: config.content || "" }} />
        </>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: config.content || "" }} />
      )}
    </section>
  );
}

interface AnnouncementConfig {
  text?: string;
  backgroundColor?: string;
  icon?: string;
  closable?: boolean;
}

export function AnnouncementRenderer({ config, isPreview = false }: { config: AnnouncementConfig; isPreview?: boolean }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;

  return (
    <section style={{ backgroundColor: config.backgroundColor || "#fff8e1" }} className={`${isPreview ? "py-2 px-3" : "py-3 px-4 md:px-6"} flex items-center justify-center gap-2`}>
      <i className={`${config.icon || "ri-megaphone-line"} ${isPreview ? "text-xs" : "text-sm md:text-base"} text-foreground-700`}></i>
      <p className={`${isPreview ? "text-[10px]" : "text-xs md:text-sm"} text-foreground-700 flex-1 text-center`}>{config.text || ""}</p>
      {config.closable !== false && (
        <button onClick={() => setClosed(true)} className="w-6 h-6 flex items-center justify-center text-foreground-400 hover:text-foreground-600 transition-colors shrink-0">
          <i className="ri-close-line"></i>
        </button>
      )}
    </section>
  );
}
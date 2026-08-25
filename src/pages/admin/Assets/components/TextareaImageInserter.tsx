import { useState, useRef, useCallback } from "react";
import ImageUploader from "@/components/feature/ImageUploader";

interface TextareaImageInserterProps {
  value: string;
  onChange: (val: string) => void;
}

export default function TextareaImageInserter({
  value,
  onChange,
}: TextareaImageInserterProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [insertedImages, setInsertedImages] = useState<string[]>([]);

  const insertAtCursor = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = value.substring(0, start);
      const after = value.substring(end);
      const newValue = before + text + after;

      onChange(newValue);

      // Restore cursor position after re-render
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + text.length;
          textareaRef.current.selectionEnd = start + text.length;
          textareaRef.current.focus();
        }
      }, 0);
    },
    [value, onChange]
  );

  const handleInsertImage = (url: string) => {
    const imgTag = `\n<img src="${url}" alt="" class="w-full rounded-lg my-4" />\n`;
    insertAtCursor(imgTag);
    setInsertedImages((prev) => [...prev, url]);
  };

  const handleQuickUpload = (url: string) => {
    handleInsertImage(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <ImageUploader
            value=""
            onChange={handleQuickUpload}
            label=""
            placeholder="上传图片到内容中..."
          />
        </div>
      </div>

      {insertedImages.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-foreground-400">已插入图片：</span>
          {insertedImages.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className="relative group w-12 h-12 rounded-lg overflow-hidden border border-background-200/70 flex-shrink-0"
            >
              <img
                src={url}
                alt=""
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => insertAtCursor(`<img src="${url}" alt="" class="w-full rounded-lg my-4" />`)}
                className="absolute inset-0 bg-black/50 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
              >
                再插入
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm h-56 resize-none font-mono text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all"
        placeholder={`在此输入图文内容，支持 HTML 格式...\n\n点击上方上传图片，图片会自动插入到光标位置。\n\n示例：<h2>标题</h2>\n<p>正文段落</p>`}
      />

      <p className="text-xs text-foreground-400">
        <i className="ri-information-line mr-1"></i>
        支持 HTML 标签。点击图片上传后，会自动在当前光标位置插入图片标签。也可直接粘贴 URL。
      </p>
    </div>
  );
}
import { useState, useCallback } from 'react';
import { nowBeijing } from '@/lib/dateUtils';

interface SuggestModalProps {
  onClose: () => void;
}

function isBrowserMode() {
  return typeof window !== 'undefined' && !(window as any).electronAPI;
}

function getApiBase() {
  try {
    const stored = localStorage.getItem('lan_server_base');
    if (stored) return stored.replace(/\/+$/, '');
  } catch { /* ignore */ }
  return window.location.origin;
}

async function lanPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(getApiBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LAN API ${path} 返回 ${res.status}`);
  return res.json();
}

export default function SuggestModal({ onClose }: SuggestModalProps) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) {
      setError('请输入您的建议');
      return;
    }
    if (content.trim().length > 500) {
      setError('建议内容不能超过500字');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      // ── 局域网环境：走本地 API 保存到 SQLite ──
      if (isBrowserMode()) {
        const result = await lanPost('/api/public/suggestion', { suggestion: content.trim() });
        if (result.code === 0) {
          setSubmitted(true);
          setTimeout(() => {
            onClose();
          }, 1500);
          return;
        }
        throw new Error(result.msg || '提交失败');
      }

      // ── 外网环境：走 readdy 表单 ──
      const formData = new URLSearchParams();
      formData.append('suggestion', content.trim());
      formData.append('timestamp', nowBeijing());

      const res = await fetch('https://readdy.ai/api/form/d8g3i4v2sbn9gq0bf5b0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      if (res.ok) {
        setSubmitted(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError('提交失败，请稍后重试');
      }
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }, [content, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <i className="ri-lightbulb-line text-emerald-400 text-sm" />
            </div>
            <span className="text-base font-bold text-white">其他建议</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {submitted ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <i className="ri-check-line text-emerald-400 text-3xl" />
              </div>
              <p className="text-lg font-bold text-white mb-1">提交成功</p>
              <p className="text-sm text-slate-400">感谢您的建议，我们会认真考虑</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-400 mb-3">
                有什么想吃的菜品？或者对我们的菜品有什么建议？请在下方告诉我们：
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="例如：希望增加糖醋排骨、希望早餐有更多选择..."
                rows={5}
                maxLength={500}
                className="w-full text-sm bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 resize-none"
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs ${content.length > 500 ? 'text-red-400' : 'text-slate-500'}`}>
                  {content.length}/500
                </span>
                {error && <span className="text-xs text-red-400">{error}</span>}
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full mt-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin text-sm" />
                    提交中...
                  </>
                ) : (
                  <>
                    <i className="ri-send-plane-line text-sm" />
                    提交建议
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
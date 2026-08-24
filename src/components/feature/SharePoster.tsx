import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";

interface TemplateConfig {
  id: number;
  name: string;
  bgClass: string;
  deco1: string;
  deco2: string;
  cardBg: string;
  topText: string;
  subText: string;
  bottomText: string;
  accentText: string;
  priceText: string;
  btnRing: string;
}

const TEMPLATES: TemplateConfig[] = [
  {
    id: 1,
    name: "科技蓝",
    bgClass: "bg-gradient-to-br from-blue-500 to-blue-700",
    deco1: "bg-white/10",
    deco2: "bg-white/5",
    cardBg: "bg-white",
    topText: "text-white",
    subText: "text-white/70",
    bottomText: "text-white/80",
    accentText: "text-blue-600",
    priceText: "text-red-500",
    btnRing: "ring-blue-400",
  },
  {
    id: 2,
    name: "活力红",
    bgClass: "bg-gradient-to-br from-red-500 to-red-700",
    deco1: "bg-yellow-300/15",
    deco2: "bg-yellow-300/5",
    cardBg: "bg-white",
    topText: "text-white",
    subText: "text-white/70",
    bottomText: "text-white/80",
    accentText: "text-red-600",
    priceText: "text-red-500",
    btnRing: "ring-red-400",
  },
  {
    id: 3,
    name: "高端黑",
    bgClass: "bg-gradient-to-br from-slate-800 to-slate-950",
    deco1: "bg-amber-400/10",
    deco2: "bg-amber-400/5",
    cardBg: "bg-slate-700/60 backdrop-blur",
    topText: "text-white",
    subText: "text-white/60",
    bottomText: "text-white/70",
    accentText: "text-amber-400",
    priceText: "text-amber-400",
    btnRing: "ring-amber-400",
  },
  {
    id: 4,
    name: "暖橙",
    bgClass: "bg-gradient-to-br from-orange-400 to-orange-600",
    deco1: "bg-white/10",
    deco2: "bg-white/5",
    cardBg: "bg-white",
    topText: "text-white",
    subText: "text-white/70",
    bottomText: "text-white/80",
    accentText: "text-orange-600",
    priceText: "text-red-500",
    btnRing: "ring-orange-400",
  },
];

interface SharePosterProps {
  open: boolean;
  onClose: () => void;
  type: "course" | "product" | "distribution";
  itemId: number;
  title: string;
  coverImage: string;
  price: number;
  referralCode: string;
  userName: string;
  userAvatar?: string;
  registerReward: number;
  pointsRatio: number;
}

function buildItemUrl(
  type: "course" | "product" | "distribution",
  itemId: number,
  code: string,
): string {
  const basePath = __BASE_PATH__.split("/").filter(Boolean).join("/");
  const prefix = basePath ? `/${basePath}` : "";
  const path =
    type === "course" ? `/courses/${itemId}` : type === "product" ? `/shop/${itemId}` : "";
  return `${window.location.origin}${prefix}${path}?ref=${code}`;
}

export default function SharePoster({
  open,
  onClose,
  type,
  itemId,
  title,
  coverImage,
  price,
  referralCode,
  userName,
  userAvatar,
  registerReward,
  pointsRatio,
}: SharePosterProps) {
  const [templateIdx, setTemplateIdx] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const tpl = TEMPLATES[templateIdx];

  const generateQR = useCallback(async () => {
    if (!open || !referralCode) return;
    setGenerating(true);
    try {
      const url = buildItemUrl(type, itemId, referralCode);
      const dataUrl = await QRCode.toDataURL(url, {
        width: 180,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl("");
    } finally {
      setGenerating(false);
    }
  }, [open, type, itemId, referralCode]);

  useEffect(() => {
    if (open) {
      generateQR();
      setTemplateIdx(0);
      setSavedHint(false);
    }
  }, [open, generateQR]);

  const handleSaveHint = () => {
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 3000);
  };

  if (!open) return null;

  const actionText =
    type === "course" ? "一起学习" : type === "product" ? "一起购买" : "一起加入";
  const rewardLabel =
    registerReward > 0
      ? `好友注册各得 ${registerReward} 积分`
      : "";
  const buyLabel =
    pointsRatio > 0 ? `· 购买再返 ${pointsRatio}% 积分` : "";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-end sm:justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-md max-h-[90vh]">
        {/* Close */}
        <div className="flex items-center justify-end w-full px-4 mb-2">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Poster Card */}
        <div className="px-4 pb-3 overflow-y-auto w-full flex justify-center">
          <div
            ref={posterRef}
            className="relative w-[320px] h-[540px] rounded-2xl overflow-hidden shadow-2xl select-none"
            onClick={handleSaveHint}
          >
            {/* Background */}
            <div className={`absolute inset-0 ${tpl.bgClass}`} />
            <div className={`absolute -top-10 -right-10 w-48 h-48 rounded-full ${tpl.deco1}`} />
            <div className={`absolute -bottom-16 -left-16 w-56 h-56 rounded-full ${tpl.deco2}`} />

            {/* Content */}
            <div className="relative z-10 h-full flex flex-col p-5">
              {/* Top: sharer info */}
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-white/20 overflow-hidden flex items-center justify-center shrink-0">
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={userName}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <i className="ri-user-fill text-lg text-white/80" />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-bold ${tpl.topText}`}>{userName}</p>
                  <p className={`text-xs mt-0.5 ${tpl.subText}`}>邀请你{actionText}</p>
                </div>
              </div>

              {/* Middle: product card */}
              <div className={`mt-4 flex-1 ${tpl.cardBg} rounded-xl p-3 flex flex-col overflow-hidden`}>
                {/* Cover image */}
                <div className="w-full h-44 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  <img
                    src={coverImage}
                    alt={title}
                    className="w-full h-full object-cover object-top"
                    crossOrigin="anonymous"
                  />
                </div>

                {/* Title */}
                <div className="mt-3 min-h-0">
                  <h3 className={`text-sm font-bold leading-snug line-clamp-2 ${tpl.cardBg.includes("bg-white") ? "text-gray-900" : "text-white"}`}>
                    {title}
                  </h3>
                </div>

                {/* Price / Reward */}
                {type === "distribution" ? (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className={`text-base font-black ${tpl.accentText}`}>
                      {registerReward > 0 ? `注册送 ${registerReward} 积分` : "注册有礼"}
                    </span>
                    {pointsRatio > 0 && (
                      <span className={`text-xs ${tpl.cardBg.includes("bg-white") ? "text-gray-500" : "text-white/60"}`}>
                        购买再返 {pointsRatio}% 积分
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className={`text-lg font-black ${tpl.priceText}`}>
                      {price === 0 ? "免费" : `¥${price}`}
                    </span>
                    {price > 0 && (
                      <span className={`text-xs ${tpl.cardBg.includes("bg-white") ? "text-gray-500" : "text-white/60"}`}>
                        起
                      </span>
                    )}
                  </div>
                )}

                {/* Reward hint */}
                {(type !== "distribution" && (rewardLabel || buyLabel)) && (
                  <div className="mt-auto pt-2">
                    <p className={`text-[11px] leading-relaxed ${tpl.cardBg.includes("bg-white") ? "text-gray-500" : "text-white/70"}`}>
                      <i className="ri-gift-line mr-1" />
                      {rewardLabel}
                      {buyLabel}
                    </p>
                  </div>
                )}
              </div>

              {/* Bottom: brand + QR */}
              <div className="mt-4 flex items-end justify-between">
                <div className="flex-1 min-w-0">
                  <p className={`text-base font-bold ${tpl.topText}`}>引力场 Nuclechain</p>
                  <p className={`text-xs mt-1 ${tpl.bottomText}`}>长按扫码查看详情</p>
                  <p className={`text-[10px] mt-1 ${tpl.subText}`}>小鹅通提供技术支持</p>
                </div>
                <div className="w-20 h-20 rounded-lg bg-white p-1.5 shrink-0 ml-3 shadow-lg">
                  {generating || !qrDataUrl ? (
                    <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center">
                      <i className="ri-loader-4-line animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <img src={qrDataUrl} alt="二维码" className="w-full h-full" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hint text */}
        <div className="px-4 py-2 text-center">
          <p className="text-sm text-white/90 font-medium">
            <i className="ri-image-line mr-1" />
            长按上方海报保存并分享
          </p>
        </div>

        {/* Template selector */}
        <div className="w-full bg-white rounded-t-2xl px-4 pt-4 pb-6 mt-2">
          <p className="text-xs text-gray-500 mb-3 text-center">选择分享模板</p>
          <div className="flex items-center gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide">
            {TEMPLATES.map((t, idx) => (
              <button
                key={t.id}
                onClick={() => setTemplateIdx(idx)}
                className={`flex-shrink-0 relative w-16 h-24 rounded-lg overflow-hidden transition-all ${
                  idx === templateIdx
                    ? `ring-2 ring-offset-2 ${t.btnRing} scale-105`
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                <div className={`absolute inset-0 ${t.bgClass}`} />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <div className={`w-6 h-6 rounded-full ${t.deco1}`} />
                  <div className={`w-8 h-2 rounded ${t.cardBg}`} />
                </div>
                {idx === templateIdx && (
                  <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow">
                    <i className="ri-check-line text-xs text-gray-800" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {savedHint && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-lg bg-black/80 text-white text-sm">
          请长按海报保存到相册
        </div>
      )}
    </div>
  );
}
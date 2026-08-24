import { useState, useCallback, useEffect, useRef } from 'react';
import { nowBeijing } from '@/lib/dateUtils';
import {
  loadDisplayConfig,
  saveDisplayConfig,
  type DisplayConfig,
  type DisplayContent,
  type DisplayMenu,
  type DisplayScreen,
  type DisplaySettings,
  type MenuItem,
  type FeaturedDish,
} from '@/lib/displayStore';

// Deep equality check to avoid unnecessary re-renders when polling returns the same data
function isConfigEqual(a: DisplayConfig | null, b: DisplayConfig | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useDisplayConfig(enablePolling = false, screenId: string = 'default') {
  const [config, setConfig] = useState<DisplayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a ref to the latest config for async operations
  const configRef = useRef<DisplayConfig | null>(null);

  // 初始加载 - 只在挂载时执行一次，不依赖 reload
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const data = await loadDisplayConfig(screenId);
        if (!cancelled && !isConfigEqual(data, configRef.current)) {
          configRef.current = data;
          setConfig(data);
        }
      } catch (e) {
        console.error('[DisplayConfig] initial load failed:', e);
        if (!cancelled) {
          setConfig(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, []); // 空数组，只在挂载时运行

  // reload 函数 - 供外部调用和轮询使用
  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await loadDisplayConfig(screenId);
      // Only trigger re-render if data actually changed
      if (!isConfigEqual(data, configRef.current)) {
        configRef.current = data;
        setConfig(data);
      }
    } catch (e) {
      console.error('[DisplayConfig] reload failed:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [screenId]);

  // 大屏展示模式：定时轮询同步（静默刷新，不触发 loading）
  // 注意：Electron 会拦截 < 5000ms 的 setInterval（防闪屏），所以用 6000ms
  useEffect(() => {
    if (!enablePolling) return;
    intervalRef.current = setInterval(() => {
      reload(true);
    }, 6000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enablePolling, reload]);

  // Optimistic update helper: update local state immediately, then persist in background
  // 如果后台保存失败，自动回滚到旧数据
  const applyUpdate = useCallback((updater: (prev: DisplayConfig) => DisplayConfig) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      const snapshot = prev;
      configRef.current = next;

      saveDisplayConfig(next, screenId).catch((e) => {
        console.warn('[DisplayConfig] 后台保存失败，自动回滚:', e);
        configRef.current = snapshot;
        setConfig(snapshot);
      });

      return next;
    });
  }, [screenId]);

  const save = useCallback(async (updates: Partial<DisplayConfig>) => {
    applyUpdate((prev) => ({ ...prev, ...updates }));
  }, [applyUpdate]);

  // ─── 内容 ───
  const createContent = useCallback(async (item: Omit<DisplayContent, 'id' | 'updateTime'>) => {
    const now = nowBeijing().toISOString().replace('T', ' ').slice(0, 19);
    const newItem: DisplayContent = {
      ...item,
      id: `CT_${Date.now()}`,
      updateTime: now,
    };
    applyUpdate((prev) => ({
      ...prev,
      contents: [newItem, ...prev.contents],
    }));
    return newItem;
  }, [applyUpdate]);

  const editContent = useCallback(async (id: string, updates: Partial<DisplayContent>) => {
    const now = nowBeijing().toISOString().replace('T', ' ').slice(0, 19);
    applyUpdate((prev) => ({
      ...prev,
      contents: prev.contents.map((c) =>
        c.id === id ? { ...c, ...updates, updateTime: now } : c,
      ),
    }));
  }, [applyUpdate]);

  const removeContent = useCallback(async (id: string) => {
    applyUpdate((prev) => ({
      ...prev,
      contents: prev.contents.filter((c) => c.id !== id),
      settings: {
        ...prev.settings,
        activeContentIds: prev.settings.activeContentIds.filter((cid) => cid !== id),
      },
      screens: prev.screens.map((s) =>
        s.currentContentId === id ? { ...s, currentContentId: '' } : s,
      ),
    }));
  }, [applyUpdate]);

  const pushContent = useCallback(async (id: string, targetScreenIds?: string[]) => {
    const now = nowBeijing().toISOString().replace('T', ' ').slice(0, 19);
    applyUpdate((prev) => {
      const newContents = prev.contents.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, status: 'published' as const, publishTime: now, updateTime: now };
        if (targetScreenIds) updated.screens = targetScreenIds;
        return updated;
      });
      const newActiveIds = prev.settings.activeContentIds.includes(id)
        ? prev.settings.activeContentIds
        : [...prev.settings.activeContentIds, id];
      const newScreens = targetScreenIds
        ? prev.screens.map((s) =>
            targetScreenIds.includes(s.id)
              ? { ...s, currentContentId: id, lastPush: now }
              : s,
          )
        : prev.screens;
      return {
        ...prev,
        contents: newContents,
        settings: { ...prev.settings, activeContentIds: newActiveIds },
        screens: newScreens,
      };
    });
  }, [applyUpdate]);

  // ─── 菜单 ───
  const editMenu = useCallback(async (menu: Partial<DisplayMenu>) => {
    applyUpdate((prev) => ({
      ...prev,
      menu: { ...prev.menu, ...menu },
      settings: {
        ...prev.settings,
        activeMenuDate: menu.date || prev.menu.date,
      },
    }));
  }, [applyUpdate]);

  // ─── 屏幕 ───
  const createScreen = useCallback(async (screen: Omit<DisplayScreen, 'id'>) => {
    const newScreen: DisplayScreen = {
      ...screen,
      id: `LED_${Date.now()}`,
    };
    applyUpdate((prev) => ({
      ...prev,
      screens: [...prev.screens, newScreen],
    }));
    return newScreen;
  }, [applyUpdate]);

  const editScreen = useCallback(async (id: string, updates: Partial<DisplayScreen>) => {
    applyUpdate((prev) => ({
      ...prev,
      screens: prev.screens.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  }, [applyUpdate]);

  const removeScreen = useCallback(async (id: string) => {
    applyUpdate((prev) => ({
      ...prev,
      screens: prev.screens.filter((s) => s.id !== id),
    }));
  }, [applyUpdate]);

  // ─── 设置 ───
  const editSettings = useCallback(async (settings: Partial<DisplaySettings>) => {
    applyUpdate((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...settings },
    }));
  }, [applyUpdate]);

  const editTicker = useCallback(async (notices: string[]) => {
    applyUpdate((prev) => ({
      ...prev,
      settings: { ...prev.settings, tickerNotices: notices },
    }));
  }, [applyUpdate]);

  const editFoodSafety = useCallback(async (info: DisplaySettings['foodSafetyInfo']) => {
    applyUpdate((prev) => ({
      ...prev,
      settings: { ...prev.settings, foodSafetyInfo: info },
    }));
  }, [applyUpdate]);

  const editStaffInfo = useCallback(async (info: DisplaySettings['staffInfo']) => {
    applyUpdate((prev) => ({
      ...prev,
      settings: { ...prev.settings, staffInfo: info },
    }));
  }, [applyUpdate]);

  const editShowcaseImages = useCallback(async (images: string[]) => {
    applyUpdate((prev) => ({
      ...prev,
      settings: { ...prev.settings, showcaseImages: images },
    }));
  }, [applyUpdate]);

  const editFeaturedDishes = useCallback(async (dishes: FeaturedDish[]) => {
    applyUpdate((prev) => ({
      ...prev,
      settings: { ...prev.settings, featuredDishes: dishes },
    }));
  }, [applyUpdate]);

  const editNoticeContent = useCallback(async (contentId: string) => {
    applyUpdate((prev) => ({
      ...prev,
      settings: { ...prev.settings, noticeContentId: contentId },
    }));
  }, [applyUpdate]);

  // 推送并同步设为公示内容（原子操作，一次 Supabase 保存避免竞态）
  const pushAndSetNotice = useCallback(async (contentId: string, targetScreenIds?: string[]) => {
    const now = nowBeijing().toISOString().replace('T', ' ').slice(0, 19);
    applyUpdate((prev) => {
      const newContents = prev.contents.map((c) => {
        if (c.id !== contentId) return c;
        return { ...c, status: 'published' as const, publishTime: now, updateTime: now };
      });
      const newActiveIds = prev.settings.activeContentIds.includes(contentId)
        ? prev.settings.activeContentIds
        : [...prev.settings.activeContentIds, contentId];
      const newScreens = targetScreenIds
        ? prev.screens.map((s) =>
            targetScreenIds.includes(s.id)
              ? { ...s, currentContentId: contentId, lastPush: now }
              : s,
          )
        : prev.screens;
      return {
        ...prev,
        contents: newContents,
        screens: newScreens,
        settings: { ...prev.settings, activeContentIds: newActiveIds, noticeContentId: contentId },
      };
    });
  }, [applyUpdate]);

  return {
    config,
    loading,
    reload,
    save,
    createContent,
    editContent,
    removeContent,
    pushContent,
    editMenu,
    createScreen,
    editScreen,
    removeScreen,
    editSettings,
    editTicker,
    editFoodSafety,
    editStaffInfo,
    editShowcaseImages,
    editFeaturedDishes,
    editNoticeContent,
    pushAndSetNotice,
  };
}

export type { DisplayConfig, DisplayContent, DisplayMenu, DisplayScreen, DisplaySettings, MenuItem };
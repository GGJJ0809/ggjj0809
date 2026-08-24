import type { HikvisionDevice, HikvisionChannel } from '@/hooks/useHikvision';
import { supabase } from '@/lib/supabase';
import { nowBeijing } from '@/lib/dateUtils';

// ─── 局域网同步策略 ───────────────────────────────────────────────────────
// Electron 桌面端：supabase 被替换为 localDb（通过 IPC 操作本地 SQLite）
// 同一台机器上，管理端和大屏端共享同一个 canteen.db，IPC 读写即时生效。
// 跨机器场景：通过管理端 local-server 的 HTTP API 拉取配置（见 LAN_SERVER_BASE）。
// ──────────────────────────────────────────────────────────────────────────

// 管理端 local-server 基础地址（跨机器 LAN 同步用）
// 默认 localhost（同机场景），跨机器时改为管理端 IP
let lanServerBase = (() => {
  try { return localStorage.getItem('lan_server_base') || `http://localhost:${(typeof window !== 'undefined' && (window as any)._localServerPort) || 8081}`; } catch { return 'http://localhost:8081'; }
})();

/** 设置跨机器 LAN 同步的管理端地址，例如 http://192.168.1.100:8080 */
export function setLanServerBase(url: string) {
  lanServerBase = url;
  try { localStorage.setItem('lan_server_base', url); } catch { /* ignore */ }
}

/** 获取当前 LAN 管理端地址 */
export function getLanServerBase(): string {
  return lanServerBase;
}

// ─── 数据类型 ───────────────────────────────────────────────────────────────

export interface DisplayContent {
  id: string;
  title: string;
  type: string;
  status: 'published' | 'draft' | 'scheduled' | 'archived';
  body: string;
  preview: string;
  screens: string[];
  publishTime: string;
  updateTime: string;
  author: string;
}

export interface MenuItem {
  name: string;
  price: number;
  category: string;
  calories: number;
  tag: string;
}

export interface DisplayMenu {
  date: string;
  breakfast: MenuItem[];
  lunch: MenuItem[];
  dinner: MenuItem[];
}

export interface DisplayScreen {
  id: string;
  name: string;
  location: string;
  resolution: string;
  type: string;
  status: 'online' | 'offline' | 'warning';
  currentContentId: string;
  brightness: number;
  ip: string;
  lastPush: string;
  zones: string[];
}

export interface FeaturedDish {
  id: number;
  name: string;
  calories: number;
  category: string;
}

export interface DisplaySettings {
  activeContentIds: string[];
  activeMenuDate: string;
  tickerNotices: string[];
  foodSafetyInfo: {
    licenseNo: string;
    checkResult: string;
    sampleStatus: string;
    inspector: string;
  };
  staffInfo: {
    name: string;
    title: string;
    photoUrl: string;
  }[];
  todayDutyStaff: {
    name: string;
    title: string;
    photoUrl: string;
  }[];
  showcaseImages: string[];
  noticeContentId: string;
  featuredDishes: FeaturedDish[];
}

export interface DisplayConfig {
  contents: DisplayContent[];
  menu: DisplayMenu;
  screens: DisplayScreen[];
  settings: DisplaySettings;
}

// ─── 默认数据 ───────────────────────────────────────────────────────────────

const defaultMenu: DisplayMenu = {
  date: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
  breakfast: [
    { name: '豆腐脑', price: 3, category: '主食', calories: 80, tag: '清淡' },
    { name: '包子（鲜肉）', price: 2, category: '主食', calories: 220, tag: '现蒸' },
    { name: '小米粥', price: 2, category: '粥品', calories: 90, tag: '养胃' },
    { name: '煮鸡蛋', price: 1, category: '蛋品', calories: 75, tag: '高蛋白' },
    { name: '榨菜', price: 1, category: '小菜', calories: 20, tag: '开胃' },
  ],
  lunch: [
    { name: '红烧肉', price: 18, category: '荤菜', calories: 450, tag: '本餐特色' },
    { name: '鱼香肉丝', price: 16, category: '荤菜', calories: 320, tag: '经典' },
    { name: '番茄炒鸡蛋', price: 10, category: '家常菜', calories: 180, tag: '热门' },
    { name: '清炒西兰花', price: 8, category: '素菜', calories: 95, tag: '健康' },
    { name: '蒸米饭', price: 3, category: '主食', calories: 200, tag: '' },
    { name: '紫菜蛋花汤', price: 5, category: '汤品', calories: 60, tag: '免费' },
  ],
  dinner: [
    { name: '宫保鸡丁', price: 18, category: '荤菜', calories: 380, tag: '本餐特色' },
    { name: '清蒸鲈鱼', price: 22, category: '荤菜', calories: 280, tag: '新鲜' },
    { name: '清炒菠菜', price: 7, category: '素菜', calories: 70, tag: '健康' },
    { name: '冬瓜排骨汤', price: 8, category: '汤品', calories: 150, tag: '滋补' },
    { name: '蒸米饭', price: 3, category: '主食', calories: 200, tag: '' },
  ],
};

const typeMap: Record<string, string> = {
  '菜谱公告': '菜谱模板',
  '安全公示': '公示模板',
  '临时通知': '临时通知',
  '互动内容': '调查模板',
};

export function normalizeType(type: string): string {
  return typeMap[type] || type;
}

const defaultContents: DisplayContent[] = [
  {
    id: 'CT001',
    title: '本周菜谱公告',
    type: '菜谱模板',
    status: 'published',
    body: '本周（5月13日-19日）午餐菜谱如下：周一红烧肉、周二宫保鸡丁、周三清蒸鱼...',
    preview: '本周（5月13日-19日）午餐菜谱如下：周一红烧肉、周二宫保鸡丁、周三清蒸鱼...',
    screens: ['LED-大厅01', 'LED-入口01'],
    publishTime: '2026-05-13 08:00:00',
    updateTime: '2026-05-13 07:45:22',
    author: '张三',
  },
  {
    id: 'CT002',
    title: '食品安全公示栏',
    type: '公示模板',
    status: 'published',
    body: '本月食品安全检测结果：共抽检样品48批次，合格率100%，菌落总数等指标均符合国家标准...',
    preview: '本月食品安全检测结果：共抽检样品48批次，合格率100%，菌落总数等指标均符合国家标准...',
    screens: ['LED-大厅01', 'LED-大厅02', 'LED-入口01'],
    publishTime: '2026-05-01 00:00:00',
    updateTime: '2026-05-14 09:00:00',
    author: '管理员',
  },
  {
    id: 'CT003',
    title: '今日特别提示',
    type: '临时通知',
    status: 'published',
    body: '因供应商原因，今日晚餐时段的清蒸鱼更换为清蒸鲈鱼，营养价值相近，敬请谅解...',
    preview: '因供应商原因，今日晚餐时段的清蒸鱼更换为清蒸鲈鱼，营养价值相近，敬请谅解...',
    screens: ['LED-大厅02'],
    publishTime: '2026-05-14 11:30:00',
    updateTime: '2026-05-14 11:28:00',
    author: '李四',
  },
  {
    id: 'CT004',
    title: '食堂满意度调查',
    type: '调查模板',
    status: 'draft',
    body: '亲爱的就餐员工，为了提升食堂服务质量，请参与本次满意度调查...',
    preview: '亲爱的就餐员工，为了提升食堂服务质量，请参与本次满意度调查...',
    screens: [],
    publishTime: '',
    updateTime: '2026-05-14 14:22:00',
    author: '王五',
  },
];

const defaultScreens: DisplayScreen[] = [
  {
    id: 'LED-001',
    name: 'LED-大厅01',
    location: '就餐大厅-入口',
    resolution: '1920\u00d71080',
    type: 'LED显示屏',
    status: 'online',
    currentContentId: 'CT001',
    brightness: 80,
    ip: '192.168.1.101',
    lastPush: '2026-05-14 08:00:15',
    zones: ['菜谱区', '公告区', 'Logo区'],
  },
  {
    id: 'LED-002',
    name: 'LED-大厅02',
    location: '就餐大厅-中央',
    resolution: '3840\u00d72160',
    type: 'LED大屏',
    status: 'online',
    currentContentId: 'CT002',
    brightness: 75,
    ip: '192.168.1.102',
    lastPush: '2026-05-14 09:00:05',
    zones: ['主内容区', '滚动字幕区'],
  },
  {
    id: 'LED-003',
    name: 'LED-入口01',
    location: '食堂主入口',
    resolution: '1920\u00d71080',
    type: 'LED显示屏',
    status: 'online',
    currentContentId: 'CT001',
    brightness: 90,
    ip: '192.168.1.103',
    lastPush: '2026-05-14 08:00:18',
    zones: ['欢迎区', '公告区'],
  },
  {
    id: 'LED-004',
    name: 'LED-结算台01',
    location: '结算台上方',
    resolution: '1280\u00d7720',
    type: '液晶显示器',
    status: 'warning',
    currentContentId: '',
    brightness: 70,
    ip: '192.168.1.104',
    lastPush: '2026-05-14 07:55:01',
    zones: ['价格显示区'],
  },
  {
    id: 'LED-005',
    name: 'LED-后厨01',
    location: '后厨操作区',
    resolution: '1920\u00d71080',
    type: '防水显示屏',
    status: 'offline',
    currentContentId: '',
    brightness: 60,
    ip: '192.168.1.105',
    lastPush: '2026-05-13 18:00:00',
    zones: ['操作规范区', '提示区'],
  },
];

const defaultSettings: DisplaySettings = {
  activeContentIds: ['CT001', 'CT002', 'CT003'],
  activeMenuDate: defaultMenu.date,
  tickerNotices: [
    '【食品安全公示】本食堂已取得食品经营许可证，欢迎就餐员工监督',
    '【温馨提示】请按需取餐，珍惜粮食，节约每一粒米',
    '【营养健议】荤素搭配、粗细结合，每日摄入蔬菜不少于300g',
    '【卫生告知】本食堂今日所有食材均已通过检疫验收，请放心就餐',
    '【留样公示】今日午餐留样已存入留样柜CB-01，保存至5月16日',
    '【就餐须知】文明用餐，保持桌面清洁，用餐后请将餐盘放至指定位置',
    '【满意度调查】您对今日餐品满意吗？请扫码参与调查，感谢配合',
  ],
  foodSafetyInfo: {
    licenseNo: '食品经营许可证：JY13109001234567',
    checkResult: '本月检测合格率：100%',
    sampleStatus: '今日留样：已完成（12份）',
    inspector: '卫生检查员：张三、李四',
  },
  staffInfo: [
    { name: '王芳', title: '食堂管理员', photoUrl: '' },
    { name: '李明', title: '厨师长', photoUrl: '' },
    { name: '张敏', title: '面点师', photoUrl: '' },
    { name: '刘洋', title: '热菜厨师', photoUrl: '' },
    { name: '陈静', title: '凉菜厨师', photoUrl: '' },
    { name: '赵强', title: '配菜师', photoUrl: '' },
    { name: '孙丽', title: '服务员', photoUrl: '' },
    { name: '周杰', title: '服务员', photoUrl: '' },
    { name: '吴霞', title: '洗碗工', photoUrl: '' },
    { name: '郑华', title: '采购员', photoUrl: '' },
    { name: '杨帆', title: '仓库管理员', photoUrl: '' },
    { name: '黄磊', title: '营养顾问', photoUrl: '' },
    { name: '冯雪', title: '西点厨师', photoUrl: 'https://readdy.ai/api/search-image?query=professional%20Chinese%20female%20pastry%20chef%20in%20clean%20white%20chef%20uniform%20standing%20in%20modern%20kitchen%2C%20warm%20smile%2C%20natural%20lighting%2C%20soft%20bokeh%20background%2C%20professional%20portrait%20photography%2C%20friendly%20expression%2C%20clean%20white%20background%20with%20subtle%20warm%20tones%2C%20editorial%20style%20food%20industry%20portrait&width=400&height=400&seq=staff-fengxue-01&orientation=squarish' },
    { name: '蒋涛', title: '蒸菜厨师', photoUrl: 'https://readdy.ai/api/search-image?query=professional%20Chinese%20male%20chef%20specializing%20in%20steamed%20dishes%2C%20wearing%20white%20chef%20hat%20and%20white%20uniform%2C%20confident%20expression%2C%20modern%20commercial%20kitchen%20background%20slightly%20blurred%2C%20warm%20side%20lighting%2C%20professional%20culinary%20portrait%2C%20clean%20composition%2C%20food%20industry%20headshot&width=400&height=400&seq=staff-jiangtao-02&orientation=squarish' },
    { name: '沈明', title: '切配主管', photoUrl: 'https://readdy.ai/api/search-image?query=middle%20aged%20Chinese%20male%20kitchen%20prep%20supervisor%20in%20white%20chef%20coat%2C%20standing%20confidently%20in%20commercial%20kitchen%2C%20bright%20natural%20light%20from%20window%2C%20professional%20portrait%20with%20warm%20tones%2C%20friendly%20but%20authoritative%20expression%2C%20clean%20background%2C%20food%20service%20industry%20photography&width=400&height=400&seq=staff-shenming-03&orientation=squarish' },
    { name: '韩雨', title: '食品安全员', photoUrl: 'https://readdy.ai/api/search-image?query=young%20Chinese%20female%20food%20safety%20inspector%20wearing%20white%20uniform%20and%20hygienic%20cap%2C%20holding%20a%20clipboard%2C%20clean%20modern%20food%20testing%20laboratory%20background%2C%20bright%20professional%20lighting%2C%20confident%20and%20detail%20oriented%20expression%2C%20healthcare%20and%20food%20industry%20portrait%2C%20clean%20minimal%20composition&width=400&height=400&seq=staff-hanyu-04&orientation=squarish' },
  ],
  todayDutyStaff: [],
  showcaseImages: [
    'https://readdy.ai/api/search-image?query=delicious%20Asian%20cafeteria%20food%20display%20with%20clean%20white%20plates%2C%20fresh%20steamed%20vegetables%2C%20braised%20pork%20and%20rice%20dishes%20on%20a%20stainless%20steel%20counter%2C%20warm%20overhead%20lighting%2C%20professional%20food%20photography%2C%20appetizing%20arrangement%2C%208k%20resolution%2C%20shallow%20depth%20of%20field&width=400&height=300&seq=show1&orientation=squarish',
    'https://readdy.ai/api/search-image?query=fresh%20kitchen%20ingredients%20on%20a%20cutting%20board%2C%20organic%20vegetables%20and%20herbs%2C%20tomatoes%2C%20cucumbers%2C%20carrots%2C%20chef%20hands%20preparing%20healthy%20meal%2C%20bright%20natural%20lighting%2C%20clean%20modern%20kitchen%20environment%2C%20food%20photography%2C%20vivid%20colors&width=400&height=300&seq=show2&orientation=squarish',
    'https://readdy.ai/api/search-image?query=modern%20clean%20cafeteria%20dining%20hall%20with%20bright%20lights%2C%20white%20tables%20and%20chairs%2C%20people%20eating%20lunch%20happily%2C%20wide%20angle%20view%2C%20contemporary%20architecture%2C%20natural%20lighting%20from%20large%20windows%2C%20cheerful%20atmosphere%2C%20professional%20interior%20photography&width=400&height=300&seq=show3&orientation=squarish',
    'https://readdy.ai/api/search-image?query=closeup%20of%20fresh%20steamed%20buns%20and%20dumplings%20in%20bamboo%20steamer%20basket%2C%20Chinese%20breakfast%20food%2C%20warm%20steam%20rising%2C%20soft%20lighting%2C%20appetizing%20food%20photography%2C%20rustic%20wooden%20table%20background%2C%20traditional%20Asian%20cuisine%20presentation&width=400&height=300&seq=show4&orientation=squarish',
  ],
  noticeContentId: 'CT002',
  featuredDishes: [],
};

const defaultConfig: DisplayConfig = {
  contents: defaultContents,
  menu: defaultMenu,
  screens: defaultScreens,
  settings: defaultSettings,
};

// ─── 存储键 ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'display_config';
const getStorageKey = (screenId: string) => `${STORAGE_KEY}_${screenId}`;

function resolveConfigKey(screenId: string): string {
  return screenId === 'default' ? 'display_config' : `display_config_${screenId}`;
}

export async function loadDisplayConfig(screenId: string = 'default'): Promise<DisplayConfig> {
  const configKey = resolveConfigKey(screenId);

  // 1. 通过 supabase 读取（Electron → 本地 IPC SQLite；浏览器 → 云端 Supabase）
  try {
    const { data } = await supabase
      .from('display_configs')
      .select('config_data')
      .eq('config_key', configKey)
      .maybeSingle();
    if (data?.config_data) {
      const parsed = mergeWithDefaults(data.config_data as any);
      localStorage.setItem(getStorageKey(screenId), JSON.stringify(parsed));
      return parsed;
    }
  } catch (e) {
    console.warn('[Display Config] 本地 DB 读失败:', e);
  }

  // 2. 跨机器 LAN：从管理端 local-server HTTP API 拉取
  try {
    const res = await fetch(`${lanServerBase}/api/display-config?key=${encodeURIComponent(configKey)}`);
    if (res.ok) {
      const json = await res.json();
      if (json?.data?.config_data) {
        const parsed = mergeWithDefaults(json.data.config_data);
        localStorage.setItem(getStorageKey(screenId), JSON.stringify(parsed));
        return parsed;
      }
    }
  } catch (e) {
    // LAN 不可达（同机或管理端未启动），静默跳过
  }

  // 3. 兜底 localStorage
  try {
    const raw = localStorage.getItem(getStorageKey(screenId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return mergeWithDefaults(parsed);
    }
  } catch {
    // ignore
  }

  return { ...defaultConfig };
}

export async function saveDisplayConfig(config: DisplayConfig, screenId: string = 'default'): Promise<void> {
  const configKey = resolveConfigKey(screenId);

  // 1. 保存到本地 DB（Electron → IPC SQLite）
  try {
    const { data: existing } = await supabase
      .from('display_configs')
      .select('id')
      .eq('config_key', configKey)
      .maybeSingle();

    if (existing) {
      await supabase.from('display_configs').update({
        config_data: config,
        updated_at: nowBeijing(),
      }).eq('config_key', configKey);
    } else {
      await supabase.from('display_configs').insert({
        config_key: configKey,
        config_data: config,
        updated_at: nowBeijing(),
      });
    }
  } catch (e) {
    console.warn('[Display Config] 本地 DB 写失败:', e);
  }

  // 2. 同步到管理端 local-server（跨机器场景，管理端会写入自己的 SQLite）
  try {
    await fetch(`${lanServerBase}/api/display-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config_key: configKey, config_data: config }),
    });
  } catch (e) {
    // LAN 不可达，静默跳过
  }

  // 3. 本地兜底
  localStorage.setItem(getStorageKey(screenId), JSON.stringify(config));
}

function mergeWithDefaults(raw: any): DisplayConfig {
  return {
    contents: Array.isArray(raw.contents) ? raw.contents : defaultConfig.contents,
    menu: raw.menu ? { ...defaultConfig.menu, ...raw.menu } : defaultConfig.menu,
    screens: Array.isArray(raw.screens) ? raw.screens : defaultConfig.screens,
    settings: raw.settings ? { ...defaultConfig.settings, ...raw.settings } : defaultConfig.settings,
  };
}

// ─── 内容 CRUD ─────────────────────────────────────────────────────────────

export async function addContent(content: Omit<DisplayContent, 'id' & 'updateTime'>, screenId: string = 'default'): Promise<DisplayContent> {
  const config = await loadDisplayConfig(screenId);
  const now = nowBeijing();
  const newContent: DisplayContent = {
    ...content,
    id: `CT_${Date.now()}`,
    updateTime: now,
  };
  config.contents = [newContent, ...config.contents];
  await saveDisplayConfig(config, screenId);
  return newContent;
}

export async function updateContent(id: string, updates: Partial<DisplayContent>, screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  const now = nowBeijing();
  config.contents = config.contents.map((c) =>
    c.id === id ? { ...c, ...updates, updateTime: now } : c,
  );
  await saveDisplayConfig(config, screenId);
}

export async function deleteContent(id: string, screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.contents = config.contents.filter((c) => c.id !== id);
  // 从 active 列表移除
  config.settings.activeContentIds = config.settings.activeContentIds.filter((cid) => cid !== id);
  // 从屏幕引用中移除
  config.screens = config.screens.map((s) =>
    s.currentContentId === id ? { ...s, currentContentId: '' } : s,
  );
  await saveDisplayConfig(config, screenId);
}

export async function publishContent(id: string, targetScreenIds?: string[], screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  const now = nowBeijing();

  config.contents = config.contents.map((c) => {
    if (c.id !== id) return c;
    const updated = { ...c, status: 'published' as const, publishTime: now, updateTime: now };
    if (targetScreenIds) {
      updated.screens = targetScreenIds;
    }
    return updated;
  });

  // 加入 active 列表
  if (!config.settings.activeContentIds.includes(id)) {
    config.settings.activeContentIds.push(id);
  }

  // 更新屏幕引用
  if (targetScreenIds) {
    config.screens = config.screens.map((s) => {
      if (targetScreenIds.includes(s.id)) {
        return { ...s, currentContentId: id, lastPush: now };
      }
      return s;
    });
  }

  await saveDisplayConfig(config, screenId);
}

// ─── 菜单 CRUD ─────────────────────────────────────────────────────────────

export async function updateMenu(menu: Partial<DisplayMenu>, screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.menu = { ...config.menu, ...menu };
  config.settings.activeMenuDate = menu.date || config.menu.date;
  await saveDisplayConfig(config, screenId);
}

// ─── 屏幕 CRUD ─────────────────────────────────────────────────────────────

export async function addScreen(screen: Omit<DisplayScreen, 'id'>, screenId: string = 'default'): Promise<DisplayScreen> {
  const config = await loadDisplayConfig(screenId);
  const newScreen: DisplayScreen = {
    ...screen,
    id: `LED_${Date.now()}`,
  };
  config.screens.push(newScreen);
  await saveDisplayConfig(config, screenId);
  return newScreen;
}

export async function updateScreen(id: string, updates: Partial<DisplayScreen>, screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.screens = config.screens.map((s) => (s.id === id ? { ...s, ...updates } : s));
  await saveDisplayConfig(config, screenId);
}

export async function deleteScreen(id: string, screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.screens = config.screens.filter((s) => s.id !== id);
  await saveDisplayConfig(config, screenId);
}

// ─── 设置更新 ─────────────────────────────────────────────────────────────

export async function updateSettings(settings: Partial<DisplaySettings>, screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.settings = { ...config.settings, ...settings };
  await saveDisplayConfig(config, screenId);
}

export async function updateTicker(notices: string[], screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.settings.tickerNotices = notices;
  await saveDisplayConfig(config, screenId);
}

export async function updateFoodSafety(info: DisplaySettings['foodSafetyInfo'], screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.settings.foodSafetyInfo = info;
  await saveDisplayConfig(config, screenId);
}

export async function updateStaffInfo(info: DisplaySettings['staffInfo'], screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.settings.staffInfo = info;
  await saveDisplayConfig(config, screenId);
}

export async function updateTodayDutyStaff(info: DisplaySettings['todayDutyStaff'], screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.settings.todayDutyStaff = info;
  await saveDisplayConfig(config, screenId);
}

export async function updateShowcaseImages(images: string[], screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.settings.showcaseImages = images;
  await saveDisplayConfig(config, screenId);
}

export async function updateNoticeContent(contentId: string, screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.settings.noticeContentId = contentId;
  await saveDisplayConfig(config, screenId);
}

export async function updateFeaturedDishes(dishes: FeaturedDish[], screenId: string = 'default'): Promise<void> {
  const config = await loadDisplayConfig(screenId);
  config.settings.featuredDishes = dishes;
  await saveDisplayConfig(config, screenId);
}

// ─── 摄像头在线数（从 useHikvision 传入）────────────────────────────────────

export function getCameraOnlineCount(channels: HikvisionChannel[], devices: HikvisionDevice[]): {
  online: number;
  total: number;
} {
  const enabled = channels.filter((c) => c.enabled && c.rtspUrl);
  const enabledDevices = devices.filter((d) => d.enabled);
  const valid = enabled.map((ch) => {
    const dev = enabledDevices.find((d) => d.id === ch.deviceId);
    return dev ? { ch, dev } : null;
  }).filter(Boolean);
  return { online: valid.length, total: valid.length };
}
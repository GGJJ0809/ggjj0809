export interface ScaleConfig {
  baseUrl: string;
  merchantId: string;
  xToken: string;
  machineSn?: string;
  accessToken?: string;
}

export interface DeviceTokenResult {
  ok: boolean;
  status: number;
  token: string | null;
  rawBody: unknown;
  message: string;
}

export interface MaterialItem {
  materialId?: string;
  materialName?: string;
  name?: string;
  expectedWeight?: number;
  planWeight?: number;
  actualWeight?: number;
  realWeight?: number;
  unit?: string;
  categoryName?: string;
  category?: string;
  status?: string;
  supplier?: string;
  fetchMaterialId?: string;
}

export interface MaterialCategory {
  categoryName?: string;
  name?: string;
  materialList?: MaterialItem[];
  list?: MaterialItem[];
  items?: MaterialItem[];
}

export interface ScaleApiResponse {
  code?: number;
  status?: number;
  msg?: string;
  message?: string;
  data?: {
    list?: MaterialCategory[];
    categoryList?: MaterialCategory[];
    materialList?: MaterialItem[];
    records?: MaterialItem[];
    total?: number;
    [key: string]: unknown;
  };
  _raw?: unknown;
  [key: string]: unknown;
}

export interface ScaleOperatorItem {
  userId?: number;
  id?: number;
  userName?: string;
  name?: string;
  workNo?: string;
  work_no?: string;
  phone?: string;
  role?: string;
  status?: number;
  [key: string]: unknown;
}

// ─── 分页获取商家操作员信息 ──────────────────────────────────────────────────

export async function fetchOperatorList(
  config: ScaleConfig,
  params?: {
    current?: number;
    size?: number;
    ifCount?: number;
    userName?: string;
    status?: number;
  },
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = {
    current: params?.current ?? 1,
    size: params?.size ?? 20,
    ifCount: params?.ifCount ?? 1,
  };
  if (params?.userName) content.userName = params.userName;
  if (params?.status !== undefined) content.status = params.status;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/common/user-page-test`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    throw new Error(
      e instanceof Error
        ? `无法连接到服务器：${e.message}`
        : '无法连接到服务器'
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`认证失败 (${response.status})，请检查连接配置`);
    }
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

export function extractOperators(resp: ScaleApiResponse): ScaleOperatorItem[] {
  const d = resp?.data;
  if (!d) return [];

  const records = (d.records ?? d.list ?? d.items ?? []) as ScaleOperatorItem[];
  return records;
}

export function getOperatorName(o: ScaleOperatorItem): string {
  return o.userName ?? o.name ?? `操作员 #${o.userId ?? o.id ?? '?'}`;
}

export function getOperatorWorkNo(o: ScaleOperatorItem): string {
  return o.workNo ?? o.work_no ?? String(o.userId ?? o.id ?? '?');
}

// ─── 连接测试接口 ──────────────────────────────────────────────────────────────

export async function testScaleConnection(
  config: ScaleConfig
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const nonceStr = Math.random().toString(36).slice(2, 18).toUpperCase();
  const timestamp = String(Date.now());

  const params = new URLSearchParams({
    version: '1.0',
    nonceStr,
    timestamp,
  });

  const headers: Record<string, string> = {
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/common/user-page-test?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', headers });
  } catch (e: unknown) {
    throw new Error(
      e instanceof Error
        ? `无法连接到服务器：${e.message}`
        : '无法连接到服务器，请检查 Base URL 和网络'
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { ok: response.ok || response.status < 500, status: response.status, body };
}

// ─── 设备登录（OAuth） ────────────────────────────────────────────────────────

/**
 * 设备登录接口 - POST /api/v2/oauth/device/token
 * 用 Merchant-Id + X-Token + machine-sn 换取 access_token
 * 文档上说 content 是 Query 参数，这里同时尝试 query 和 body 两种方式
 */
export async function fetchDeviceToken(
  config: ScaleConfig
): Promise<DeviceTokenResult> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  if (!machineSn) {
    return {
      ok: false,
      status: 0,
      token: null,
      rawBody: null,
      message: '请先填写 Machine SN，设备登录需要设备序列号',
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
    'machine-sn': machineSn,
  };

  // 把 content 编码到 query string 上（按文档要求）
  const contentPayload = JSON.stringify({ machineSn });
  const params = new URLSearchParams({ content: contentPayload });
  const url = `${baseUrl.replace(/\/$/, '')}/api/v2/oauth/device/token?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
    });
  } catch (e: unknown) {
    return {
      ok: false,
      status: 0,
      token: null,
      rawBody: null,
      message: e instanceof Error
        ? `无法连接到服务器：${e.message}`
        : '无法连接到服务器',
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    try {
      body = await response.text();
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: false,
      status: response.status,
      token: null,
      rawBody: body,
      message: `登录失败 (HTTP ${response.status})：${detail}`,
    };
  }

  // 尝试从各种可能的字段名中提取 token
  let token: string | null = null;
  const b = body as Record<string, unknown> | undefined;
  if (b) {
    // 常见字段名
    token = (b.access_token ?? b.accessToken ?? b.token ?? b.data) as string | null;
    // 如果 data 是对象，再深入找
    if (!token && typeof b.data === 'object' && b.data !== null) {
      const d = b.data as Record<string, unknown>;
      token = (d.access_token ?? d.accessToken ?? d.token) as string | null;
    }
    // 如果 code === 0 / code === 200，取 data 里的 token
    if (!token && (b.code === 0 || b.code === '0' || b.code === 200 || b.code === '200')) {
      const d = b.data as Record<string, unknown> | undefined;
      if (d) {
        token = (d.access_token ?? d.accessToken ?? d.token ?? d.value) as string | null;
      }
    }
  }

  if (token && typeof token === 'string') {
    return {
      ok: true,
      status: response.status,
      token,
      rawBody: body,
      message: `登录成功！Token: ${token.slice(0, 12)}...`,
    };
  }

  // 没找到 token，返回原始响应让用户看看
  return {
    ok: false,
    status: response.status,
    token: null,
    rawBody: body,
    message: `服务器返回了 HTTP ${response.status}，但未识别到 token 字段。请查看原始响应。`,
  };
}

// ──────────────────────────────────────────────────────────────────────────────

function generateNonceStr(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function fetchMaterialCategoryList(
  config: ScaleConfig,
  fetchMaterialId: string
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };

  if (machineSn) {
    headers['machine-sn'] = machineSn;
  }

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: {
      fetchMaterialId,
    },
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/fetch-material/detail/category/list`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`接口路径不存在 (404)，请确认电子秤系统的领料单查询接口路径是否正确`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`认证失败 (${response.status})，请检查 Merchant-Id 和 X-Token`);
    }
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  // 保存原始响应供调试用
  json._raw = json;
  return json;
}

export function extractMaterials(resp: ScaleApiResponse): MaterialItem[] {
  const d = resp?.data;
  if (!d) return [];

  // 处理多种可能的数据结构
  const categoryList = d.list ?? d.categoryList ?? [];
  if (Array.isArray(categoryList) && categoryList.length > 0) {
    const items: MaterialItem[] = [];
    (categoryList as MaterialCategory[]).forEach((cat) => {
      const mList = cat.materialList ?? cat.list ?? cat.items ?? [];
      mList.forEach((m) => {
        items.push({ ...m, categoryName: m.categoryName ?? cat.categoryName ?? cat.name });
      });
    });
    if (items.length > 0) return items;
  }

  // 直接返回 materialList 或 records
  const direct = d.materialList ?? d.records;
  if (Array.isArray(direct)) return direct as MaterialItem[];

  return [];
}

// ─── 入库提交 ────────────────────────────────────────────────────────────────

export interface IntoDetailItem {
  goodsId?: string;
  goodsName: string;
  supplierId?: number;
  supplierName?: string;
  planNum?: number;
  num: number;
  unitName?: string;
  price?: number;
  amount?: number;
  remark?: string;
}

export interface IntoSubmitParams {
  intoId?: string;          // 入库单号（可选）
  warehouseId: number;      // 仓库id（必需）
  intoDate: string;         // 入库时间（必需）
  totalAmount: number;      // 总价（整数，无金额时传 0）
  totalNum?: number;        // 合计数量（可选）
  intoType: number;         // 入库类型（必需）
  canteenId?: number;
  fetchUserId?: number;     // 领取人 id（入库接口必填）
  detailList: IntoDetailItem[];
  supplierId?: number;
  remark?: string;
  status?: number;
  sourceType?: number;
}

export async function submitInboundAcceptance(
  config: ScaleConfig,
  params: IntoSubmitParams
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: {
      ...(params.intoId ? { intoId: params.intoId } : {}),
      warehouseId: params.warehouseId,
      intoDate: params.intoDate,
      totalAmount: params.totalAmount,
      totalNum: params.totalNum ?? params.detailList.reduce((s, d) => s + d.num, 0),
      intoType: params.intoType,
      status: params.status ?? 2,
      sourceType: params.sourceType ?? 2,
      interfaceType: 'DEVICE',
      remark: params.remark ?? '',
      canteenId: params.canteenId,
      fetchUserId: params.fetchUserId,
      supplierId: params.supplierId,
      detailList: params.detailList.map((d) => ({
        goodsId: d.goodsId,
        goodsName: d.goodsName,
        supplierId: d.supplierId,
        supplierName: d.supplierName,
        planNum: d.planNum ?? 0,
        num: d.num,
        unitName: d.unitName ?? 'kg',
        price: d.price ?? 0,
        amount: d.amount ?? 0,
        remark: d.remark ?? '',
      })),
    },
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/into/add/commit`;

  console.log('[InboundCheck-API-Submit] ━━━ 提交入库 ━━━');
  console.log('[InboundCheck-API-Submit] url=' + url);
  console.log('[InboundCheck-API-Submit] warehouseId=' + params.warehouseId + ', intoDate=' + params.intoDate + ', totalAmount=' + params.totalAmount + ', totalNum=' + (params.totalNum ?? params.detailList.reduce((s, d) => s + d.num, 0)));
  console.log('[InboundCheck-API-Submit] detailList=' + params.detailList.length + '项:');
  params.detailList.forEach((d, i) => console.log('[InboundCheck-API-Submit]   [' + i + '] goodsName=' + d.goodsName + ', num=' + d.num + ', unitName=' + d.unitName + ', price=' + d.price + ', amount=' + d.amount + ', supplierName=' + (d.supplierName || '(空)') + ', supplierId=' + (d.supplierId || '(空)')));

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知网络错误';
    console.error('[InboundCheck-API-Submit] ★★★ 网络请求失败: ' + errMsg);
    throw new Error(
      e instanceof Error ? `无法连接到服务器：${e.message}` : '无法连接到服务器'
    );
  }

  console.log('[InboundCheck-API-Submit] HTTP ' + response.status + ' ' + response.statusText);

  // 先读取响应体，无论成功失败都要解析
  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[InboundCheck-API-Submit] ★★★ 响应非JSON');
    throw new Error(`提交失败 (HTTP ${response.status})，服务器返回了非 JSON 响应`);
  }

  console.log('[InboundCheck-API-Submit] 响应 code=' + (json.code ?? json.status) + ', msg=' + (json.msg || json.message || '(空)'));

  if (!response.ok) {
    // 优先取接口返回的 msg 字段
    const apiMsg = (json as Record<string, unknown>)?.msg
      ?? (json as Record<string, unknown>)?.message;
    const detail = apiMsg ? String(apiMsg) : JSON.stringify(json);
    console.error('[InboundCheck-API-Submit] ★★★ 提交失败: ' + detail);
    throw new Error(`提交失败 (HTTP ${response.status})：${detail}`);
  }

  console.log('[InboundCheck-API-Submit] ✓ 入库提交成功');
  return json;
}

// ─── 数据提取工具 ────────────────────────────────────────────────────────────

export function getMaterialName(m: MaterialItem): string {
  return m.materialName ?? m.name ?? '未知食材';
}

export function getExpectedWeight(m: MaterialItem): number {
  return m.expectedWeight ?? m.planWeight ?? 0;
}

export function getActualWeight(m: MaterialItem): number {
  return m.actualWeight ?? m.realWeight ?? 0;
}

// ─── 仓库列表 ────────────────────────────────────────────────────────────────

export interface WarehouseItem {
  warehouseId?: number;
  id?: number;
  warehouseName?: string;
  name?: string;
  address?: string;
  status?: number;
  [key: string]: unknown;
}

export async function fetchWarehouseList(config: ScaleConfig): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: '',
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/warehouse/all-Android`;

  console.log('[InboundCheck-API-Warehouse] ━━━ 请求仓库列表 ━━━ url=' + url);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  console.log('[InboundCheck-API-Warehouse] HTTP ' + response.status);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`认证失败 (${response.status})，请检查 Merchant-Id 和 X-Token`);
    }
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  const extracted = extractWarehouses(json);
  console.log('[InboundCheck-API-Warehouse] code=' + (json.code ?? json.status) + ', warehouses=' + extracted.length);
  json._raw = json;
  return json;
}

export function extractWarehouses(resp: ScaleApiResponse): WarehouseItem[] {
  const d = resp?.data;
  if (!d) return [];
  // ★ 兼容两种响应格式：drpOk(直接数组) → data 就是数组；drpOk({ list: [...] }) → data 是对象
  if (Array.isArray(d)) return d as WarehouseItem[];
  const list = (d as Record<string, unknown>).list ?? (d as Record<string, unknown>).records ?? (d as Record<string, unknown>).warehouseList ?? [];
  if (Array.isArray(list)) return list as WarehouseItem[];
  return [];
}

export function getWarehouseName(w: WarehouseItem): string {
  return w.warehouseName ?? w.name ?? `仓库 #${w.warehouseId ?? w.id ?? '?'}`;
}

export function getWarehouseId(w: WarehouseItem): number | undefined {
  const id = w.warehouseId ?? w.id;
  return id != null ? Number(id) : undefined;
}

// ─── 单位列表 ────────────────────────────────────────────────────────────────

export interface UnitItem {
  unitId?: number;
  id?: number;
  unitName?: string;
  name?: string;
  weighType?: number;
  [key: string]: unknown;
}

export async function fetchUnitList(
  config: ScaleConfig,
  weighType?: number,
  areaId?: number,
  areaAuth?: number[],
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = {};
  if (weighType !== undefined) content.weighType = weighType;
  if (areaId !== undefined) content.areaId = areaId;
  if (areaAuth !== undefined) content.areaAuth = areaAuth;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/unit/all`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

export function extractUnits(resp: ScaleApiResponse): UnitItem[] {
  const d = resp?.data;
  if (!d) return [];

  const list = d.list ?? d.records ?? d.unitList ?? [];
  if (Array.isArray(list)) return list as UnitItem[];
  return [];
}

export function getUnitName(u: UnitItem): string {
  return u.unitName ?? u.name ?? `单位 #${u.unitId ?? u.id ?? '?'}`;
}

// ─── 类别树 ──────────────────────────────────────────────────────────────────

export interface CategoryTreeNode {
  categoryId?: number;
  id?: number;
  categoryName?: string;
  name?: string;
  parentId?: number;
  level?: number;
  children?: CategoryTreeNode[];
  [key: string]: unknown;
}

export async function fetchCategoryTree(
  config: ScaleConfig,
  options?: {
    tenantId?: number;
    categoryType?: number;
    categoryTypes?: number[];
    areaId?: number;
    areaAuth?: number[];
    ifNarrow?: number;
  },
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = {};
  if (options?.tenantId !== undefined) content.tenantId = options.tenantId;
  if (options?.categoryType !== undefined) content.categoryType = options.categoryType;
  if (options?.categoryTypes !== undefined) content.categoryTypes = options.categoryTypes;
  if (options?.areaId !== undefined) content.areaId = options.areaId;
  if (options?.areaAuth !== undefined) content.areaAuth = options.areaAuth;
  if (options?.ifNarrow !== undefined) content.ifNarrow = options.ifNarrow;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/category-tree`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

export function extractCategoryTree(resp: ScaleApiResponse): CategoryTreeNode[] {
  const d = resp?.data;
  if (!d) return [];

  const list = d.list ?? d.tree ?? d.categoryTree ?? d.categories ?? [];
  if (Array.isArray(list)) return list as CategoryTreeNode[];
  return [];
}

export function getCategoryName(n: CategoryTreeNode): string {
  return n.categoryName ?? n.name ?? `分类 #${n.categoryId ?? n.id ?? '?'}`;
}

// ─── 供应商列表 ──────────────────────────────────────────────────────────────

export interface DrpSupplierItem {
  supplierId?: number;
  id?: number;
  supplierName?: string;
  name?: string;
  contactName?: string;
  contactPhone?: string;
  [key: string]: unknown;
}

export async function fetchSupplierList(config: ScaleConfig): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: '',
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/supplier/all`;

  console.log('[InboundCheck-API-Supplier] ━━━ 请求供应商列表 ━━━ url=' + url);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  console.log('[InboundCheck-API-Supplier] HTTP ' + response.status);

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  const extracted = extractSuppliers(json);
  console.log('[InboundCheck-API-Supplier] code=' + (json.code ?? json.status) + ', suppliers=' + extracted.length);
  json._raw = json;
  return json;
}

export function extractSuppliers(resp: ScaleApiResponse): DrpSupplierItem[] {
  const d = resp?.data;
  if (!d) return [];
  // ★ 兼容两种响应格式
  if (Array.isArray(d)) return d as DrpSupplierItem[];
  const list = (d as Record<string, unknown>).list ?? (d as Record<string, unknown>).records ?? (d as Record<string, unknown>).supplierList ?? (d as Record<string, unknown>).suppliers ?? [];
  if (Array.isArray(list)) return list as DrpSupplierItem[];
  return [];
}

export function getSupplierName(s: DrpSupplierItem): string {
  return s.supplierName ?? s.name ?? `供应商 #${s.supplierId ?? s.id ?? '?'}`;
}

// ─── 货品检索（分页） ──────────────────────────────────────────────────────────

export interface MaterialSearchParams {
  current?: number;
  size?: number;
  ifCount?: number;
  materialName?: string;
  materialCode?: string;
  categoryIdList?: number[];
  barCode?: string;
  warehouseId?: number;
  warehouseType?: number;
  initial?: string;
  materialInfo?: string;
  materialType?: number;
  materialIdList?: number[];
}

export interface MaterialSearchItem {
  materialId?: number;
  materialName?: string;
  materialCode?: string;
  barCode?: string;
  categoryId?: number;
  categoryName?: string;
  unitId?: number;
  unitName?: string;
  unitPrice?: number;
  salesMode?: number;
  materialType?: number;
  status?: number;
  [key: string]: unknown;
}

export interface MaterialSearchResponse {
  records?: MaterialSearchItem[];
  total?: number;
  size?: number;
  current?: number;
  pages?: number;
}

export async function fetchMaterialPage(
  config: ScaleConfig,
  params: MaterialSearchParams,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = {
    current: params.current ?? 1,
    size: params.size ?? 20,
    ifCount: params.ifCount ?? 1,
  };
  if (params.materialName) content.materialName = params.materialName;
  if (params.materialCode) content.materialCode = params.materialCode;
  if (params.categoryIdList && params.categoryIdList.length > 0) content.categoryIdList = params.categoryIdList;
  if (params.barCode) content.barCode = params.barCode;
  if (params.warehouseId !== undefined) content.warehouseId = params.warehouseId;
  if (params.warehouseType !== undefined) content.warehouseType = params.warehouseType;
  if (params.initial) content.initial = params.initial;
  if (params.materialInfo) content.materialInfo = params.materialInfo;
  if (params.materialType !== undefined) content.materialType = params.materialType;
  if (params.materialIdList && params.materialIdList.length > 0) content.materialIdList = params.materialIdList;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/material/page`;

  console.log('[InboundCheck-API-MaterialSearch] ━━━ 请求货品搜索 ━━━');
  console.log('[InboundCheck-API-MaterialSearch] url=' + url + ', materialInfo=' + (content.materialInfo || '(空)') + ', size=' + content.size + ', current=' + content.current);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  console.log('[InboundCheck-API-MaterialSearch] HTTP ' + response.status + ' ' + response.statusText);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`认证失败 (${response.status})，请检查连接配置`);
    }
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[InboundCheck-API-MaterialSearch] JSON解析失败');
    throw new Error(`请求失败: HTTP ${response.status}，响应非JSON`);
  }
  console.log('[InboundCheck-API-MaterialSearch] code=' + (json.code ?? json.status) + ', records=' + (extractMaterialPage(json).records?.length ?? '?') + ', total=' + (extractMaterialPage(json).total ?? '?'));
  json._raw = json;
  return json;
}

export function extractMaterialPage(resp: ScaleApiResponse): MaterialSearchResponse {
  const d = resp?.data;
  if (!d) return { records: [], total: 0 };

  const records = (d.records ?? d.list ?? d.items ?? []) as MaterialSearchItem[];
  const total = (d.total ?? d.totalCount ?? d.count ?? records.length) as number;
  const size = (d.size ?? d.pageSize ?? 20) as number;
  const current = (d.current ?? d.page ?? 1) as number;

  return { records, total, size, current };
}

export function getMaterialSearchName(m: MaterialSearchItem): string {
  return m.materialName ?? `货品 #${m.materialId ?? m.materialCode ?? '?'}`;
}

// ─── 新增货品 ──────────────────────────────────────────────────────────────────

export interface AddMaterialParams {
  materialName: string;
  materialType: number;
  categoryId: number;
  salesMode: number;
  unitId: number;
  unitPrice?: number;
  barCode?: string;
}

export async function addMaterial(
  config: ScaleConfig,
  params: AddMaterialParams,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = {
    materialName: params.materialName,
    materialType: params.materialType,
    categoryId: params.categoryId,
    salesMode: params.salesMode,
    unitId: params.unitId,
  };
  if (params.unitPrice !== undefined) content.unitPrice = params.unitPrice;
  if (params.barCode) content.barCode = params.barCode;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/add/material`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

// ─── 前10个大类 ────────────────────────────────────────────────────────────────

export interface TopCategoryItem {
  categoryId?: number;
  id?: number;
  categoryName?: string;
  name?: string;
  [key: string]: unknown;
}

export async function fetchTopCategories(config: ScaleConfig): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: null,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/category/top-list`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

export function extractTopCategories(resp: ScaleApiResponse): TopCategoryItem[] {
  const d = resp?.data;
  if (!d) return [];

  const list = d.list ?? d.records ?? d.categories ?? [];
  if (Array.isArray(list)) return list as TopCategoryItem[];
  return [];
}

export function getTopCategoryName(c: TopCategoryItem): string {
  return c.categoryName ?? c.name ?? `分类 #${c.categoryId ?? c.id ?? '?'}`;
}

export function getTopCategoryId(c: TopCategoryItem): number | undefined {
  const id = c.categoryId ?? c.id;
  return id != null ? Number(id) : undefined;
}

// ─── AI 单货品注册 ───────────────────────────────────────────────────────────

export interface MaterialListBean {
  materialId?: number;
  materialName?: string;
  [key: string]: unknown;
}

export interface MaterialRegisterParams {
  businessId?: number;
  businessSubId?: number;
  operation?: 'NEW' | 'APPEND' | 'REMOVE';
  requestId: string;
  materialList?: MaterialListBean[];
}

export async function oneMaterialRegister(
  config: ScaleConfig,
  params: MaterialRegisterParams,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = { requestId: params.requestId };
  if (params.businessId !== undefined) content.businessId = params.businessId;
  if (params.businessSubId !== undefined) content.businessSubId = params.businessSubId;
  if (params.operation) content.operation = params.operation;
  if (params.materialList) content.materialList = params.materialList;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/ai/one-material-register`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

// ─── AI 批量注册 ────────────────────────────────────────────────────────────────

export async function batchRegister(
  config: ScaleConfig,
  params: MaterialRegisterParams,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = { requestId: params.requestId };
  if (params.businessId !== undefined) content.businessId = params.businessId;
  if (params.businessSubId !== undefined) content.businessSubId = params.businessSubId;
  if (params.operation) content.operation = params.operation;
  if (params.materialList) content.materialList = params.materialList;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/ai/batch-register`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

// ─── AI 保存图片并批量注册 ────────────────────────────────────────────────────

export async function batchSavePicThenRegister(
  config: ScaleConfig,
  params: MaterialRegisterParams,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = { requestId: params.requestId };
  if (params.businessId !== undefined) content.businessId = params.businessId;
  if (params.businessSubId !== undefined) content.businessSubId = params.businessSubId;
  if (params.operation) content.operation = params.operation;
  if (params.materialList) content.materialList = params.materialList;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/ai/batch-save-pic-then-register`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

// ─── AI 获取注册状态货品（分页）────────────────────────────────────────────────

export interface RegisterMaterialSearchParams {
  current?: number;
  size?: number;
  ifCount?: number;
  ifRegister?: number;
  materialInfo?: string;
  ifCollect?: number;
  initial?: string;
  categoryIdList?: number[];
  barCode?: string;
  areaId?: number;
  warehouseId?: number;
  modelVersion?: string;
  interfaceType?: 'APP' | 'WEB' | 'DEVICE' | 'HANDHELD_DEVICE';
}

export interface RegisterMaterialItem {
  materialId?: number;
  materialName?: string;
  materialCode?: string;
  barCode?: string;
  categoryId?: number;
  categoryName?: string;
  unitName?: string;
  ifRegister?: number;
  ifCollect?: number;
  modelVersion?: string;
  materialType?: number;
  [key: string]: unknown;
}

export async function fetchRegisterMaterials(
  config: ScaleConfig,
  params: RegisterMaterialSearchParams,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = {
    current: params.current ?? 1,
    size: params.size ?? 20,
    ifCount: params.ifCount ?? 1,
    interfaceType: params.interfaceType ?? 'WEB',
  };
  if (params.ifRegister !== undefined) content.ifRegister = params.ifRegister;
  if (params.materialInfo) content.materialInfo = params.materialInfo;
  if (params.ifCollect !== undefined) content.ifCollect = params.ifCollect;
  if (params.initial) content.initial = params.initial;
  if (params.categoryIdList && params.categoryIdList.length > 0) content.categoryIdList = params.categoryIdList;
  if (params.barCode) content.barCode = params.barCode;
  if (params.areaId !== undefined) content.areaId = params.areaId;
  if (params.warehouseId !== undefined) content.warehouseId = params.warehouseId;
  if (params.modelVersion) content.modelVersion = params.modelVersion;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/page/register-material`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知网络错误';
    console.error('[fetchRegisterMaterials] 网络请求失败: ' + errMsg);
    throw new Error(`查询注册货品失败：${errMsg}`);
  }

  if (!response.ok) {
    console.error('[fetchRegisterMaterials] HTTP error ' + response.status);
    throw new Error(`查询注册货品失败: HTTP ${response.status}`);
  }

  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[fetchRegisterMaterials] JSON 解析失败');
    throw new Error('查询注册货品失败：服务器返回了非 JSON 响应');
  }

  // ★ 检查业务码
  const bizCode = (json as Record<string, unknown>)?.code;
  if (bizCode !== undefined && bizCode !== 10000 && bizCode !== 0 && bizCode !== '10000' && bizCode !== '0') {
    const apiMsg = (json as Record<string, unknown>)?.msg ?? (json as Record<string, unknown>)?.message ?? '';
    console.error('[fetchRegisterMaterials] API 返回错误 code=' + bizCode + ' msg=' + apiMsg);
    throw new Error(`查询注册货品异常：${apiMsg || '未知错误(code=' + bizCode + ')'}`);
  }

  json._raw = json;
  return json;
}

export function extractRegisterMaterials(resp: ScaleApiResponse): RegisterMaterialItem[] {
  const d = resp?.data;
  if (!d) return [];

  const records = (d.records ?? d.list ?? d.items ?? []) as RegisterMaterialItem[];
  return records;
}

// ─── AI 获取货品照片 ──────────────────────────────────────────────────────────

export interface MaterialPicItem {
  picId?: number;
  materialId?: number;
  imageUrl?: string;
  url?: string;
  [key: string]: unknown;
}

export async function fetchMaterialPics(
  config: ScaleConfig,
  materialId: number,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: { materialId },
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/list/material-pic`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知网络错误';
    console.error('[fetchMaterialPics] 网络请求失败: ' + errMsg + ', url=' + url);
    throw new Error(`查询货品图片失败：${errMsg}`);
  }

  if (!response.ok) {
    console.error('[fetchMaterialPics] HTTP error ' + response.status + ' for materialId=' + materialId);
    throw new Error(`查询货品图片失败: HTTP ${response.status}`);
  }

  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[fetchMaterialPics] JSON 解析失败 for materialId=' + materialId);
    throw new Error('查询货品图片失败：服务器返回了非 JSON 响应');
  }

  // ★ 检查业务码：code 不为 10000 或 0 时视为失败
  const bizCode = (json as Record<string, unknown>)?.code;
  if (bizCode !== undefined && bizCode !== 10000 && bizCode !== 0 && bizCode !== '10000' && bizCode !== '0') {
    const apiMsg = (json as Record<string, unknown>)?.msg ?? (json as Record<string, unknown>)?.message ?? '';
    console.error('[fetchMaterialPics] API 返回错误 code=' + bizCode + ' msg=' + apiMsg + ' for materialId=' + materialId);
    throw new Error(`查询货品图片异常：${apiMsg || '未知错误(code=' + bizCode + ')'}`);
  }

  json._raw = json;
  return json;
}

export function extractMaterialPics(resp: ScaleApiResponse): MaterialPicItem[] {
  const d = resp?.data;
  if (!d) return [];

  const list = d.list ?? d.records ?? d.pics ?? [];
  if (Array.isArray(list)) return list as MaterialPicItem[];
  return [];
}

// ─── AI 保存货品照片 ──────────────────────────────────────────────────────────

export async function saveMaterialPics(
  config: ScaleConfig,
  materialId: number,
  imageUrlList: string[],
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: { materialId, imageUrlList },
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/save/material-pic`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知网络错误';
    console.error('[saveMaterialPics] 网络请求失败: ' + errMsg + ', materialId=' + materialId + ', urlCount=' + imageUrlList.length);
    throw new Error(`保存货品照片失败：${errMsg}`);
  }

  if (!response.ok) {
    console.error('[saveMaterialPics] HTTP error ' + response.status + ' for materialId=' + materialId);
    throw new Error(`保存货品照片失败: HTTP ${response.status}`);
  }

  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[saveMaterialPics] JSON 解析失败 for materialId=' + materialId);
    throw new Error('保存货品照片失败：服务器返回了非 JSON 响应');
  }

  // ★ 检查业务码
  const bizCode = (json as Record<string, unknown>)?.code;
  if (bizCode !== undefined && bizCode !== 10000 && bizCode !== 0 && bizCode !== '10000' && bizCode !== '0') {
    const apiMsg = (json as Record<string, unknown>)?.msg ?? (json as Record<string, unknown>)?.message ?? '';
    console.error('[saveMaterialPics] API 返回错误 code=' + bizCode + ' msg=' + apiMsg);
    throw new Error(`保存货品照片异常：${apiMsg || '未知错误(code=' + bizCode + ')'}`);
  }

  json._raw = json;
  return json;
}

// ─── AI 删除货品照片 ──────────────────────────────────────────────────────────

export async function deleteMaterialPics(
  config: ScaleConfig,
  materialId: number,
  options?: {
    imageUrlList?: string[];
    ifAllDelete?: number;
    ifDeleteModel?: number;
  },
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = { materialId };
  if (options?.imageUrlList) content.imageUrlList = options.imageUrlList;
  if (options?.ifAllDelete !== undefined) content.ifAllDelete = options.ifAllDelete;
  if (options?.ifDeleteModel !== undefined) content.ifDeleteModel = options.ifDeleteModel;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/delete/material-pic`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

// ─── AI 获取本次采集待注册货品 ─────────────────────────────────────────────────

export async function fetchThisWaitRegisterMaterials(
  config: ScaleConfig,
  materialInfo?: string,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = {};
  if (materialInfo) content.materialInfo = materialInfo;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/list/this/wait-register-material`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

// ─── AI 清空注册模型 ──────────────────────────────────────────────────────────

export async function cleanRegisterModel(
  config: ScaleConfig,
  params: { businessId?: number; requestId: string },
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = { requestId: params.requestId };
  if (params.businessId !== undefined) content.businessId = params.businessId;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/clean/register-model`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = await response.json() as ScaleApiResponse;
  json._raw = json;
  return json;
}

// ─── 设备入库记录同步 ──────────────────────────────────────────────────────────

export interface SyncedInboundRecord {
  syncedId: string;
  ingredient: string;
  supplier: string;
  expected: number;
  actual: number;
  unit: string;
  inspector: string;
  certificates: string[];
  deviation: number;
  status: string;
  recordTime: string;
  warehouseName?: string;
}

export interface FetchDeviceRecordsParams {
  deviceSn: string;
  deviceIp?: string;
  current?: number;
  size?: number;
  startTime?: string;
  endTime?: string;
}

function calcSyncDeviation(expected: number, actual: number): number {
  if (expected === 0) return 0;
  return parseFloat((((actual - expected) / expected) * 100).toFixed(1));
}

function calcSyncStatus(deviation: number): string {
  const abs = Math.abs(deviation);
  if (abs > 8) return 'fail';
  if (abs > 3) return 'warning';
  return 'pass';
}

/**
 * 从 DRP 系统同步指定设备的最新入库记录
 * 设备在本地局域网中，通过 DRP 接口拉取数据
 */
export async function fetchDeviceInboundRecords(
  config: ScaleConfig,
  params: FetchDeviceRecordsParams,
): Promise<{ records: SyncedInboundRecord[]; total: number }> {
  const { baseUrl, merchantId, xToken } = config;
  const { deviceSn, current = 1, size = 50, startTime, endTime } = params;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
    'machine-sn': deviceSn,
  };

  const content: Record<string, unknown> = {
    current,
    size,
    ifCount: 1,
    interfaceType: 'DEVICE',
  };
  if (startTime) content.startTime = startTime;
  if (endTime) content.endTime = endTime;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  // 尝试标准的入库记录分页查询接口
  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/into/page`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    throw new Error(
      e instanceof Error
        ? `无法连接 DRP 系统：${e.message}。请确认电子秤设备 (${deviceSn}) 在局域网内已联网`
        : `无法连接 DRP 系统。请确认电子秤设备已联网`
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `接口不存在 (404)。DRP 系统可能不支持入库记录分页查询，请联系管理员确认接口路径`
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`认证失败 (${response.status})，请检查电子秤连接配置`);
    }
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  const json = (await response.json()) as ScaleApiResponse;

  const d = json?.data;
  if (!d) {
    return { records: [], total: 0 };
  }

  const rawRecords = (d.records ?? d.list ?? d.items ?? []) as Record<string, unknown>[];
  const totalRecords = (d.total ?? d.totalCount ?? d.count ?? rawRecords.length) as number;

  const records: SyncedInboundRecord[] = rawRecords.map((r: Record<string, unknown>) => {
    const expected = parseFloat(String(r.planWeight ?? r.expectedWeight ?? r.planNum ?? 0));
    const actual = parseFloat(String(r.actualWeight ?? r.realWeight ?? r.num ?? 0));
    const deviation = calcSyncDeviation(expected, actual);
    const status = calcSyncStatus(deviation);

    const ingredient = String(
      r.goodsName ?? r.materialName ?? r.ingredientName ?? r.ingredient ?? r.name ?? '未知食材'
    );
    const supplier = String(r.supplierName ?? r.supplier ?? '');
    const unit = String(r.unitName ?? r.unit ?? 'kg');
    const inspector = String(r.operatorName ?? r.operator ?? r.inspector ?? r.createBy ?? '');
    const recordTime = String(r.intoDate ?? r.createTime ?? r.recordTime ?? r.createdAt ?? new Date().toISOString());
    const warehouseName = r.warehouseName ? String(r.warehouseName) : undefined;

    // 证书字段
    let certificates: string[] = [];
    if (Array.isArray(r.certificates)) {
      certificates = r.certificates.map((c: unknown) => String(c));
    } else if (typeof r.certificate === 'string' && r.certificate) {
      certificates = [r.certificate];
    }

    return {
      syncedId: String(r.intoId ?? r.id ?? r.recordId ?? `${Date.now()}-${Math.random()}`),
      ingredient,
      supplier,
      expected,
      actual,
      unit,
      inspector,
      certificates,
      deviation,
      status,
      recordTime,
      warehouseName,
    };
  });

  return { records, total: totalRecords };
}

// ─── 电子秤v5-查询货品注册图 ────────────────────────────────────────────────

export interface RegisterPicVO {
  materialId?: number;
  materialCode?: string;
  materialName?: string;
  ifRegister?: number;
  ifCollect?: number;
  imageUrlList?: string[];
  [key: string]: unknown;
}

export async function fetchRegisterPics(
  config: ScaleConfig,
  materialId: number,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: { materialId },
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/list/material/register-pic`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知网络错误';
    console.error('[fetchRegisterPics] 网络请求失败: ' + errMsg + ', materialId=' + materialId);
    throw new Error(`查询货品注册图失败：${errMsg}`);
  }

  if (!response.ok) {
    console.error('[fetchRegisterPics] HTTP error ' + response.status + ' for materialId=' + materialId);
    throw new Error(`查询货品注册图失败: HTTP ${response.status}`);
  }

  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[fetchRegisterPics] JSON 解析失败 for materialId=' + materialId);
    throw new Error('查询货品注册图失败：服务器返回了非 JSON 响应');
  }

  const bizCode = (json as Record<string, unknown>)?.code;
  if (bizCode !== undefined && bizCode !== 10000 && bizCode !== 0 && bizCode !== '10000' && bizCode !== '0') {
    const apiMsg = (json as Record<string, unknown>)?.msg ?? (json as Record<string, unknown>)?.message ?? '';
    console.error('[fetchRegisterPics] API 返回错误 code=' + bizCode + ' msg=' + apiMsg + ' for materialId=' + materialId);
    throw new Error(`查询货品注册图异常：${apiMsg || '未知错误(code=' + bizCode + ')'}`);
  }

  json._raw = json;
  return json;
}

export function extractRegisterPics(resp: ScaleApiResponse): RegisterPicVO | null {
  const d = resp?.data;
  if (!d) return null;

  if (Array.isArray(d)) {
    return (d[0] as RegisterPicVO) ?? null;
  }
  return d as RegisterPicVO;
}

// ─── 电子秤v5-上传货品注册图 ────────────────────────────────────────────────

export async function uploadRegisterPics(
  config: ScaleConfig,
  materialId: number,
  imageUrlList: string[],
): Promise<ScaleApiResponse> {
  if (!imageUrlList || imageUrlList.length === 0) {
    throw new Error('图片地址列表(imageUrlList)不能为空，至少需要1张图片');
  }

  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: { materialId, imageUrlList },
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/upload/material/register-pic`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知网络错误';
    console.error('[uploadRegisterPics] 网络请求失败: ' + errMsg + ', materialId=' + materialId + ', picCount=' + imageUrlList.length);
    throw new Error(`上传货品注册图失败：${errMsg}`);
  }

  if (!response.ok) {
    console.error('[uploadRegisterPics] HTTP error ' + response.status + ' for materialId=' + materialId);
    throw new Error(`上传货品注册图失败: HTTP ${response.status}`);
  }

  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[uploadRegisterPics] JSON 解析失败 for materialId=' + materialId);
    throw new Error('上传货品注册图失败：服务器返回了非 JSON 响应');
  }

  const bizCode = (json as Record<string, unknown>)?.code;
  if (bizCode !== undefined && bizCode !== 10000 && bizCode !== 0 && bizCode !== '10000' && bizCode !== '0') {
    const apiMsg = (json as Record<string, unknown>)?.msg ?? (json as Record<string, unknown>)?.message ?? '';
    console.error('[uploadRegisterPics] API 返回错误 code=' + bizCode + ' msg=' + apiMsg + ' for materialId=' + materialId);
    throw new Error(`上传货品注册图异常：${apiMsg || '未知错误(code=' + bizCode + ')'}`);
  }

  json._raw = json;
  return json;
}

// ─── 电子秤v5-初始化赋值类别表等级和货品一级类别 ────────────────────────────────

export async function initCategoryLevel(config: ScaleConfig): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: null,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/init/category-level/material-big-category`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知网络错误';
    console.error('[initCategoryLevel] 网络请求失败: ' + errMsg);
    throw new Error(`初始化类别等级失败：${errMsg}`);
  }

  if (!response.ok) {
    console.error('[initCategoryLevel] HTTP error ' + response.status);
    throw new Error(`初始化类别等级失败: HTTP ${response.status}`);
  }

  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[initCategoryLevel] JSON 解析失败');
    throw new Error('初始化类别等级失败：服务器返回了非 JSON 响应');
  }

  const bizCode = (json as Record<string, unknown>)?.code;
  if (bizCode !== undefined && bizCode !== 10000 && bizCode !== 0 && bizCode !== '10000' && bizCode !== '0') {
    const apiMsg = (json as Record<string, unknown>)?.msg ?? (json as Record<string, unknown>)?.message ?? '';
    console.error('[initCategoryLevel] API 返回错误 code=' + bizCode + ' msg=' + apiMsg);
    throw new Error(`初始化类别等级异常：${apiMsg || '未知错误(code=' + bizCode + ')'}`);
  }

  json._raw = json;
  return json;
}

// ─── 电子秤v5-同步货品 ───────────────────────────────────────────────────────

export interface SyncMaterialParams {
  current?: number;
  size?: number;
  ifCount?: number;
  ifPageSizeZero?: number;
  orders?: { column: string; asc: boolean }[];
  areaId?: number;
  updateId?: string;
}

export interface SyncMaterialItem {
  id?: number;
  spuId?: number;
  materialId?: number;
  materialName?: string;
  materialCode?: string;
  pinyinInitials?: string;
  pinyinFull?: string;
  imageUrl?: string;
  nutritionId?: number;
  categoryId?: number;
  categoryName?: string;
  materialType?: number;
  barCode?: string;
  unitId?: number;
  unitName?: string;
  salePrice?: number;
  unitPrice?: number;
  leastIntoPrice?: number;
  salesMode?: number;
  reserveRate?: number;
  shelfLifeType?: number;
  shelfLifeDays?: number;
  delFlag?: number;
  disableStatus?: number;
  revision?: number;
  crby?: string;
  crtime?: string;
  upby?: string;
  uptime?: string;
  synopsis?: string;
  purPriceCeiling?: number;
  bigCategoryId?: number;
  updateId?: string;
  size?: string;
  rate?: number;
  convertGrams?: number;
  mainFlag?: number;
  brandId?: number;
  brandName?: string;
  intoType?: number;
  warehouseId?: number;
  unitList?: unknown[];
  [key: string]: unknown;
}

export async function syncMenuMaterials(
  config: ScaleConfig,
  params?: SyncMaterialParams,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = {
    current: params?.current ?? 1,
    size: params?.size ?? 10,
    ifCount: params?.ifCount ?? 1,
    ifPageSizeZero: params?.ifPageSizeZero ?? 1,
  };
  if (params?.orders && params.orders.length > 0) content.orders = params.orders;
  if (params?.areaId !== undefined) content.areaId = params.areaId;
  if (params?.updateId) content.updateId = params.updateId;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/sync/menuMaterial`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知网络错误';
    console.error('[syncMenuMaterials] 网络请求失败: ' + errMsg);
    throw new Error(`同步货品失败：${errMsg}`);
  }

  if (!response.ok) {
    console.error('[syncMenuMaterials] HTTP error ' + response.status);
    throw new Error(`同步货品失败: HTTP ${response.status}`);
  }

  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[syncMenuMaterials] JSON 解析失败');
    throw new Error('同步货品失败：服务器返回了非 JSON 响应');
  }

  const bizCode = (json as Record<string, unknown>)?.code;
  if (bizCode !== undefined && bizCode !== 10000 && bizCode !== 0 && bizCode !== '10000' && bizCode !== '0') {
    const apiMsg = (json as Record<string, unknown>)?.msg ?? (json as Record<string, unknown>)?.message ?? '';
    console.error('[syncMenuMaterials] API 返回错误 code=' + bizCode + ' msg=' + apiMsg);
    throw new Error(`同步货品异常：${apiMsg || '未知错误(code=' + bizCode + ')'}`);
  }

  json._raw = json;
  return json;
}

export function extractSyncMaterials(
  resp: ScaleApiResponse,
): { records: SyncMaterialItem[]; total: number; current: number; size: number } {
  const d = resp?.data;
  if (!d) return { records: [], total: 0, current: 1, size: 10 };

  const records = (d.records ?? d.list ?? []) as SyncMaterialItem[];
  const total = (d.total ?? d.totalCount ?? d.count ?? records.length) as number;
  const current = (d.current ?? d.page ?? 1) as number;
  const size = (d.size ?? d.pageSize ?? 10) as number;

  return { records, total, current, size };
}

// ─── 电子秤v5-同步大类（前10个）──────────────────────────────────────────────

export interface SyncBigCategoryItem {
  categoryId?: number;
  categoryName?: string;
  categoryType?: number;
  [key: string]: unknown;
}

export async function syncBigCategories(config: ScaleConfig): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content: null,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/sync/big-category`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知网络错误';
    console.error('[syncBigCategories] 网络请求失败: ' + errMsg);
    throw new Error(`同步大类失败：${errMsg}`);
  }

  if (!response.ok) {
    console.error('[syncBigCategories] HTTP error ' + response.status);
    throw new Error(`同步大类失败: HTTP ${response.status}`);
  }

  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[syncBigCategories] JSON 解析失败');
    throw new Error('同步大类失败：服务器返回了非 JSON 响应');
  }

  const bizCode = (json as Record<string, unknown>)?.code;
  if (bizCode !== undefined && bizCode !== 10000 && bizCode !== 0 && bizCode !== '10000' && bizCode !== '0') {
    const apiMsg = (json as Record<string, unknown>)?.msg ?? (json as Record<string, unknown>)?.message ?? '';
    console.error('[syncBigCategories] API 返回错误 code=' + bizCode + ' msg=' + apiMsg);
    throw new Error(`同步大类异常：${apiMsg || '未知错误(code=' + bizCode + ')'}`);
  }

  json._raw = json;
  return json;
}

export function extractSyncBigCategories(resp: ScaleApiResponse): SyncBigCategoryItem[] {
  const d = resp?.data;
  if (!d) return [];

  if (Array.isArray(d)) return d as SyncBigCategoryItem[];

  const list = d.list ?? d.records ?? d.categories ?? [];
  if (Array.isArray(list)) return list as SyncBigCategoryItem[];
  return [];
}

// ─── 电子秤ai-获取未注册/已注册货品数量 ──────────────────────────────────────

export async function fetchRegisterMaterialNum(
  config: ScaleConfig,
  params: RegisterMaterialSearchParams,
): Promise<ScaleApiResponse> {
  const { baseUrl, merchantId, xToken, machineSn } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Merchant-Id': merchantId,
    'MERCHANT-ID': merchantId,
    'X-Token': xToken,
  };
  if (machineSn) headers['machine-sn'] = machineSn;

  const content: Record<string, unknown> = {
    current: params.current ?? 1,
    size: params.size ?? 10,
    ifCount: params.ifCount ?? 1,
    interfaceType: params.interfaceType ?? 'WEB',
  };
  if (params.ifRegister !== undefined) content.ifRegister = params.ifRegister;
  if (params.materialInfo) content.materialInfo = params.materialInfo;
  if (params.ifCollect !== undefined) content.ifCollect = params.ifCollect;
  if (params.initial) content.initial = params.initial;
  if (params.categoryIdList && params.categoryIdList.length > 0) content.categoryIdList = params.categoryIdList;
  if (params.barCode) content.barCode = params.barCode;
  if (params.areaId !== undefined) content.areaId = params.areaId;
  if (params.warehouseId !== undefined) content.warehouseId = params.warehouseId;
  if (params.modelVersion) content.modelVersion = params.modelVersion;

  const body = {
    version: '1.0',
    nonceStr: generateNonceStr(),
    timestamp: String(Date.now()),
    signType: 'MD5',
    content,
  };

  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/device/drp/get/register-material-num`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知网络错误';
    console.error('[fetchRegisterMaterialNum] 网络请求失败: ' + errMsg);
    throw new Error(`获取注册货品数量失败：${errMsg}`);
  }

  if (!response.ok) {
    console.error('[fetchRegisterMaterialNum] HTTP error ' + response.status);
    throw new Error(`获取注册货品数量失败: HTTP ${response.status}`);
  }

  let json: ScaleApiResponse;
  try {
    json = (await response.json()) as ScaleApiResponse;
  } catch {
    console.error('[fetchRegisterMaterialNum] JSON 解析失败');
    throw new Error('获取注册货品数量失败：服务器返回了非 JSON 响应');
  }

  const bizCode = (json as Record<string, unknown>)?.code;
  if (bizCode !== undefined && bizCode !== 10000 && bizCode !== 0 && bizCode !== '10000' && bizCode !== '0') {
    const apiMsg = (json as Record<string, unknown>)?.msg ?? (json as Record<string, unknown>)?.message ?? '';
    console.error('[fetchRegisterMaterialNum] API 返回错误 code=' + bizCode + ' msg=' + apiMsg);
    throw new Error(`获取注册货品数量异常：${apiMsg || '未知错误(code=' + bizCode + ')'}`);
  }

  json._raw = json;
  return json;
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── 食材重量知识库 ──────────────────────────────────────────────────────────
// 每一条记录描述一种常见食堂食材的典型单件/单位重量范围（单位：克）
// weightMin / weightMax：该食材单件重量的典型范围
// typicalUnit：常见计量单位
// category：食材分类
interface IngredientProfile {
  name: string;
  weightMin: number;
  weightMax: number;
  typicalUnit: string;
  category: string;
  aliases: string[];
}

const INGREDIENT_KNOWLEDGE: IngredientProfile[] = [
  // ── 蔬菜类 ──
  { name: '大白菜', weightMin: 1500, weightMax: 3500, typicalUnit: '颗', category: '蔬菜', aliases: ['白菜', '黄芽菜'] },
  { name: '小白菜', weightMin: 150, weightMax: 350, typicalUnit: '把', category: '蔬菜', aliases: ['青菜', '上海青', '油菜'] },
  { name: '菠菜', weightMin: 200, weightMax: 400, typicalUnit: '把', category: '蔬菜', aliases: [] },
  { name: '生菜', weightMin: 250, weightMax: 500, typicalUnit: '颗', category: '蔬菜', aliases: ['叶生菜', '球生菜'] },
  { name: '西兰花', weightMin: 300, weightMax: 600, typicalUnit: '颗', category: '蔬菜', aliases: ['花椰菜', '青花菜'] },
  { name: '花菜', weightMin: 500, weightMax: 1200, typicalUnit: '颗', category: '蔬菜', aliases: ['菜花', '花椰菜'] },
  { name: '土豆', weightMin: 100, weightMax: 300, typicalUnit: '个', category: '蔬菜', aliases: ['马铃薯', '洋芋'] },
  { name: '番茄', weightMin: 100, weightMax: 250, typicalUnit: '个', category: '蔬菜', aliases: ['西红柿'] },
  { name: '黄瓜', weightMin: 150, weightMax: 350, typicalUnit: '根', category: '蔬菜', aliases: ['青瓜'] },
  { name: '茄子', weightMin: 150, weightMax: 400, typicalUnit: '根', category: '蔬菜', aliases: ['矮瓜'] },
  { name: '胡萝卜', weightMin: 80, weightMax: 200, typicalUnit: '根', category: '蔬菜', aliases: ['红萝卜'] },
  { name: '白萝卜', weightMin: 500, weightMax: 1500, typicalUnit: '根', category: '蔬菜', aliases: ['萝卜'] },
  { name: '洋葱', weightMin: 150, weightMax: 350, typicalUnit: '个', category: '蔬菜', aliases: ['葱头'] },
  { name: '青椒', weightMin: 80, weightMax: 200, typicalUnit: '个', category: '蔬菜', aliases: ['柿子椒', '甜椒'] },
  { name: '辣椒', weightMin: 10, weightMax: 50, typicalUnit: '个', category: '蔬菜', aliases: ['红辣椒', '尖椒'] },
  { name: '冬瓜', weightMin: 5000, weightMax: 15000, typicalUnit: '个', category: '蔬菜', aliases: [] },
  { name: '南瓜', weightMin: 1000, weightMax: 4000, typicalUnit: '个', category: '蔬菜', aliases: [] },
  { name: '芹菜', weightMin: 200, weightMax: 500, typicalUnit: '把', category: '蔬菜', aliases: ['西芹'] },
  { name: '韭菜', weightMin: 150, weightMax: 350, typicalUnit: '把', category: '蔬菜', aliases: [] },
  { name: '豆芽', weightMin: 200, weightMax: 500, typicalUnit: '袋', category: '蔬菜', aliases: ['绿豆芽', '黄豆芽'] },
  { name: '豆腐', weightMin: 300, weightMax: 500, typicalUnit: '块', category: '豆制品', aliases: [] },
  { name: '豆皮', weightMin: 100, weightMax: 300, typicalUnit: '张', category: '豆制品', aliases: ['千张', '百叶'] },

  // ── 肉类 ──
  { name: '猪里脊肉', weightMin: 300, weightMax: 800, typicalUnit: '块', category: '猪肉', aliases: ['里脊', '猪柳'] },
  { name: '猪五花肉', weightMin: 500, weightMax: 2000, typicalUnit: '块', category: '猪肉', aliases: ['五花肉', '三层肉'] },
  { name: '猪排骨', weightMin: 500, weightMax: 2500, typicalUnit: '扇', category: '猪肉', aliases: ['排骨', '肋排'] },
  { name: '猪前腿肉', weightMin: 1000, weightMax: 4000, typicalUnit: '块', category: '猪肉', aliases: ['前腿', '夹心肉'] },
  { name: '猪后腿肉', weightMin: 1500, weightMax: 5000, typicalUnit: '块', category: '猪肉', aliases: ['后腿', '臀肉'] },
  { name: '猪蹄', weightMin: 300, weightMax: 800, typicalUnit: '只', category: '猪肉', aliases: ['猪脚'] },
  { name: '鸡胸肉', weightMin: 200, weightMax: 400, typicalUnit: '块', category: '禽肉', aliases: ['鸡胸'] },
  { name: '鸡腿', weightMin: 150, weightMax: 350, typicalUnit: '个', category: '禽肉', aliases: ['琵琶腿'] },
  { name: '鸡翅', weightMin: 50, weightMax: 120, typicalUnit: '个', category: '禽肉', aliases: ['鸡中翅'] },
  { name: '整鸡', weightMin: 1000, weightMax: 2500, typicalUnit: '只', category: '禽肉', aliases: ['三黄鸡', '土鸡'] },
  { name: '鸭腿', weightMin: 200, weightMax: 400, typicalUnit: '个', category: '禽肉', aliases: [] },
  { name: '牛肉（牛腩）', weightMin: 500, weightMax: 3000, typicalUnit: '块', category: '牛肉', aliases: ['牛腩', '牛肋条'] },
  { name: '牛肉（牛腱）', weightMin: 500, weightMax: 2000, typicalUnit: '块', category: '牛肉', aliases: ['牛腱子'] },
  { name: '牛柳', weightMin: 200, weightMax: 600, typicalUnit: '条', category: '牛肉', aliases: ['牛里脊'] },
  { name: '羊肉', weightMin: 500, weightMax: 3000, typicalUnit: '块', category: '羊肉', aliases: ['羊腿肉', '羊排'] },

  // ── 水产类 ──
  { name: '草鱼', weightMin: 1000, weightMax: 3000, typicalUnit: '条', category: '水产', aliases: ['鲩鱼'] },
  { name: '鲫鱼', weightMin: 200, weightMax: 600, typicalUnit: '条', category: '水产', aliases: [] },
  { name: '鲤鱼', weightMin: 500, weightMax: 2500, typicalUnit: '条', category: '水产', aliases: [] },
  { name: '鲈鱼', weightMin: 400, weightMax: 1000, typicalUnit: '条', category: '水产', aliases: [] },
  { name: '带鱼', weightMin: 200, weightMax: 600, typicalUnit: '条', category: '水产', aliases: [] },
  { name: '虾', weightMin: 10, weightMax: 40, typicalUnit: '只', category: '水产', aliases: ['基围虾', '对虾', '明虾'] },
  { name: '花蛤', weightMin: 5, weightMax: 25, typicalUnit: '个', category: '水产', aliases: ['蛤蜊'] },
  { name: '鱿鱼', weightMin: 200, weightMax: 600, typicalUnit: '条', category: '水产', aliases: [] },

  // ── 蛋奶类 ──
  { name: '鸡蛋', weightMin: 45, weightMax: 70, typicalUnit: '个', category: '蛋奶', aliases: ['鲜鸡蛋'] },
  { name: '鸭蛋', weightMin: 60, weightMax: 85, typicalUnit: '个', category: '蛋奶', aliases: [] },

  // ── 米面粮油 ──
  { name: '大米', weightMin: 5000, weightMax: 25000, typicalUnit: '袋', category: '主食', aliases: ['米'] },
  { name: '面粉', weightMin: 1000, weightMax: 25000, typicalUnit: '袋', category: '主食', aliases: ['小麦粉'] },
  { name: '食用油', weightMin: 2500, weightMax: 20000, typicalUnit: '桶', category: '调料', aliases: ['大豆油', '花生油', '菜籽油', '调和油'] },

  // ── 调料类 ──
  { name: '食盐', weightMin: 250, weightMax: 500, typicalUnit: '袋', category: '调料', aliases: ['盐'] },
  { name: '白砂糖', weightMin: 250, weightMax: 500, typicalUnit: '袋', category: '调料', aliases: ['白糖', '砂糖'] },
  { name: '酱油', weightMin: 500, weightMax: 2000, typicalUnit: '瓶', category: '调料', aliases: ['生抽', '老抽'] },
  { name: '醋', weightMin: 500, weightMax: 2000, typicalUnit: '瓶', category: '调料', aliases: ['陈醋', '米醋', '白醋'] },
  { name: '料酒', weightMin: 500, weightMax: 2000, typicalUnit: '瓶', category: '调料', aliases: ['黄酒'] },
  { name: '味精', weightMin: 100, weightMax: 500, typicalUnit: '袋', category: '调料', aliases: ['鸡精'] },
  { name: '豆瓣酱', weightMin: 200, weightMax: 1000, typicalUnit: '瓶', category: '调料', aliases: [] },
  { name: '花椒', weightMin: 25, weightMax: 100, typicalUnit: '袋', category: '调料', aliases: [] },
  { name: '干辣椒', weightMin: 50, weightMax: 200, typicalUnit: '袋', category: '调料', aliases: ['辣椒干'] },
  { name: '生姜', weightMin: 50, weightMax: 200, typicalUnit: '块', category: '调料', aliases: ['姜'] },
  { name: '大蒜', weightMin: 30, weightMax: 80, typicalUnit: '头', category: '调料', aliases: ['蒜头'] },
  { name: '大葱', weightMin: 80, weightMax: 250, typicalUnit: '根', category: '蔬菜', aliases: ['葱'] },

  // ── 水果类 ──
  { name: '苹果', weightMin: 150, weightMax: 300, typicalUnit: '个', category: '水果', aliases: [] },
  { name: '香蕉', weightMin: 100, weightMax: 200, typicalUnit: '根', category: '水果', aliases: [] },
  { name: '橙子', weightMin: 150, weightMax: 300, typicalUnit: '个', category: '水果', aliases: [] },
  { name: '西瓜', weightMin: 3000, weightMax: 10000, typicalUnit: '个', category: '水果', aliases: [] },
];

// ─── 匹配算法 ────────────────────────────────────────────────────────────────

interface MatchResult {
  name: string;
  category: string;
  typicalUnit: string;
  matchType: 'exact' | 'range' | 'fuzzy' | 'ambiguous';
  confidence: number;        // 0 ~ 100
  estimatedQuantity: number; // 估算数量
  estimatedUnitWeight: number; // 估算单件重量
  detail: string;
}

function matchIngredient(weightGrams: number, topN: number = 5): {
  results: MatchResult[];
  isAmbiguous: boolean;
  totalMatches: number;
} {
  const scored: Array<{ profile: IngredientProfile; score: number; matchType: MatchResult['matchType']; quantity: number }> = [];

  for (const profile of INGREDIENT_KNOWLEDGE) {
    const { weightMin, weightMax } = profile;

    // 精确命中范围
    if (weightGrams >= weightMin && weightGrams <= weightMax) {
      const mid = (weightMin + weightMax) / 2;
      const deviation = Math.abs(weightGrams - mid) / mid;
      const score = 100 - deviation * 30; // 越接近中点，分数越高
      scored.push({ profile, score: Math.max(60, score), matchType: 'range', quantity: 1 });
      continue;
    }

    // 检查是否为整数倍（多件）
    const minQty = Math.max(1, Math.floor(weightGrams / (weightMax * 1.15)));
    const maxQty = Math.max(1, Math.ceil(weightGrams / (weightMin * 0.85)));

    let bestQty = 1;
    let bestDeviation = Infinity;

    for (let qty = minQty; qty <= maxQty && qty <= 50; qty++) {
      const totalMin = weightMin * qty;
      const totalMax = weightMax * qty;
      const totalMid = (totalMin + totalMax) / 2;

      let dev: number;
      if (weightGrams >= totalMin && weightGrams <= totalMax) {
        dev = Math.abs(weightGrams - totalMid) / totalMid;
      } else if (weightGrams < totalMin) {
        dev = (totalMin - weightGrams) / totalMin;
      } else {
        dev = (weightGrams - totalMax) / totalMax;
      }

      if (dev < bestDeviation) {
        bestDeviation = dev;
        bestQty = qty;
      }
    }

    // 偏差在 50% 以内视为可匹配
    if (bestDeviation < 0.50) {
      const score = Math.max(10, 100 - bestDeviation * 150);
      const matchType = bestDeviation < 0.10 ? 'exact' : bestDeviation < 0.25 ? 'fuzzy' : 'ambiguous';
      scored.push({ profile, score, matchType, quantity: bestQty });
    }
  }

  // 按分数降序排列
  scored.sort((a, b) => b.score - a.score);

  const topResults = scored.slice(0, Math.max(topN, 5));
  const isAmbiguous = topResults.length > 0 && topResults[0].score < 70;

  const results: MatchResult[] = topResults.map((s) => ({
    name: s.profile.name,
    category: s.profile.category,
    typicalUnit: s.profile.typicalUnit,
    matchType: s.matchType,
    confidence: Math.round(s.score),
    estimatedQuantity: s.quantity,
    estimatedUnitWeight: Math.round((s.profile.weightMin + s.profile.weightMax) / 2),
    detail: s.quantity > 1
      ? `约 ${s.quantity} ${s.profile.typicalUnit}，每${s.profile.typicalUnit}约 ${Math.round((s.profile.weightMin + s.profile.weightMax) / 2)}g`
      : `约 1 ${s.profile.typicalUnit}，典型重量 ${s.profile.weightMin}~${s.profile.weightMax}g`,
  }));

  return { results, isAmbiguous, totalMatches: scored.length };
}

// 按关键词搜索食材
function searchIngredients(keyword: string, limit: number = 10): IngredientProfile[] {
  const kw = keyword.toLowerCase().trim();
  if (!kw) return INGREDIENT_KNOWLEDGE.slice(0, limit);

  const scored = INGREDIENT_KNOWLEDGE.map((p) => {
    let s = 0;
    if (p.name.toLowerCase().includes(kw)) s += 100;
    if (p.category.toLowerCase().includes(kw)) s += 50;
    p.aliases.forEach((a) => { if (a.toLowerCase().includes(kw)) s += 80; });
    return { profile: p, score: s };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.profile);
}

// ─── 请求处理 ────────────────────────────────────────────────────────────────

interface RecognizeRequest {
  weight: number;         // 重量（克）
  unit?: string;          // 单位（g/kg），默认 g
  category?: string;      // 食材分类提示
  keyword?: string;       // 关键词搜索提示
  topN?: number;          // 返回前 N 条，默认 5
}

interface SearchRequest {
  keyword: string;
  limit?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // POST /recognize — 根据重量识别食材
    if (path.endsWith('/recognize') && req.method === 'POST') {
      const body: RecognizeRequest = await req.json();
      let weightGrams = body.weight;

      // 单位转换
      if (body.unit === 'kg') weightGrams = weightGrams * 1000;
      else if (body.unit === '斤') weightGrams = weightGrams * 500;
      else if (body.unit === '两') weightGrams = weightGrams * 50;

      if (isNaN(weightGrams) || weightGrams <= 0) {
        return new Response(
          JSON.stringify({ code: 400, message: '请提供有效的重量值（> 0）', data: null }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const matchResult = matchIngredient(weightGrams, body.topN ?? 5);

      // 如果提供了分类或关键词，微调排序
      let results = matchResult.results;
      if (body.category || body.keyword) {
        const filter = (body.category || body.keyword || '').toLowerCase();
        // 分类/关键词匹配的排在前面
        const preferred = results.filter((r) =>
          r.category.toLowerCase().includes(filter) || r.name.toLowerCase().includes(filter)
        );
        const others = results.filter((r) => !preferred.includes(r));
        results = [...preferred, ...others];
      }

      return new Response(
        JSON.stringify({
          code: 200,
          message: 'success',
          data: {
            weight: weightGrams,
            weightDisplay: weightGrams >= 1000
              ? `${(weightGrams / 1000).toFixed(2)} kg`
              : `${weightGrams} g`,
            results,
            isAmbiguous: matchResult.isAmbiguous,
            totalMatches: matchResult.totalMatches,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // POST /search — 关键词搜索食材
    if (path.endsWith('/search') && req.method === 'POST') {
      const body: SearchRequest = await req.json();
      const items = searchIngredients(body.keyword, body.limit ?? 10);

      return new Response(
        JSON.stringify({
          code: 200,
          message: 'success',
          data: {
            keyword: body.keyword,
            items: items.map((p) => ({
              name: p.name,
              category: p.category,
              typicalUnit: p.typicalUnit,
              weightRange: `${p.weightMin}g ~ ${p.weightMax}g`,
              midWeight: Math.round((p.weightMin + p.weightMax) / 2),
              aliases: p.aliases,
            })),
            total: items.length,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // GET /knowledge — 获取知识库概览
    if (path.endsWith('/knowledge') && req.method === 'GET') {
      const categories = [...new Set(INGREDIENT_KNOWLEDGE.map((p) => p.category))];

      return new Response(
        JSON.stringify({
          code: 200,
          message: 'success',
          data: {
            totalIngredients: INGREDIENT_KNOWLEDGE.length,
            categories,
            categoryCount: categories.length,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ code: 404, message: '接口不存在', data: null }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    return new Response(
      JSON.stringify({
        code: 500,
        message: e instanceof Error ? e.message : '服务器内部错误',
        data: null,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

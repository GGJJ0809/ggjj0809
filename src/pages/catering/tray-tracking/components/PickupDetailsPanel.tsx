import { useState, useEffect } from 'react';
import { usePickupDetails, MEAL_TYPES, PickupDetail, StationSnEntry } from '@/pages/catering/pickup-details/hooks/usePickupDetails';
import { todayBeijing } from '@/lib/dateUtils';

const CATEGORY_COLORS: Record<string, string> = {
  荤菜: 'bg-red-50 text-red-600',
  素菜: 'bg-emerald-50 text-emerald-600',
  家常菜: 'bg-amber-50 text-amber-600',
  主食: 'bg-orange-50 text-orange-600',
  汤品: 'bg-sky-50 text-sky-600',
  凉菜: 'bg-teal-50 text-teal-600',
  热菜: 'bg-rose-50 text-rose-600',
  炖煲: 'bg-yellow-50 text-yellow-600',
  蒸菜: 'bg-lime-50 text-lime-600',
  油炸: 'bg-orange-50 text-orange-600',
  海鲜: 'bg-cyan-50 text-cyan-600',
  肉食: 'bg-pink-50 text-pink-600',
  小吃: 'bg-violet-50 text-violet-600',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动录入',
  auto: '自动采集',
  scale: '称重采集',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatWeight(g: number) {
  if (g >= 1000) return `${(g / 1000).toFixed(2)}kg`;
  return `${Math.round(g)}g`;
}

export default function PickupDetailsPanel() {
  const {
    records,
    stats,
    categories,
    loading,
    error,
    selectedDate,
    selectedMeal,
    selectedCategory,
    searchQuery,
    currentPage,
    pageSize,
    setSelectedDate,
    setSelectedMeal,
    setSelectedCategory,
    setSearchQuery,
    setCurrentPage,
    refetch,
    exportData,
    exportReport,
    classifyTeam,
  } = usePickupDetails();

  const [exporting, setExporting] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // 点击外部关闭导出下拉
  useEffect(() => {
    if (!exportDropdownOpen) return;
    const handler = () => setExportDropdownOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [exportDropdownOpen]);

  // 导出消息3秒后自动消失
  useEffect(() => {
    if (!exportMsg) return;
    const t = setTimeout(() => setExportMsg(null), 3000);
    return () => clearTimeout(t);
  }, [exportMsg]);

  const isToday = selectedDate === todayBeijing();

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  const buildCsv = (data: PickupDetail[]) => {
    const header = '取餐时间,日期,餐段,托盘编号,菜品名称,菜系,取餐前(g),取餐后(g),取餐量(g),份数,人员ID,来源,备注\n';
    const rows = data.map((r: PickupDetail) =>
      [
        new Date(r.pickup_time).toLocaleString('zh-CN', { hour12: false }),
        formatDateShort(r.pickup_time),
        r.meal_type,
        r.station_code,
        r.dish_name,
        r.category,
        Number(r.weight_before).toFixed(0),
        Math.max(0, Number(r.weight_before) - Number(r.pickup_weight)).toFixed(0),
        Number(r.pickup_weight).toFixed(0),
        r.pickup_portions,
        r.person_id || '',
        SOURCE_LABELS[r.source || ''] || r.source || '手动录入',
        (r.notes || '').replace(/,/g, '，'),
      ].join(',')
    ).join('\n');
    return '\uFEFF' + header + rows;
  };

  /** 生成取餐报告CSV（含大队分类 + 餐盘餐段统计） */
  const buildReportCsv = (logs: PickupDetail[], stationSnMap: Record<string, StationSnEntry>) => {
    const lines: string[] = [];

    // ━━━ 第一部分：取餐明细 ━━━
    const detailHeader = '分类,设备SN,餐盘编号,餐段,取餐时间,菜品名称,菜系,取餐前(g),取餐后(g),取餐量(g),份数,人员ID,来源,备注';
    lines.push(detailHeader);

    // 按 SN 所属大队排序
    // 优先从 stationSnMap 取 SN；若无映射，尝试 station_code 本身就是 SN（Electron本地模式）
    const getSn = (sc: string) => {
      if (stationSnMap[sc]?.sn) return stationSnMap[sc].sn;
      // station_code 本身如果能被识别为已知SN（在大队映射表中），直接使用
      if (classifyTeam(sc) !== '其他') return sc;
      return '';
    };
    const getTeam = (sc: string) => classifyTeam(getSn(sc));

    const TEAM_RANK: Record<string, number> = { '一大队': 1, '二大队': 2, '三大队': 3, '四大队': 4, '其他': 99 };
    const sortedLogs = [...logs].sort((a, b) => {
      const ta = TEAM_RANK[getTeam(a.station_code)] || 99;
      const tb = TEAM_RANK[getTeam(b.station_code)] || 99;
      if (ta !== tb) return ta - tb;
      const sna = getSn(a.station_code);
      const snb = getSn(b.station_code);
      if (sna !== snb) return sna.localeCompare(snb);
      if (a.station_code !== b.station_code) return a.station_code.localeCompare(b.station_code);
      return new Date(a.pickup_time).getTime() - new Date(b.pickup_time).getTime();
    });

    const SOURCE_MAP: Record<string, string> = {
      manual: '手动录入', auto: '自动采集', scale: '称重采集',
    };

    sortedLogs.forEach((r) => {
      const sn = getSn(r.station_code);
      const team = getTeam(r.station_code);
      const sourceLabel = SOURCE_MAP[r.source || ''] || r.source || '手动录入';
      const row = [
        team,
        sn || '—',
        r.station_code,
        r.meal_type,
        new Date(r.pickup_time).toLocaleString('zh-CN', { hour12: false }),
        r.dish_name,
        r.category,
        Number(r.weight_before).toFixed(0),
        Math.max(0, Number(r.weight_before) - Number(r.pickup_weight)).toFixed(0),
        Number(r.pickup_weight).toFixed(0),
        r.pickup_portions,
        r.person_id || '—',
        sourceLabel,
        (r.notes || '').replace(/,/g, '，'),
      ].join(',');
      lines.push(row);
    });

    // ━━━ 空行分隔 ━━━
    lines.push('');
    lines.push('');

    // ━━━ 第二部分：餐盘餐段统计 ━━━
    const statsHeader = '======== 餐盘餐段统计 ========';
    lines.push(statsHeader);
    const statsColHeader = '分类,设备SN,餐盘编号,餐段,起始重量(g),取餐次数,取餐总量(g),剩余重量(g)';
    lines.push(statsColHeader);

    // 按 (station_code, meal_type) 分组统计
    const groupKey = (sc: string, mt: string) => `${sc}|||${mt}`;
    const groups: Record<string, {
      station_code: string;
      meal_type: string;
      pickups: PickupDetail[];
    }> = {};

    sortedLogs.forEach((r) => {
      const key = groupKey(r.station_code, r.meal_type);
      if (!groups[key]) {
        groups[key] = { station_code: r.station_code, meal_type: r.meal_type, pickups: [] };
      }
      groups[key].pickups.push(r);
    });

    // 按大队→SN→station_code→meal_type排序
    const groupList = Object.values(groups).sort((a, b) => {
      const ta = TEAM_RANK[getTeam(a.station_code)] || 99;
      const tb = TEAM_RANK[getTeam(b.station_code)] || 99;
      if (ta !== tb) return ta - tb;
      const sna = getSn(a.station_code);
      const snb = getSn(b.station_code);
      if (sna !== snb) return sna.localeCompare(snb);
      if (a.station_code !== b.station_code) return a.station_code.localeCompare(b.station_code);
      return a.meal_type.localeCompare(b.meal_type);
    });

    groupList.forEach((g) => {
      const pks = g.pickups;
      const startWeight = Number(pks[0].weight_before);
      const count = pks.length;
      const totalPicked = pks.reduce((s, r) => s + Number(r.pickup_weight), 0);
      // 剩余重量 = 起始重量 - 总取餐量
      const remaining = Math.max(0, startWeight - totalPicked);
      const sn = getSn(g.station_code);
      const team = getTeam(g.station_code);

      lines.push([
        team,
        sn || '—',
        g.station_code,
        g.meal_type,
        startWeight.toFixed(0),
        String(count),
        totalPicked.toFixed(0),
        remaining.toFixed(0),
      ].join(','));
    });

    return '\uFEFF' + lines.join('\n');
  };

  const doExport = async (todayOnly: boolean) => {
    setExporting(true);
    setExportDropdownOpen(false);
    setExportMsg(null);
    try {
      const data = await exportData(todayOnly);
      if (data.length === 0) {
        setExportMsg({ type: 'info', text: todayOnly ? `${selectedDate} 暂无取餐记录可导出` : '暂无任何取餐记录可导出' });
        return;
      }
      const csv = buildCsv(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const label = todayOnly ? selectedDate : '全部';
      link.download = `取餐明细_${label}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setExportMsg({ type: 'success', text: `已导出 ${data.length} 条取餐记录` });
    } catch (err: any) {
      setExportMsg({ type: 'error', text: `导出失败：${err.message || '未知错误'}` });
    } finally {
      setExporting(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 汇总表：行=菜品（每顿7道×3餐=21行），列=大队×(餐前/餐后) + 合计
  // ──────────────────────────────────────────────────────────────────────────
  const buildSummaryHtmlTable = (
    logs: PickupDetail[],
    stationSnMap: Record<string, StationSnEntry>,
    dateLabel: string,
  ): string => {
    const getSn = (sc: string) => {
      if (stationSnMap[sc]?.sn) return stationSnMap[sc].sn;
      if (classifyTeam(sc) !== '其他') return sc;
      return '';
    };
    const getTeam = (sc: string) => classifyTeam(getSn(sc));

    const MEAL_ORDER = ['早餐', '午餐', '晚餐'];
    const TEAM_ORDER = ['一大队', '二大队', '三大队', '四大队', '五大队'];

    interface DishData {
      // 每个站点(station_code)首次出现时的初始重量之和 → 该大队该菜品的「餐前总重量」
      sumWeightBefore: number;
      // 该大队该菜品所有站点所有取餐量之和 → 「消耗」
      totalPickup: number;
      // 已登记初始重量的站点集合，防止重复累加
      stationInitWeight: Record<string, number>;
    }

    // data[brigade][meal][dish] = DishData
    const aggData: Record<string, Record<string, Record<string, DishData>>> = {};
    TEAM_ORDER.forEach((t) => {
      aggData[t] = { '早餐': {}, '午餐': {}, '晚餐': {} };
    });

    // Dish insertion-order per meal
    const mealDishOrder: Record<string, string[]> = { 早餐: [], 午餐: [], 晚餐: [] };

    const sortedLogs = [...logs].sort(
      (a, b) => new Date(a.pickup_time).getTime() - new Date(b.pickup_time).getTime(),
    );

    sortedLogs.forEach((r) => {
      const team = getTeam(r.station_code);
      if (!TEAM_ORDER.includes(team)) return;
      const meal = r.meal_type;
      if (!MEAL_ORDER.includes(meal)) return;
      const dish = r.dish_name && r.dish_name !== '未命名菜品' ? r.dish_name : '未命名';

      if (!mealDishOrder[meal].includes(dish)) mealDishOrder[meal].push(dish);

      if (!aggData[team][meal][dish]) {
        aggData[team][meal][dish] = {
          sumWeightBefore: 0,
          totalPickup: 0,
          stationInitWeight: {},
        };
      }

      const entry = aggData[team][meal][dish];

      // 每个站点只记录一次初始重量（第一条按时间排序的记录）
      // 这样多托盘同一菜品时，餐前 = 各托盘初始重量之和
      if (!(r.station_code in entry.stationInitWeight)) {
        const initW = Number(r.weight_before);
        entry.stationInitWeight[r.station_code] = initW;
        entry.sumWeightBefore += initW;
      }

      // 每次取餐都累加消耗量
      entry.totalPickup += Number(r.pickup_weight);
    });

    // Ensure each meal has at least 7 dish slots (pad with blank names)
    MEAL_ORDER.forEach((meal) => {
      while (mealDishOrder[meal].length < 7) {
        mealDishOrder[meal].push(`菜${mealDishOrder[meal].length + 1}`);
      }
    });

    // Determine which teams actually appear in data
    const activeTeams = TEAM_ORDER.filter((t) =>
      MEAL_ORDER.some((m) => Object.keys(aggData[t][m]).length > 0),
    );
    const teams = activeTeams.length > 0 ? activeTeams : TEAM_ORDER;

    const totalDishRows = MEAL_ORDER.reduce((s, m) => s + mealDishOrder[m].length, 0);

    // Styles
    const cs = 'border:1px solid #888;padding:3px 5px;text-align:center;font-size:11pt;';
    const hs = `${cs}font-weight:bold;background:#e8e8e8;vertical-align:middle;`;
    const totalCols = 3 + teams.length * 3 + 3;

    let html = `<table border="1" style="border-collapse:collapse;font-family:'宋体',SimSun,serif;">`;

    // Title row
    html += `<tr><td colspan="${totalCols}" style="${hs}font-size:13pt;padding:6px 8px;">`;
    html += `${dateLabel}  取餐消耗汇总表</td></tr>`;

    // Header row 1: team names
    html += '<tr>';
    html += `<th rowspan="2" style="${hs}">日期</th>`;
    html += `<th rowspan="2" style="${hs}">餐别</th>`;
    html += `<th rowspan="2" style="${hs}">菜品</th>`;
    teams.forEach((t) => {
      html += `<th colspan="3" style="${hs}">${t}</th>`;
    });
    html += `<th colspan="3" style="${hs}">合计</th>`;
    html += '</tr>';

    // Header row 2: 餐前/餐后/消耗
    html += '<tr>';
    const colCount = teams.length + 1; // teams + total
    for (let i = 0; i < colCount; i++) {
      html += `<th style="${hs}">餐前(g)</th><th style="${hs}">餐后(g)</th><th style="${hs}">消耗(g)</th>`;
    }
    html += '</tr>';

    // Data rows
    let isFirstRowOfDay = true;
    MEAL_ORDER.forEach((meal) => {
      const dishes = mealDishOrder[meal];
      dishes.forEach((dish, dishIdx) => {
        html += '<tr>';

        // Date cell spans all dish rows (emitted only on very first row)
        if (isFirstRowOfDay) {
          html += `<td rowspan="${totalDishRows}" style="${cs}vertical-align:middle;font-weight:bold;">${dateLabel}</td>`;
          isFirstRowOfDay = false;
        }

        // Meal cell spans the 7 dishes of this meal
        if (dishIdx === 0) {
          html += `<td rowspan="${dishes.length}" style="${cs}vertical-align:middle;font-weight:bold;">${meal}</td>`;
        }

        // Dish name
        html += `<td style="${cs}text-align:left;">${dish}</td>`;

        let sumBefore = 0;
        let sumAfter = 0;
        let sumConsumption = 0;
        let hasAny = false;

        teams.forEach((team) => {
          const d = aggData[team][meal][dish];
          if (d && d.sumWeightBefore > 0) {
            const before = Math.round(d.sumWeightBefore);
            // 餐后 = 餐前总重 - 总消耗，不得为负
            const after = Math.max(0, Math.round(d.sumWeightBefore - d.totalPickup));
            const consumption = Math.min(before, Math.round(d.totalPickup));
            sumBefore += before;
            sumAfter += after;
            sumConsumption += consumption;
            hasAny = true;
            html += `<td style="${cs}">${before}</td><td style="${cs}">${after}</td><td style="${cs}">${consumption}</td>`;
          } else {
            html += `<td style="${cs}">—</td><td style="${cs}">—</td><td style="${cs}">—</td>`;
          }
        });

        // Total column
        if (hasAny) {
          html += `<td style="${cs}font-weight:bold;">${Math.round(sumBefore)}</td>`;
          html += `<td style="${cs}font-weight:bold;">${Math.round(sumAfter)}</td>`;
          html += `<td style="${cs}font-weight:bold;">${Math.round(sumConsumption)}</td>`;
        } else {
          html += `<td style="${cs}">—</td><td style="${cs}">—</td><td style="${cs}">—</td>`;
        }

        html += '</tr>';
      });
    });

    html += '</table>';
    return html;
  };

  /** 下载汇总表（Excel HTML格式） */
  const doExportSummaryXls = async (todayOnly: boolean) => {
    setExporting(true);
    setExportDropdownOpen(false);
    setExportMsg(null);
    try {
      const { logs, stationSnMap } = await exportReport(todayOnly);
      if (logs.length === 0) {
        setExportMsg({ type: 'info', text: todayOnly ? `${selectedDate} 暂无取餐记录` : '暂无任何取餐记录' });
        return;
      }
      const label = todayOnly ? selectedDate : '全部日期';
      const tableHtml = buildSummaryHtmlTable(logs, stationSnMap, label);
      const fullHtml = [
        '<!DOCTYPE html><html><head>',
        '<meta charset="UTF-8">',
        '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">',
        '</head><body>',
        tableHtml,
        '</body></html>',
      ].join('');
      const blob = new Blob([fullHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `取餐消耗汇总表_${label}.xls`;
      link.click();
      URL.revokeObjectURL(url);
      setExportMsg({ type: 'success', text: `已导出汇总表（${logs.length} 条记录）` });
    } catch (err: any) {
      setExportMsg({ type: 'error', text: `导出失败：${err.message || '未知错误'}` });
    } finally {
      setExporting(false);
    }
  };

  /** 导出取餐报告（含大队分类 + 餐盘餐段统计） */
  const doExportReport = async (todayOnly: boolean) => {
    setExporting(true);
    setExportDropdownOpen(false);
    setExportMsg(null);
    try {
      const { logs, stationSnMap } = await exportReport(todayOnly);
      if (logs.length === 0) {
        setExportMsg({ type: 'info', text: todayOnly ? `${selectedDate} 暂无取餐记录可导出` : '暂无任何取餐记录可导出' });
        return;
      }
      const csv = buildReportCsv(logs, stationSnMap);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const label = todayOnly ? selectedDate : '全部';
      link.download = `取餐报告_${label}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setExportMsg({ type: 'success', text: `已导出取餐报告（${logs.length} 条记录）` });
    } catch (err: any) {
      setExportMsg({ type: 'error', text: `导出失败：${err.message || '未知错误'}` });
    } finally {
      setExporting(false);
    }
  };

  const hasMore = records.length === pageSize;

  return (
    <div className="space-y-4">
      {/* 导出结果提示 */}
      {exportMsg && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs ${
          exportMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
          exportMsg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' :
          'bg-slate-50 text-slate-600 border border-slate-100'
        }`}>
          <i className={`${
            exportMsg.type === 'success' ? 'ri-checkbox-circle-line' :
            exportMsg.type === 'error' ? 'ri-error-warning-line' :
            'ri-information-line'
          }`} />
          {exportMsg.text}
        </div>
      )}

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Date switcher */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
            <button
              type="button"
              onClick={() => changeDate(-1)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 cursor-pointer"
            >
              <i className="ri-arrow-left-s-line text-slate-500 text-sm" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs text-slate-700 bg-transparent focus:outline-none cursor-pointer px-1"
            />
            <button
              type="button"
              onClick={() => changeDate(1)}
              disabled={isToday}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <i className="ri-arrow-right-s-line text-slate-500 text-sm" />
            </button>
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayBeijing())}
                className="text-xs text-emerald-600 px-2 py-0.5 rounded hover:bg-emerald-50 cursor-pointer whitespace-nowrap"
              >
                回到今天
              </button>
            )}
          </div>

          {/* Meal type filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 flex-shrink-0">餐段</span>
            <div className="flex bg-slate-50 border border-slate-200 rounded-lg p-1 gap-0.5">
              {MEAL_TYPES.map((m: string) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMeal(m)}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                    selectedMeal === m
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 flex-shrink-0">菜系</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-slate-400 cursor-pointer"
            >
              {categories.map((c: string) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="text"
                placeholder="搜索菜品或托盘编号..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 w-48 focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          <div className="flex-1" />

          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExportDropdownOpen(!exportDropdownOpen); }}
              disabled={exporting}
              className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <i className="ri-download-2-line" />导出 CSV
                  <i className="ri-arrow-down-s-line text-[10px]" />
                </>
              )}
            </button>
            {exportDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-[160px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-3 py-1.5 text-[10px] text-slate-400 uppercase tracking-wide">简易导出</div>
                <button
                  type="button"
                  onClick={() => doExport(true)}
                  className="w-full text-left text-xs text-slate-700 px-4 py-2.5 hover:bg-slate-50 cursor-pointer whitespace-nowrap flex items-center gap-2"
                >
                  <i className="ri-calendar-check-line text-slate-400" />
                  导出当天
                </button>
                <button
                  type="button"
                  onClick={() => doExport(false)}
                  className="w-full text-left text-xs text-slate-700 px-4 py-2.5 hover:bg-slate-50 cursor-pointer whitespace-nowrap flex items-center gap-2"
                >
                  <i className="ri-archive-line text-slate-400" />
                  导出全部
                </button>
                <div className="border-t border-slate-100 my-0.5" />
                <div className="px-3 py-1.5 text-[10px] text-slate-400 uppercase tracking-wide">取餐报告（含大队分类+餐段统计）</div>
                <button
                  type="button"
                  onClick={() => doExportReport(true)}
                  className="w-full text-left text-xs text-slate-700 px-4 py-2.5 hover:bg-slate-50 cursor-pointer whitespace-nowrap flex items-center gap-2"
                >
                  <i className="ri-file-chart-line text-slate-400" />
                  导出当天报告
                </button>
                <button
                  type="button"
                  onClick={() => doExportReport(false)}
                  className="w-full text-left text-xs text-slate-700 px-4 py-2.5 hover:bg-slate-50 cursor-pointer whitespace-nowrap flex items-center gap-2"
                >
                  <i className="ri-folder-chart-line text-slate-400" />
                  导出全部报告
                </button>
                <div className="border-t border-slate-100 my-0.5" />
                <div className="px-3 py-1.5 text-[10px] text-amber-500 uppercase tracking-wide">汇总表（每大队每道菜餐前/餐后）</div>
                <button
                  type="button"
                  onClick={() => doExportSummaryXls(true)}
                  className="w-full text-left text-xs text-slate-700 px-4 py-2.5 hover:bg-amber-50 cursor-pointer whitespace-nowrap flex items-center gap-2"
                >
                  <i className="ri-table-line text-amber-500" />
                  下载当天汇总表 (.xls)
                </button>
                <button
                  type="button"
                  onClick={() => doExportSummaryXls(false)}
                  className="w-full text-left text-xs text-slate-700 px-4 py-2.5 hover:bg-amber-50 cursor-pointer whitespace-nowrap flex items-center gap-2"
                >
                  <i className="ri-file-excel-2-line text-amber-500" />
                  下载全部汇总表 (.xls)
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={refetch}
            className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line" />刷新
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '取餐总次数', value: stats.total_pickups.toString(), unit: '次', icon: 'ri-swap-box-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '取餐总重量', value: stats.total_weight >= 1000 ? `${(stats.total_weight / 1000).toFixed(1)}` : Math.round(stats.total_weight).toString(), unit: stats.total_weight >= 1000 ? 'kg' : 'g', icon: 'ri-weight-line', color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: '涉及菜品', value: stats.unique_dishes.toString(), unit: '种', icon: 'ri-bowl-line', color: 'text-sky-600', bg: 'bg-sky-50' },
          { label: '涉及托盘', value: stats.unique_stations.toString(), unit: '个', icon: 'ri-dashboard-3-line', color: 'text-teal-600', bg: 'bg-teal-50' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${s.bg}`}>
              <i className={`${s.icon} ${s.color} text-xl`} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">
                {s.value}
                <span className="text-xs text-slate-400 font-normal ml-1">{s.unit}</span>
              </p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Records table */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm ml-3">加载取餐记录...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="ri-error-warning-line text-3xl mb-2 text-red-400" />
            <p className="text-sm mb-3">{error}</p>
            <button
              type="button"
              onClick={refetch}
              className="text-sm border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              重试
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="ri-inbox-2-line text-4xl mb-3" />
            <p className="text-sm font-medium text-slate-600">暂无取餐记录</p>
            <p className="text-xs mt-1 max-w-xs text-center">
              {selectedDate} {selectedMeal !== '全部' ? selectedMeal : ''} 暂无取餐明细数据。可切换日期或餐段查看。
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 w-12">#</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">取餐时间</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">餐段</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">托盘编号</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">菜品名称</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">菜系</th>
                    <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">取餐前(g)</th>
                    <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">取餐后(g)</th>
                    <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">取餐量</th>
                    <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">份数</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">人员ID</th>
                    <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">来源</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.map((r: PickupDetail, idx: number) => {
                    const catColor = CATEGORY_COLORS[r.category] || 'bg-slate-50 text-slate-500';
                    const sourceLabel = SOURCE_LABELS[r.source || ''] || r.source || '手动录入';
                    const sourceColor = r.source === 'auto' || r.source === 'scale'
                      ? 'bg-sky-50 text-sky-600'
                      : 'bg-slate-100 text-slate-500';

                    return (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-slate-400">{currentPage * pageSize + idx + 1}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          <div>{formatTime(r.pickup_time)}</div>
                          <div className="text-slate-400 text-[10px]">{formatDateShort(r.pickup_time)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-600">{r.meal_type}</span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{r.station_code}</td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {r.dish_name && r.dish_name !== '未命名菜品' ? (
                            <span className="text-slate-800">{r.dish_name}</span>
                          ) : (
                            <span className="text-amber-500 text-xs flex items-center gap-1">
                              <i className="ri-error-warning-line" />未命名（托盘未绑定菜品）
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${catColor}`}>
                            {r.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 text-right font-mono">
                          {Number(r.weight_before).toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 text-right font-mono">
                          {Math.max(0, Number(r.weight_before) - Number(r.pickup_weight)).toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-semibold ${Number(r.pickup_weight) > 1000 ? 'text-amber-600' : 'text-slate-800'}`}>
                            {formatWeight(Number(r.pickup_weight))}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-slate-600">{r.pickup_portions}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{r.person_id || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${sourceColor}`}>
                            {sourceLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 max-w-[150px] truncate" title={r.notes || ''}>
                          {r.notes || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-50">
              <span className="text-xs text-slate-400">
                第 {currentPage + 1} 页 · 每页 {pageSize} 条
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="flex items-center gap-1 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <i className="ri-arrow-left-s-line" />上一页
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={!hasMore}
                  className="flex items-center gap-1 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一页<i className="ri-arrow-right-s-line" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
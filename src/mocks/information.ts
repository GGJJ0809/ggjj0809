export const contentItems = [
  { id: 'CT001', title: '本周菜谱公告', type: '菜谱公告', template: '菜谱模板', status: 'published', screens: ['LED-大厅01', 'LED-入口01'], publishTime: '2026-05-13 08:00:00', updateTime: '2026-05-13 07:45:22', author: '张三', preview: '本周（5月13日-19日）午餐菜谱如下：周一红烧肉、周二宫保鸡丁、周三清蒸鱼...' },
  { id: 'CT002', title: '食品安全公示栏', type: '安全公示', template: '公示模板', status: 'published', screens: ['LED-大厅01', 'LED-大厅02', 'LED-入口01'], publishTime: '2026-05-01 00:00:00', updateTime: '2026-05-14 09:00:00', author: '管理员', preview: '本月食品安全检测结果：共抽检样品48批次，合格率100%，菌落总数等指标均符合国家标准...' },
  { id: 'CT003', name: '今日特别提示', title: '今日特别提示', type: '临时通知', template: '通知模板', status: 'published', screens: ['LED-大厅02'], publishTime: '2026-05-14 11:30:00', updateTime: '2026-05-14 11:28:00', author: '李四', preview: '因供应商原因，今日晚餐时段的清蒸鱼更换为清蒸鲈鱼，营养价值相近，敬请谅解...' },
  { id: 'CT004', title: '食堂满意度调查', type: '互动内容', template: '调查模板', status: 'draft', screens: [], publishTime: '', updateTime: '2026-05-14 14:22:00', author: '王五', preview: '亲爱的就餐员工，为了提升食堂服务质量，请参与本次满意度调查...' },
  { id: 'CT005', title: '节假日通知', type: '临时通知', template: '通知模板', status: 'scheduled', screens: ['LED-大厅01', 'LED-大厅02', 'LED-入口01'], publishTime: '2026-05-18 08:00:00', updateTime: '2026-05-14 15:00:00', author: '管理员', preview: '端午节假期（6月7日-9日）食堂正常开放，供应特色端午节餐品...' },
  { id: 'CT006', title: '上月运营报告', type: '统计报告', template: '报告模板', status: 'archived', screens: [], publishTime: '2026-05-01 00:00:00', updateTime: '2026-05-01 00:00:00', author: '管理员', preview: '2026年4月食堂运营月报：共服务就餐人次62,580次，餐品满意度评分4.6分...' },
];

export const screenDevices = [
  { id: 'LED-001', name: 'LED-大厅01', location: '就餐大厅-入口', resolution: '1920×1080', type: 'LED显示屏', status: 'online', currentContent: '本周菜谱公告', brightness: 80, ip: '192.168.1.101', lastPush: '2026-05-14 08:00:15', zones: ['菜谱区', '公告区', 'Logo区'] },
  { id: 'LED-002', name: 'LED-大厅02', location: '就餐大厅-中央', resolution: '3840×2160', type: 'LED大屏', status: 'online', currentContent: '食品安全公示栏', brightness: 75, ip: '192.168.1.102', lastPush: '2026-05-14 09:00:05', zones: ['主内容区', '滚动字幕区'] },
  { id: 'LED-003', name: 'LED-入口01', location: '食堂主入口', resolution: '1920×1080', type: 'LED显示屏', status: 'online', currentContent: '本周菜谱公告', brightness: 90, ip: '192.168.1.103', lastPush: '2026-05-14 08:00:18', zones: ['欢迎区', '公告区'] },
  { id: 'LED-004', name: 'LED-结算台01', location: '结算台上方', resolution: '1280×720', type: '液晶显示器', status: 'warning', currentContent: '价格公示', brightness: 70, ip: '192.168.1.104', lastPush: '2026-05-14 07:55:01', zones: ['价格显示区'] },
  { id: 'LED-005', name: 'LED-后厨01', location: '后厨操作区', resolution: '1920×1080', type: '防水显示屏', status: 'offline', currentContent: '操作规范指引', brightness: 60, ip: '192.168.1.105', lastPush: '2026-05-13 18:00:00', zones: ['操作规范区', '提示区'] },
];

export const contentTemplates = [
  { id: 'T001', name: '菜谱模板', type: '菜谱公告', zones: ['菜谱区', '价格区', 'Logo区', '日期区'] },
  { id: 'T002', name: '公示模板', type: '安全公示', zones: ['标题区', '正文区', '图片区', '日期区'] },
  { id: 'T003', name: '通知模板', type: '临时通知', zones: ['通知标题', '正文内容', '日期时间'] },
  { id: 'T004', name: '调查模板', type: '互动内容', zones: ['问卷区', '二维码区'] },
  { id: 'T005', name: '报告模板', type: '统计报告', zones: ['图表区', '数据区', '说明区'] },
];
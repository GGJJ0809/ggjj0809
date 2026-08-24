export const dishes = [
  { id: 'D001', name: '红烧肉', category: '荤菜', price: 18, calories: 450, protein: 22, fat: 32, carbs: 15, fiber: 0.5, method: '先焯水去腥，再用老抽、生抽、冰糖、八角等大火收汁，小火焖煮40分钟至软糯。', nutrition: '富含蛋白质和脂肪，提供丰富能量', contraindications: '高血脂、心血管疾病患者、减重人群应少食', img: 'https://readdy.ai/api/search-image?query=braised%20pork%20belly%20chinese%20style%20red%20braised%20meat%20beautiful%20plating%20food%20photography%20white%20background&width=200&height=200&seq=d001&orientation=squarish', status: 'active' },
  { id: 'D002', name: '清炒西兰花', category: '素菜', price: 8, calories: 95, protein: 4, fat: 3, carbs: 12, fiber: 3.2, method: '西兰花焯水后过冷水保绿色，蒜末爆香，大火翻炒2分钟加盐调味。', nutrition: '富含维生素C、维生素K和膳食纤维，抗氧化效果好', contraindications: '甲状腺功能减退患者适量食用', img: 'https://readdy.ai/api/search-image?query=stir%20fried%20broccoli%20chinese%20style%20green%20vegetable%20dish%20garlic%20beautiful%20plating%20food%20photography&width=200&height=200&seq=d002&orientation=squarish', status: 'active' },
  { id: 'D003', name: '番茄炒鸡蛋', category: '家常菜', price: 10, calories: 180, protein: 8, fat: 10, carbs: 14, fiber: 1.2, method: '鸡蛋打散炒熟盛出，番茄切块下锅翻炒出汁，放入鸡蛋，加盐、糖调味。', nutrition: '含丰富番茄红素和优质蛋白质，营养均衡', contraindications: '胃酸过多者少食', img: 'https://readdy.ai/api/search-image?query=scrambled%20eggs%20with%20tomatoes%20chinese%20home%20style%20cooking%20beautiful%20food%20photography%20white%20plate&width=200&height=200&seq=d003&orientation=squarish', status: 'active' },
  { id: 'D004', name: '鱼香肉丝', category: '荤菜', price: 16, calories: 320, protein: 18, fat: 18, carbs: 20, fiber: 1.8, method: '猪里脊切丝腌制，泡椒、豆瓣酱爆香，下肉丝翻炒，加调好的鱼香汁勾芡出锅。', nutrition: '含丰富蛋白质和多种维生素', contraindications: '脾胃虚寒者少食辛辣', img: 'https://readdy.ai/api/search-image?query=yu%20xiang%20rou%20si%20spicy%20pork%20shreds%20chinese%20sichuan%20style%20food%20dish%20beautiful%20plating&width=200&height=200&seq=d004&orientation=squarish', status: 'active' },
  { id: 'D005', name: '蒸米饭', category: '主食', price: 3, calories: 200, protein: 4, fat: 0.5, carbs: 44, fiber: 0.4, method: '洗米加水，水米比例1:1.2，电饭锅蒸煮25分钟。', nutrition: '提供基础碳水化合物，补充能量', contraindications: '糖尿病患者适量食用', img: 'https://readdy.ai/api/search-image?query=steamed%20white%20rice%20japanese%20style%20bowl%20beautiful%20food%20photography%20soft%20light&width=200&height=200&seq=d005&orientation=squarish', status: 'active' },
  { id: 'D006', name: '紫菜蛋花汤', category: '汤品', price: 5, calories: 60, protein: 5, fat: 2, carbs: 5, fiber: 0.8, method: '清水煮沸加入紫菜，打入鸡蛋花，加盐、香油、葱花调味。', nutrition: '含碘、铁等矿物质，助消化', contraindications: '甲亢患者少食含碘食物', img: 'https://readdy.ai/api/search-image?query=seaweed%20egg%20drop%20soup%20chinese%20style%20bowl%20beautiful%20food%20photography&width=200&height=200&seq=d006&orientation=squarish', status: 'active' },
  { id: 'D007', name: '宫保鸡丁', category: '荤菜', price: 18, calories: 380, protein: 24, fat: 22, carbs: 18, fiber: 1.5, method: '鸡肉切丁腌制，花生米炸香，辣椒、花椒爆香后下鸡丁，加宫保汁翻炒均匀。', nutrition: '高蛋白质，花生含不饱和脂肪酸', contraindications: '对花生过敏者禁食', img: 'https://readdy.ai/api/search-image?query=kung%20pao%20chicken%20chinese%20spicy%20dish%20peanuts%20peppers%20beautiful%20plating%20food%20photography&width=200&height=200&seq=d007&orientation=squarish', status: 'active' },
  { id: 'D008', name: '凉拌黄瓜', category: '凉菜', price: 6, calories: 45, protein: 1.5, fat: 2, carbs: 6, fiber: 0.8, method: '黄瓜拍碎切段，加蒜末、辣椒油、生抽、醋、香油拌匀，腌制10分钟。', nutrition: '低热量，富含水分和维生素，帮助消暑', contraindications: '脾胃虚寒者少食生冷', img: 'https://readdy.ai/api/search-image?query=cold%20cucumber%20salad%20chinese%20style%20appetizer%20garlic%20chili%20food%20photography%20beautiful%20plating&width=200&height=200&seq=d008&orientation=squarish', status: 'inactive' },
];

export const mealAnalysisData = [
  { date: '05-08', breakfast: 412, lunch: 982, dinner: 618, totalCalories: 185420 },
  { date: '05-09', breakfast: 388, lunch: 1055, dinner: 592, totalCalories: 189300 },
  { date: '05-10', breakfast: 445, lunch: 928, dinner: 642, totalCalories: 182100 },
  { date: '05-11', breakfast: 392, lunch: 1102, dinner: 684, totalCalories: 196800 },
  { date: '05-12', breakfast: 461, lunch: 1028, dinner: 714, totalCalories: 194500 },
  { date: '05-13', breakfast: 418, lunch: 996, dinner: 652, totalCalories: 187200 },
  { date: '05-14', breakfast: 434, lunch: 1042, dinner: 711, totalCalories: 193100 },
];

export const nutritionDistribution = [
  { name: '碳水化合物', value: 55, color: '#f59e0b' },
  { name: '蛋白质', value: 25, color: '#10b981' },
  { name: '脂肪', value: 20, color: '#ef4444' },
];

export const mealRecords = [
  { id: 'MR001', time: '2026-05-14 12:05:32', person: '员工 A-0312', items: ['红烧肉', '清炒西兰花', '蒸米饭', '紫菜蛋花汤'], calories: 803, protein: 49, fat: 47.5, status: 'normal' },
  { id: 'MR002', time: '2026-05-14 12:06:11', person: '员工 B-0587', items: ['番茄炒鸡蛋', '蒸米饭', '紫菜蛋花汤'], calories: 440, protein: 17, fat: 12.5, status: 'low_calorie' },
  { id: 'MR003', time: '2026-05-14 12:07:44', person: '员工 C-1024', items: ['宫保鸡丁', '蒸米饭', '凉拌黄瓜'], calories: 625, protein: 29.5, fat: 24.5, status: 'normal' },
  { id: 'MR004', time: '2026-05-14 12:08:22', person: '员工 D-0891', items: ['红烧肉', '鱼香肉丝', '蒸米饭', '蒸米饭'], calories: 1170, protein: 58, fat: 82, status: 'high_calorie' },
  { id: 'MR005', time: '2026-05-14 12:09:55', person: '员工 E-2201', items: ['清炒西兰花', '番茄炒鸡蛋', '紫菜蛋花汤'], calories: 335, protein: 17.5, fat: 15, status: 'low_calorie' },
];

export const sampleRecords = [
  { id: 'SP001', date: '2026-05-14', meal: '午餐', dish: '红烧肉', weight: 125, cabinetId: 'CB-01', slot: 'A3', sampleTime: '11:45:00', status: 'stored', expireTime: '2026-05-16 11:45:00' },
  { id: 'SP002', date: '2026-05-14', meal: '午餐', dish: '清炒西兰花', weight: 106, cabinetId: 'CB-01', slot: 'A4', sampleTime: '11:46:30', status: 'stored', expireTime: '2026-05-16 11:46:30' },
  { id: 'SP003', date: '2026-05-14', meal: '午餐', dish: '番茄炒鸡蛋', weight: 112, cabinetId: 'CB-01', slot: 'A5', sampleTime: '11:47:15', status: 'stored', expireTime: '2026-05-16 11:47:15' },
  { id: 'SP004', date: '2026-05-14', meal: '午餐', dish: '紫菜蛋花汤', weight: 200, cabinetId: 'CB-02', slot: 'B1', sampleTime: '11:48:00', status: 'stored', expireTime: '2026-05-16 11:48:00' },
  { id: 'SP005', date: '2026-05-14', meal: '早餐', dish: '豆腐脑', weight: 218, cabinetId: 'CB-01', slot: 'A1', sampleTime: '07:30:00', status: 'stored', expireTime: '2026-05-16 07:30:00' },
  { id: 'SP006', date: '2026-05-14', meal: '早餐', dish: '包子', weight: 95, cabinetId: 'CB-01', slot: 'A2', sampleTime: '07:31:20', status: 'stored', expireTime: '2026-05-16 07:31:20' },
  { id: 'SP007', date: '2026-05-13', meal: '晚餐', dish: '清蒸鱼', weight: 132, cabinetId: 'CB-02', slot: 'B3', sampleTime: '17:15:00', status: 'expired', expireTime: '2026-05-15 17:15:00' },
];

export const acceptanceRecords = [
  { id: 'AC001', time: '2026-05-14 07:15:22', ingredient: '猪里脊肉', supplier: '天厨鲜肉供应商', expected: 50, actual: 51.2, deviation: 2.4, unit: 'kg', inspector: '李四', status: 'pass', certificates: ['动物检疫合格证', '肉品品质检验合格证'] },
  { id: 'AC002', time: '2026-05-14 07:28:44', ingredient: '西兰花', supplier: '绿源蔬菜基地', expected: 30, actual: 27.6, deviation: -8.0, unit: 'kg', inspector: '李四', status: 'warning', certificates: ['无公害农产品证书'] },
  { id: 'AC003', time: '2026-05-14 07:42:10', ingredient: '鸡蛋', supplier: '正大食品有限公司', expected: 200, actual: 199, deviation: -0.5, unit: '枚', inspector: '张三', status: 'pass', certificates: ['产品合格证'] },
  { id: 'AC004', time: '2026-05-14 08:05:33', ingredient: '大米', supplier: '苏北粮仓合作社', expected: 100, actual: 100.5, deviation: 0.5, unit: 'kg', inspector: '张三', status: 'pass', certificates: ['绿色食品证书', '产品质量合格证'] },
  { id: 'AC005', time: '2026-05-14 08:22:58', ingredient: '食用油', supplier: '金龙鱼贸易公司', expected: 20, actual: 18.1, deviation: -9.5, unit: 'L', inspector: '王五', status: 'fail', certificates: ['产品合格证'] },
  { id: 'AC006', time: '2026-05-14 08:45:11', ingredient: '番茄', supplier: '绿源蔬菜基地', expected: 40, actual: 39.6, deviation: -1.0, unit: 'kg', inspector: '王五', status: 'pass', certificates: ['无公害农产品证书'] },
];
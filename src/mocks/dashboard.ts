export const statsData = [
  {
    id: 1,
    label: '在线传感器',
    value: '42',
    unit: '个',
    change: '+3',
    changeType: 'up',
    icon: 'ri-sensor-line',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    id: 2,
    label: '今日报警',
    value: '7',
    unit: '次',
    change: '-2',
    changeType: 'down',
    icon: 'ri-alarm-warning-line',
    color: 'text-red-500',
    bg: 'bg-red-50',
  },
  {
    id: 3,
    label: 'AI识别事件',
    value: '156',
    unit: '条',
    change: '+12',
    changeType: 'up',
    icon: 'ri-eye-line',
    color: 'text-amber-500',
    bg: 'bg-amber-50',
  },
  {
    id: 4,
    label: '今日就餐人数',
    value: '2,381',
    unit: '人次',
    change: '+89',
    changeType: 'up',
    icon: 'ri-restaurant-line',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
];

export const airQualityData = [
  { time: '06:00', pm25: 18, pm10: 32, temp: 22, humidity: 65 },
  { time: '07:00', pm25: 24, pm10: 41, temp: 23, humidity: 63 },
  { time: '08:00', pm25: 35, pm10: 58, temp: 25, humidity: 60 },
  { time: '09:00', pm25: 28, pm10: 47, temp: 26, humidity: 58 },
  { time: '10:00', pm25: 20, pm10: 36, temp: 27, humidity: 56 },
  { time: '11:00', pm25: 42, pm10: 68, temp: 28, humidity: 54 },
  { time: '12:00', pm25: 58, pm10: 89, temp: 29, humidity: 52 },
  { time: '13:00', pm25: 65, pm10: 96, temp: 30, humidity: 50 },
  { time: '14:00', pm25: 48, pm10: 75, temp: 29, humidity: 53 },
  { time: '15:00', pm25: 32, pm10: 52, temp: 28, humidity: 55 },
  { time: '16:00', pm25: 25, pm10: 44, temp: 27, humidity: 57 },
  { time: '17:00', pm25: 38, pm10: 62, temp: 26, humidity: 59 },
  { time: '18:00', pm25: 55, pm10: 84, temp: 25, humidity: 61 },
];

export const alarmRecords = [
  {
    id: 1,
    time: '13:42',
    type: '空气质量',
    level: 'high',
    message: 'PM2.5超标：后厨区域 65μg/m³（阈值50）',
    location: '后厨区-传感器03',
    status: 'unconfirmed',
  },
  {
    id: 2,
    time: '12:18',
    type: 'AI行为',
    level: 'medium',
    message: '检测到未佩戴口罩人员进入操作区',
    location: '摄像头07-备餐间',
    status: 'confirmed',
  },
  {
    id: 3,
    time: '11:55',
    type: '设备离线',
    level: 'low',
    message: '温湿度传感器心跳超时，设备可能离线',
    location: '冷库区-传感器12',
    status: 'confirmed',
  },
  {
    id: 4,
    time: '10:30',
    type: 'AI行为',
    level: 'high',
    message: '检测到疑似吸烟行为',
    location: '摄像头02-员工休息区',
    status: 'confirmed',
  },
  {
    id: 5,
    time: '09:15',
    type: '食材验收',
    level: 'medium',
    message: '蔬菜验收重量偏差超过允许范围（-8.2%）',
    location: '验收区-磅秤01',
    status: 'confirmed',
  },
  {
    id: 6,
    time: '08:47',
    type: '空气质量',
    level: 'low',
    message: '温度异常：就餐大厅温度31.5℃超出舒适范围',
    location: '就餐大厅-传感器01',
    status: 'confirmed',
  },
];

export const mealTrendData = [
  { date: '05-08', breakfast: 420, lunch: 980, dinner: 620 },
  { date: '05-09', breakfast: 380, lunch: 1050, dinner: 590 },
  { date: '05-10', breakfast: 445, lunch: 920, dinner: 640 },
  { date: '05-11', breakfast: 390, lunch: 1100, dinner: 680 },
  { date: '05-12', breakfast: 460, lunch: 1020, dinner: 710 },
  { date: '05-13', breakfast: 410, lunch: 990, dinner: 650 },
  { date: '05-14', breakfast: 432, lunch: 1040, dinner: 709 },
];

export const deviceStatusData = [
  { name: '传感器在线', value: 42, color: '#10b981' },
  { name: '传感器离线', value: 3, color: '#ef4444' },
  { name: '传感器维护', value: 2, color: '#f59e0b' },
];

export const aiEventTypes = [
  { name: '未戴口罩', count: 48, icon: 'ri-surgical-mask-line', color: 'text-red-500' },
  { name: '疑似吸烟', count: 12, icon: 'ri-fire-line', color: 'text-orange-500' },
  { name: '未穿工服', count: 31, icon: 'ri-shirt-line', color: 'text-amber-500' },
  { name: '操作规范', count: 65, icon: 'ri-shield-check-line', color: 'text-emerald-500' },
];

export const sensorStatusList = [
  { id: 'S001', name: '后厨-空气01', type: '空气质量', pm25: 42, temp: 29, status: 'warning' },
  { id: 'S002', name: '就餐大厅-空气01', type: '空气质量', pm25: 18, temp: 26, status: 'normal' },
  { id: 'S003', name: '冷库-温湿度01', type: '温湿度', pm25: null, temp: 4, status: 'normal' },
  { id: 'S004', name: '备餐间-空气01', type: '空气质量', pm25: 35, temp: 27, status: 'normal' },
  { id: 'S005', name: '验收区-温湿度01', type: '温湿度', pm25: null, temp: 22, status: 'offline' },
];
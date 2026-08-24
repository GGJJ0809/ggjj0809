export const zones = ['后厨区', '就餐大厅', '备餐间', '冷库区', '验收区'];

export const currentAirQuality = [
  { zone: '后厨区', pm25: 58, pm10: 89, temp: 32, humidity: 68, status: 'warning' },
  { zone: '就餐大厅', pm25: 22, pm10: 38, temp: 27, humidity: 58, status: 'good' },
  { zone: '备餐间', pm25: 35, pm10: 54, temp: 28, humidity: 62, status: 'normal' },
  { zone: '冷库区', pm25: 8, pm10: 15, temp: 4, humidity: 85, status: 'good' },
  { zone: '验收区', pm25: 41, pm10: 67, temp: 26, humidity: 55, status: 'normal' },
];

export const airHistoryData = [
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

export const sensorDevices = [
  { id: 'S001', name: '后厨区-综合传感器01', type: '综合传感器', zone: '后厨区', protocol: 'MQTT', lastOnline: '2026-05-14 18:32:10', status: 'online', firmware: 'v2.3.1' },
  { id: 'S002', name: '就餐大厅-空气01', type: '空气质量', zone: '就餐大厅', protocol: 'HTTP', lastOnline: '2026-05-14 18:32:05', status: 'online', firmware: 'v2.1.0' },
  { id: 'S003', name: '冷库区-温湿度01', type: '温湿度', zone: '冷库区', protocol: 'Modbus', lastOnline: '2026-05-14 18:31:58', status: 'online', firmware: 'v1.8.5' },
  { id: 'S004', name: '备餐间-空气01', type: '空气质量', zone: '备餐间', protocol: 'MQTT', lastOnline: '2026-05-14 18:32:08', status: 'online', firmware: 'v2.3.1' },
  { id: 'S005', name: '验收区-温湿度01', type: '温湿度', zone: '验收区', protocol: 'HTTP', lastOnline: '2026-05-14 16:45:22', status: 'offline', firmware: 'v2.0.3' },
  { id: 'S006', name: '后厨区-综合传感器02', type: '综合传感器', zone: '后厨区', protocol: 'MQTT', lastOnline: '2026-05-14 18:30:01', status: 'warning', firmware: 'v2.3.1' },
  { id: 'S007', name: '就餐大厅-温湿度01', type: '温湿度', zone: '就餐大厅', protocol: 'Modbus', lastOnline: '2026-05-14 18:32:03', status: 'online', firmware: 'v1.9.2' },
  { id: 'S008', name: '冷库区-温湿度02', type: '温湿度', zone: '冷库区', protocol: 'Modbus', lastOnline: '2026-05-14 18:20:15', status: 'maintenance', firmware: 'v1.8.5' },
];

export const alarmEvents = [
  { id: 'A001', time: '2026-05-14 13:42:15', type: '空气质量', level: 'high', sensor: 'S001', zone: '后厨区', message: 'PM2.5超标：65μg/m³（阈值50μg/m³）', status: 'unconfirmed', operator: '' },
  { id: 'A002', time: '2026-05-14 12:18:30', type: '温度异常', level: 'medium', sensor: 'S007', zone: '就餐大厅', message: '温度偏高：31.5℃（上限30℃）', status: 'confirmed', operator: '张三' },
  { id: 'A003', time: '2026-05-14 11:55:08', type: '设备离线', level: 'low', sensor: 'S005', zone: '验收区', message: '心跳超时，设备可能离线，请检查网络连接', status: 'resolved', operator: '李四' },
  { id: 'A004', time: '2026-05-14 10:30:22', type: '空气质量', level: 'high', sensor: 'S006', zone: '后厨区', message: 'PM10超标：96μg/m³（阈值75μg/m³）', status: 'confirmed', operator: '王五' },
  { id: 'A005', time: '2026-05-14 09:15:44', type: '湿度异常', level: 'medium', sensor: 'S003', zone: '冷库区', message: '湿度过高：92%（上限85%）', status: 'resolved', operator: '张三' },
  { id: 'A006', time: '2026-05-14 08:47:11', type: '设备离线', level: 'low', sensor: 'S008', zone: '冷库区', message: '传感器进入维护模式，数据暂停上报', status: 'resolved', operator: '李四' },
  { id: 'A007', time: '2026-05-13 17:22:55', type: '空气质量', level: 'high', sensor: 'S001', zone: '后厨区', message: 'CO₂浓度偏高：1250ppm（阈值1000ppm）', status: 'resolved', operator: '王五' },
  { id: 'A008', time: '2026-05-13 14:08:33', type: '温度异常', level: 'medium', sensor: 'S003', zone: '冷库区', message: '冷库温度升高：8℃（上限6℃），请检查制冷设备', status: 'resolved', operator: '张三' },
];
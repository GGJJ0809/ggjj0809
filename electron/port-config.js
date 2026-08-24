import fs from 'fs';
import path from 'path';

const DEFAULTS = {
  httpPort: 8081,
  fixedHttpPort: true,
  mqttPort: 1883,
  fixedMqttPort: false,
};

export function getPortConfig(userDataPath) {
  const configPath = path.join(userDataPath, 'port-config.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const data = JSON.parse(raw);
      return { ...DEFAULTS, ...data };
    }
  } catch (e) {
    console.warn('[PortConfig] 读取配置失败，使用默认值:', e.message);
  }
  return { ...DEFAULTS };
}

export function savePortConfig(userDataPath, config) {
  const configPath = path.join(userDataPath, 'port-config.json');
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log('[PortConfig] 配置已保存:', JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('[PortConfig] 保存配置失败:', e.message);
    return false;
  }
}
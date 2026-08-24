# 智能留样柜 HTTP API 接口文档

## 概述

本系统通过 HTTP 代理方式与局域网内的智能留样柜通信。管理端（端口 8081）作为中间层，前端页面操作 → 管理端 local-server → 转发到留样柜设备。

---

## 通用说明

- **编码格式**：所有接口请求和响应均使用 `application/x-www-form-urlencoded`
- **认证方式**：登录后获取 Token，后续请求在 Header 中携带 `Token` 字段
- **Token 有效期**：30 分钟（管理端自动缓存刷新）
- **设备默认端口**：80（可通过参数指定）

---

## 已对接接口清单

### 1. 登录认证

```
POST /user/login
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| loginName | string | 是 | 登录用户名 |
| password | string | 是 | 登录密码 |

**成功响应：**
```json
{
  "code": 1,
  "msg": "success",
  "result": {
    "token": "xxxxxxxxxxxxxxxxxxxx"
  }
}
```

---

### 2. 开始留样

```
POST /cook/keep_b
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 留样记录 ID |
| deviceId | string | 是 | 设备编号 |
| pic | string | 否 | 留样图片（Base64 或 URL） |
| weight | number | 否 | 留样重量（克） |

---

### 3. 完成留样

```
POST /cook/finish_keep
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| mealTimes | number | 是 | 餐次：0=早餐, 1=午餐, 2=晚餐 |
| gmtCook | number | 是 | 烹饪日期（时间戳，毫秒） |
| deviceId | string | 是 | 设备编号 |
| num | number | 是 | 柜门数量 |
| list | string(JSON) | 是 | 留样菜品列表 JSON 字符串 |
| state | number | 否 | 留样状态 |

---

### 4. 查询柜门列表

```
POST /door/query_list
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | string | 否 | 页码，默认 1 |
| limit | string | 否 | 每页条数，默认 20 |

---

### 5. 打开指定柜门

```
POST /door/open_one
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| num | number | 是 | 柜门编号 |

---

### 5b. 查询已打开柜门列表

```
GET /door/opened_list
```

**说明：** 设备端点击"留样完成"后，调用此接口获取今天已打开但尚未关闭的柜门列表。设备端弹窗显示这些柜门，供用户选择确认关闭。

**成功响应：**
```json
{
  "code": 1,
  "message": "success",
  "result": [
    { "num": "12", "gmtOpen": 1687200000000 }
  ]
}
```

---

### 5c. 关闭柜门

```
POST /door/close
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| num | number | 是 | 柜门编号 |

**说明：** 用户在"请选择需要上锁柜门"弹窗中点击"确认"后，设备端调用此接口记录柜门已关闭。

---

### 6. 查询留样记录

```
POST /cook/query_list
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | string | 否 | 页码，默认 1 |
| limit | string | 否 | 每页条数，默认 20 |
| mealTimes | number | 否 | 餐次筛选：0=早餐, 1=午餐, 2=晚餐 |
| gmtKeep | number | 否 | 留样日期筛选（时间戳） |
| keyword | string | 否 | 按菜名搜索关键词 |

---

### 7. 取样

```
POST /cook/take_keep
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 待确认 | — | — | 取样相关参数（需厂家提供文档确认） |

---

### 8. 紧急开门记录

```
POST /open_record/save
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| num | number | 是 | 柜门编号 |
| reason | string | 是 | 开门原因 |
| operator | string | 否 | 操作人 |

---

### 9. 清空餐次食谱

```
POST /meal/clear
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| mealTimes | string | 是 | 餐次：0=早餐, 1=午餐, 2=晚餐 |
| gmtCook | string | 是 | 烹饪日期（时间戳） |

---

### 10. 批量添加食谱

```
POST /meal/insert_list
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| list | string(JSON) | 是 | 菜品列表 JSON 字符串，格式：`[{"cookName":"菜品名","mealTimes":0,"gmtCook":"日期"},...]` |

---

### 11. 留样统计-按日查询详情

```
GET /keep_count/day_detail
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| date | string | 是 | 查询日期 |

---

### 12. 留样统计-按餐次查询汇总

```
GET /keep_count/get_day
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| gmtCook | string | 是 | 烹饪日期（时间戳） |
| mealTimes | string | 是 | 餐次：0=早餐, 1=午餐, 2=晚餐 |

---

### 13. 分页查询留样明细

```
GET /cook/query_list
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| currentPage | string | 否 | 当前页码，默认 1 |
| pageSize | string | 否 | 每页条数，默认 20 |
| gmtCook | string | 否 | 烹饪日期筛选（时间戳） |
| keyword | string | 否 | 按菜名搜索关键词 |

---

### 14. 留样查询-月历

```
GET /keep/calendar
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| yearMonth | string | 否 | 年月，格式 YYYY-MM，如 "2026-06" |
| date | string | 否 | 时间戳（毫秒），自动转为当月 |

**说明：** 设备端「留样台账-台历」调用此接口，获取某个月每一天的留样完成状态。

**成功响应：**
```json
{
  "code": 1,
  "message": "success",
  "result": {
    "yearMonth": "2026-06",
    "firstWeekday": 1,
    "daysInMonth": 30,
    "days": [
      { "day": 1, "status": 2, "hasMenu": true, "hasSample": true },
      { "day": 2, "status": 1, "hasMenu": true, "hasSample": true },
      { "day": 3, "status": 0, "hasMenu": false, "hasSample": false }
    ]
  }
}
```

**状态说明：**
| 状态值 | 含义 |
|--------|------|
| 0 | 未留样（红色） |
| 1 | 留样未完成（橙色） |
| 2 | 留样全部完成（绿色） |

---

### 15. 留样查询-日详情

```
GET /keep/day_detail
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| date | string | 否 | 日期，格式 YYYY-MM-DD |
| gmtCook | string | 否 | 时间戳（毫秒），自动转为日期 |

**说明：** 设备端点击日历某天后调用，返回该日各餐次的详细留样情况。

**成功响应：**
```json
{
  "code": 1,
  "message": "success",
  "result": {
    "date": "2026-06-12",
    "meals": [
      {
        "mealTimes": 0,
        "mealName": "早餐",
        "status": 2,
        "amount": 5,
        "alreadyAmount": 5,
        "menuItems": [
          { "id": "1", "cookName": "小米粥", "category": "主食" }
        ],
        "sampleItems": [
          { "id": "1", "cookName": "小米粥", "weight": 125, "slot": "1", "operator": "admin", "status": "stored" }
        ]
      }
    ]
  }
}
```

---

### 16. 留样查询-搜索

```
GET /keep/search
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 是 | 搜索关键词（菜名） |
| dishName | string | 否 | 同 keyword，兼容字段 |
| currentPage | string | 否 | 当前页码，默认 1 |
| pageSize | string | 否 | 每页条数，默认 20 |

**说明：** 设备端「留样查询」搜索栏调用此接口，按菜名搜索留样记录。

**成功响应：**
```json
{
  "code": 1,
  "message": "success",
  "result": {
    "total": 15,
    "list": [
      {
        "id": "1",
        "cookName": "红烧肉",
        "num": "3",
        "weight": 125,
        "pic": "http://...",
        "mealTimes": 1,
        "status": 1,
        "gmtCook": 1728652800000
      }
    ]
  }
}
```

---

## 待确认问题

1. **取样接口（/cook/take_keep）**的完整参数列表是什么？
2. 各接口的**完整返回字段含义**能否提供？
3. 设备是否支持 **MQTT 推送**（如柜门状态变化、留样到期告警）？
4. 设备固件**当前版本号**是多少？不同版本 API 是否有差异？
5. 登录接口的**默认账号密码**是什么？
6. 设备端「服务器设置」中的「测试」按钮，具体是发什么请求、期望返回什么格式？

---

### 13. 查询温度监测数据

```
GET /temperature/recently_info
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deviceId | string | 否 | 设备编号 |
| limit | number | 否 | 返回条数，默认 20 |

**说明：** 设备端底部「温度监测」面板调用此接口获取最近温度数据，用于绘制温度曲线。

**成功响应：**
```json
{
  "code": 1,
  "message": "success",
  "result": [
    {
      "id": "1",
      "deviceId": "MS-LYG-40OEZJ",
      "value": 4.0,
      "maxTem": 8.0,
      "minTem": 0.0,
      "gmtRecord": 1728652800000,
      "gmtCreate": 1728652800000
    }
  ]
}
```

---

### 14. 上报温度数据

```
POST /temperature/save
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deviceId | string | 是 | 设备编号 |
| value | number | 是 | 温度值（摄氏度） |

**说明：** 设备端定时上报当前温度数据，后端保存到本地 SQLite 并同步到云端。

**成功响应：**
```json
{
  "code": 1,
  "message": "success",
  "result": null
}
```

---

### 15. 查询使用情况汇总

```
GET /keep/usage
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deviceId | string | 是 | 设备编号 |
| token | string | 是 | 登录 token |

**说明：** 设备端底部「使用情况」面板调用此接口获取当前温度、柜门使用统计、餐次留样进度。

**成功响应：**
```json
{
  "code": 1,
  "message": "success",
  "result": {
    "currentTemp": 4.0,
    "totalDoors": 12,
    "usedDoors": 3,
    "freeDoors": 9,
    "amount": 5,
    "alreadyAmount": 3,
    "mealTimes": 1
  }
}
```

**字段说明：**
| 字段 | 说明 |
|------|------|
| currentTemp | 当前温度（摄氏度） |
| totalDoors | 柜门总数 |
| usedDoors | 已使用（已留样）柜门数 |
| freeDoors | 空闲柜门数 |
| amount | 当前餐次菜品总数 |
| alreadyAmount | 当前餐次已留样数量 |
| mealTimes | 当前餐次：0=早餐, 1=午餐, 2=晚餐 |

---

## 管理端代理接口（我方提供）

以下为管理端 8081 端口对外暴露的代理接口，供内部前端调用：

| 管理端接口 | 方法 | 说明 |
|-----------|------|------|
| `/api/keep/login` | POST | 登录获取 Token（自动缓存） |
| `/api/keep/logout` | POST | 断开连接（清除缓存） |
| `/api/keep/status` | GET | 设备连通性检测 |
| `/api/keep/start` | POST | 开始留样 |
| `/api/keep/finish` | POST | 完成留样 |
| `/api/keep/doors` | GET | 查询柜门列表 |
| `/api/keep/door/open` | POST | 打开指定柜门 |
| `/api/keep/query` | GET | 查询留样记录 |
| `/api/keep/take` | POST | 取样 |
| `/api/keep/sync` | POST | 从设备同步留样记录到云端数据库 |
| `/api/keep/door/emergency` | POST | 紧急取样 |
| `/api/keep/meal/clear` | POST | 清空某餐次食谱 |
| `/api/keep/meal/insert_list` | POST | 批量添加食谱 |
| `/api/keep/meal/sync` | POST | 同步一整天完整食谱（早/中/晚） |
| `/api/keep/count/day_detail` | GET | 查询某天各餐次留样详情 |
| `/api/keep/count/get_day` | GET | 查询某天某餐次汇总 |
| `/api/keep/cook/query_list` | GET | 分页查询留样明细 |

---

*文档生成日期：2026-06-08*
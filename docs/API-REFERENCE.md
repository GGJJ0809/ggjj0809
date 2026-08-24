# 食堂慧管理系统 — 入库电子秤设备 API 接口参考文档

> **版本**: 2026.08  
> **覆盖范围**: 56 个 DRP 设备 API 端点  
> **实现状态**: 56/56 ✅ 全部覆盖

---

## 公共约定

### Header 必填参数（所有接口）

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `Merchant-Id` | string | 商户ID |
| `X-Token` | string | 认证Token |
| `machine-sn` | string | 设备序列号 |
| `Content-Type` | string | 固定值 `application/json` |

### Body 公共参数（部分接口需要）

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `version` | string | 否 | 版本控制 |
| `nonceStr` | string | 否 | 随机字符串 |
| `timestamp` | string | 否 | 时间戳 |
| `signType` | string | 否 | 签名类型（如 MD5） |
| `sign` | string | 否 | 签名 |

### 响应格式

```json
{
  "code": 10000,    // 10000=成功, 1=失败
  "msg": "成功",
  "data": { ... }
}
```

---

## 一、基础/公共接口

| # | 接口名称 | 方法 | 路径 | 状态 |
|---|---------|------|------|------|
| 1 | 分页获取商家操作员信息（测试用） | GET | `/api/v4/device/drp/common/user-page-test` | ✅ |
| 2 | 获取仓库信息（分页） | POST | `/api/v4/device/drp/common/warehouse-page` | ✅ |

**#2 响应示例:**
```json
{
  "code": 10000,
  "msg": "成功",
  "data": [
    { "warehouseId": 1, "warehouseName": "默认仓库", "warehouseNum": "CK001", "address": "" }
  ]
}
```

---

## 二、页面初始化/基础数据接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 3 | 获取仓库列表 | POST | `/api/v4/device/drp/warehouse/all-Android` | Header | ✅ |
| 4 | 获取供应商列表 | POST | `/api/v4/device/drp/supplier/all` | Header | ✅ |
| 5 | 获取单位列表 | POST | `/api/v4/device/drp/unit/all` | Header | ✅ |
| 6 | 获取类别树 | POST | `/api/v4/device/drp/category-tree` | Header | ✅ |
| 7 | 获取前10个大类 | POST | `/api/v4/device/drp/category/top-list` | Header | ✅ |
| 8 | 货品检索（分页） | POST | `/api/v4/device/drp/material/page` | Header | ✅ |

**#3 响应示例:**
```json
{
  "code": 10000,
  "msg": "成功",
  "data": [
    { "warehouseId": 1, "warehouseName": "默认仓库", "warehouseNum": "CK001", "areaId": 1, "areaName": "默认区域", "status": 1, "warehouseType": 1 }
  ]
}
```

**#5 响应示例:**
```json
{
  "code": 10000,
  "msg": "成功",
  "data": [
    { "unitId": 1, "unitName": "kg", "unitDesc": "千克", "conversionRate": 1000, "decimalPlaces": 3, "ifDefault": 1 },
    { "unitId": 2, "unitName": "g", "unitDesc": "克", "conversionRate": 1, "decimalPlaces": 0, "ifDefault": 2 },
    { "unitId": 3, "unitName": "斤", "unitDesc": "斤", "conversionRate": 500, "decimalPlaces": 2, "ifDefault": 2 },
    { "unitId": 4, "unitName": "公斤", "unitDesc": "公斤", "conversionRate": 1000, "decimalPlaces": 3, "ifDefault": 2 }
  ]
}
```

**#6 响应示例 (直接数组):**
```json
[
  {
    "id": 1, "parentId": 0, "children": [], "areaId": 0, "areaName": "",
    "categoryName": "蔬菜", "categoryAreaName": "蔬菜",
    "categoryType": 1, "categoryNum": "CT0001", "disableStatus": 1, "bigCategoryId": 0
  }
]
```

---

## 三、入库相关接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 9 | 入库列表查询（分页） | POST | `/api/v4/device/drp/into/page` | Header | ✅ |
| 10 | 入库明细查询（按单号） | POST | `/api/v4/device/drp/into-detail/list` | Header, Body: `content.orderId` | ✅ |
| 11 | 入库明细分页查询 | POST | `/api/v4/device/drp/into-detail/page` | Header, Body: `content.orderId` | ✅ |
| 12 | 入库提交（核心） | POST | `/api/v4/device/drp/into/add/commit` | Header, Body: `content.intoDate`, `content.totalAmount`, `content.detailList` | ✅ |
| 13 | 入库记录编辑提交 | POST | `/api/v4/device/drp/into/edit/commit` | Header, Body: `content.intoId` | ✅ |
| 14 | 删除入库记录 | POST | `/api/v4/device/drp/remove/into` | Header, Body: `content.orderId` | ✅ |

**#12 入库提交请求示例:**
```json
{
  "content": {
    "warehouseId": 1,
    "intoDate": "2026-08-10 14:30:00",
    "totalAmount": 15000,
    "totalNum": 3.5,
    "intoType": 1,
    "supplierId": 1,
    "detailList": [
      {
        "materialId": 1,
        "materialName": "大白菜",
        "unitId": 1,
        "unitPrice": 500,
        "deliveryNum": 2.0,
        "totalPrice": 1000
      }
    ]
  }
}
```

**#12 响应示例:**
```json
{
  "code": 10000,
  "msg": "成功",
  "data": { "intoId": "IN1691678400000_A1B2C3", "savedCount": 1, "status": 2, "totalNum": 3.5 }
}
```

**#10 响应示例 (直接数组):**
```json
{
  "code": 10000,
  "msg": "成功",
  "data": [
    {
      "detailId": 1, "intoId": "IN1691678400000_A1B2C3",
      "materialId": 1, "unitId": 1, "unitPrice": 500,
      "deliveryNum": 2.0, "totalPrice": 1000,
      "supplierId": 1, "remark": ""
    }
  ]
}
```

---

## 四、出库相关接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 15 | 出库提交 | POST | `/api/v4/device/drp/out/add/commit` | Header, Body: `content.warehouseId`, `content.fetchUserId`, `content.outDate`, `content.outType`, `content.detailList` | ✅ |
| 16 | 出库记录编辑提交 | POST | `/api/v4/device/drp/out/edit/commit` | Header, Body: `content.outId` | ✅ |
| 17 | 删除出库记录 | POST | `/api/v4/device/drp/remove/out` | Header, Body: `content.orderId` | ✅ |
| 18 | 出库列表查询（分页） | POST | `/api/v4/device/drp/out/page` | Header | ✅ |
| 19 | 出库明细查询（按单号） | POST | `/api/v4/device/drp/out-detail/list` | Header, Body: `content.orderId` | ✅ |
| 20 | 出库明细分页查询 | POST | `/api/v4/device/drp/out-detail/page` | Header, Body: `content.orderId` | ✅ |
| 21 | 出库货品类别查询 | POST | `/api/v4/device/drp/out/inventory/category` | Header | ✅ |

**#15 出库提交请求示例:**
```json
{
  "content": {
    "warehouseId": 1,
    "fetchUserId": 1,
    "outDate": "2026-08-10 15:00:00",
    "outType": 1,
    "detailList": [
      {
        "materialId": 1,
        "materialName": "大白菜",
        "unitId": 1,
        "unitPrice": 500,
        "deliveryNum": 1.5,
        "totalPrice": 750
      }
    ]
  }
}
```

---

## 五、即入即出接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 22 | 即入即出 | POST | `/api/v4/device/drp/into-and-out` | Header, Body: `content.warehouseId`, `content.intoDate`, `content.totalAmount`, `content.totalNum`, `content.intoType`, `content.detailList` | ✅ |

---

## 六、领料单相关接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 23 | 领料明细类别 | POST | `/api/v4/device/drp/fetch-material/detail/category/list` | Header, Body: `content.fetchMaterialId` | ✅ |
| 24 | 查询领料单明细 | POST | `/api/v4/device/drp/fetch-material/detail/get` | Header, Body: `content.fetchMaterialId` | ✅ |
| 25 | 分页查询领料单列表 | POST | `/api/v4/device/drp/fetch-material/page` | Header | ✅ |
| 26 | 分页查询领料单明细 | POST | `/api/v4/device/drp/fetch-material/detail/page` | Header | ✅ |

---

## 七、采购订单/送货单接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 27 | 采购订单送货单列表 (v4.0) | POST | `/api/v4/device/drp/getOrderDelivery` | Header | ✅ |
| 28 | 采购订单送货单列表 (v5) | POST | `/api/v4/device/drp/page/OrderDelivery` | Header | ✅ |
| 29 | 送货单明细类别 | POST | `/api/v4/device/drp/orderDelivery/detail/category/list` | Header | ✅ |
| 30 | 查询送货单明细 | POST | `/api/v4/device/drp/orderDelivery/detail/get` | Header, Body: `content.orderDeliveryId`, `content.documentType` | ✅ |
| 31 | 送货单档口列表 | POST | `/api/v4/device/drp/list/OrderDelivery-stall` | Header, Body: `content.orderDeliveryId`, `content.documentType` | ✅ |

---

## 八、AI识别/货品注册接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 32 | 单货品注册 | POST | `/api/v4/device/drp/ai/one-material-register` | Header, Body: `content.requestId` | ✅ |
| 33 | 批量保存照片并注册 | POST | `/api/v4/device/drp/ai/batch-save-pic-then-register` | Header, Body: `content.requestId` | ✅ |
| 34 | 批量注册 | POST | `/api/v4/device/drp/ai/batch-register` | Header | ✅ |
| 35 | 获取未注册/已注册货品 | POST | `/api/v4/device/drp/page/register-material` | Header | ✅ |
| 36 | 获取注册/未注册货品数量 | POST | `/api/v4/device/drp/get/register-material-num` | Header | ✅ |
| 37 | 获取货品照片 | POST | `/api/v4/device/drp/list/material-pic` | Header | ✅ |
| 38 | 删除货品照片 | POST | `/api/v4/device/drp/delete/material-pic` | Header | ✅ |
| 39 | 保存货品照片 | POST | `/api/v4/device/drp/save/material-pic` | Header, Body: `content.materialId`, `content.imageUrlList` | ✅ |
| 40 | 获取本次采集货品 | POST | `/api/v4/device/drp/list/this/wait-register-material` | Header | ✅ |
| 41 | 清空注册模型 | POST | `/api/v4/device/drp/clean/register-model` | Header, Body: `content.requestId` | ✅ |

---

## 九、库存查询接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 42 | 库存查询（分页） | POST | `/api/v4/device/drp/material/inventory/page` | Header | ✅ |
| 43 | 按库存获取出库货品 | POST | `/api/v4/device/drp/page/out-material/by-inventory` | Header | ✅ |
| 44 | 根据货品ID获取库存 | POST | `/api/v4/device/drp/getInventoryNumByMaterialId` | Header, Body: `content.materialId` | ✅ |
| 45 | 按批次获取出库货品（暂未对接） | POST | `/api/v4/device/drp/page/out-material/by-batch` | Header | ✅ |

---

## 十、货品管理接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 46 | 新增货品 | POST | `/api/v4/device/drp/add/material` | Header, Body: `content.materialName`, `content.materialType`, `content.categoryId`, `content.salesMode`, `content.unitId` | ✅ |
| 47 | 上传货品注册图 | POST | `/api/v4/device/drp/upload/material/register-pic` | Header, Body: `content.materialId`, `content.imageUrlList` | ✅ |
| 48 | 查询货品注册图 | POST | `/api/v4/device/drp/list/material/register-pic` | Header, Body: `content.materialId` | ✅ |

---

## 十一、同步/初始化接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 49 | 初始化类别等级和货品一级类别 | POST | `/api/v4/device/drp/init/category-level/material-big-category` | Header | ✅ |
| 50 | 同步大类（前10个） | POST | `/api/v4/device/drp/sync/big-category` | Header | ✅ |
| 51 | 同步货品 | POST | `/api/v4/device/drp/sync/menuMaterial` | Header | ✅ |

---

## 十二、其他接口

| # | 接口名称 | 方法 | 路径 | 必填字段 | 状态 |
|---|---------|------|------|---------|------|
| 52 | 根据单号查询出入库详情 | POST | `/api/v4/device/drp/getIntoOutDetailById` | Header, Body: `content.intoOutId` | ✅ |
| 53 | 分页查询出入库单列表 | POST | `/api/v4/device/drp/page/into-out` | Header | ✅ |
| 54 | 采购计划详情 | POST | `/api/v4/device/drp/getPlanDetail` | Header | ✅ |
| 55 | 查询质检单 | POST | `/api/v4/device/drp/get/inspect-goods` | Header | ✅ |
| 56 | 获取货品保质期截止日期 | POST | `/api/v4/device/drp/getMaterialShelfLifeDays` | Header, Body: `content.materialId` | ✅ |

**#56 响应示例:**
```json
{
  "code": 10000,
  "msg": "成功",
  "data": {
    "materialId": 1,
    "startDate": "2026-08-10",
    "shelfLifeDays": 180,
    "expiryDate": "2027-02-06"
  }
}
```

---

## 数据库表对照

### 入库相关
| 表名 | 用途 | 位置 |
|------|------|------|
| `into_inventory` | 入库单主表 | SQLite (routes-device.js) |
| `into_inventory_detail` | 入库明细 | SQLite (routes-device.js) |
| `drp_inbound_records` | 入库记录（旧格式） | SQLite (routes-device.js) |
| `drp_inbound_details` | 入库明细（旧格式） | SQLite (routes-device.js) |
| `acceptance_records` | 验收记录 | SQLite + Supabase |

### 出库相关
| 表名 | 用途 | 位置 |
|------|------|------|
| `out_inventory` | 出库单主表 | SQLite (routes-device.js) |
| `out_inventory_detail` | 出库明细 | SQLite (routes-device.js) |

### 基础数据
| 表名 | 用途 | 位置 |
|------|------|------|
| `warehouses` | 仓库 | SQLite + Supabase |
| `suppliers` | 供应商 | SQLite + Supabase |
| `inbound_materials` | 入库货品 | SQLite + Supabase |
| `scale_operators` | 操作员 | SQLite |

---

## 路由前缀说明

所有 DRP 设备 API 均支持两个前缀路径：

| 前缀 | 示例 |
|------|------|
| `/api/v4/device/drp/` | `/api/v4/device/drp/into/page` |
| `/tengyun-api/api/v4/device/drp/` | `/tengyun-api/api/v4/device/drp/into/page` |

两个前缀的功能完全一致，`tengyun-api` 变体用于兼容腾云品牌的电子秤设备。

---

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-08-10 | v1.0 | 初始版本：56 个接口全部覆盖，新增入库明细/编辑/删除 + 出库全链路 10 个接口 |
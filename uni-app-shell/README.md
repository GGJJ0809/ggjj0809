# uni-app 壳子项目 — 备案信息获取完整指南

## 一、必装工具下载（CMD 命令）

### 1. Node.js（脚本依赖）
```bash
# Windows (PowerShell)
winget install OpenJS.NodeJS

# Mac
brew install node
```
官网：https://nodejs.org/zh-cn/download

### 2. JDK（keytool 签名工具在里面）
```bash
# Windows (PowerShell)
winget install EclipseAdoptium.Temurin.17.JDK

# Mac
brew install --cask temurin
```
装完后验证：`keytool -help`

### 3. HBuilderX（uni-app 打包 IDE）
官网下载：https://www.dcloud.io/hbuilderx.html
（没有 CMD 命令，直接下载安装包）

### 4. Xcode（iOS 专用，仅 Mac）
```bash
# Mac App Store 安装，或命令行
xcode-select --install
```
**注意：iOS 打包必须有 Mac 电脑 + 688元/年的苹果开发者账号。**

### 5. DevEco Studio（鸿蒙专用）
官网下载：https://developer.harmonyos.com/cn/develop/deveco-studio
（没有 CMD 命令，直接下载安装包）

---

## 二、快速开始（3 步拿到安卓备案信息）

### 第 1 步：修改 web-view 地址
打开 `pages/index/index.vue`，把 `webUrl` 改成你的项目域名：
```js
webUrl: 'https://你的域名.com'
```

### 第 2 步：修改包名和 Bundle ID
打开 `manifest.json`，找到下面字段并修改：
```json
"android": {
  "packagename": "com.yourcompany.yourapp"
},
"ios": {
  "bundleid": "com.yourcompany.yourapp"
},
"mp-harmony": {
  "package": "com.yourcompany.yourapp"
}
```

### 第 3 步：生成安卓签名证书（自动提取备案信息）

**Windows 用户：**
双击运行 `scripts/generate-keystore.bat`

**Mac / Linux 用户：**
```bash
cd scripts
chmod +x generate-keystore.sh
./generate-keystore.sh
```

运行后终端会输出所有备案信息：
- 证书 MD5 指纹
- SHA-1 指纹
- 数字签名公钥
- 包名（就是你 manifest.json 里写的）

**把输出结果复制到表格里，安卓和鸿蒙的信息就有了。**

---

## 三、iOS 备案信息获取

iOS 信息必须去苹果开发者后台拿，步骤如下：

1. 访问 https://developer.apple.com
2. 登录你的 Apple Developer 账号
3. 进入 **Certificates, Identifiers & Profiles**
4. **Identifiers** → 找到你的 App ID → 复制 **Bundle ID**
5. **Certificates** → **Production** → 找到你的 Distribution 证书 → 点击下载 `.cer` 文件
6. 双击导入 Mac「钥匙串访问」→ 右键证书 → 显示简介 → 查看：
   - **SHA-1 指纹**
   - **公钥**（Public Key）

**没有 Mac 的用户：** iOS 备案可以后期补，先做安卓和鸿蒙的备案即可。

---

## 四、鸿蒙备案信息获取

1. 打开 DevEco Studio
2. 打开本项目（uni-app 的鸿蒙模块）
3. 进入 `entry/src/main/module.json5`
4. 查看 `bundleName` 字段 → 这就是**鸿蒙包名**
5. 在 DevEco Studio 中点击 **Build → Generate Key and CSR** 生成签名证书
6. 用 `keytool -list -v -keystore 你的证书.p12` 查看 **MD5 指纹** 和 **公钥**

---

## 五、打包提交（备案后）

### 安卓打包
1. 打开 HBuilderX
2. 打开本项目文件夹
3. 点击 **发行 → 原生 App-云打包**
4. 选择 Android，填入你的 keystore 路径和密码
5. 点击打包，下载 APK

### iOS 打包
1. HBuilderX 中 **发行 → 原生 App-云打包**
2. 选择 iOS，上传你的 p12 证书和 provisioning profile
3. 打包下载 IPA

### 鸿蒙打包
1. DevEco Studio 中打开项目
2. **Build → Build Hap(s)/App(s)**
3. 选择 Build App → 生成 .app 文件

---

## 六、备案信息汇总表

| 平台 | 字段 | 来源 |
|---|---|---|
| 安卓 | 包名 | manifest.json → android.packagename |
| 安卓 | 证书 MD5 指纹 | `generate-keystore.bat` 输出 |
| 安卓 | 数字签名公钥 | `generate-keystore.bat` 输出 |
| iOS | Bundle ID | manifest.json → ios.bundleid |
| iOS | 证书 SHA-1 | 苹果钥匙串访问 |
| iOS | 数字签名公钥 | 苹果钥匙串访问 |
| 鸿蒙 | 包名 | manifest.json → mp-harmony.package |
| 鸿蒙 | 证书 MD5 指纹 | DevEco Studio 签名证书 |
| 鸿蒙 | 数字签名公钥 | DevEco Studio 签名证书 |

---

## 七、注意事项

1. **包名全局唯一**：建议用 `com.你的域名.项目名` 格式，比如 `com.example.myapp`
2. **证书密码记好**：keystore 密码丢了证书就废了，App 更新会中断
3. **同一个证书一直用**：App 更新必须用第一次打包的证书，否则应用商店会认为是不同应用
4. **iOS 需要 Mac**：没有 Mac 可以借一台，或者去淘宝找 iOS 打包代上架服务
5. **备案不需要上架**：备案只需要包名和证书信息，不需要先有上架的 App

---

有问题随时来问！
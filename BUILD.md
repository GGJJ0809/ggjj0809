---

## 8. Windows 电脑上打包发给麒麟客户

> **适用场景**：你在 Windows 电脑上开发/修改代码，想打包出 Linux（麒麟系统）的安装包发给客户。
> **核心难点**：`better-sqlite3` 是 C++ 原生模块，Windows 编译器无法直接编译出 Linux 能运行的二进制。

### 方案对比

| 方案 | 难度 | 稳定性 | 适用情况 |
|------|------|--------|----------|
| **WSL2 本地打包（强烈推荐）** | 低 | 极高 | Windows 10/11 自带，免费，装个 Ubuntu 就能跑 |
| GitHub Actions 云端打包 | 极低 | 极高 | 有 GitHub 账号，push 代码后自动出包 |
| Windows 直接交叉编译 | 高 | 低 | 不推荐，原生模块编译大概率失败 |

---

### 8.1 方案一：WSL2 本地打包（最推荐，无 GitHub 也能用）

**原理**：Windows 10/11 自带 WSL2（Windows Subsystem for Linux），装个 Ubuntu 就是一个完整的 Linux 环境。在里面直接运行 `./build-kylin.sh` 脚本，打包完成后产物自动复制回 Windows 桌面。

**零成本**：WSL2 和 Ubuntu 都是微软/Canonical 官方免费提供的，不需要任何第三方工具。

#### 前置条件

- Windows 10（版本 2004 及以上）或 Windows 11
- 已开启虚拟化（大多数现代电脑默认开启）

#### 操作步骤（仅需首次配置一次，之后每次打包一键搞定）

项目根目录已包含两个 PowerShell 脚本：

| 脚本 | 作用 | 运行次数 |
|------|------|----------|
| `setup-wsl2.ps1` | 自动安装 WSL2 + Ubuntu + 所有打包依赖 | **仅需一次** |
| `build-via-wsl2.ps1` | 自动复制项目 → WSL2 打包 → 产物回桌面 | **每次打包** |

**Step 1 — 安装 WSL2 环境（仅需一次）**

在项目根目录，右键 `setup-wsl2.ps1` → **"使用 PowerShell 运行"**（或"以管理员身份运行"）。

脚本会自动完成：
1. 检查 WSL2 是否已安装，如未安装则自动安装
2. 检查 Ubuntu 是否已安装，如未安装则自动安装
3. 在 Ubuntu 中安装 Node.js、npm、编译工具、fakeroot 等全部依赖

> ⚠️ WSL2 安装后可能需要**重启电脑 1~2 次**，脚本会自动提示。重启后再运行一次 `setup-wsl2.ps1` 即可继续完成配置。

**Step 2 — 打包 Linux 安装包（每次改完代码后运行）**

在项目根目录，右键 `build-via-wsl2.ps1` → **"使用 PowerShell 运行"**。

脚本会自动完成：
1. 将当前项目复制到 WSL2 Ubuntu（排除 node_modules，在 Linux 里重新安装）
2. 在 WSL2 里运行 `./build-kylin.sh` 全自动打包
3. 打包完成后将产物（AppImage + deb）复制回 **Windows 桌面**

全程约 **5~15 分钟**（首次因为要在 WSL2 里重新 npm install 和编译 better-sqlite3，稍慢；后续复用缓存会快很多）。

**Step 3 — 产物在桌面上，直接发给客户**

打包完成后，桌面会出现一个文件夹：

```
食堂智慧管理系统-Linux安装包-20250522-1430/
├── 食堂智慧管理系统-1.0.0-x86_64.AppImage    ← x64 麒麟免安装版
├── 食堂智慧管理系统_1.0.0_amd64.deb          ← x64 麒麟安装包
├── 食堂智慧管理系统-1.0.0-arm64.AppImage     ← arm64 麒麟免安装版
└── 食堂智慧管理系统_1.0.0_arm64.deb          ← arm64 麒麟安装包
```

直接把这个文件夹发给客户即可。让客户在终端执行 `uname -m`：

| 输出 | CPU 类型 | 用哪个包 |
|------|---------|---------|
| `x86_64` | Intel / AMD | `x86_64.AppImage` 或 `amd64.deb` |
| `aarch64` | 飞腾 / 鲲鹏 | `arm64.AppImage` 或 `arm64.deb` |

---

### 8.2 方案二：GitHub Actions 云端打包（可选，需有 GitHub 账号）

**原理**：把代码 push 到 GitHub，由 GitHub 的 Linux 服务器自动打包出 x64 和 arm64 的安装包。

#### 操作步骤

**Step 1 — 把代码 push 到 GitHub**

在项目根目录打开 PowerShell：

```powershell
git init
git add .
git commit -m "init"

# 去 GitHub 网页新建一个空仓库，复制仓库地址
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

**Step 2 — 触发自动打包**

打开浏览器，进入你的 GitHub 仓库 Actions 页面：
```
https://github.com/你的用户名/仓库名/actions
```

点击左侧 **"Build Linux Packages for Kylin"**，然后点击右上角 **"Run workflow"** → **"Run workflow"**。

**Step 3 — 等待并下载产物**

- 等待约 **5~10 分钟**
- 打包完成后，页面下方 **Artifacts** 区域会显示两个下载链接：
  - `linux-packages-x64`
  - `linux-packages-arm64`
- 点击下载，解压后就是发给客户的安装包

---

### 8.3 方案三：手动在 WSL2 里打包（了解原理或脚本异常时备用）

如果 PowerShell 脚本在你的电脑上运行异常，可以手动操作：

**Step 1 — 安装 WSL2 + Ubuntu**

以管理员身份打开 PowerShell：

```powershell
# 安装 WSL2 + Ubuntu
wsl --install -d Ubuntu

# 重启电脑后，在开始菜单启动 Ubuntu，设置用户名和密码
```

**Step 2 — 在 WSL2 Ubuntu 里安装依赖**

```bash
sudo apt update
sudo apt install -y nodejs npm fakeroot dpkg python3 g++ make
```

**Step 3 — 复制项目到 WSL2 并打包**

在 Windows 资源管理器地址栏输入 `\\wsl$\Ubuntu\home\你的用户名`，把项目文件夹复制进去。

然后在 WSL2 Ubuntu 终端：

```bash
cd ~/你的项目
chmod +x build-kylin.sh
./build-kylin.sh
```

**Step 4 — 产物复制回 Windows**

打包完成后，产物在 `~/你的项目/dist-electron/` 目录。

从 Windows 资源管理器访问：
```
\\wsl$\Ubuntu\home\你的用户名\你的项目\dist-electron
```

把里面的文件复制到 Windows 桌面即可发给客户。

---

### 8.4 为什么不推荐在 Windows 上直接交叉编译？

`better-sqlite3` 是 C++ 原生模块，包含平台相关的二进制代码。Windows 上的 Visual C++ 编译器编译出来的是 `.dll` / `.exe` 格式，Linux 根本不认识。要编出 Linux 的 `.so` 库，必须在 Linux 环境下编译。

electron-builder 在 Windows 上打包 Linux 时，会尝试用 Docker 镜像 `electronuserland/builder` 来编译。但 Windows 上默认没有 Docker，装了 Docker Desktop 后还需要处理跨架构编译的复杂配置，极易失败。

**结论**：不要在 Windows 上折腾交叉编译，用 WSL2 或 GitHub Actions 才是正解。

---

### 8.5 Windows 本地测试包（build-win.bat）

虽然无法直接打包 Linux 版本，但你可以在 Windows 上打包一个 `.exe` 安装包，**自己先测试功能是否正常**：

```batch
:: 在项目根目录双击运行
build-win.bat
```

脚本会自动完成：
1. 检查 Node.js / npm 环境
2. 安装依赖（首次）
3. Vite 构建
4. 打包出 Windows `.exe` 安装程序

产物在 `dist-electron/` 目录下，双击安装即可在 Windows 上测试全部功能。

> 测试确认功能正常后，再通过 WSL2 打包 Linux 版本发给客户。

---

## 联系技术支持
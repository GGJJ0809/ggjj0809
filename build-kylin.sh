#!/bin/bash

# ═══════════════════════════════════════════════════════════════
#  食堂智慧管理系统 - 麒麟系统一键打包脚本
#  Smart Canteen - Kylin OS One-Click Build Script
# ═══════════════════════════════════════════════════════════════
#
# 用法：
#   1. 进入项目根目录：cd /path/to/你的项目
#   2. 赋予执行权限：chmod +x build-kylin.sh
#   3. 运行脚本：./build-kylin.sh
#
# 特性：
#   - 自动检测 Node.js / npm / 系统架构
#   - 自动安装依赖（仅首次，支持离线复用 node_modules）
#   - 自动安装 Electron 打包工具
#   - 自动清理旧产物、构建前端、打包 Linux 安装包
#   - 生成 AppImage（免安装）+ deb（系统安装包）两种格式
#
# 离线打包说明：
#   如果目标麒麟电脑无外网，先在有外网的同架构电脑上执行一次本脚本，
#   然后将整个项目目录（含 node_modules）拷贝到麒麟电脑，再次运行本脚本即可
#   （检测到 node_modules 已存在时会跳过 npm install，直接构建打包）。
# ═══════════════════════════════════════════════════════════════

set -e

# ─── 颜色定义 ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 国内镜像加速（Electron 打包必备）───────────────────────────
export ELECTRON_MIRROR="https://cdn.npmmirror.com/binaries/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://cdn.npmmirror.com/binaries/electron-builder-binaries/"
export npm_config_registry="https://registry.npmmirror.com/"
export npm_config_strict_ssl="false"

# ─── Banner ────────────────────────────────────────────────────
echo -e "${BOLD}${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        食堂智慧管理系统 - 麒麟系统一键打包脚本               ║"
echo "║        Smart Canteen - Kylin OS One-Click Builder            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ═══════════════════════════════════════════════════════════════
#  STEP 0: 环境检测
# ═══════════════════════════════════════════════════════════════
echo -e "${BOLD}${CYAN}▶ 环境检测${NC}"

# 1. Node.js
if ! command -v node &>/dev/null; then
    echo -e "${RED}[✗] 未检测到 Node.js${NC}"
    echo -e "${YELLOW}   安装命令：sudo apt update && sudo apt install -y nodejs npm${NC}"
    exit 1
fi
NODE_VER=$(node -v | sed 's/v//' | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
    echo -e "${RED}[✗] Node.js 版本过低：$(node -v)，需要 >= 18${NC}"
    exit 1
fi
echo -e "${GREEN}[✓] Node.js $(node -v)${NC}"

# 2. npm
if ! command -v npm &>/dev/null; then
    echo -e "${RED}[✗] 未检测到 npm${NC}"
    exit 1
fi
echo -e "${GREEN}[✓] npm $(npm -v)${NC}"

# 3. 系统架构
# 支持 FORCE_ARCH 环境变量强制指定目标架构（交叉编译场景）
# 用法：FORCE_ARCH=arm64 ./build-kylin.sh
ARCH=$(uname -m)
CROSS_COMPILE=false
if [ -n "$FORCE_ARCH" ]; then
    case "$FORCE_ARCH" in
        x64)    TARGET_ARCH="x64";   ARCH_NAME="x86_64 / amd64（交叉编译）" ;;
        arm64)  TARGET_ARCH="arm64"; ARCH_NAME="arm64 / aarch64（交叉编译）" ;;
        *)      TARGET_ARCH="$FORCE_ARCH"; ARCH_NAME="$FORCE_ARCH（交叉编译）" ;;
    esac
    CROSS_COMPILE=true
    echo -e "${YELLOW}[!] 交叉编译模式：本机=${ARCH} → 目标=${ARCH_NAME}${NC}"
else
    case "$ARCH" in
        x86_64)  TARGET_ARCH="x64";  ARCH_NAME="x86_64 / amd64" ;;
        aarch64) TARGET_ARCH="arm64"; ARCH_NAME="arm64 / aarch64" ;;
        arm64)   TARGET_ARCH="arm64"; ARCH_NAME="arm64 / aarch64" ;;
        *)       TARGET_ARCH="";     ARCH_NAME="$ARCH（未知）" ;;
    esac
fi
echo -e "${GREEN}[✓] 目标架构：${ARCH_NAME}${NC}"

# 交叉编译时检查工具链
if [ "$CROSS_COMPILE" = true ] && [ "$TARGET_ARCH" = "arm64" ] && [ "$ARCH" = "x86_64" ]; then
    if ! command -v aarch64-linux-gnu-gcc &>/dev/null; then
        echo -e "${RED}[✗] 交叉编译 ARM64 需要 aarch64-linux-gnu-gcc${NC}"
        echo -e "${YELLOW}   安装命令：sudo apt update && sudo apt install -y gcc-aarch64-linux-gnu g++-aarch64-linux-gnu${NC}"
        exit 1
    fi
    echo -e "${GREEN}[✓] ARM64 交叉编译工具链已就绪${NC}"
fi

# 4. 项目目录检查
if [ ! -f "package.json" ]; then
    echo -e "${RED}[✗] 当前目录不是项目根目录（找不到 package.json）${NC}"
    echo -e "${YELLOW}   请进入项目根目录执行：cd /path/to/project && ./build-kylin.sh${NC}"
    exit 1
fi
echo -e "${GREEN}[✓] 项目目录检测通过${NC}"

# 5. 检测 fakeroot（deb 包打包需要）
if ! command -v fakeroot &>/dev/null; then
    echo -e "${YELLOW}[!] 未检测到 fakeroot（打包 deb 安装包需要）${NC}"
    echo -e "${YELLOW}   安装命令：sudo apt install -y fakeroot dpkg${NC}"
    read -p "是否继续？可能无法生成 deb 包，只能生成 AppImage [Y/n]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        exit 1
    fi
fi

# 6. 检测 libfuse2（AppImage 打包需要）
echo -e "${BLUE}  检查 libfuse2（AppImage 打包依赖）...${NC}"
if ! ldconfig -p 2>/dev/null | grep -q libfuse; then
    if ! dpkg -l libfuse2 2>/dev/null | grep -q '^ii'; then
        echo -e "${YELLOW}[!] 未检测到 libfuse2（打包 AppImage 需要 FUSE 支持）${NC}"
        echo -e "${YELLOW}   安装命令：sudo apt update && sudo apt install -y libfuse2${NC}"
        echo -e "${YELLOW}   安装后重新运行本脚本即可${NC}"
        read -p "是否继续？可能无法生成 AppImage，只能生成 deb [Y/n]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            exit 1
        fi
    fi
else
    echo -e "${GREEN}[✓] libfuse2 已安装${NC}"
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 0: 从 .build-version 读取并递增版本号
#  ⚠️ 不用 package.json（平台会回退），用独立文件追踪
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 0/6 — 版本号管理${NC}"

# 从 .build-version 读取当前版本（兜底 1.0.0）
VER_FILE=".build-version"
if [ -f "$VER_FILE" ]; then
    CURRENT_VER=$(head -1 "$VER_FILE" | tr -d '[:space:]')
else
    CURRENT_VER="1.0.0"
fi
echo -e "${BLUE}  当前构建版本：${CURRENT_VER}${NC}"

# 用 node 递增 patch 版本号（1.0.0 → 1.0.1）
NEW_VER=$(node -e "const v='${CURRENT_VER}'.split('.');v[2]=Number(v[2])+1;console.log(v.join('.'))")
echo "$NEW_VER" > "$VER_FILE"
echo -e "${GREEN}[✓] 本次构建版本：${NEW_VER}${NC}"

# 写入构建信息文件（供应用内显示）
BUILD_TIME=$(date -Iseconds)
echo "// 自动生成，每次打包时更新 - 请勿手动修改" > src/buildInfo.ts
echo "export const buildInfo = { version: '${NEW_VER}', buildTime: '${BUILD_TIME}' };" >> src/buildInfo.ts
echo -e "${GREEN}[✓] 构建信息已写入：版本 ${NEW_VER}，时间 ${BUILD_TIME}${NC}"

# ═══════════════════════════════════════════════════════════════
#  STEP 1: 安装依赖（自动检测离线/在线模式）
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 1/6 — 安装项目依赖${NC}"

# 离线检测：如果 node_modules 已存在且包含关键模块，跳过安装
if [ -d "node_modules" ] && [ -d "node_modules/react" ] && [ -d "node_modules/vite" ]; then
  # 检查 package.json 是否比 node_modules 目录更新（依赖清单可能变了）
  if [ -f "package.json" ] && [ "package.json" -nt "node_modules" ]; then
    echo -e "${YELLOW}[!] package.json 已更新，需要重新安装依赖${NC}"
    npm install
    if [ $? -ne 0 ]; then
      echo -e "${RED}[✗] npm install 失败${NC}"
      exit 1
    fi
    echo -e "${GREEN}[✓] 依赖已更新${NC}"
  else
    echo -e "${GREEN}[✓] node_modules 已存在且依赖最新，跳过 npm install（离线模式）${NC}"
  fi
else
  echo -e "${BLUE}  正在执行 npm install...${NC}"
  npm install
  if [ $? -ne 0 ]; then
    # 尝试离线安装
    echo -e "${YELLOW}[!] npm install 失败（可能无网络），尝试离线模式...${NC}"
    if [ -d "node_modules" ]; then
      echo -e "${YELLOW}  node_modules 存在但可能不完整，尝试 npm install --prefer-offline${NC}"
      npm install --prefer-offline
      if [ $? -ne 0 ]; then
        echo -e "${RED}[✗] 离线安装也失败了${NC}"
        echo -e "${YELLOW}  请确保 node_modules 完整：${NC}"
        echo -e "${YELLOW}  1. 在有网络的电脑上执行一次 ./build-kylin.sh 下载所有依赖${NC}"
        echo -e "${YELLOW}  2. 将整个项目目录（含 node_modules）拷贝到本机${NC}"
        echo -e "${YELLOW}  3. 再次运行本脚本${NC}"
        exit 1
      fi
    else
      echo -e "${RED}[✗] node_modules 不存在且无网络，无法继续${NC}"
      echo -e "${YELLOW}  请先在有网络的电脑上完成首次构建，再拷贝到本机离线打包${NC}"
      exit 1
    fi
  fi
  echo -e "${GREEN}[✓] 依赖安装完成${NC}"
fi

# 删除残留的旧 better-sqlite3（已弃用，防止 node-gyp 编译失败）
if [ -d "node_modules/better-sqlite3" ]; then
  echo -e "${YELLOW}[!] 发现残留 better-sqlite3，删除中...${NC}"
  rm -rf "node_modules/better-sqlite3"
  echo -e "${GREEN}[✓] 已清理旧 better-sqlite3${NC}"
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 2: 安装 Electron 打包工具
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 2/6 — 检查 Electron 打包工具${NC}"

NEED_INSTALL_ELECTRON=false
if [ ! -d "node_modules/electron" ]; then
    echo -e "${YELLOW}  未检测到 electron${NC}"
    NEED_INSTALL_ELECTRON=true
fi
if [ ! -d "node_modules/electron-builder" ]; then
    echo -e "${YELLOW}  未检测到 electron-builder${NC}"
    NEED_INSTALL_ELECTRON=true
fi

if [ "$NEED_INSTALL_ELECTRON" = true ]; then
    echo -e "${BLUE}  正在安装 electron 和 electron-builder...${NC}"
    npm install --save-dev electron electron-builder
    if [ $? -ne 0 ]; then
        echo -e "${RED}[✗] Electron 工具安装失败${NC}"
        echo -e "${YELLOW}  如果处于离线环境，请确保 node_modules 完整：${NC}"
        echo -e "${YELLOW}  1. 在有网络、同架构的电脑上执行 ./build-kylin.sh${NC}"
        echo -e "${YELLOW}  2. 将整个 node_modules 拷贝到本机${NC}"
        exit 1
    fi
    echo -e "${GREEN}[✓] Electron 工具安装完成${NC}"
else
    # 只检查文件是否存在，避免 npx electron --version 触发二进制下载导致卡死
    ELECTRON_BIN="node_modules/electron/dist/electron"
    if [ -f "$ELECTRON_BIN" ]; then
        ELECTRON_VER=$(grep '"version"' node_modules/electron/package.json 2>/dev/null | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "unknown")
        echo -e "${GREEN}[✓] Electron ${ELECTRON_VER} / electron-builder 已就绪${NC}"
    else
        echo -e "${YELLOW}[!] electron 模块存在但二进制文件未下载${NC}"
        echo -e "${YELLOW}   尝试从缓存恢复...${NC}"
        cd node_modules/electron && node install.js 2>/dev/null || true
        cd "$SCRIPT_DIR"
        if [ -f "$ELECTRON_BIN" ]; then
            echo -e "${GREEN}[✓] Electron 二进制恢复成功${NC}"
        else
            echo -e "${RED}[✗] Electron 二进制恢复失败${NC}"
            echo -e "${YELLOW}   离线环境请确保已从有网络的机器拷贝 ~/.cache/electron${NC}"
            echo -e "${YELLOW}   或者直接拷贝 node_modules/electron/dist/ 目录${NC}"
            exit 1
        fi
    fi
fi

# ─── 预下载 Electron 二进制（多镜像兜底，防止打包时卡在 CDN 超时）─────────
echo -e "${BOLD}${CYAN}▶ 预下载 Electron 二进制（多镜像兜底）${NC}"
ELECTRON_VERSION=$(node -e "try{console.log(require('electron/package.json').version)}catch(e){console.log('')}")
if [ -n "$ELECTRON_VERSION" ]; then
    ARCH_SUFFIX="x64"
    if [ "$TARGET_ARCH" = "arm64" ]; then ARCH_SUFFIX="arm64"; fi
    ZIP="electron-v${ELECTRON_VERSION}-linux-${ARCH_SUFFIX}.zip"
    CACHE_DIR="${ELECTRON_CACHE:-$HOME/.cache/electron}"
    mkdir -p "$CACHE_DIR"
    if [ -f "$CACHE_DIR/$ZIP" ]; then
        echo -e "${GREEN}[✓] Electron 二进制缓存已存在，跳过下载${NC}"
    else
        DOWNLOADED=false
        for MIRROR in \
            "https://cdn.npmmirror.com/binaries/electron/" \
            "https://npmmirror.com/mirrors/electron/" \
            "https://github.com/electron/electron/releases/download/"; do
            URL="${MIRROR}v${ELECTRON_VERSION}/${ZIP}"
            echo -e "${BLUE}  尝试镜像：${URL}${NC}"
            if command -v wget &>/dev/null; then
                wget -q --timeout=60 --tries=2 -O "$CACHE_DIR/$ZIP" "$URL" 2>/dev/null || true
            else
                curl -L --max-time 60 --retry 2 -o "$CACHE_DIR/$ZIP" "$URL" 2>/dev/null || true
            fi
            if [ -f "$CACHE_DIR/$ZIP" ]; then
                SIZE=$(stat -c%s "$CACHE_DIR/$ZIP" 2>/dev/null || echo 0)
                if [ "$SIZE" -gt 50000000 ]; then
                    echo -e "${GREEN}[✓] Electron 二进制下载成功（${SIZE} bytes）${NC}"
                    DOWNLOADED=true
                    break
                else
                    echo -e "${YELLOW}  [!] 文件过小（${SIZE} bytes），疑似错误页，换下一个镜像...${NC}"
                    rm -f "$CACHE_DIR/$ZIP"
                fi
            fi
        done
        if [ "$DOWNLOADED" = false ]; then
            echo -e "${YELLOW}[!] Electron 二进制预下载失败，仍尝试让 electron-builder 自行下载...${NC}"
        fi
    fi
else
    echo -e "${YELLOW}[!] 未读取到 electron 版本，跳过预下载${NC}"
fi

# ─── 确保 asar 工具可用（STEP 5 验证打包产物需要）─────────────────────────
echo -e "${BLUE}  检查 asar 工具...${NC}"
ASAR_CHECK=$(node -e "try { require('asar'); console.log('ok'); } catch(e) { console.log('missing'); }" 2>/dev/null)
if [ "$ASAR_CHECK" != "ok" ]; then
    echo -e "${YELLOW}  未检测到 asar，安装中...${NC}"
    npm install --save-dev asar || true
    ASAR_CHECK=$(node -e "try { require('asar'); console.log('ok'); } catch(e) { console.log('missing'); }" 2>/dev/null)
    if [ "$ASAR_CHECK" != "ok" ]; then
        echo -e "${YELLOW}[!] asar 安装失败，STEP 5 产物验证将跳过${NC}"
    else
        echo -e "${GREEN}[✓] asar 已就绪${NC}"
    fi
else
    echo -e "${GREEN}[✓] asar 已就绪${NC}"
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 2.5: 准备 HLS 视频播放（已移除 jsmpeg 依赖）
#  HLS 方案使用 hls.js + HTML5 video 标签，无需额外静态文件
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 2.5/6 — HLS 方案准备${NC}"
echo -e "${GREEN}[✓] HLS 方案使用 hls.js 库，无需额外静态文件${NC}"
echo -e "${GREEN}[✓] RTSP 流转 HLS 由 ffmpeg 在后台处理，前端直接播放${NC}"

# ═══════════════════════════════════════════════════════════════
#  STEP 3: 清理旧产物及缓存（★ 彻底清除所有缓存！）
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 3/6 — 清理旧打包产物及缓存${NC}"

if [ -d "dist-electron" ]; then
    echo -e "${BLUE}  删除 dist-electron/ ...${NC}"
    rm -rf dist-electron
fi
if [ -d "out" ]; then
    echo -e "${BLUE}  删除 out/ ...${NC}"
    rm -rf out
fi
# ★ 清理 Vite 构建缓存（避免用旧编译产物！）
if [ -d "node_modules/.vite" ]; then
    echo -e "${BLUE}  清理 Vite 构建缓存...${NC}"
    rm -rf node_modules/.vite
fi
# ★ 清理 electron-builder 所有缓存（避免缓存旧版本 Electron 二进制或 ASAR）
if [ -d "$HOME/.cache/electron-builder" ]; then
    echo -e "${BLUE}  清理 electron-builder 缓存...${NC}"
    rm -rf "$HOME/.cache/electron-builder" 2>/dev/null || true
fi
if [ -d "$XDG_CACHE_HOME/electron-builder" ]; then
    rm -rf "$XDG_CACHE_HOME/electron-builder" 2>/dev/null || true
fi
if [ -d "$HOME/.electron" ]; then
    echo -e "${BLUE}  清理 electron 缓存...${NC}"
    rm -rf "$HOME/.electron" 2>/dev/null || true
fi
# ★ 清理 node_modules/.cache（esbuild 等缓存可能在此）
if [ -d "node_modules/.cache" ]; then
    echo -e "${BLUE}  清理 node_modules/.cache...${NC}"
    rm -rf node_modules/.cache
fi
# ★ 清理 ffmpeg-bin 旧文件（改为缓存复用，不再无条件删除）
FFMPEG_DIR="ffmpeg-bin"
FFMPEG_BIN="${FFMPEG_DIR}/ffmpeg"
FFMPEG_CACHE_VALID=false

if [ -f "$FFMPEG_BIN" ]; then
    # 验证 ELF 格式
    ELF_MAGIC=$(xxd -l 4 -p "$FFMPEG_BIN" 2>/dev/null || od -An -tx1 -N4 "$FFMPEG_BIN" 2>/dev/null | tr -d ' ')
    if [ "$ELF_MAGIC" = "7f454c46" ]; then
        FFMPEG_SIZE=$(du -h "$FFMPEG_BIN" | cut -f1)
        echo -e "${GREEN}[✓] ffmpeg 缓存有效（${FFMPEG_SIZE}），本次跳过下载${NC}"
        FFMPEG_CACHE_VALID=true
    else
        echo -e "${YELLOW}[!] ffmpeg 缓存文件损坏（ELF 魔数错误），清理并重新下载...${NC}"
        rm -rf "$FFMPEG_DIR"
    fi
fi

if [ "$FFMPEG_CACHE_VALID" = false ]; then
    if [ -d "$FFMPEG_DIR" ]; then
        echo -e "${BLUE}  清理旧 ffmpeg-bin/ ...${NC}"
        rm -rf "$FFMPEG_DIR"
    fi
fi
# ★ 清理临时目录中的 electron-builder 缓存
if [ -d "/tmp/electron-builder" ]; then
    echo -e "${BLUE}  清理 /tmp/electron-builder ...${NC}"
    rm -rf /tmp/electron-builder 2>/dev/null || true
fi
# ★ 确保没有残留的 main.cjs（防止入口歧义）
if [ -f "electron/main.cjs" ]; then
    echo -e "${YELLOW}  删除残留的 electron/main.cjs（防止 ESM/CJS 入口歧义）...${NC}"
    rm -f electron/main.cjs
fi

echo -e "${GREEN}[✓] 旧产物及缓存已清理${NC}"

# ═══════════════════════════════════════════════════════════════
#  STEP 3.5: 源码验证
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 3.5/6 — 源码验证${NC}"

# 验证 rtsp:start 和 rtsp:stop handler 存在
if grep -q "rtsp:start" electron/main.js && grep -q "rtsp:stop" electron/main.js; then
    echo -e "${GREEN}[✓] RTSP IPC handler 存在${NC}"
else
    echo -e "${RED}[✗] 未找到 RTSP IPC handler，electron/main.js 可能不完整${NC}"
    exit 1
fi

# 验证 HLS 相关函数存在
if grep -q "ensureHlsHttpServer" electron/main.js && grep -q "spawnRtspStream" electron/main.js; then
    echo -e "${GREEN}[✓] HLS 转码函数存在${NC}"
else
    echo -e "${RED}[✗] 未找到 HLS 转码函数，electron/main.js 可能不完整${NC}"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 3.6: 准备 ffmpeg 静态二进制（RTSP 流转发依赖）
#  ⚠️ extraResources 已启用，ffmpeg 将被捆绑进安装包。
#  如果下载失败，打包时 electron-builder 会忽略 ffmpeg-bin/。
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 3.6/6 — 准备 ffmpeg 静态二进制${NC}"

# 先检查系统 ffmpeg 是否已安装
if command -v ffmpeg &>/dev/null; then
    FFMPEG_SYS_VER=$(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')
    echo -e "${GREEN}[✓] 系统 ffmpeg 已安装（版本 ${FFMPEG_SYS_VER}），运行时优先使用${NC}"
fi

FFMPEG_DIR="ffmpeg-bin"
FFMPEG_BIN="${FFMPEG_DIR}/ffmpeg"

# ★ 如果缓存有效，直接跳过整个下载流程
if [ "$FFMPEG_CACHE_VALID" = true ]; then
    echo -e "${GREEN}[✓] ffmpeg 静态二进制已就绪（缓存复用），跳过 STEP 3.6 下载${NC}"
    SKIP_FFMPEG_VERIFY=false
else
    # 缓存无效，执行下载流程
    # 清理旧残留
    if [ -d "$FFMPEG_DIR" ]; then
        echo -e "${BLUE}  清理旧 ffmpeg-bin/ ...${NC}"
        rm -rf "$FFMPEG_DIR"
    fi
    mkdir -p "$FFMPEG_DIR"

    if [ "$TARGET_ARCH" = "arm64" ]; then
        # ARM64 静态构建：从 GitHub BtbN 下载
        # GitHub 的 latest/download 路径会自动重定向到最新版本
        FFMPEG_URL="https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linuxarm64-gpl.tar.xz"
        FFMPEG_ARCH_LABEL="ARM64 (BtbN)"
        USE_TBNT=true
    else
        # x64 继续使用 johnvansickle.com（x64 版本可靠）
        FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
        FFMPEG_ARCH_LABEL="x64"
        USE_TBNT=false
    fi

    echo -e "${BLUE}  目标架构：${FFMPEG_ARCH_LABEL}${NC}"
    echo -e "${BLUE}  下载地址：${FFMPEG_URL}${NC}"

    DOWNLOAD_OK=false
    for attempt in 1 2 3; do
        if command -v wget &>/dev/null; then
            wget -q --show-progress --timeout=60 -O "${FFMPEG_DIR}/ffmpeg.tar.xz" "$FFMPEG_URL" && DOWNLOAD_OK=true
        elif command -v curl &>/dev/null; then
            curl -L --max-time 60 --progress-bar -o "${FFMPEG_DIR}/ffmpeg.tar.xz" "$FFMPEG_URL" && DOWNLOAD_OK=true
        fi
        
        if [ "$DOWNLOAD_OK" = true ] && [ -f "${FFMPEG_DIR}/ffmpeg.tar.xz" ]; then
            # 验证文件大小（BtbN 的 ARM64 包通常约 50-80MB，太小说明是 HTML 错误页）
            FILE_SIZE=$(stat -c%s "${FFMPEG_DIR}/ffmpeg.tar.xz" 2>/dev/null || stat -f%z "${FFMPEG_DIR}/ffmpeg.tar.xz" 2>/dev/null || echo "0")
            if [ "$FILE_SIZE" -gt 10000000 ]; then
                echo -e "${GREEN}[✓] 下载成功（${FILE_SIZE} bytes）${NC}"
                break
            else
                echo -e "${YELLOW}[!] 下载文件过小（${FILE_SIZE} bytes），可能是 HTML 错误页，重试...${NC}"
                rm -f "${FFMPEG_DIR}/ffmpeg.tar.xz"
                DOWNLOAD_OK=false
            fi
        fi
        
        if [ "$attempt" -lt 3 ]; then
            echo -e "${YELLOW}  [!] 下载尝试 ${attempt} 失败，${attempt} 秒后重试...${NC}"
            sleep 3
        fi
    done

    if [ "$DOWNLOAD_OK" != true ] || [ ! -f "${FFMPEG_DIR}/ffmpeg.tar.xz" ]; then
        echo -e "${YELLOW}[!] ffmpeg 下载失败（所有来源均失败）${NC}"
        echo -e "${YELLOW}   安装包将不包含内置 ffmpeg，但 deb 包已声明 ffmpeg 依赖${NC}"
        echo -e "${YELLOW}   系统安装 ffmpeg 后应用即可正常工作${NC}"
        rm -rf "$FFMPEG_DIR"
        rmdir "$FFMPEG_DIR" 2>/dev/null || true
        # 不退出，继续打包
        echo -e "${YELLOW}  继续打包（不含内置 ffmpeg）...${NC}"
        # 跳过后续解压验证
        SKIP_FFMPEG_VERIFY=true
    else
        SKIP_FFMPEG_VERIFY=false
    fi

    # 如果下载成功，继续解压验证
    if [ "$SKIP_FFMPEG_VERIFY" != true ]; then
        echo -e "${BLUE}  正在解压 ffmpeg...${NC}"

        # 尝试精确提取 ffmpeg 二进制
        tar -xf "${FFMPEG_DIR}/ffmpeg.tar.xz" -C "$FFMPEG_DIR" --strip-components=1 "*/ffmpeg" 2>/dev/null || {
            # 回退：解压全部再移动
            tar -xf "${FFMPEG_DIR}/ffmpeg.tar.xz" -C "$FFMPEG_DIR"
            FOUND_FFMPEG=$(find "$FFMPEG_DIR" -name "ffmpeg" -type f | head -1)
            if [ -n "$FOUND_FFMPEG" ] && [ "$FOUND_FFMPEG" != "$FFMPEG_BIN" ]; then
                mv "$FOUND_FFMPEG" "$FFMPEG_BIN"
            fi
            # 清理解压出来的目录
            find "$FFMPEG_DIR" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} + 2>/dev/null || true
        }

        # 清理临时文件
        rm -f "${FFMPEG_DIR}/ffmpeg.tar.xz"
        find "$FFMPEG_DIR" -mindepth 1 -maxdepth 1 -not -name "ffmpeg" -exec rm -rf {} + 2>/dev/null || true

        if [ -f "$FFMPEG_BIN" ]; then
            chmod +x "$FFMPEG_BIN"
            # ★ 验证 ELF 格式，防止下载到 HTML 错误页面
            ELF_MAGIC=$(xxd -l 4 -p "$FFMPEG_BIN" 2>/dev/null || od -An -tx1 -N4 "$FFMPEG_BIN" 2>/dev/null | tr -d ' ')
            if [ "$ELF_MAGIC" != "7f454c46" ]; then
                echo -e "${RED}[✗] ffmpeg 二进制格式错误（不是 ELF），可能是下载到了 HTML 错误页面${NC}"
                echo -e "${YELLOW}   ELF 魔数: ${ELF_MAGIC:-无}${NC}"
                echo -e "${YELLOW}   删除错误文件，安装包将不包含内置 ffmpeg${NC}"
                echo -e "${YELLOW}   系统安装 ffmpeg 后应用即可正常工作${NC}"
                rm -f "$FFMPEG_BIN"
                rmdir "$FFMPEG_DIR" 2>/dev/null || true
            else
                FFMPEG_SIZE=$(du -h "$FFMPEG_BIN" | cut -f1)
                echo -e "${GREEN}[✓] ffmpeg 已就绪（ELF 格式验证通过，${FFMPEG_SIZE}）${NC}"
            fi
        else
            echo -e "${YELLOW}[!] ffmpeg 解压后未找到，安装包将不包含内置 ffmpeg${NC}"
            echo -e "${YELLOW}   系统安装 ffmpeg 后应用即可正常工作${NC}"
            rmdir "$FFMPEG_DIR" 2>/dev/null || true
        fi
    fi
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 4: Vite 构建前端
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 4/6 — Vite 构建前端资源${NC}"
echo -e "${BLUE}  环境变量 ELECTRON=true${NC}"

ELECTRON=true npx vite build --outDir out
if [ $? -ne 0 ]; then
    echo -e "${RED}[✗] Vite 构建失败${NC}"
    echo -e "${YELLOW}   常见原因：TypeScript 类型错误、资源引用错误${NC}"
    exit 1
fi

if [ ! -f "out/index.html" ]; then
    echo -e "${RED}[✗] 构建产物不完整，缺少 out/index.html${NC}"
    exit 1
fi

# 验证资源路径是否正确（必须为 ./assets/ 开头，不能是 /assets/）
FIRST_SRC=$(grep -o 'src="[^"]*"' out/index.html | head -1 | sed 's/src="\([^"]*\)"/\1/')
if [[ "$FIRST_SRC" == /assets/* ]]; then
    echo -e "${RED}[✗] 构建产物路径错误：资源使用绝对路径 /assets/ 开头${NC}"
    echo -e "${RED}   这会导致 Electron file:// 协议无法加载资源，打包后白屏！${NC}"
    echo -e "${YELLOW}   请检查 vite.config.ts 中是否配置了 base: './'${NC}"
    exit 1
fi

echo -e "${GREEN}[✓] 前端构建完成（资源路径：${FIRST_SRC}）${NC}"

# ─── 确保 package.json 包含 homepage（electron-builder FPM 打包必需）──────
echo ""
echo -e "${BOLD}${CYAN}▶ 检查打包元数据${NC}"
echo -e "${BLUE}  确保 package.json 包含 homepage...${NC}"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!pkg.homepage) {
  pkg.homepage = 'https://canteen.local';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('Added homepage to package.json');
} else {
  console.log('homepage already exists: ' + pkg.homepage);
}
"
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}[!] 无法自动添加 homepage，继续尝试打包...${NC}"
fi

# ─── 写入版本号到 package.json（electron-builder 从这里读取版本）──────
# 注意：不用 --config 单独传版本，会把 electron-builder.yml 的 linux 配置覆盖掉
# 改为临时写 package.json version，打完包再恢复
echo ""
echo -e "${BOLD}${CYAN}▶ 设置打包版本号${NC}"
echo -e "${BLUE}  构建版本：${NEW_VER}${NC}"

# 保存原始版本号
ORIGINAL_VERSION=$(node -e "const p=require('./package.json');console.log(p.version||'0.0.0')")
echo -e "${BLUE}  原始版本：${ORIGINAL_VERSION}${NC}"

# 写入构建版本
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${NEW_VER}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('version 已更新为：${NEW_VER}');
"
echo -e "${GREEN}[✓] package.json version → ${NEW_VER}${NC}"

# ─── 确保 app-builder 二进制有执行权限 ──────────────────────────
echo -e "${BLUE}  修复 app-builder 二进制权限...${NC}"
if [ -d "node_modules/app-builder-bin/linux" ]; then
    chmod -R +x node_modules/app-builder-bin/linux/ 2>/dev/null || true
    echo -e "${GREEN}[✓] app-builder 权限已修复${NC}"
fi

# STEP 1 已经处理过 native 模块编译，这里统一跳过避免重复编译失败
echo -e "${YELLOW}  禁用 electron-builder 内置 native 模块重编译（已在 STEP 1 完成）${NC}"

# Docker 环境下 proper-lockfile 容易超时，加大 stale 阈值
export PROPER_LOCKFILE_STALE="${PROPER_LOCKFILE_STALE:-120000}"
echo -e "${BLUE}  PROPER_LOCKFILE_STALE=${PROPER_LOCKFILE_STALE}${NC}"

if [ -n "$TARGET_ARCH" ]; then
    npx electron-builder --linux --${TARGET_ARCH} --config.npmRebuild=false
else
    npx electron-builder --linux --config.npmRebuild=false
fi
BUILD_STATUS=$?

# 交叉编译完成后清理环境变量
if [ "$CROSS_COMPILE" = true ] && [ "$TARGET_ARCH" = "arm64" ]; then
    unset CC CXX AR npm_config_target_arch npm_config_arch
fi

if [ $BUILD_STATUS -ne 0 ]; then
    echo ""
    echo -e "${RED}[✗] Electron 打包失败${NC}"
    echo ""
    echo -e "${YELLOW}排查建议：${NC}"
    echo -e "${YELLOW}  1. 缺少 fakeroot：sudo apt install -y fakeroot dpkg${NC}"
    echo -e "${YELLOW}  2. 磁盘空间不足：df -h${NC}"
    echo -e "${YELLOW}  3. 查看上方详细错误日志，定位具体问题${NC}"
    exit 1
fi

# ─── 恢复 package.json 原始版本号 ────────────────────────────────
echo -e "${BLUE}  恢复 package.json 原始版本号...${NC}"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${ORIGINAL_VERSION}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('version 已恢复为：${ORIGINAL_VERSION}');
"
echo -e "${GREEN}[✓] package.json version → ${ORIGINAL_VERSION}${NC}"

# ═══════════════════════════════════════════════════════════════
#  STEP 5: 验证打包产物中的 main.js 代码
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 5/6 — 验证打包产物${NC}"

# 查找 ASAR 包或解压后的 app 目录中的 main.js
ASAR_PATH=""
for candidate in dist-electron/linux-unpacked/resources/app.asar dist-electron/*-unpacked/resources/app.asar; do
    if [ -f "$candidate" ]; then
        ASAR_PATH="$candidate"
        break
    fi
done

if [ -n "$ASAR_PATH" ]; then
    echo -e "${BLUE}  找到 ASAR 包：${ASAR_PATH}${NC}"
    
    # 使用 node 直接调用 asar API（避免 npx 找不到子依赖）
    ASAR_CHECK=$(node -e "try { require('asar'); console.log('ok'); } catch(e) { console.log('missing'); }" 2>/dev/null)
    if [ "$ASAR_CHECK" = "ok" ]; then
        ASAR_RESULT=$(node -e "
const asar = require('asar');
const fs = require('fs');
const path = require('path');
const asarPath = '$ASAR_PATH';
const tmpDir = '/tmp/canteen-asar-check';
try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
try { fs.mkdirSync(tmpDir, { recursive: true }); } catch(e) {}
try {
    asar.extractAll(asarPath, tmpDir);
    const mainJsPath = path.join(tmpDir, 'electron/main.js');
    if (fs.existsSync(mainJsPath)) {
        const content = fs.readFileSync(mainJsPath, 'utf8');
        if (content.includes('ensureHlsHttpServer') && content.includes('spawnRtspStream')) {
            console.log('ASAR_HLS_OK');
        } else {
            console.log('ASAR_HLS_MISSING');
        }
    } else {
        console.log('ASAR_MAIN_NOT_FOUND');
    }
} catch(e) {
    console.log('ASAR_EXTRACT_ERROR: ' + e.message);
}
" 2>/dev/null | tail -1)

        case "$ASAR_RESULT" in
            ASAR_HLS_OK)
                echo -e "${GREEN}[✓] ASAR 验证通过：HLS 转码函数已打包${NC}"
                ;;
            ASAR_HLS_MISSING)
                echo -e "${RED}[✗] ASAR 验证失败：打包产物中缺少 HLS 函数！${NC}"
                echo -e "${YELLOW}   这是打包工具缓存导致的，请删除所有缓存后重试：${NC}"
                echo -e "${YELLOW}   rm -rf node_modules/.cache ~/.cache/electron-builder ~/.electron dist-electron/${NC}"
                ;;
            ASAR_MAIN_NOT_FOUND)
                echo -e "${YELLOW}[!] ASAR 包中未找到 electron/main.js${NC}"
                ;;
            ASAR_EXTRACT_ERROR*)
                echo -e "${YELLOW}[!] ASAR 解压失败：${ASAR_RESULT}${NC}"
                ;;
            *)
                echo -e "${YELLOW}[!] ASAR 验证结果未知：${ASAR_RESULT}${NC}"
                ;;
        esac
        rm -rf /tmp/canteen-asar-check 2>/dev/null || true
    else
        echo -e "${YELLOW}[!] asar 模块不可用，跳过 ASAR 产物验证${NC}"
        echo -e "${YELLOW}   可以在麒麟电脑上手动验证：${NC}"
        echo -e "${YELLOW}   node -e \"require('asar').extractAll('${ASAR_PATH}', '/tmp/app-check')\"${NC}"
        echo -e "${YELLOW}   grep -n 'ensureHlsHttpServer' /tmp/app-check/electron/main.js${NC}"
    fi
else
    echo -e "${YELLOW}[!] 未找到 ASAR 包，跳过产物验证${NC}"
fi

# ═══════════════════════════════════════════════════════════════
#  结果输出
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  🎉 打包成功！${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""

if [ -d "dist-electron" ] && [ "$(ls -A dist-electron)" ]; then
    echo -e "${BOLD}${CYAN}📦 打包产物目录：dist-electron/${NC}"
    echo ""
    
    # 列出产物
    for f in dist-electron/*; do
        if [ -f "$f" ]; then
            SIZE=$(ls -lh "$f" | awk '{print $5}')
            NAME=$(basename "$f")
            echo -e "  ${GREEN}✓${NC} ${NAME}  (${SIZE})"
        fi
    done
    echo ""
    
    # 安装指引
    echo -e "${BOLD}${CYAN}📥 安装方式（在目标麒麟电脑上执行）：${NC}"
    echo ""
    
    # AppImage
    APPIMAGE=$(ls dist-electron/*.AppImage 2>/dev/null | head -1)
    if [ -n "$APPIMAGE" ]; then
        NAME=$(basename "$APPIMAGE")
        echo -e "  ${BOLD}方式一：AppImage（推荐，免安装，双击运行）${NC}"
        echo -e "  ${YELLOW}  cp ${NAME} /home/用户名/桌面/${NC}"
        echo -e "  ${YELLOW}  chmod +x /home/用户名/桌面/${NAME}${NC}"
        echo -e "  ${YELLOW}  双击图标即可启动${NC}"
        echo ""
    fi
    
    # deb
    DEB=$(ls dist-electron/*.deb 2>/dev/null | head -1)
    if [ -n "$DEB" ]; then
        NAME=$(basename "$DEB")
        echo -e "  ${BOLD}方式二：deb 安装包（安装到系统菜单）${NC}"
        echo -e "  ${YELLOW}  sudo dpkg -i ${NAME}${NC}"
        echo -e "  ${YELLOW}  sudo apt-get install -f   # 自动修复依赖（如有）${NC}"
        echo -e "  ${YELLOW}  然后在应用菜单中找到「食堂智慧管理系统」启动${NC}"
        echo ""
    fi
    
    echo -e "${BOLD}${CYAN}💾 数据相关：${NC}"
    echo -e "  ${YELLOW}应用数据目录：~/.config/食堂智慧管理系统/${NC}"
    echo -e "  ${YELLOW}日志文件：~/桌面/canteen-logs/${NC}"
    echo ""
    
    echo -e "${BOLD}${CYAN}📋 安装后验证：${NC}"
    echo -e "  ${YELLOW}1. 打开应用，检查页面是否正常显示${NC}"
    echo -e "  ${YELLOW}2. 进入「首页」，数据应正常加载（验收记录、环境监控等）${NC}"
    echo -e "  ${YELLOW}3. 如白屏，按 Ctrl+Shift+I 打开 DevTools 查看 Console 报错${NC}"
    echo ""
    
    echo -e "${BOLD}${CYAN}⚠️ 注意事项：${NC}"
    echo -e "  ${YELLOW}• 本系统使用 Supabase 云数据库，无需本地数据库配置${NC}"
    echo -e "  ${YELLOW}• 确保目标设备有网络连接以访问 Supabase 服务${NC}"
    echo ""
    
    echo -e "${GREEN}${BOLD}完成！${NC}"
    echo ""
else
    echo -e "${RED}[!] 警告：未找到 dist-electron 目录或目录为空${NC}"
fi
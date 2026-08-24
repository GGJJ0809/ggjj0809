#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  食堂智慧管理系统 — macOS 开发环境一键搭建脚本
#  Smart Canteen — macOS Dev Environment Setup
# ═══════════════════════════════════════════════════════════════
#
# 用法：
#   1. 打开终端（Terminal），cd 到项目根目录
#   2. 赋予执行权限：chmod +x setup-mac.sh
#   3. 运行：./setup-mac.sh
#
# 这个脚本会自动完成：
#   - 安装/更新 Node.js 18+（通过 nvm）
#   - 安装项目依赖（npm install）
#   - 安装 Electron + electron-builder（用于开发和打包）
#   - 检查并提示安装 Docker（用于 Linux 交叉打包）
#
# 如果已经装好了部分工具，脚本会自动跳过。
# ═══════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     食堂智慧管理系统 — macOS 开发环境搭建                    ║"
echo "║     Smart Canteen — macOS Dev Setup                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo -e "${BOLD}本机信息：${NC}"
echo -e "  系统：$(sw_vers -productName) $(sw_vers -productVersion)"
echo -e "  架构：$(uname -m)"
echo -e "  Shell：${SHELL}"
echo ""

# ─── STEP 1: 检查/安装 Xcode Command Line Tools ─────────────
echo -e "${BOLD}${CYAN}▶ STEP 1/6 — Xcode Command Line Tools${NC}"

if xcode-select -p &>/dev/null; then
    echo -e "${GREEN}[✓] Xcode Command Line Tools 已安装${NC}"
    echo -e "${BLUE}  路径：$(xcode-select -p)${NC}"
else
    echo -e "${YELLOW}[!] 未检测到 Xcode Command Line Tools（编译 native 模块需要）${NC}"
    echo -e "${BLUE}  正在安装（会弹出系统对话框，点击「安装」即可）...${NC}"
    xcode-select --install 2>/dev/null || true
    echo ""
    echo -e "${YELLOW}  安装完成后请重新运行本脚本。${NC}"
    echo -e "${YELLOW}  如果弹窗没有出现，可以手动执行：xcode-select --install${NC}"
    exit 0
fi

# ─── STEP 2: 检查/安装 Node.js（通过 nvm）─────────────────
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 2/6 — Node.js 环境${NC}"

NEED_NODE=false
NVM_LOADED=false

# 检查 nvm 是否已安装
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    NVM_LOADED=true
    echo -e "${GREEN}[✓] nvm 已安装${NC}"
elif [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
    source "/opt/homebrew/opt/nvm/nvm.sh"
    NVM_LOADED=true
    echo -e "${GREEN}[✓] nvm 已安装（Homebrew）${NC}"
else
    echo -e "${YELLOW}[!] 未检测到 nvm${NC}"

    # 检查是否安装了 Homebrew
    HAS_BREW=false
    if command -v brew &>/dev/null; then
        HAS_BREW=true
        echo -e "${GREEN}[✓] Homebrew 已安装${NC}"
    fi

    echo ""
    echo -e "${YELLOW}  nvm 是管理 Node.js 版本的最佳工具，推荐安装。${NC}"
    echo -e "${CYAN}  安装方式：${NC}"
    if [ "$HAS_BREW" = true ]; then
        echo -e "    brew install nvm"
        echo -e "    然后按提示在 ~/.zshrc 或 ~/.bash_profile 中添加 nvm 配置"
    else
        echo -e "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
    fi
    echo ""
    read -p "是否现在安装 nvm？[Y/n]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${YELLOW}  跳过 nvm，直接检查系统 Node.js...${NC}"
    else
        if [ "$HAS_BREW" = true ]; then
            brew install nvm
            mkdir -p "$HOME/.nvm"
            echo 'export NVM_DIR="$HOME/.nvm"' >> "$HOME/.zshrc"
            echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> "$HOME/.zshrc"
            echo '[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"' >> "$HOME/.zshrc"
            source "/opt/homebrew/opt/nvm/nvm.sh"
            NVM_LOADED=true
            echo -e "${GREEN}[✓] nvm 安装完成${NC}"
        else
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
            source "$HOME/.nvm/nvm.sh"
            NVM_LOADED=true
            echo -e "${GREEN}[✓] nvm 安装完成${NC}"
        fi
    fi
fi

# 检查 Node.js 版本
if command -v node &>/dev/null; then
    NODE_VER=$(node -v | sed 's/v//' | cut -d'.' -f1)
    if [ "$NODE_VER" -ge 18 ]; then
        echo -e "${GREEN}[✓] Node.js $(node -v)${NC}"
    else
        echo -e "${YELLOW}[!] Node.js $(node -v) 版本过低（需要 >= 18）${NC}"
        NEED_NODE=true
    fi
else
    echo -e "${YELLOW}[!] 未检测到 Node.js${NC}"
    NEED_NODE=true
fi

if [ "$NEED_NODE" = true ]; then
    if [ "$NVM_LOADED" = true ]; then
        echo -e "${BLUE}  通过 nvm 安装 Node.js 20 LTS...${NC}"
        nvm install 20
        nvm use 20
        nvm alias default 20
        echo -e "${GREEN}[✓] Node.js $(node -v)${NC}"
    else
        echo -e "${RED}[✗] 需要 Node.js >= 18，请手动安装${NC}"
        echo -e "${YELLOW}  推荐使用 nvm，或从 https://nodejs.org 下载安装包${NC}"
        exit 1
    fi
fi

# 检查 npm
if command -v npm &>/dev/null; then
    echo -e "${GREEN}[✓] npm $(npm -v)${NC}"
else
    echo -e "${RED}[✗] 未检测到 npm，Node.js 安装可能不完整${NC}"
    exit 1
fi

# ─── STEP 3: 安装项目依赖 ─────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 3/6 — 安装项目依赖${NC}"

if [ -d "node_modules" ] && [ -d "node_modules/react" ] && [ -d "node_modules/vite" ]; then
    if [ -f "package.json" ] && [ "package.json" -nt "node_modules" ]; then
        echo -e "${YELLOW}[!] package.json 已更新，重新安装依赖...${NC}"
        npm install
    else
        echo -e "${GREEN}[✓] node_modules 已存在且最新，跳过 npm install${NC}"
    fi
else
    echo -e "${BLUE}  正在执行 npm install...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}[✗] npm install 失败${NC}"
        echo -e "${YELLOW}  可能原因：网络问题、node 版本不兼容${NC}"
        echo -e "${YELLOW}  尝试：npm install --legacy-peer-deps${NC}"
        exit 1
    fi
    echo -e "${GREEN}[✓] 依赖安装完成${NC}"
fi

# ─── STEP 4: 安装 Electron + electron-builder ──────────────
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 4/6 — Electron 开发工具${NC}"

NEED_ELECTRON=false
if [ ! -d "node_modules/electron" ]; then
    echo -e "${YELLOW}  未检测到 electron${NC}"
    NEED_ELECTRON=true
fi
if [ ! -d "node_modules/electron-builder" ]; then
    echo -e "${YELLOW}  未检测到 electron-builder${NC}"
    NEED_ELECTRON=true
fi

if [ "$NEED_ELECTRON" = true ]; then
    echo -e "${BLUE}  正在安装 electron 和 electron-builder...${NC}"
    npm install --save-dev electron electron-builder
    if [ $? -ne 0 ]; then
        echo -e "${RED}[✗] Electron 工具安装失败${NC}"
        exit 1
    fi
    echo -e "${GREEN}[✓] Electron 工具安装完成${NC}"
else
    ELECTRON_VER=$(grep '"version"' node_modules/electron/package.json 2>/dev/null | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "unknown")
    echo -e "${GREEN}[✓] Electron ${ELECTRON_VER} / electron-builder 已就绪${NC}"
fi

# ─── STEP 5: 检查 Docker（Linux 交叉打包需要）─────────────
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 5/6 — Docker（Linux 打包工具）${NC}"

if command -v docker &>/dev/null; then
    DOCKER_VER=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')
    echo -e "${GREEN}[✓] Docker ${DOCKER_VER} 已安装${NC}"

    # 验证 Docker 是否正常运行
    if docker info &>/dev/null 2>&1; then
        echo -e "${GREEN}[✓] Docker 运行正常${NC}"
    else
        echo -e "${YELLOW}[!] Docker 已安装但似乎未运行${NC}"
        echo -e "${YELLOW}  请打开 Docker Desktop 应用并等待它启动完成${NC}"
    fi
else
    echo -e "${YELLOW}[!] 未检测到 Docker${NC}"
    echo ""
    echo -e "${YELLOW}  Docker 用于在 Mac 上打包 Linux（麒麟系统）安装包。${NC}"
    echo -e "${YELLOW}  如果不需打包 Linux 版本，可以跳过。${NC}"
    echo ""
    echo -e "${CYAN}  安装方式：${NC}"
    echo -e "  1. 下载 Docker Desktop for Mac（Apple Silicon 选 Apple Chip 版）："
    echo -e "     https://www.docker.com/products/docker-desktop/"
    echo -e "  2. 安装后打开 Docker Desktop，等待左下角显示绿色「Running」"
    echo -e "  3. 重新运行本脚本验证"
    echo ""
    read -p "是否跳过 Docker 安装？[y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}  请安装 Docker 后重新运行本脚本。${NC}"
        exit 0
    fi
    echo -e "${YELLOW}  Docker 已跳过。如需打包 Linux 版本，之后安装 Docker 即可。${NC}"
fi

# ─── STEP 6: 验证 ──────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 6/6 — 环境验证${NC}"

echo ""
echo -e "${BOLD}当前环境：${NC}"
echo -e "  Node.js : $(node -v)"
echo -e "  npm     : $(npm -v)"
echo -e "  Electron: $(grep '"version"' node_modules/electron/package.json 2>/dev/null | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo '未安装')"
echo -e "  Docker  : $(docker --version 2>/dev/null || echo '未安装')"
echo -e "  项目目录: ${SCRIPT_DIR}"
echo ""

# ─── 快速启动指引 ──────────────────────────────────────────
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  ✓ 环境搭建完成！${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}${CYAN}🚀 日常开发：${NC}"
echo -e "  ${YELLOW}npm run dev${NC}          → 启动 Vite 开发服务器（浏览器访问 http://localhost:3000）"
echo ""
echo -e "${BOLD}${CYAN}🔧 Electron 桌面开发模式：${NC}"
echo -e "  ${YELLOW}npx electron .${NC}       → 启动 Electron 窗口（需先开 npm run dev）"
echo ""
echo -e "${BOLD}${CYAN}📦 打包 Linux（麒麟系统）安装包：${NC}"
if command -v docker &>/dev/null; then
    echo -e "  ${YELLOW}./build-linux-docker.sh${NC}  → 通过 Docker 交叉编译，生成 AppImage + deb"
else
    echo -e "  ${YELLOW}需要先安装 Docker Desktop，然后运行：./build-linux-docker.sh${NC}"
fi
echo ""

# 询问是否现在启动开发服务器
read -p "是否现在启动 Vite 开发服务器测试一下？[Y/n]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo ""
    echo -e "${BLUE}正在启动 Vite 开发服务器...${NC}"
    echo -e "${YELLOW}按 Ctrl+C 停止${NC}"
    echo ""
    npm run dev
fi
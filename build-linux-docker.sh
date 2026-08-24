#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  食堂智慧管理系统 — macOS → Linux（麒麟系统）Docker 打包脚本
#  Smart Canteen — macOS Docker Cross-Build for Kylin OS
# ═══════════════════════════════════════════════════════════════
#
# 用法：
#   1. 确保 Docker Desktop 已启动（左下角绿色 "Running"）
#   2. chmod +x build-linux-docker.sh
#   3. ./build-linux-docker.sh
#
# 原理：
#   在 macOS 上无法直接使用 fakeroot/dpkg/libfuse2 等 Linux 工具
#   这个脚本开一个 Ubuntu 容器，在里面运行 build-kylin.sh 完成打包
#   产物自动复制回 Mac 桌面
#
# 产物（在桌面 canteen-packages-YYYYMMDD-HHMM/ 目录下）：
#   - 食堂智慧管理系统-x.x.x-x86_64.AppImage  (Intel/AMD 麒麟)
#   - 食堂智慧管理系统_x.x.x_amd64.deb        (Intel/AMD 麒麟)
#   - 食堂智慧管理系统-x.x.x-arm64.AppImage   (飞腾/鲲鹏 麒麟)
#   - 食堂智慧管理系统_x.x.x_arm64.deb         (飞腾/鲲鹏 麒麟)
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
PROJECT_NAME="$(basename "$SCRIPT_DIR")"

# 产物输出目录（放桌面）
TIMESTAMP=$(date +%Y%m%d-%H%M)
OUTPUT_DIR="$HOME/Desktop/canteen-packages-${TIMESTAMP}"
mkdir -p "$OUTPUT_DIR"

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     macOS → Linux（麒麟系统）Docker 交叉打包                 ║"
echo "║     Smart Canteen — Docker Cross-Build for Kylin             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 前置检查 ──────────────────────────────────────────────
echo -e "${BOLD}${CYAN}▶ 环境检查${NC}"

# Docker
if ! command -v docker &>/dev/null; then
    echo -e "${RED}[✗] 未检测到 Docker${NC}"
    echo -e "${YELLOW}  请先安装 Docker Desktop：https://www.docker.com/products/docker-desktop/${NC}"
    echo -e "${YELLOW}  然后运行 ./setup-mac.sh 完成环境搭建${NC}"
    exit 1
fi
echo -e "${GREEN}[✓] Docker $(docker --version | awk '{print $3}' | tr -d ',')${NC}"

if ! docker info &>/dev/null 2>&1; then
    echo -e "${RED}[✗] Docker 未运行${NC}"
    echo -e "${YELLOW}  请打开 Docker Desktop 应用，等待左下角显示绿色「Running」${NC}"
    exit 1
fi
echo -e "${GREEN}[✓] Docker 运行正常${NC}"

# build-kylin.sh
if [ ! -f "build-kylin.sh" ]; then
    echo -e "${RED}[✗] 找不到 build-kylin.sh，请在项目根目录运行本脚本${NC}"
    exit 1
fi
echo -e "${GREEN}[✓] 构建脚本 build-kylin.sh 存在${NC}"

# ─── STEP 1: 创建临时 Dockerfile ───────────────────────────
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 1/4 — 准备 Ubuntu 构建镜像${NC}"

TMP_DOCKERFILE=$(mktemp /tmp/canteen-dockerfile.XXXXXX)
cat > "$TMP_DOCKERFILE" << 'DOCKEREOF'
FROM ubuntu:22.04

# 避免交互式提示
ENV DEBIAN_FRONTEND=noninteractive

# 安装所有打包依赖
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    fakeroot \
    dpkg \
    libfuse2 \
    python3 \
    g++ \
    make \
    xz-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 安装 Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 设置 npm 国内镜像（加速下载）
RUN npm config set registry https://registry.npmmirror.com/

WORKDIR /build
DOCKEREOF

IMAGE_NAME="canteen-builder:latest"
IMAGE_ARCH=$(docker inspect "$IMAGE_NAME" --format='{{.Os}}/{{.Architecture}}' 2>/dev/null || echo "none")
if [ "$IMAGE_ARCH" = "linux/amd64" ]; then
    echo -e "${GREEN}[✓] amd64 构建镜像已存在，跳过构建${NC}"
else
    echo -e "${BLUE}  构建 Docker 镜像（首次约 2-5 分钟，后续复用缓存）...${NC}"
    TMP_CTX=$(mktemp -d)
    cp "$TMP_DOCKERFILE" "$TMP_CTX/Dockerfile"
    docker build --platform linux/amd64 -t "$IMAGE_NAME" "$TMP_CTX"
    rm -rf "$TMP_CTX"
    echo -e "${GREEN}[✓] 构建镜像就绪${NC}"
fi
rm -f "$TMP_DOCKERFILE"

# ─── STEP 2: 打包 x64 版本 ─────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 2/4 — 打包 x64（Intel/AMD 麒麟）${NC}"
echo -e "${BLUE}  将项目复制到容器内 tmpfs（绕过 bind mount 文件锁问题）...${NC}"

docker run --rm \
    --platform linux/amd64 \
    -v "$SCRIPT_DIR":/build-host \
    --tmpfs /build:exec,uid=1000,gid=1000,size=6g \
    -e ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
    -e ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
    "$IMAGE_NAME" \
    bash -c "
        echo '[1/4] 复制项目到 tmpfs 工作区...'
        cp -a /build-host/. /build/
        cd /build
        echo '[2/4] 执行 build-kylin.sh...'
        chmod +x build-kylin.sh
        ./build-kylin.sh
        echo '[3/4] 复制打包产物回宿主机...'
        if [ -d dist-electron ]; then
            cp -r dist-electron /build-host/
        fi
        if [ -f .build-version ]; then
            cp .build-version /build-host/
        fi
        if [ -f src/buildInfo.ts ]; then
            cp src/buildInfo.ts /build-host/src/
        fi
        if [ -f package.json ]; then
            cp package.json /build-host/package.json
        fi
        echo '[4/4] 完成'
    "

# 复制 x64 产物
X64_COUNT=0
if [ -d "dist-electron" ]; then
    for f in dist-electron/*x86_64* dist-electron/*amd64*; do
        if [ -f "$f" ]; then
            cp "$f" "$OUTPUT_DIR/"
            X64_COUNT=$((X64_COUNT + 1))
        fi
    done
    # 也复制不含架构标记的（build-kylin.sh 在单架构模式下产物名字不带架构后缀）
    for f in dist-electron/*.AppImage dist-electron/*.deb; do
        if [ -f "$f" ] && [[ "$f" != *arm64* ]] && [[ "$f" != *x86_64* ]] && [[ "$f" != *amd64* ]]; then
            cp "$f" "$OUTPUT_DIR/"
            X64_COUNT=$((X64_COUNT + 1))
        fi
    done
fi
echo -e "${GREEN}[✓] x64 打包完成，产物 ${X64_COUNT} 个${NC}"

# ─── STEP 3: 打包 arm64 版本 ────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}▶ STEP 3/4 — 打包 arm64（飞腾/鲲鹏 麒麟）${NC}"
echo -e "${BLUE}  将项目复制到容器内 tmpfs（绕过 bind mount 文件锁问题）...${NC}"

docker run --rm \
    --platform linux/amd64 \
    -v "$SCRIPT_DIR":/build-host \
    --tmpfs /build:exec,uid=1000,gid=1000,size=6g \
    -e ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
    -e ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
    "$IMAGE_NAME" \
    bash -c "
        echo '[1/4] 安装 ARM64 交叉编译工具链...'
        apt-get update && apt-get install -y gcc-aarch64-linux-gnu g++-aarch64-linux-gnu
        echo '[2/4] 复制项目到 tmpfs 工作区...'
        cp -a /build-host/. /build/
        cd /build
        echo '[3/4] 执行 build-kylin.sh（ARM64 交叉编译）...'
        chmod +x build-kylin.sh
        FORCE_ARCH=arm64 ./build-kylin.sh
        echo '[4/4] 复制打包产物回宿主机...'
        if [ -d dist-electron ]; then
            cp -r dist-electron /build-host/
        fi
        if [ -f .build-version ]; then
            cp .build-version /build-host/
        fi
        if [ -f src/buildInfo.ts ]; then
            cp src/buildInfo.ts /build-host/src/
        fi
        if [ -f package.json ]; then
            cp package.json /build-host/package.json
        fi
        echo '[完成]'
    "

# 复制 arm64 产物
ARM64_COUNT=0
if [ -d "dist-electron" ]; then
    for f in dist-electron/*arm64* dist-electron/*aarch64*; do
        if [ -f "$f" ]; then
            cp "$f" "$OUTPUT_DIR/"
            ARM64_COUNT=$((ARM64_COUNT + 1))
        fi
    done
fi
echo -e "${GREEN}[✓] arm64 打包完成，产物 ${ARM64_COUNT} 个${NC}"

# ─── STEP 4: 输出结果 ──────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  🎉 全部打包完成！${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}${CYAN}📦 产物位置：${OUTPUT_DIR}${NC}"
echo ""

TOTAL_COUNT=0
if [ "$(ls -A "$OUTPUT_DIR" 2>/dev/null)" ]; then
    for f in "$OUTPUT_DIR"/*; do
        if [ -f "$f" ]; then
            SIZE=$(ls -lh "$f" | awk '{print $5}')
            NAME=$(basename "$f")
            echo -e "  ${GREEN}✓${NC} ${NAME}  (${SIZE})"
            TOTAL_COUNT=$((TOTAL_COUNT + 1))
        fi
    done
    echo ""
    echo -e "${BOLD}共 ${TOTAL_COUNT} 个安装包${NC}"
else
    echo -e "${YELLOW}  [!] 未找到打包产物，请检查上方日志排查问题${NC}"
fi

echo ""
echo -e "${BOLD}${CYAN}📥 客户安装方式：${NC}"
echo -e "  ${YELLOW}客户先执行 uname -m 确认 CPU 架构：${NC}"
echo -e "    ${YELLOW}x86_64 → 用 x86_64.AppImage 或 amd64.deb${NC}"
echo -e "    ${YELLOW}aarch64 → 用 arm64.AppImage 或 arm64.deb${NC}"
echo ""
echo -e "  ${BOLD}AppImage（免安装）：${NC}"
echo -e "    ${YELLOW}chmod +x 文件名.AppImage && ./文件名.AppImage${NC}"
echo ""
echo -e "  ${BOLD}deb（系统安装）：${NC}"
echo -e "    ${YELLOW}sudo dpkg -i 文件名.deb${NC}"
echo -e "    ${YELLOW}sudo apt-get install -f${NC}"
echo ""

# 清理中间产物
echo -e "${BLUE}清理 dist-electron/ 临时目录...${NC}"
rm -rf dist-electron out 2>/dev/null || true
echo -e "${GREEN}[✓] 清理完成${NC}"
echo ""

echo -e "${BOLD}${GREEN}完成！把桌面上的 canteen-packages-${TIMESTAMP}/ 文件夹发给客户即可。${NC}"
echo ""
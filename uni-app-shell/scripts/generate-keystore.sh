#!/bin/bash

# ===== 配置区域（按需修改）=====
KEYSTORE_FILE="myapp.keystore"
ALIAS_NAME="myapp"
KEYPASS="123456"
STOREPASS="123456"
DNAME="CN=备案公司, OU=备案部门, O=备案组织, L=城市, ST=省份, C=CN"
# ================================

echo ""
echo "============================================"
echo "  uni-app 安卓签名证书生成器（备案信息提取）"
echo "============================================"
echo ""

# 检查 keytool
if ! command -v keytool &> /dev/null; then
    echo "[错误] 未找到 keytool。请先安装 JDK！"
    echo "Mac: brew install --cask temurin"
    echo "官网: https://adoptium.net/"
    exit 1
fi

# 如果证书已存在，询问是否覆盖
if [ -f "$KEYSTORE_FILE" ]; then
    echo "[提示] 发现已存在证书文件：$KEYSTORE_FILE"
    read -p "是否重新生成？(y/N): " OVERWRITE
    if [[ "$OVERWRITE" =~ ^[Yy]$ ]]; then
        rm "$KEYSTORE_FILE"
    else
        echo "[跳过] 使用已有证书，直接提取信息..."
        EXTRACT_ONLY=true
    fi
fi

# 生成证书
if [ "$EXTRACT_ONLY" != "true" ]; then
    echo "[1/3] 正在生成签名证书..."
    keytool -genkey -v \
        -keystore "$KEYSTORE_FILE" \
        -alias "$ALIAS_NAME" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -keypass "$KEYPASS" \
        -storepass "$STOREPASS" \
        -dname "$DNAME"

    if [ $? -ne 0 ]; then
        echo "[错误] 证书生成失败！"
        exit 1
    fi
    echo "[完成] 证书已生成：$KEYSTORE_FILE"
    echo ""
fi

echo "[2/3] 正在提取备案信息..."
echo ""

# 从 manifest.json 读取包名
MANIFEST="../manifest.json"
ANDROID_PACKAGE=$(grep -o '"packagename"[^,]*' "$MANIFEST" | sed 's/.*"packagename"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
HARMONY_PACKAGE=$(grep -o '"package"[^,]*' "$MANIFEST" | grep -v 'packagename' | sed 's/.*"package"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

echo "============================================"
echo "  【安卓平台备案信息】"
echo "============================================"
echo "包名（Package Name）: $ANDROID_PACKAGE"
echo ""
echo "--- 证书 MD5 指纹 ---"
keytool -list -v -keystore "$KEYSTORE_FILE" -storepass "$STOREPASS" 2>/dev/null | grep -A1 "MD5"

echo ""
echo "--- 证书 SHA-1 指纹（参考）---"
keytool -list -v -keystore "$KEYSTORE_FILE" -storepass "$STOREPASS" 2>/dev/null | grep -A1 "SHA1"

echo ""
echo "--- 数字签名公钥 ---"
keytool -list -v -keystore "$KEYSTORE_FILE" -storepass "$STOREPASS" 2>/dev/null | grep -A10 "Subject Public Key Algorithm"

echo ""
echo "--- 证书所有者（需与备案主体一致）---"
keytool -list -v -keystore "$KEYSTORE_FILE" -storepass "$STOREPASS" 2>/dev/null | grep -E "Owner:|Issuer:"

echo ""
echo "============================================"
echo "  【鸿蒙平台备案信息（证书通用）】"
echo "============================================"
echo "鸿蒙包名: $HARMONY_PACKAGE"
echo "证书 MD5 指纹: （同上）"
echo "数字签名公钥: （同上）"

echo ""
echo "============================================"
echo "  【证书文件位置】"
echo "============================================"
echo "证书路径: $(pwd)/$KEYSTORE_FILE"
echo "证书密码: $STOREPASS"
echo "别名: $ALIAS_NAME"
echo ""

echo "[3/3] 全部完成！请复制上方信息到备案表格。"
echo ""
read -p "按回车键退出..."
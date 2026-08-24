@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ===== 配置区域（按需修改）=====
set KEYSTORE_FILE=myapp.keystore
set ALIAS_NAME=myapp
set KEYPASS=123456
set STOREPASS=123456
set DNAME=CN=备案公司, OU=备案部门, O=备案组织, L=城市, ST=省份, C=CN
:: ================================

echo.
echo ============================================
echo   uni-app 安卓签名证书生成器（备案信息提取）
echo ============================================
echo.

:: 检查 keytool 是否可用
keytool -help >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 keytool。请先安装 JDK！
    echo 下载地址：https://adoptium.net/
    echo.
    pause
    exit /b 1
)

:: 如果证书已存在，询问是否覆盖
if exist %KEYSTORE_FILE% (
    echo [提示] 发现已存在证书文件：%KEYSTORE_FILE%
    set /p OVERWRITE="是否重新生成？(y/N): "
    if /I "!OVERWRITE!"=="y" (
        del %KEYSTORE_FILE%
    ) else (
        echo [跳过] 使用已有证书，直接提取信息...
        goto EXTRACT
    )
)

echo [1/3] 正在生成签名证书...
keytool -genkey -v ^
    -keystore %KEYSTORE_FILE% ^
    -alias %ALIAS_NAME% ^
    -keyalg RSA ^
    -keysize 2048 ^
    -validity 10000 ^
    -keypass %KEYPASS% ^
    -storepass %STOREPASS% ^
    -dname "%DNAME%"

if errorlevel 1 (
    echo [错误] 证书生成失败！
    pause
    exit /b 1
)

echo [完成] 证书已生成：%KEYSTORE_FILE%
echo.

:EXTRACT
echo [2/3] 正在提取备案信息...
echo.

:: 将 keytool 输出写入临时文件
keytool -list -v -keystore %KEYSTORE_FILE% -storepass %STOREPASS% > keystore_info.txt 2>&1

:: 提取包名（从 manifest.json 读取）
echo ============================================
echo   【安卓平台备案信息】
echo ============================================
set /p PACKAGENAME=<nul
for /f "tokens=2 delims=:" %%a in ('findstr /C:"packagename" ..\manifest.json') do (
    set PACKAGENAME=%%a
    set PACKAGENAME=!PACKAGENAME:"=!
    set PACKAGENAME=!PACKAGENAME: =!
    set PACKAGENAME=!PACKAGENAME:,=!
)
echo 包名（Package Name）: !PACKAGENAME!

:: 提取 MD5
echo.
echo --- 证书 MD5 指纹 ---
findstr /C:"MD5" keystore_info.txt

:: 提取 SHA1
echo.
echo --- 证书 SHA-1 指纹（参考）---
findstr /C:"SHA1" keystore_info.txt

:: 提取公钥
echo.
echo --- 数字签名公钥 ---
findstr /C:"Subject Public Key Algorithm" keystore_info.txt
findstr /C:"RSA Public Key" keystore_info.txt
findstr /C:"Modulus" keystore_info.txt

:: 提取所有者信息
echo.
echo --- 证书所有者（需与备案主体一致）---
findstr /C:"Owner" keystore_info.txt
findstr /C:"Issuer" keystore_info.txt

echo.
echo ============================================
echo   【鸿蒙平台备案信息（证书通用）】
echo ============================================
for /f "tokens=2 delims=:" %%a in ('findstr /C:"package" ..\manifest.json') do (
    set HMPACKAGE=%%a
    set HMPACKAGE=!HMPACKAGE:"=!
    set HMPACKAGE=!HMPACKAGE: =!
    set HMPACKAGE=!HMPACKAGE:,=!
)
echo 鸿蒙包名: !HMPACKAGE!
echo 证书 MD5 指纹: （同上）
echo 数字签名公钥: （同上）

echo.
echo ============================================
echo   【证书文件位置】
echo ============================================
echo 证书路径: %CD%\%KEYSTORE_FILE%
echo 证书密码: %STOREPASS%
echo 别名: %ALIAS_NAME%
echo.

:: 删除临时文件
del keystore_info.txt >nul 2>&1

echo [3/3] 全部完成！请复制上方信息到备案表格。
echo.
pause
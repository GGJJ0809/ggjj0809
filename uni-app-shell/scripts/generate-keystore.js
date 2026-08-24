const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// ===== 配置区域（按需修改）=====
const CONFIG = {
  keystoreFile: 'myapp.keystore',
  aliasName: 'myapp',
  keyPass: '123456',
  storePass: '123456',
  dname: 'CN=备案公司, OU=备案部门, O=备案组织, L=城市, ST=省份, C=CN'
}
// ================================

function checkKeytool() {
  try {
    execSync('keytool -help', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function generateKeystore() {
  console.log('[1/3] 正在生成签名证书...\n')
  const cmd = `keytool -genkey -v ` +
    `-keystore ${CONFIG.keystoreFile} ` +
    `-alias ${CONFIG.aliasName} ` +
    `-keyalg RSA -keysize 2048 -validity 10000 ` +
    `-keypass ${CONFIG.keyPass} -storepass ${CONFIG.storePass} ` +
    `-dname "${CONFIG.dname}"`

  execSync(cmd, { stdio: 'inherit' })
  console.log(`\n[完成] 证书已生成：${path.resolve(CONFIG.keystoreFile)}\n`)
}

function extractInfo() {
  console.log('[2/3] 正在提取备案信息...\n')

  const output = execSync(
    `keytool -list -v -keystore ${CONFIG.keystoreFile} -storepass ${CONFIG.storePass}`,
    { encoding: 'utf-8', stdio: 'pipe' }
  )

  // 读取 manifest.json 包名
  const manifestPath = path.join(__dirname, '..', 'manifest.json')
  let androidPackage = 'com.yourcompany.yourapp'
  let harmonyPackage = 'com.yourcompany.yourapp'

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    androidPackage = manifest['app-plus']?.distribute?.android?.packagename || androidPackage
    harmonyPackage = manifest['mp-harmony']?.package || harmonyPackage
  } catch (e) {
    console.log('[提示] 读取 manifest.json 失败，使用默认值\n')
  }

  // 解析 keytool 输出
  const md5Match = output.match(/MD5:([\s\S]*?)(?=SHA1:|$)/)
  const sha1Match = output.match(/SHA1:([\s\S]*?)(?=Signature|$)/)
  const pubKeyMatch = output.match(/Subject Public Key Algorithm:([\s\S]*?)\n\n/)
  const ownerMatch = output.match(/Owner: (.*)/)
  const issuerMatch = output.match(/Issuer: (.*)/)

  const md5 = md5Match ? md5Match[1].trim().replace(/\s+/g, '').toUpperCase() : '未找到'
  const sha1 = sha1Match ? sha1Match[1].trim().replace(/\s+/g, '').toUpperCase() : '未找到'
  const pubKey = pubKeyMatch ? pubKeyMatch[0].trim() : '未找到'
  const owner = ownerMatch ? ownerMatch[1].trim() : '未找到'
  const issuer = issuerMatch ? issuerMatch[1].trim() : '未找到'

  console.log('============================================')
  console.log('  【安卓平台备案信息】')
  console.log('============================================')
  console.log(`包名（Package Name）: ${androidPackage}`)
  console.log('')
  console.log('--- 证书 MD5 指纹 ---')
  console.log(md5)
  console.log('')
  console.log('--- 证书 SHA-1 指纹（参考）---')
  console.log(sha1)
  console.log('')
  console.log('--- 数字签名公钥 ---')
  console.log(pubKey)
  console.log('')
  console.log('--- 证书所有者（需与备案主体一致）---')
  console.log(`Owner:  ${owner}`)
  console.log(`Issuer: ${issuer}`)
  console.log('')
  console.log('============================================')
  console.log('  【鸿蒙平台备案信息（证书通用）】')
  console.log('============================================')
  console.log(`鸿蒙包名: ${harmonyPackage}`)
  console.log(`证书 MD5 指纹: ${md5}`)
  console.log(`数字签名公钥: ${pubKey}`)
  console.log('')
  console.log('============================================')
  console.log('  【证书文件位置】')
  console.log('============================================')
  console.log(`证书路径: ${path.resolve(CONFIG.keystoreFile)}`)
  console.log(`证书密码: ${CONFIG.storePass}`)
  console.log(`别名: ${CONFIG.aliasName}`)
  console.log('')
}

function main() {
  console.log('')
  console.log('============================================')
  console.log('  uni-app 签名证书生成 & 备案信息提取')
  console.log('============================================')
  console.log('')

  if (!checkKeytool()) {
    console.log('[错误] 未找到 keytool。请先安装 JDK！')
    console.log('下载地址：https://adoptium.net/')
    process.exit(1)
  }

  // 如果证书已存在
  if (fs.existsSync(CONFIG.keystoreFile)) {
    console.log(`[提示] 发现已存在证书：${CONFIG.keystoreFile}`)
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    })
    readline.question('是否重新生成？(y/N): ', (answer) => {
      readline.close()
      if (answer.toLowerCase() === 'y') {
        fs.unlinkSync(CONFIG.keystoreFile)
        generateKeystore()
        extractInfo()
        console.log('[3/3] 全部完成！请复制上方信息到备案表格。\n')
      } else {
        console.log('[跳过] 使用已有证书，直接提取信息...\n')
        extractInfo()
        console.log('[完成] 请复制上方信息到备案表格。\n')
      }
    })
  } else {
    generateKeystore()
    extractInfo()
    console.log('[3/3] 全部完成！请复制上方信息到备案表格。\n')
  }
}

main()
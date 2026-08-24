<template>
  <view class="container">
    <web-view :src="webUrl" />
  </view>
</template>

<script>
export default {
  data() {
    return {
      // ===== 修改这里：换成你的项目域名 =====
      webUrl: 'https://your-domain.com'
    }
  },
  onLoad() {
    // 支持从本地存储动态覆盖（方便测试环境切换）
    try {
      const storedUrl = uni.getStorageSync('app_web_url')
      if (storedUrl) {
        this.webUrl = storedUrl
      }
    } catch (e) {
      console.log('读取本地存储失败', e)
    }
  }
}
</script>

<style>
.container {
  width: 100%;
  height: 100vh;
  padding: 0;
  margin: 0;
}
</style>
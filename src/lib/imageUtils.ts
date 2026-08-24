/**
 * 将图片文件压缩并返回 base64 Data URL
 * 大幅降低内存占用，防止大量菜品图片导致页面闪退
 */

interface CompressOptions {
  maxWidth?: number;   // 最大宽度，默认 400px
  maxHeight?: number;  // 最大高度，默认 400px
  quality?: number;    // JPEG 质量 0-1，默认 0.7
  outputType?: string; // 输出格式，默认 'image/jpeg'
}

const DEFAULT_OPTIONS: CompressOptions = {
  maxWidth: 400,
  maxHeight: 400,
  quality: 0.7,
  outputType: 'image/jpeg',
};

export function compressImage(file: File, options?: CompressOptions): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    // 非图片文件直接 fallback 到 FileReader
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const { maxWidth, maxHeight } = opts;

      // 等比缩放：确保宽高都不超过最大值
      if (width > maxWidth! || height > maxHeight!) {
        const ratio = Math.min(maxWidth! / width, maxHeight! / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 不可用'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // 转为 base64，使用 JPEG 大幅减小体积
      const dataUrl = canvas.toDataURL(opts.outputType, opts.quality);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };

    img.src = url;
  });
}

/**
 * 估算 base64 字符串解码后的字节数（用于调试）
 */
export function estimateBase64Size(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.round((base64.length * 3) / 4);
}
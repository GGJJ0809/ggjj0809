import { useState, useRef, useCallback } from 'react';
import { compressImage } from '@/lib/imageUtils';

// 检测是否为 Electron 桌面端（本地模式无 Supabase Storage）
function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  className?: string;
  shape?: 'circle' | 'square';
  size?: string;
}

export default function ImageUploader({
  value,
  onChange,
  placeholder = '点击上传图片',
  className = '',
  shape = 'square',
  size = 'h-28',
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  /** 将图片文件读取为 base64 Data URL（Electron 本地模式使用，已压缩） */
  const readAsDataURL = (file: File): Promise<string> => {
    return compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.8 });
  };

  /** 通过 Supabase Storage 上传图片（云端模式使用） */
  const uploadToSupabase = async (file: File): Promise<string> => {
    const { supabase } = await import('@/lib/supabase');

    // Electron 本地模式下 supabase 是 localDb 的代理，没有 storage
    if (isElectron() || !supabase.storage) {
      throw new Error('ELECTRON_MODE');
    }

    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { data: uploadData, error } = await supabase.storage
      .from('images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from('images')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过 5MB');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      let url: string;

      try {
        // 优先尝试 Supabase Storage 上传
        url = await uploadToSupabase(file);
      } catch (uploadErr: any) {
        // Electron 本地模式或 Storage 不可用 → 降级为 base64 Data URL
        if (
          uploadErr?.message === 'ELECTRON_MODE' ||
          uploadErr?.message?.includes('storage') ||
          uploadErr?.message?.includes('.storage is not')
        ) {
          console.log('[ImageUploader] 本地模式，使用 base64 Data URL');
          url = await readAsDataURL(file);
        } else {
          throw uploadErr;
        }
      }

      onChange(url);
    } catch (err: any) {
      console.error('Upload error:', err);
      alert('上传失败: ' + (err?.message || '请重试'));
    } finally {
      setUploading(false);
      setProgress(0);
      // Reset input
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }, [onChange]);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg';

  return (
    <div className={`relative ${className}`}>
      <div
        onClick={handleClick}
        className={`w-full ${size} ${shapeClass} bg-slate-100 overflow-hidden flex items-center justify-center border border-slate-200 cursor-pointer hover:border-emerald-300 transition-colors relative`}
      >
        {value ? (
          <>
            <img src={value} alt="uploaded" className="w-full h-full object-cover" />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick();
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-slate-700 hover:bg-white cursor-pointer"
              >
                <i className="ri-refresh-line text-sm" />
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-red-500 hover:bg-white cursor-pointer"
              >
                <i className="ri-delete-bin-line text-sm" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-slate-400">
            {uploading ? (
              <>
                <i className="ri-loader-4-line animate-spin text-xl" />
                <span className="text-xs mt-1">上传中...</span>
              </>
            ) : (
              <>
                <i className="ri-upload-cloud-2-line text-2xl" />
                <span className="text-xs mt-1">{placeholder}</span>
              </>
            )}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
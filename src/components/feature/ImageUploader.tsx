import { useState, useRef, useCallback } from "react";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
  folder?: string;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  placeholder?: string;
}

interface StoredImage {
  name: string;
  path: string;
  url: string;
  createdAt: string;
}

export default function ImageUploader({
  value,
  onChange,
  bucket = "public",
  folder = "images",
  accept = "image/*",
  maxSizeMB = 5,
  label = "图片",
  placeholder = "https://...",
}: ImageUploaderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [storedImages, setStoredImages] = useState<StoredImage[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<string>(folder);

  const validateFileName = (name: string): string => {
    const clean = name
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_");
    return clean.substring(0, 63) || "image";
  };

  const handleFileUpload = async (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`文件不能超过 ${maxSizeMB}MB`);
      return;
    }

    setLoading(true);
    setError("");
    setUploadProgress(0);

    try {
      const fileName = `${Date.now()}_${validateFileName(file.name)}`;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('filename', fileName);

      const response = await fetch('http://114.215.190.225/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || '上传失败');
      }

      onChange(data.url);
      setShowPicker(false);
      await loadStoredImages();
    } catch (err: any) {
      setError(err?.message || "上传失败");
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const loadStoredImages = useCallback(async () => {
    setPickerLoading(true);
    try {
      const response = await fetch(`http://114.215.190.225/api/images?folder=${folderRef.current}`);
      const data = await response.json();
      if (data.success) {
        setStoredImages(data.images || []);
      } else {
        setStoredImages([]);
      }
    } catch (err) {
      console.error("加载图片失败", err);
      setStoredImages([]);
    } finally {
      setPickerLoading(false);
    }
  }, []);

  const openPicker = async () => {
    setShowPicker(true);
    await loadStoredImages();
  };

  const removeImage = async (path: string) => {
    try {
      await fetch('http://114.215.190.225/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      setStoredImages((prev) => prev.filter((img) => img.path !== path));
      if (value.includes(path.split("/").pop() || "")) {
        onChange("");
      }
    } catch (err) {
      console.error("删除失败", err);
    }
  };

  const copyUrlToClipboard = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-medium text-foreground-500">
          {label}
        </label>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-background-200/70 bg-background-50 text-sm text-foreground-800 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="shrink-0 px-3 py-2 rounded-lg bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 disabled:opacity-50 transition-all whitespace-nowrap flex items-center gap-1"
        >
          {loading ? (
            <i className="ri-loader-4-line animate-spin"></i>
          ) : (
            <>
              <i className="ri-upload-cloud-2-line"></i>
              上传
            </>
          )}
        </button>
        <button
          type="button"
          onClick={openPicker}
          className="shrink-0 px-3 py-2 rounded-lg border border-background-200/70 text-foreground-600 text-xs font-medium hover:bg-background-50 transition-all whitespace-nowrap flex items-center gap-1"
        >
          <i className="ri-image-line"></i>
          选择
        </button>
      </div>

      <input
        type="file"
        ref={fileRef}
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
          e.target.value = "";
        }}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {value && (
        <div className="relative w-40 h-28 rounded-lg overflow-hidden border border-background-200/70 bg-background-100">
          <img
            src={value}
            alt="preview"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-all"
          >
            <i className="ri-close-line text-xs"></i>
          </button>
        </div>
      )}

      {/* Image Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowPicker(false)}
          ></div>
          <div className="relative bg-white rounded-xl border border-background-200/70 w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col mx-4">
            <div className="sticky top-0 bg-white border-b border-background-200/70 px-5 py-4 flex items-center justify-between z-10 shrink-0">
              <h2 className="font-semibold text-foreground-900">图片管理</h2>
              <button
                onClick={() => setShowPicker(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {pickerLoading ? (
                <div className="flex items-center justify-center py-12">
                  <i className="ri-loader-4-line animate-spin text-foreground-400 text-lg"></i>
                </div>
              ) : storedImages.length === 0 ? (
                <div className="text-center py-12">
                  <i className="ri-image-line text-3xl text-foreground-300 mb-2"></i>
                  <p className="text-sm text-foreground-400">暂无图片</p>
                  <p className="text-xs text-foreground-300 mt-1">
                    点击底部按钮上传新图片
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {storedImages.map((img) => {
                    const isSelected = value === img.url ||
                      (img.url && value.includes(img.name));
                    return (
                      <div key={img.path} className="relative group">
                        <button
                          type="button"
                          onClick={() => {
                            onChange(img.url);
                            setShowPicker(false);
                          }}
                          className={`w-full aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                            isSelected
                              ? "border-primary-500 ring-2 ring-primary-200"
                              : "border-background-200/70 hover:border-primary-300"
                          }`}
                        >
                          <img
                            src={img.url}
                            alt={img.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "https://readdy.ai/api/search-image?query=broken%20image%20placeholder&width=200&height=200&seq=placeholder&orientation=squarish";
                            }}
                          />
                        </button>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center">
                            <i className="ri-check-line text-xs"></i>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(img.path)}
                          className="absolute top-2 left-2 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <i className="ri-delete-bin-line text-xs"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => copyUrlToClipboard(img.url)}
                          className="absolute bottom-2 right-2 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                          title="复制URL"
                        >
                          <i className="ri-link text-xs"></i>
                        </button>
                        <p className="text-[10px] text-foreground-400 mt-1 truncate">
                          {img.name}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-background-200/70 px-5 py-4 flex items-center justify-between shrink-0">
              <p className="text-xs text-foreground-400">
                共 {storedImages.length} 张图片
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 rounded-full bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all whitespace-nowrap flex items-center gap-1"
                >
                  <i className="ri-upload-cloud-2-line"></i>
                  上传新图片
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
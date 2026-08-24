import { useState, useRef } from 'react';

export interface PhotoItem {
  id: string;
  dataUrl: string;
  label: string;
  timestamp: string;
}

interface Props {
  title?: string;
  description?: string;
  minPhotos?: number;
  maxPhotos?: number;
  photos: PhotoItem[];
  onAddPhoto: (photo: PhotoItem) => void;
  onDeletePhoto: (id: string) => void;
  onClearAll?: () => void;
}

export default function PhotoCapture({
  title = '拍照留存',
  description = '请拍摄货品照片，建议从不同角度拍摄',
  minPhotos = 1,
  maxPhotos = 10,
  photos,
  onAddPhoto,
  onDeletePhoto,
  onClearAll,
}: Props) {
  const [capturing, setCapturing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      setCapturing(true);
    };
    reader.readAsDataURL(file);

    e.target.value = '';
  };

  const handleConfirmCapture = () => {
    if (!previewUrl) return;

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const photo: PhotoItem = {
      id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      dataUrl: previewUrl,
      label: `照片 ${photos.length + 1}`,
      timestamp: ts,
    };

    onAddPhoto(photo);
    setPreviewUrl(null);
    setCapturing(false);
  };

  const handleCancelCapture = () => {
    setPreviewUrl(null);
    setCapturing(false);
  };

  const handleOpenCamera = async () => {
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraOpen(false);
      fileInputRef.current?.click();
    }
  };

  const handleCameraCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPreviewUrl(dataUrl);
    setCapturing(true);
    closeCamera();
  };

  const closeCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-700">{title}</p>
          <p className="text-xs text-slate-400 mt-0.5">{description}（{photos.length}/{maxPhotos}）</p>
        </div>
        <div className="flex gap-1.5">
          {onClearAll && photos.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs text-red-400 border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-delete-bin-line mr-1 text-xs" />清空
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenCamera}
            disabled={photos.length >= maxPhotos}
            className="flex items-center gap-1 text-xs bg-slate-800 text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="ri-camera-line text-sm" />拍照
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={photos.length >= maxPhotos}
            className="flex items-center gap-1 text-xs border border-slate-200 text-slate-500 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="ri-image-add-line text-sm" />上传
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* Camera preview */}
      {cameraOpen && (
        <div className="relative bg-black rounded-xl overflow-hidden">
          <video ref={videoRef} className="w-full max-h-64 object-cover" autoPlay playsInline muted />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
            <button
              type="button"
              onClick={handleCameraCapture}
              className="w-14 h-14 flex items-center justify-center rounded-full bg-white border-4 border-slate-300 hover:border-emerald-400 cursor-pointer transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-white border-2 border-slate-400" />
            </button>
          </div>
          <button
            type="button"
            onClick={closeCamera}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer"
          >
            <i className="ri-close-line" />
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {/* Preview & confirm */}
      {capturing && previewUrl && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <img src={previewUrl} alt="预览" className="w-full max-h-48 object-contain rounded-lg bg-white" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmCapture}
              className="flex-1 text-xs bg-emerald-500 text-white py-2 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap flex items-center justify-center gap-1"
            >
              <i className="ri-check-line" />确认保存
            </button>
            <button
              type="button"
              onClick={handleCancelCapture}
              className="text-xs border border-slate-200 text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100 cursor-pointer whitespace-nowrap"
            >
              重新拍摄
            </button>
          </div>
        </div>
      )}

      {/* Photo gallery */}
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square">
              <img
                src={photo.dataUrl}
                alt={photo.label}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const w = window.open('', '_blank');
                    if (w) {
                      w.document.write(`<img src="${photo.dataUrl}" style="max-width:100%;max-height:100vh" />`);
                    }
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 group-hover:opacity-100 cursor-pointer mr-1"
                  title="查看大图"
                >
                  <i className="ri-zoom-in-line text-xs" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePhoto(photo.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="删除"
                >
                  <i className="ri-close-line text-xs" />
                </button>
              </div>
              <span className="absolute bottom-1 left-1 text-[10px] text-white bg-black/50 px-1 rounded">
                {photo.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
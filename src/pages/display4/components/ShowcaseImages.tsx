import { useEffect, useState } from 'react';
import { loadDisplayConfig } from '@/lib/displayStore';

export default function ShowcaseImages() {
  const [images, setImages] = useState<string[]>(['', '', '', '']);
  const [loading, setLoading] = useState(true);

  const fetchImages = async () => {
    try {
      const config = await loadDisplayConfig('default');
      const showcaseImages = config?.settings?.showcaseImages;
      if (Array.isArray(showcaseImages) && showcaseImages.length > 0) {
        const padded = [...showcaseImages];
        while (padded.length < 4) padded.push('');
        setImages(padded.slice(0, 4));
      }
    } catch (e) {
      console.error('[ShowcaseImages] fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
    const timer = setInterval(fetchImages, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-3 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-cyan-500/10">
          <i className="ri-image-line text-cyan-400 text-3xl" />
        </div>
        <span className="text-3xl font-semibold text-slate-200 whitespace-nowrap">菜价公示</span>
      </div>

      <div className="flex-1 grid grid-rows-4 gap-1.5 min-h-0">
        {loading ? (
          <div className="row-span-4 flex items-center justify-center text-slate-500">
            <i className="ri-loader-4-line animate-spin text-7xl" />
          </div>
        ) : (
          images.map((url, i) => (
            <div
              key={i}
              className="relative bg-slate-950 rounded-md border border-slate-800 overflow-hidden flex items-center justify-center"
            >
              {url ? (
                <img
                  src={url}
                  alt={`展示图${i + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-slate-600">
                  <i className="ri-image-add-line text-6xl" />
                  <span className="text-2xl">未上传</span>
                </div>
              )}
              {/* 序号角标 */}
              <span className="absolute top-1 left-1 w-6 h-6 flex items-center justify-center rounded bg-slate-900/80 text-2xl font-medium text-slate-400 border border-slate-700">
                {i + 1}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
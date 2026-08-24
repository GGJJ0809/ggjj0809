import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import type { HikvisionChannel } from '@/hooks/useHikvision';

interface Props {
  channel: HikvisionChannel;
  selected?: boolean;
  onClick?: () => void;
  onFullscreen?: () => void;
  showRefresh?: boolean;
  fillContainer?: boolean;
  showScanline?: boolean;
  isActive?: boolean;
}

type Status = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'error';

const MAX_RECONNECT = 5;
const RECONNECT_DELAYS = [2000, 4000, 8000, 8000, 8000];

export default function CameraFrame({ channel, selected, onClick, onFullscreen, showRefresh = true, fillContainer, showScanline, isActive }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [reconnectCount, setReconnectCount] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const streamStartedRef = useRef(false);

  const statusRef = useRef<Status>('connecting');
  const reconnectCountRef = useRef(0);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { reconnectCountRef.current = reconnectCount; }, [reconnectCount]);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch { /* ignore */ }
      hlsRef.current = null;
    }
  }, []);

  const stopStream = useCallback(async () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    destroyHls();
    streamStartedRef.current = false;
    const electronApi = (window as any).electronAPI;
    if (electronApi?.rtspStop && channel.rtspUrl) {
      try { await electronApi.rtspStop(channel.rtspUrl); } catch { /* ignore */ }
    }
  }, [destroyHls, channel.rtspUrl]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (!mountedRef.current) return;

    const nextCount = reconnectCountRef.current + 1;
    if (nextCount >= MAX_RECONNECT) {
      setStatus('error');
      setErrorMsg('视频流多次尝试恢复失败，推流服务可能已停止。请检查 ffmpeg 进程或重新配置摄像头。');
      return;
    }

    const delay = RECONNECT_DELAYS[Math.min(nextCount - 1, RECONNECT_DELAYS.length - 1)];
    setReconnectCount(nextCount);
    setStatus('reconnecting');
    setErrorMsg(`连接中断，${delay / 1000} 秒后自动重试 (第 ${nextCount}/${MAX_RECONNECT} 次)`);

    reconnectTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        startStreamRef.current(true);
      }
    }, delay);
  }, []);

  const startStreamRef = useRef<(isReconnect?: boolean) => Promise<void>>(async () => {});

  const startStream = useCallback(async (isReconnect = false) => {
    if (!mountedRef.current) return;

    if (!channel.rtspUrl) {
      setStatus('error');
      setErrorMsg('通道未配置 RTSP 地址，请打开「配置设备」填写地址');
      return;
    }

    const electronApi = (window as any).electronAPI;
    if (!electronApi?.rtspStart) {
      setStatus('error');
      setErrorMsg('桌面客户端 IPC 未就绪：请确认使用 Electron 桌面客户端打开。');
      return;
    }

    if (isReconnect) {
      setStatus('reconnecting');
      setErrorMsg(`正在恢复连接… (第 ${reconnectCountRef.current + 1}/${MAX_RECONNECT} 次)`);
    } else {
      setStatus('connecting');
      setErrorMsg('');
      setReconnectCount(0);
      reconnectCountRef.current = 0;
    }

    destroyHls();

    try {
      if (isReconnect && electronApi.rtspStop && channel.rtspUrl) {
        try { await electronApi.rtspStop(channel.rtspUrl); } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 800));
      }

      console.log(`[Camera CH${channel.channelNo}] 调用 rtspStart: ${channel.rtspUrl}`);
      const result = await electronApi.rtspStart(channel.rtspUrl);
      if (!mountedRef.current) return;

      console.log(`[Camera CH${channel.channelNo}] rtspStart 结果:`, result);

      if (!result?.success) {
        if (isReconnect && reconnectCountRef.current < MAX_RECONNECT - 1) {
          scheduleReconnect();
          return;
        }
        setStatus('error');
        setErrorMsg(
          `RTSP 转码服务启动失败：${result?.error || '未知错误'}。` +
          '请检查 ffmpeg 是否已安装、RTSP 地址是否正确、防火墙是否放行本地端口。'
        );
        return;
      }

      const hlsUrl = result.hlsUrl;
      console.log(`[Camera CH${channel.channelNo}] HLS URL: ${hlsUrl}`);

      if (!videoRef.current) {
        setStatus('error');
        setErrorMsg('Video 元素未挂载。');
        return;
      }

      const video = videoRef.current;

      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 10,
          liveSyncDurationCount: 2,
          enableWorker: true,
          lowLatencyMode: false,
        });

        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          console.log(`[Camera CH${channel.channelNo}] HLS 已绑定到 video 元素`);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!mountedRef.current) return;
          setStatus('online');
          setErrorMsg('');
          setReconnectCount(0);
          reconnectCountRef.current = 0;
          streamStartedRef.current = true;
          console.log(`[Camera CH${channel.channelNo}] HLS manifest parsed, stream online`);
          video.play().catch((e) => {
            console.warn(`[Camera CH${channel.channelNo}] auto-play failed:`, e.message);
          });
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.warn(`[Camera CH${channel.channelNo}] HLS error:`, data.type, data.details);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log(`[Camera CH${channel.channelNo}] HLS fatal network error, attempting recover`);
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log(`[Camera CH${channel.channelNo}] HLS fatal media error, attempting recover`);
                hls.recoverMediaError();
                break;
              default:
                console.error(`[Camera CH${channel.channelNo}] HLS unrecoverable error`);
                if (streamStartedRef.current && statusRef.current !== 'reconnecting') {
                  scheduleReconnect();
                }
                break;
            }
          }
        });

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
          if (!mountedRef.current) return;
          setStatus('online');
          setErrorMsg('');
          setReconnectCount(0);
          reconnectCountRef.current = 0;
          streamStartedRef.current = true;
          video.play().catch(() => {});
        });
      } else {
        setStatus('error');
        setErrorMsg('当前浏览器不支持 HLS 播放，请升级浏览器或使用桌面客户端。');
        return;
      }

      const connectTimeout = setTimeout(() => {
        if (!mountedRef.current || streamStartedRef.current) return;
        if (isReconnect && reconnectCountRef.current < MAX_RECONNECT - 1) {
          scheduleReconnect();
          return;
        }
        setStatus('error');
        setErrorMsg('HLS 流连接超时（15秒）。可能原因：1) ffmpeg 未正确生成 HLS 文件；2) RTSP 地址不可达；3) 摄像头编码格式不兼容。');
      }, 15000);

      const onPlaying = () => {
        clearTimeout(connectTimeout);
      };
      video.addEventListener('playing', onPlaying, { once: true });

    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (isReconnect && reconnectCountRef.current < MAX_RECONNECT - 1) {
        scheduleReconnect();
        return;
      }
      setStatus('error');
      setErrorMsg(`启动 RTSP 流时异常：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [channel.rtspUrl, channel.channelNo, destroyHls, scheduleReconnect]);

  useEffect(() => {
    startStreamRef.current = startStream;
  }, [startStream]);

  useEffect(() => {
    mountedRef.current = true;
    startStream(false);

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      destroyHls();
      const electronApi = (window as any).electronAPI;
      if (electronApi?.rtspStop && channel.rtspUrl) {
        electronApi.rtspStop(channel.rtspUrl).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.rtspUrl, channel.channelNo, startStream, destroyHls]);

  const handleRefresh = useCallback(async () => {
    setStatus('connecting');
    setErrorMsg('');
    setReconnectCount(0);
    reconnectCountRef.current = 0;
    await stopStream();
    await new Promise((r) => setTimeout(r, 500));
    if (mountedRef.current) {
      startStreamRef.current(false);
    }
  }, [stopStream]);

  const statusCfg = {
    connecting: { label: '连接中', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-400' },
    online: { label: '在线', dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-400' },
    reconnecting: { label: '重连中', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-400' },
    offline: { label: '离线', dot: 'bg-red-400', text: 'text-red-400' },
    error: { label: '异常', dot: 'bg-red-500', text: 'text-red-400' },
  };
  const cfg = statusCfg[status];

  const innerWrapperClass = fillContainer ? 'w-full h-full relative' : 'w-full relative';
  const innerWrapperStyle = fillContainer ? {} : { paddingTop: '56.25%' };

  return (
    <div
      onClick={onClick}
      className={`relative group overflow-hidden bg-slate-900 cursor-pointer transition-all ${
        fillContainer ? 'w-full h-full' : 'w-full rounded-xl border-2'
      } ${!fillContainer ? (selected ? 'border-emerald-400' : 'border-transparent hover:border-slate-600') : ''}`}
    >
      <div className={innerWrapperClass} style={innerWrapperStyle}>
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
          autoPlay
        />

        {(status === 'offline' || status === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 bg-slate-900 px-3">
            <i className={`${status === 'error' ? 'ri-error-warning-line' : 'ri-camera-off-line'} text-3xl mb-1.5`} />
            <span className="text-xs">{status === 'error' ? '流异常' : '设备离线'}</span>
            {errorMsg && (
              <div className="text-[11px] text-red-400 mt-1 max-w-[95%] text-center leading-relaxed overflow-y-auto max-h-[70%] whitespace-pre-wrap">
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {(status === 'connecting' || status === 'reconnecting') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/80 px-3">
            <i className="ri-loader-4-line text-2xl animate-spin mb-1" />
            <span className="text-xs">{status === 'reconnecting' ? '恢复连接中…' : '连接中…'}</span>
            {errorMsg && (
              <div className="text-[11px] text-amber-400 mt-1 max-w-[95%] text-center leading-relaxed overflow-y-auto max-h-[70%] whitespace-pre-wrap">
                {errorMsg}
              </div>
            )}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 pointer-events-none" />

        {showScanline && (
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)',
            }}
          />
        )}

        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
          <span className="text-white text-xs font-mono bg-black/50 px-2 py-0.5 rounded">
            CH{channel.channelNo}
          </span>
          <span className={`flex items-center gap-1 text-xs bg-black/50 px-2 py-0.5 rounded ${cfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>

        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <div>
            <p className="text-white text-xs font-medium">{channel.name}</p>
            <p className="text-white/50 text-xs">{channel.location}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {showRefresh && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 hover:bg-white/30 text-white text-xs p-1.5 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <i className="ri-refresh-line text-sm" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onFullscreen?.(); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 hover:bg-white/30 text-white text-xs p-1.5 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <i className="ri-fullscreen-line text-sm" />
            </button>
          </div>
        </div>

        {isActive && (
          <div className="absolute inset-0 border-2 border-emerald-400 pointer-events-none z-10" />
        )}
      </div>
    </div>
  );
}
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/browser";
import { X, CameraOff, RefreshCw } from "lucide-react";

interface CameraScannerProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

export function CameraScanner({ onScan, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraIdx, setActiveCameraIdx] = useState(0);
  const lastScanRef = useRef<string>("");
  const cooldownRef = useRef(false);

  const startScanner = useCallback(async (deviceId?: string) => {
    if (!videoRef.current) return;
    setError(null);

    if (readerRef.current) {
      BrowserMultiFormatReader.releaseAllStreams();
    }

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    try {
      await reader.decodeFromVideoDevice(
        deviceId ?? undefined,
        videoRef.current,
        (result, err) => {
          if (result) {
            const text = result.getText();
            if (text && text !== lastScanRef.current && !cooldownRef.current) {
              lastScanRef.current = text;
              cooldownRef.current = true;
              onScan(text);
              // 1.5s cooldown to avoid re-scanning the same barcode
              setTimeout(() => {
                cooldownRef.current = false;
                lastScanRef.current = "";
              }, 1500);
            }
          }
          if (err && !(err instanceof NotFoundException)) {
            // Suppress NotFoundException — fires every frame when no barcode visible
          }
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Camera access denied");
    }
  }, [onScan]);

  useEffect(() => {
    // List available cameras
    BrowserMultiFormatReader.listVideoInputDevices().then((devices) => {
      setCameras(devices);
      // Prefer back camera on tablets/phones
      const backIdx = devices.findIndex(d =>
        /back|rear|environment/i.test(d.label)
      );
      const idx = backIdx >= 0 ? backIdx : 0;
      setActiveCameraIdx(idx);
      startScanner(devices[idx]?.deviceId);
    }).catch(() => {
      startScanner(); // fallback: let browser pick
    });

    return () => {
      BrowserMultiFormatReader.releaseAllStreams();
    };
  }, [startScanner]);

  function switchCamera() {
    const next = (activeCameraIdx + 1) % cameras.length;
    setActiveCameraIdx(next);
    startScanner(cameras[next]?.deviceId);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/80">
        <span className="text-zinc-200 text-sm font-medium">Scan Barcode / QR</span>
        <div className="flex items-center gap-3">
          {cameras.length > 1 && (
            <button
              onClick={switchCamera}
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
              title="Switch camera"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          playsInline
        />

        {/* Aim overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 relative">
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-[#16a34a] rounded-tl-sm" />
            <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-[#16a34a] rounded-tr-sm" />
            <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-[#16a34a] rounded-bl-sm" />
            <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-[#16a34a] rounded-br-sm" />
            {/* Scan line animation */}
            <div className="absolute inset-x-0 h-0.5 bg-[#16a34a]/70 animate-scan-line" />
          </div>
        </div>

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
            <CameraOff className="h-10 w-10 text-zinc-500" />
            <p className="text-zinc-300 text-sm text-center px-8">{error}</p>
            <button
              onClick={() => startScanner(cameras[activeCameraIdx]?.deviceId)}
              className="text-[#16a34a] text-sm underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <p className="text-center text-zinc-500 text-xs py-3 bg-zinc-950/80">
        Point camera at barcode or QR code
      </p>
    </div>
  );
}

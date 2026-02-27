"use client";

import { useState } from "react";
import { Download, X, ZoomIn } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { isImageFile } from "@/lib/utils";
import type { TicketAttachment } from "@/lib/types/database";

interface AttachmentGalleryProps {
  attachments: TicketAttachment[];
}

export function AttachmentGallery({ attachments }: AttachmentGalleryProps) {
  const [lightbox, setLightbox] = useState<TicketAttachment | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {attachments.map((att) => (
          <div key={att.id} className="group relative">
            {isImageFile(att.file_type) ? (
              <button
                onClick={() => setLightbox(att)}
                className="w-full aspect-square rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.file_url}
                  alt={att.file_name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                  <ZoomIn className="h-5 w-5 text-white" />
                </div>
              </button>
            ) : (
              <a
                href={att.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full aspect-square rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition-colors flex flex-col items-center justify-center gap-1"
              >
                <Download className="h-5 w-5 text-zinc-400" />
                <span className="text-xs text-zinc-500 text-center px-2 truncate w-full text-center">
                  {att.file_name}
                </span>
              </a>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-3xl p-2">
          {lightbox && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.file_url}
                alt={lightbox.file_name}
                className="w-full rounded-lg max-h-[80vh] object-contain"
              />
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-xs text-zinc-400">{lightbox.file_name}</span>
                <a
                  href={lightbox.file_url}
                  download={lightbox.file_name}
                  className="text-xs text-[#16a34a] hover:text-[#9d8fff] flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  Download
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

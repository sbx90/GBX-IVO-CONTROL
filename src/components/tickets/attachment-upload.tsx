"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, Loader2, FileImage } from "lucide-react";
import { useAddAttachment } from "@/hooks/use-tickets";
import { cn, formatFileSize } from "@/lib/utils";

interface AttachmentUploadProps {
  ticketId: string;
  commentId?: string;
  onUploadComplete?: () => void;
  compact?: boolean;
}

interface FileWithPreview {
  file: File;
  preview: string;
}

export function AttachmentUpload({
  ticketId,
  commentId,
  onUploadComplete,
  compact = false,
}: AttachmentUploadProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const addAttachment = useAddAttachment();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [], "application/pdf": [] },
    maxSize: 10 * 1024 * 1024, // 10MB
    onDrop: (accepted) => {
      const withPreviews = accepted.map((f) => ({
        file: f,
        preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
      }));
      setFiles((prev) => [...prev, ...withPreviews]);
    },
  });

  function removeFile(idx: number) {
    setFiles((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[idx].preview);
      updated.splice(idx, 1);
      return updated;
    });
  }

  async function uploadAll() {
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const { file } of files) {
        await addAttachment.mutateAsync({ ticketId, commentId, file });
      }
      setFiles([]);
      onUploadComplete?.();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg transition-colors cursor-pointer",
          compact ? "p-3" : "p-5",
          isDragActive
            ? "border-[#16a34a] bg-[#16a34a]/5"
            : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/30"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-1.5 text-center">
          <Upload
            className={cn(
              "text-zinc-500",
              compact ? "h-4 w-4" : "h-6 w-6"
            )}
          />
          <p
            className={cn(
              "text-zinc-400",
              compact ? "text-xs" : "text-sm"
            )}
          >
            {isDragActive
              ? "Drop files here"
              : compact
              ? "Attach files"
              : "Drop images or PDFs here, or click to browse"}
          </p>
          {!compact && (
            <p className="text-xs text-zinc-600">Max 10MB per file</p>
          )}
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 p-2 rounded bg-zinc-800 text-sm"
            >
              {f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.preview}
                  alt=""
                  className="h-8 w-8 rounded object-cover flex-shrink-0"
                />
              ) : (
                <FileImage className="h-8 w-8 text-zinc-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-zinc-200 truncate text-xs">{f.file.name}</p>
                <p className="text-zinc-500 text-xs">
                  {formatFileSize(f.file.size)}
                </p>
              </div>
              <button
                onClick={() => removeFile(i)}
                className="text-zinc-500 hover:text-red-400 flex-shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <button
            onClick={uploadAll}
            disabled={uploading}
            className="w-full py-1.5 rounded bg-[#16a34a]/20 border border-[#16a34a]/30 text-[#16a34a] text-xs font-medium hover:bg-[#16a34a]/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {uploading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-3 w-3" />
                Upload {files.length} file{files.length !== 1 ? "s" : ""}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

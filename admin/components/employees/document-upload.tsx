"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import { employeeAPI } from "@/lib/api";
import { toast } from "sonner";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface DocumentUploadProps {
  id: string;
  label: string;
  documentType: "pan-card" | "aadhaar-card";
  onChange: (key: string | null) => void;
  onUploadingChange?: (uploading: boolean) => void;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function DocumentUpload({ id, label, documentType, onChange, onUploadingChange }: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const setUploadingState = (value: boolean) => {
    setUploading(value);
    onUploadingChange?.(value);
  };

  const clear = () => {
    setPreview(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only JPG, PNG or WEBP images are allowed");
      clear();
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Image must be 5 MB or smaller");
      clear();
      return;
    }

    setUploadingState(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const response = await employeeAPI.uploadDocument(documentType, dataUrl);
      setPreview(dataUrl);
      onChange(response.data.data.key);
      toast.success(`${label} uploaded`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || `Failed to upload ${label}`);
      clear();
    } finally {
      setUploadingState(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {preview ? (
        <div className="relative rounded-md border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={label} className="h-32 w-full rounded object-contain bg-muted" />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Uploaded
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={clear} className="gap-1">
              <X className="w-4 h-4" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full h-32 border-dashed flex flex-col gap-2"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <ImagePlus className="w-6 h-6" />
              Upload {label}
              <span className="text-xs text-muted-foreground">JPG, PNG or WEBP, up to 5 MB</span>
            </>
          )}
        </Button>
      )}
    </div>
  );
}

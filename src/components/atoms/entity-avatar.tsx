"use client";

import { useState } from "react";
import { resolveEntityLogo } from "@/lib/logos";
import { cn } from "@/lib/utils";

interface EntityAvatarProps {
  logoUrl?: string | null;
  logoBase64?: string | null;
  name: string;
  primaryColor?: string | null;
  pfcPrimary?: string | null;
  size?: "sm" | "md";
}

const sizeClasses = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
} as const;

export function EntityAvatar({
  logoUrl,
  logoBase64,
  name,
  primaryColor,
  pfcPrimary,
  size = "md",
}: EntityAvatarProps) {
  const resolved = resolveEntityLogo({ logoUrl, logoBase64, name, primaryColor, pfcPrimary });
  const [imgError, setImgError] = useState(false);

  const fallback = resolveEntityLogo({ name, primaryColor });
  const initials = fallback.type === "initials" ? fallback : { initial: name.charAt(0).toUpperCase() || "?", backgroundColor: "#9CA3AF" };

  if (resolved.type === "image" && !imgError) {
    return (
      <img
        src={resolved.src}
        alt=""
        onError={() => setImgError(true)}
        className={cn("rounded-full bg-white object-cover shrink-0", sizeClasses[size])}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn("rounded-full flex items-center justify-center font-medium text-white shrink-0", sizeClasses[size])}
      style={{ backgroundColor: initials.backgroundColor }}
    >
      {initials.initial}
    </div>
  );
}

import { resolveEntityLogo, getInitials } from "@/lib/logos";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface EntityAvatarProps {
  logoUrl?: string | null;
  logoBase64?: string | null;
  name: string;
  primaryColor?: string | null;
  pfcPrimary?: string | null;
  size?: "sm" | "md";
}

const fallbackTextClass = {
  sm: "text-[10px]",
  md: "text-xs",
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
  const { initial, backgroundColor } = getInitials(name, primaryColor);

  return (
    <Avatar size={size === "sm" ? "sm" : "default"} aria-hidden="true">
      {resolved.type === "image" && (
        <AvatarImage src={resolved.src} alt="" className="bg-white" />
      )}
      <AvatarFallback
        className={cn("font-medium text-white", fallbackTextClass[size])}
        style={{ backgroundColor }}
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

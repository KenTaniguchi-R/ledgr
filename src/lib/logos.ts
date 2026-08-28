export interface ResolveLogoOptions {
  logoUrl?: string | null;
  logoBase64?: string | null;
  name: string;
  primaryColor?: string | null;
  pfcPrimary?: string | null;
}

export type LogoProps =
  | { type: "image"; src: string }
  | { type: "initials"; initial: string; backgroundColor: string };

const PALETTE = [
  "#E57373", "#F06292", "#BA68C8", "#9575CD",
  "#7986CB", "#64B5F6", "#4FC3F7", "#4DD0E1",
  "#4DB6AC", "#81C784", "#AED581", "#FF8A65",
] as const;

export function resolveEntityLogo(options: ResolveLogoOptions): LogoProps {
  if (options.logoUrl) {
    return { type: "image", src: options.logoUrl };
  }
  if (options.logoBase64) {
    // Plaid logos arrive as bare base64 (always PNG); SimpleFIN-sourced
    // favicons are cached as a full data URI since their format varies
    // (ico/png/jpeg depending on what the institution's site serves).
    const src = options.logoBase64.startsWith("data:")
      ? options.logoBase64
      : `data:image/png;base64,${options.logoBase64}`;
    return { type: "image", src };
  }
  if (options.pfcPrimary) {
    return { type: "image", src: getCategoryIconUrl(options.pfcPrimary) };
  }
  const initial = options.name.charAt(0).toUpperCase() || "?";
  const backgroundColor =
    options.primaryColor || PALETTE[options.name.charCodeAt(0) % PALETTE.length];
  return { type: "initials", initial, backgroundColor };
}

export function getInitials(name: string, primaryColor?: string | null): { initial: string; backgroundColor: string } {
  const initial = name.charAt(0).toUpperCase() || "?";
  const backgroundColor = primaryColor || PALETTE[name.charCodeAt(0) % PALETTE.length];
  return { initial, backgroundColor };
}

export function getCategoryIconUrl(pfcPrimary: string): string {
  return `https://plaid-category-icons.plaid.com/PFC_${pfcPrimary}.png`;
}

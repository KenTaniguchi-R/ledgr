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
    return { type: "image", src: `data:image/png;base64,${options.logoBase64}` };
  }
  if (options.pfcPrimary) {
    return { type: "image", src: getCategoryIconUrl(options.pfcPrimary) };
  }
  const initial = options.name.charAt(0).toUpperCase() || "?";
  const backgroundColor =
    options.primaryColor || PALETTE[options.name.charCodeAt(0) % PALETTE.length];
  return { type: "initials", initial, backgroundColor };
}

export function getCategoryIconUrl(pfcPrimary: string): string {
  return `https://plaid-category-icons.plaid.com/PFC_${pfcPrimary}.png`;
}

const ASSET_TYPES = new Set(["checking", "savings", "investment", "other"]);
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export function classifyAccountType(type: string): "asset" | "liability" {
  if (LIABILITY_TYPES.has(type)) return "liability";
  return "asset";
}

export { ASSET_TYPES, LIABILITY_TYPES };

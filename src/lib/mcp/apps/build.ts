import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const WIDGETS = [
  "spending-breakdown",
  "transaction-table",
  "budget-progress",
  "net-worth-trend",
];

const appsDir = dirname(new URL(import.meta.url).pathname);
const outDir = resolve(appsDir, "widgets");
const themeCSS = readFileSync(resolve(appsDir, "ledgr-theme.css"), "utf-8");

async function main() {
  mkdirSync(outDir, { recursive: true });

  for (const widget of WIDGETS) {
    const entryPoint = resolve(appsDir, "src", `${widget}.tsx`);

    const result = await build({
      entryPoints: [entryPoint],
      bundle: true,
      minify: true,
      format: "esm",
      target: "es2022",
      write: false,
      jsx: "automatic",
      define: {
        "process.env.NODE_ENV": '"production"',
      },
    });

    if (!result.outputFiles?.length) {
      throw new Error(`Failed to bundle ${widget}: no output files`);
    }
    const js = result.outputFiles[0].text;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${themeCSS}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--background);color:var(--foreground);font-family:var(--font-sans,"Geist",system-ui,sans-serif)}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>`;

    writeFileSync(resolve(outDir, `${widget}.html`), html);
    console.log(`Built ${widget}.html (${Math.round(html.length / 1024)}KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

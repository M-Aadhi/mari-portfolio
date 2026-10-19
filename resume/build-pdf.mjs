// Renders resume/resume.html to public/resume.pdf (A4) with Playwright.
//   node resume/build-pdf.mjs
// If Playwright isn't installed in this repo, set NODE_PATH to a global install.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const src = pathToFileURL(path.join(here, "resume.html")).href;
const out = path.join(here, "..", "public", "resume.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(src, { waitUntil: "load" });
await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`wrote ${out}`);

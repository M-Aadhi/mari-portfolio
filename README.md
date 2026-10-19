# mari-portfolio

Personal portfolio of **Mari** with two modes over one shared data object:

1. **Professional Portfolio** (default): a clean, recruiter-friendly site with About, Experience,
   Skills, Projects, Current Work, Contact and a Portfolio Assistant chatbot.
2. **Mari's World**: a scroll-driven, cinematic neon-noir city. The background is the city picture
   in `assets/world-bg.webp`. On the rooftop the scene is pinned while you scroll: the camera zooms
   out from the hologram (Nami) and drifts toward the caped figure on the ledge, then a level menu
   appears. Scrolling on descends through the city (Missions, Career Tower, System Console, Mission
   Archive, Achievement Vault, Communication Channel) while the picture keeps moving and darkens
   behind the content. Luffy the Persian cat takes over the chat.

## Project layout

| Path | What it is |
|---|---|
| `public/index.html` | The whole site (HTML, CSS, vanilla JavaScript). Opens straight from disk. |
| `public/assets/` | `mari.webp` (profile photo) and `world-bg.webp` (Mari's World background). |
| `src/worker.js` | Cloudflare Worker: serves `public/` and the private vault API under `/api/*`. |
| `wrangler.jsonc` | Worker settings (name, KV storage, optional R2). No secrets in here. |
| `resume/resume.html` | Resume source. `node resume/build-pdf.mjs` rebuilds `public/resume.pdf` (the site's Resume button). |
| `tools/totp-setup.html` | Offline page that creates the Google Authenticator secret. Never deployed. |
| `tests/` | Unit tests for the authenticator code (`npm test`). |

## Run it

- **Just look at it:** open `public/index.html` in a browser. The vault runs in demo mode
  (code `123456`, uploads stay in that tab).
- **With the real vault:** `npm install`, create a file `.dev.vars` containing
  `TOTP_SECRET="<a test secret from tools/totp-setup.html>"`, then `npm run dev` and open
  http://localhost:8787. `.dev.vars` is git-ignored.

## Customise

Edit the **CONFIG** block at the top of the `<script>` section in `public/index.html` (name, title,
company, intro, photo, resume, GitHub, LinkedIn, email, current work). To change the photo, replace
`public/assets/mari.webp` (square image, about 720×720) or point `photo` at another file. To change the
Mari's World background, replace `public/assets/world-bg.webp` (landscape; 1920 px wide or more looks sharpest). Skills, experience, projects,
archive, achievements and lab items live in the **portfolioData** object just below it. Both
modes render from that one object.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Production: what visitors see. Only tested changes are merged here. |
| `test` | Development and testing. All new work happens here first. |

Workflow: build and test on `test`, then merge `test` → `main` when it's ready to publish.

## Deploy (Cloudflare Workers, auto-deploys from GitHub)

One-time setup in the Cloudflare dashboard:

1. **Workers & Pages → Create → Import a repository** → pick `M-Aadhi/mari-portfolio`.
   Worker name **mari-portfolio** (must match `wrangler.jsonc`). Production branch **main**,
   deploy command `npx wrangler deploy`. Turn on **builds for non-production branches** so every
   push to `test` gets its own preview link.
2. **Authenticator secret:** open `tools/totp-setup.html` on your computer, scan the QR code with
   Google Authenticator, then in the Worker go to **Settings → Variables and Secrets → Add**,
   type **Secret**, name `TOTP_SECRET`, paste the secret. Close the page.
3. Push to `main` (or merge `test` → `main`). The site is live at
   `https://mari-portfolio.<your-subdomain>.workers.dev`. Add a custom domain under
   **Settings → Domains & Routes** if you have one.

Storage: files, images and clipboard snippets go to the KV namespace `mari-portfolio-vault`
(already created; files up to 25 MB each, about 1 GB free). For bigger files, enable **R2** in the
dashboard, create a bucket `mari-vault-files`, and uncomment the `r2_buckets` block in
`wrangler.jsonc`; files then go to R2 (up to 100 MB each). Preview links from `test` use the same
storage and secret as production.

## Try the hidden features

- Click **Enter Mari's World** in the navigation.
- Scroll down through the city's levels; after exploring a few, a sealed sub-level wakes up.
- In Luffy's chat, the protected identity phrases open the authenticator check, then the private
  vault: **files** (upload, drag and drop, download, delete), **images** (thumbnails; paste a
  screenshot with Ctrl/⌘+V) and a **clipboard** of text snippets you can copy on any device.
  On the deployed site this is real and private; opened from disk it is a demo (code `123456`).

## Security notes

- The authenticator code is checked **only in the Worker** against `TOTP_SECRET`, a Cloudflare
  secret. It is never in the HTML, the repo or the browser. Each code works once.
- 5 wrong codes from one IP lock it out for 15 minutes; there is also a global hourly cap.
- A correct code gives an 8-hour session in a `Secure`, `HttpOnly`, `SameSite=Strict` cookie.
  Lock Vault deletes the session on the server.
- All vault data comes from `/api/*` and only with a valid session. State-changing calls also need
  a custom header and same origin (CSRF protection).
- Uploaded files are always downloaded as attachments; only PNG/JPEG/GIF/WebP/AVIF are ever shown
  inline, so an uploaded HTML or SVG file can't run code on the site.
- Secret phrases are checked by local application logic **before** any message could reach a
  future LLM, and are never forwarded to it.
- The contact form and chat leads are still simulated (kept in the browser tab). Wiring them to the
  Worker is a later step.

## Design note

Mari's World is inspired by the mood of neon-noir cinema. The background picture
(`assets/world-bg.webp`) was supplied by the site owner. It shows a film-style hologram, a quote and
a caped figure resembling well-known film characters, so check you have the right to publish it
before the site goes public. To swap it, replace the file; nothing else needs to change.

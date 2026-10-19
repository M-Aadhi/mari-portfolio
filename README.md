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

The site is a self-contained `index.html` (HTML, CSS and vanilla JavaScript) plus two images:
`assets/mari.webp` (profile photo) and `assets/world-bg.webp` (Mari's World background). It needs
no build step, libraries or network requests.

## Run it

Open `index.html` in any browser. Or serve it locally:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Customise

Edit the **CONFIG** block at the top of the `<script>` section in `index.html` (name, title,
company, intro, photo, resume, GitHub, LinkedIn, email, current work). To change the photo, replace
`assets/mari.webp` (square image, about 720×720) or point `photo` at another file. To change the
Mari's World background, replace `assets/world-bg.webp` (landscape; 1920 px wide or more looks sharpest). Skills, experience, projects,
archive, achievements and lab items live in the **portfolioData** object just below it. Both
modes render from that one object.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Production: what visitors see. Only tested changes are merged here. |
| `test` | Development and testing. All new work happens here first. |

Workflow: build and test on `test`, then merge `test` → `main` when it's ready to publish.

## Try the hidden features

- Click **Enter Mari's World** in the navigation.
- Scroll down through the city's levels; after exploring a few, a sealed sub-level wakes up.
- In Luffy's chat, the protected identity phrases open a separate authentication panel.
  The code `123456` is **demo authentication only**.

## Security notes (prototype)

- The authentication flow is a **visual demo**. Real Google Authenticator / TOTP verification must
  happen on a secure backend; the TOTP secret must never be in the browser. Sessions should use
  secure, HTTP-only cookies and expire after about 8 hours.
- Secret phrases are checked by local application logic **before** any message could reach a
  future LLM, and are never forwarded to it.
- Contact forms and chat leads are simulated (kept in the browser tab). The production version
  should send them to a backend API that stores them and optionally emails Mari. No credentials
  belong in this repository.

## Design note

Mari's World is inspired by the mood of neon-noir cinema. The background picture
(`assets/world-bg.webp`) was supplied by the site owner. It shows a film-style hologram, a quote and
a caped figure resembling well-known film characters, so check you have the right to publish it
before the site goes public. To swap it, replace the file; nothing else needs to change.

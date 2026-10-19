# mari-portfolio

Personal portfolio of **Mari** with two modes over one shared data object:

1. **Professional Portfolio** (default): a clean, recruiter-friendly site with About, Experience,
   Skills, Projects, Current Work, Contact and a Portfolio Assistant chatbot.
2. **Mari's World**: a scrolling, cinematic neon-noir city in pink and violet haze. It opens on a
   rainy rooftop where a giant AI hologram (Nami) rises over the skyline and a lone cloaked figure
   watches from the ledge. The skyline is clickable, and scrolling down descends through the city:
   Missions, Career Tower, System Console, Mission Archive, Achievement Vault and the Communication
   Channel. Luffy the Persian cat takes over the chat.

The site is a self-contained `index.html` (HTML, CSS and vanilla JavaScript) plus
`assets/mari.webp` (profile photo). It needs no build step, libraries or network requests.

## Run it

Open `index.html` in any browser. Or serve it locally:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Customise

Edit the **CONFIG** block at the top of the `<script>` section in `index.html` (name, title,
company, intro, photo, resume, GitHub, LinkedIn, email, current work). To change the photo, replace
`assets/mari.webp` (square image, about 720×720) or point `photo` at another file. Skills, experience, projects,
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

Mari's World is inspired by the mood of neon-noir cinema. Nami and the rooftop figure are
original designs (no film characters, logos or likenesses), so the site can be shared publicly.

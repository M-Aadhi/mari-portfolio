# mari-portfolio

Personal portfolio of **Mari** with two modes over one shared data object:

1. **Professional Portfolio** (default): a clean, recruiter-friendly site with About, Experience,
   Skills, Projects, Current Work, Contact and a Portfolio Assistant chatbot.
2. **Mari's World**: a cinematic cyber-noir rooftop where the skyline is the navigation. Projects
   are mission towers, the career is a tower of floors, and skills live in a System Console. Nami,
   a holographic AI, guides visitors, and Luffy the Persian cat takes over the chat.

The prototype is a single self-contained `index.html` (HTML, CSS and vanilla JavaScript). It needs no
build step, libraries or network requests.

## Run it

Open `index.html` in any browser. Or serve it locally:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Customise

Edit the **CONFIG** block at the top of the `<script>` section in `index.html` (name, title,
intro, photo, resume, GitHub, LinkedIn, email, current work). Skills, experience, projects,
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
- Explore the rooftop; after visiting a few places a hidden area wakes up.
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

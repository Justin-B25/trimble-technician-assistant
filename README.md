# Trimble Technician Assistant

Static field-tools hub for Trimble technicians — dealer-facing workflows on GitHub Pages, with personnel-only tools in a **separate local package**.

**Live site (dealer):** https://Justin-B25.github.io/trimble-technician-assistant/

---

## Repository map

| Path | Purpose |
|------|---------|
| `index.html` | **Dealer hub** — category home and tool drill-in |
| `assets/` | Shared chrome, workspace API, app access gate, feedback |
| `groundworks/pd25/` | PD25 guided workflow + measure-up calculator |
| `measure-up/ctl/` | Siteworks CTL measure-up calculator |
| `pre-inspection/` | Machine wear / pre-install report |
| `install-deliverable/` | Post-install photo deliverable |
| `excavator/` | Earthworks excavator tuning assistant |
| `trimble-internal/` | **Not for public deploy** — TMC bench crane, GW CSV formatter |
| `google-workspace/` | Apps Script backend (`Code.gs`) + deploy guide |
| `docs/DEALER-APP.md` | Dealer architecture and deploy checklist |

---

## Local development

**Dealer hub** (from repo root):

```bash
python -m http.server 8080
```

Open http://localhost:8080/index.html

**Internal package** (local only): http://localhost:8080/trimble-internal/index.html — see [trimble-internal/README.md](trimble-internal/README.md).

Hard-refresh (**Ctrl+Shift+R**) after pulling changes.

---

## Tests and deploy verification

```bash
npm test
node scripts/verify-dealer-deploy.js
```

- `npm test` — calculator and CSV formatter smoke tests  
- `verify-dealer-deploy.js` — confirms dealer app has no internal-package leaks  

CI runs smoke tests on push/PR to `main`.

---

## Before pushing to GitHub Pages

1. Run both commands above.
2. Read [docs/DEALER-APP.md](docs/DEALER-APP.md) deploy checklist.
3. **Do not** deploy `trimble-internal/` to the public site.

---

## Google Workspace backend

Telemetry, feedback, and access control: [google-workspace/DEPLOY.md](google-workspace/DEPLOY.md). Configure `assets/workspace-config.js` after deploying Apps Script.

---

## App access

- **`@trimble.com`** — auto-approved for 28 days after email code verification  
- **Other emails** — admin approval via email link, then sign-in code  

Internal tools use the same backend but live only under `trimble-internal/` until you deploy them to a private host.

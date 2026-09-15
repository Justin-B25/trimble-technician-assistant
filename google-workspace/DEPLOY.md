# Google Workspace backend — deploy guide

This connects the Technician Assistant static app to:

1. **Events** sheet — usage telemetry (`hub_open`, `tool_open`, `csv_analyzed:ok`, `pdf_exported`, etc.)
2. **Feedback** sheet + email — structured feedback (same modal as today, plus searchable rows)
3. **Uploads** sheet + Drive folder — optional report copies from PDF export flows

---

## Step 1 — Analytics spreadsheet

Your sheet is already set up:

**Technician Assistant — Analytics**  
`https://docs.google.com/spreadsheets/d/1io6EBhpC1LKELjhjLOtH9w6jn9ZMiwx7sEcosr3Snm4/edit`

`Code.gs` is configured with spreadsheet ID `1io6EBhpC1LKELjhjLOtH9w6jn9ZMiwx7sEcosr3Snm4`.

If you use a **sheet-bound** Apps Script (Extensions → Apps Script from that spreadsheet), you can also use `SpreadsheetApp.getActiveSpreadsheet().getId()` instead of `CONFIG.SPREADSHEET_ID`.

## Step 2 — Report archive folder

Your Drive folder is already set up:

**Technician Assistant — Report Archive**  
`https://drive.google.com/drive/folders/1oZK53RQj23uuQ9naORlZiCiwTBiL63Fw`

`Code.gs` is configured with folder ID `1oZK53RQj23uuQ9naORlZiCiwTBiL63Fw`.

Share this folder only with people who should see opt-in report uploads. The Apps Script account that deploys the web app needs **Editor** access to this folder.

## Step 3 — Apps Script project

### Option A — Script bound to the Sheet (recommended)

1. Open the spreadsheet → **Extensions** → **Apps Script**.
2. Delete any default `Code.gs` content.
3. Paste the full contents of `google-workspace/Code.gs` from this repo.
4. Edit `CONFIG` at the top:
   - `SPREADSHEET_ID` — your sheet ID (bound scripts can also use `SpreadsheetApp.getActiveSpreadsheet().getId()` but explicit ID is fine)
   - `DRIVE_FOLDER_ID` — your folder ID
   - `RECIPIENT_EMAIL` — your inbox (access request notifications + feedback)
   - `APP_URL` — public GitHub Pages URL (used in approval emails)
   - `ACCESS_GRANT_DAYS` — default `28` (approved access duration)
   - `AUTO_APPROVE_DOMAINS` — default `trimble.com,trimblecorp.net` (comma-separated; subdomains such as `am.trimblecorp.net` match automatically; no manual approval)

5. Run **`setupSheets`** once from the editor (Run ▶). Approve permissions when prompted.
   - Creates **README**, **Events**, **Feedback**, **Uploads**, **AccessRequests**, **ApprovedUsers**, **AccessCodes**, **BetaAccessRequests**, **BetaApprovedUsers** with Trimble-style headers
   - Removes the default empty **Sheet1** tab
   - Safe to run again after updating `Code.gs` — refreshes headers and formatting without deleting data rows
6. **Deploy** → **New deployment** → type **Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone (required for GitHub Pages POST from the field)

7. Copy the **Web app URL** (ends with `/exec`).

### Option B — Update your existing feedback-only script

If you already deployed feedback to:

`https://script.google.com/a/macros/trimble.com/s/.../exec`

1. Open that Apps Script project in [script.google.com](https://script.google.com).
2. Replace `doPost` with the new `Code.gs` (or merge `action` branches).
3. Set `CONFIG` IDs.
4. **Deploy** → **Manage deployments** → **Edit** → **New version** → **Deploy** (same URL keeps working).

---

## Step 4 — Wire the app

1. Open `assets/workspace-config.js`.
2. Set `endpoint` to your web app `/exec` URL:

```javascript
endpoint: 'https://script.google.com/a/macros/trimble.com/s/YOUR_DEPLOYMENT_ID/exec',
```

3. Optionally set `telemetryEnabled` / `driveUploadEnabled` to `false` to disable features without removing code.

4. Deploy the static site (GitHub Pages) when ready — **do not commit** until you have tested.

---

## Step 5 — Verify

1. Open the live or local hub → check **Events** sheet for `hub_open`.
2. Open PD25 calculator → `tool_open` with tool `pd25-calculator`.
3. Submit hub feedback → row in **Feedback** + email.
4. Run a PDF export with **Send optional copy to Trimble** checked → file in Drive + row in **Uploads**.

---

## Looker Studio (optional)

1. [lookerstudio.google.com](https://lookerstudio.google.com) → Create → **Google Sheets** → select your analytics spreadsheet.
2. Use **Events** for:
   - Tool opens by week (`tool`, `event`)
   - Funnel (`csv_analyzed:ok`, `pdf_exported`)
   - Device split (`deviceType`)
   - Excavator / bench crane: `symptom_analyzed`, `guide_section_complete`
3. Use **Feedback** for friction by `type` and `page`.
4. Use **Uploads** for outcome counts by `dealer` and `reportType`.

---

## App access control

Before users can open hub categories or tools, the app checks access via Apps Script:

| Domain / user | Flow |
|---------------|------|
| `@trimble.com` | Auto-approved for **28 days** on first submit (no email to admin) |
| Everyone else | **Request access** → you receive email with **Grant permission** / **Deny** → user is emailed when approved |

**Email verification:** When you approve a user, they receive one email with a **6-digit sign-in code** and a link to the app. They submit their email again in the app, enter the code, and tap **Verify code**. The code field only appears after approval.

**Timers (configure in `workspace-config.js` and `Code.gs`):**
- `accessCodeMinutes` — sign-in code validity (default **15** minutes). Expired codes require the user to submit their email again for a new code.
- `accessGrantDays` — how long remembered devices stay signed in before re-authorization (default **28** days). Shown in the help menu, not on the access gate.

**Sheets:**
- **AccessRequests** — pending / resolved requests (`email`, `status`, `token`)
- **ApprovedUsers** — active grants (`email`, `expiresAt`, `grantType`)
- **AccessCodes** — short-lived sign-in codes (`email`, `code`, `expiresAt`)

**Telemetry events:** `access_requested`, `access_granted`, `access_denied`, `access_verified` (logged from Apps Script and the client).

**Redeploy required:** After updating `Code.gs`, run **`setupSheets`** (adds **AccessCodes** tab and **Revoke** column) and deploy a **new version** of the web app so `access_start`, `access_verify`, `access_resend_code`, and `access_revoke` work.

### Revoking a user

| Method | How |
|--------|-----|
| **One-click link** | Open **ApprovedUsers** → click **Revoke access** in the last column |
| **Sheet menu** | Select the user row → **Tech Assistant** → **Revoke selected user** |
| **Manual** | Delete the row from **ApprovedUsers** (also delete **AccessCodes** rows for that email) |

Revoking removes their grant, clears active sign-in codes, and logs `access_revoked`. Remembered devices are locked out on the next background check.

After deploying a new web app URL/version, run **Tech Assistant → Refresh revoke links** once so the **Revoke** column hyperlinks stay valid.

### Notify approved users of a new app URL

After changing `CONFIG.APP_URL` (for example after a GitHub username / Pages host change):

1. Paste the updated `Code.gs` into Apps Script and save.
2. **Deploy → Manage deployments → Edit → New version → Deploy** (so approval emails use the new URL).
3. Reload the spreadsheet, then **Tech Assistant → Email approved users new app URL**.
4. Confirm the recipient list — the script emails every **non-expired** row on **ApprovedUsers** with the new link.

Users keep their existing grant; the email only points them at the new Pages URL.

---

## BETA tool access

Some dealer tools (e.g. **Groundworks CSV Formatter (BETA)**) require a **second** access grant on top of main app access. Users must already be approved in **ApprovedUsers** before they can request BETA access.

| Domain / user | BETA flow |
|---------------|-----------|
| `@trimble.com` | Auto-approved on first **Continue to BETA tool** (no admin email) |
| Everyone else | **Request BETA access** → admin email with **Grant BETA access** / **Deny** → user emailed when approved |

**Sheets (created by `setupSheets`):**

| Sheet | Purpose |
|-------|---------|
| **BetaAccessRequests** | Pending / resolved BETA requests (`toolId`, `email`, `status`, `token`, `page`) |
| **BetaApprovedUsers** | Active BETA grants per tool (`toolId`, `email`, `expiresAt`, `grantType`) |

**Tool IDs** (must match `data-beta-tool` on the page and `betaTools` in `assets/workspace-config.js`):

| Tool ID | Label | Dealer path |
|---------|-------|-------------|
| `gw-csv-formatter` | Groundworks CSV Formatter (BETA) | `groundworks/csv-formatter/index.html` |

**Client modules:** `assets/beta-access.js`, `assets/beta-access.css` — loaded on BETA tool pages after `app-access.js`. The tool UI defers initialization until `tta:beta-access-ready` fires.

**Telemetry events:** `beta_access_requested`, `beta_access_granted`, `beta_access_denied` (logged from Apps Script and the client).

**Redeploy required:** After updating `Code.gs` with BETA handlers, run **`setupSheets`** (adds **BetaAccessRequests** and **BetaApprovedUsers** tabs) and deploy a **new version** of the web app so `beta_access_start`, `beta_access_check`, `beta_access_approve`, and `beta_access_deny` work.

**Publishing a new BETA tool:**

1. Add the tool folder under the dealer path (e.g. `groundworks/csv-formatter/`).
2. Set `data-beta-tool="<tool-id>"` on `<body>` and include `beta-access.css` / `beta-access.js`.
3. Register the tool in `assets/workspace-config.js` → `betaTools` and `assets/hub-nav.js`.
4. Add `getBetaToolLabel` / `getBetaToolPage` entries in `Code.gs`.
5. Defer tool `app.js` init until `tta:beta-access-ready` (or check `beta-access-locked` is removed).
6. Run `setupSheets`, deploy new Apps Script version, bump script `?v=` cache busters, push static site to GitHub Pages.

---

## Telemetry conventions (when adding features)

1. Add a `detectTool()` branch in `assets/workspace-api.js` if the tool is new.
2. Page load logs `tool_open` automatically — do **not** duplicate from hub link clicks.
3. Log domain events with `WorkspaceApi.logEvent('event_name', { detail: '…' })`.
4. Bump `appVersion` in `workspace-config.js` when shipping meaningful releases.
5. Re-run **`setupSheets`** in Apps Script if you extend the README tab event list in `Code.gs`.

| Event | Typical source |
|-------|----------------|
| `hub_open` | Hub home |
| `category_open` | Hub category picker |
| `tool_open` | Any tool page load (`ctl-calculator`, `pd25-calculator`, …) |
| `access_requested` | Non-Trimble user requested app access |
| `access_granted` | Access approved (`trimble_auto` or manual grant) |
| `access_denied` | Access request denied |
| `beta_access_requested` | Non-Trimble user requested BETA tool access |
| `beta_access_granted` | BETA access approved (`trimble_auto` or manual grant) |
| `beta_access_denied` | BETA access request denied |
| `calc_run` | User ran CTL, PD25, or GW CSV formatter |
| `csv_download` / `csv_save_as` | GW CSV formatter local export actions |
| `csv_uploaded` | Survey CSV file selected |
| `csv_analyzed:ok` / `csv_analyzed:fail` | Measure-up calculation outcome |
| `csv_analyzed:missing` | Required survey point missing (PD25) |
| `calc_warnings` / `calc_options` | PD25 post-run warnings and option snapshot |
| `pdf_exported` | Report upload helper after PDF |
| `pdf_export_with_dealer` | PDF export with dealer on optional Drive upload |
| `guide_phase_complete` | PD25 guided workflow |
| `guide_section_view` / `guide_section_complete` | Bench crane assembly |
| `prestart_complete` / `symptom_analyzed` | Excavator tuning |

---

## Privacy notes

- Telemetry does **not** send survey coordinates, serial numbers, or CSV contents unless you add them later.
- `dealer` and `email` are included when on the device (dealer name field, approved app-access email).
- Drive upload is **opt-in per export** and may contain customer data — checkbox copy warns techs.

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| No rows in Sheet | Confirm `endpoint` in `workspace-config.js`; redeploy Apps Script as **Anyone** |
| Feedback email works, no Sheet rows | Old script without `appendFeedback` — replace with full `Code.gs` |
| Upload fails | Check `DRIVE_FOLDER_ID`; script account needs edit access to folder |
| CORS / fetch errors | App uses iframe form POST — do not switch to `fetch()` without Apps Script CORS setup |
| `setupSheets` unknown error | Run **`setupSheetsMinimal`** first (headers only, no banding). If that works, full `setupSheets` is optional. Also close the spreadsheet tab in your browser while running from the editor. |

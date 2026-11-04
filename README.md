# Content Marketing Automation Workflows

Content marketing workflows that automate repetitive tasks. All built on n8n and Google Apps Script, ready to import, adapt and scale.

## The Problem

Most of a content marketer's week goes to work nobody planned for. A guide quietly goes out of date when an official source changes, and a reader finds the error before the team does. Sign-ups wait a day for a welcome email, enquiries wait longer for a reply, and somebody rebuilds the same performance report every Monday from four different tabs.

Each workflow below automates one of those tasks from trigger to result. Anything that needs judgement, such as an AI draft or a broadcast to subscribers, waits for a person to approve it.

## What's Inside

### Content Operations

| No. | Workflow | Problem It Removes | Runs |
| :---: | :--- | :--- | :--- |
| 1 | Source Change Watch | Guides cite official sources that change without notice, and the first person to spot it is usually a reader. | Daily |
| 2 | Claims Register And Annual Versioning | Dated facts get rechecked only when someone remembers, and a 2026 guide slides into 2027 unchanged. | Weekly, plus 1 January |
| 3 | Publishing QA | Broken links, missing meta descriptions and skipped headings ship because nobody checks every page after a commit. | After each commit |
| 4 | Metadata And Internal Links | Writing titles, descriptions and alt text for every page is slow, so it gets skipped. | On request |
| 5 | Distribution Drafts | A finished piece sits unshared while someone finds time to write the posts. | On new content |

### Email, From Sign-Up To Nurture

| No. | Workflow | Problem It Removes | Runs |
| :---: | :--- | :--- | :--- |
| 6 | Sign-Up And Double Opt-In | Unconfirmed addresses fill a list with typos and spam traps. | On sign-up |
| 7 | Welcome Email On Confirmation | Interest fades fast when the first email arrives a day late. | On confirmation |
| 8 | Course Sequence | Manual sends drift off schedule and skip people. | Hourly |
| 9 | Click Tracking And Interest Scoring | Mail apps preload images, so open rates say little about what a reader actually wants. | On every click |
| 10 | Next-Best Email | Every reader gets the same follow-up, whatever they read. | After the course |
| 11 | Re-Engagement And Sunset | Silent subscribers hurt deliverability for everyone else on the list. | Hourly |
| 12 | Unsubscribe And Suppression | One missed opt-out is a complaint and a legal risk. | On request |
| 13 | New Content Broadcast | New work never reaches the readers most likely to want it. | On new content, after approval |
| 14 | Pre-Send QA | A broken merge field or a dead link goes to the whole list at once. | Before every send |
| 15 | Enquiry Capture And Follow-Up | Enquiries from a portfolio site wait days for an answer, or get lost. | On enquiry, daily reminder |

### Reporting

| No. | Workflow | Problem It Removes | Runs |
| :---: | :--- | :--- | :--- |
| 16 | Weekly Performance Report | Someone spends Monday morning copying numbers between tools. | Every Monday |
| 17 | Email Performance Report | Campaign results live in a dashboard nobody opens. | Every Monday |
| 18 | Monthly Content Health Check | Declining pages go unnoticed until traffic has already gone. | 1st of the month |
| 19 | Course Post-Mortem | Lessons from one cohort never shape the next. | When a cohort finishes |

## How It Runs

A single Google Sheet acts as the control centre for both versions. Its tabs hold the settings, subscribers, email events, enquiries, monitored sources, the claims register, an approval queue and a run log, so every action leaves a record the team can audit.

- **Google Apps Script** - The script project bound to the sheet contains one short loader, pasted once. On each run it loads the current workflow code from this repository, so fixes and new workflows reach the sheet without anyone copying code. Scheduled jobs run every 10 minutes, every morning at 7 and every Monday at 8, and a Run tab starts any workflow on demand with a single tick box.
- **n8n** - Each workflow is a standalone file in the `n8n` folder. Import it by URL and attach Google and Gemini credentials. The Config node at the start holds every setting, ready for your own values.
- **Public pages** - The sign-up form, the enquiry form and the landing page behind every email link are hosted on GitHub Pages. Those pages pass requests to the workflows in the background, so a reader signed in to several Google accounts still lands on a working page.

## Built-In Safeguards

- **A person approves anything AI writes** - Gemini drafts posts, broadcasts, metadata and report notes. Each draft waits in the Queue tab or an inbox until someone reviews it.
- **Test mode** - While switched on, marketing emails go only to test subscribers.
- **Signed links** - Every email link carries a signature, so a tampered link is rejected.
- **One suppression list** - Every sending workflow checks it first, and an unsubscribe takes effect at once.
- **QA before every send** - Emails with unfilled fields, missing unsubscribe links, spam-trigger wording or broken links are blocked and logged.
- **A daily send cap** - Sending stops below the Gmail limit.
- **Facts kept apart from guesses** - Reports label measured numbers and AI hypotheses separately.
- **No personal data in the code** - Keys, IDs and addresses live in your own Google account, never in this repository.

## Set It Up

### Google Apps Script

1. Create a Google Sheet, then open **Extensions** and **Apps Script**.
2. In **Project Settings**, tick **Show "appsscript.json" manifest file in editor**.
3. Replace `appsscript.json` with [apps-script/appsscript.json](apps-script/appsscript.json) and `Code.gs` with [apps-script/Loader.gs](apps-script/Loader.gs), then save.
4. Deploy a web app: **Deploy**, **New deployment**, type **Web app**, execute as **Me**, access **Anyone**.
5. Run `cmaSetup` from the editor and allow the permissions.
6. In the Settings tab, add your web app URL and your Google Analytics property ID.
7. Add your Gemini API key as the script property `GEMINI_API_KEY`.
8. Point `docs/assets/config.js` at your web app URL and publish the `docs` folder with GitHub Pages.

### n8n

1. Import a workflow from the `n8n` folder.
2. Add credentials for Google Sheets, Gmail, Google Analytics, Google OAuth2 with the Search Console scope, and an HTTP Header Auth credential for Gemini with the header `x-goog-api-key`.
3. Replace the placeholders in the Config node and activate the workflow.

## Repository Layout

| Path | Contents |
| :--- | :--- |
| `apps-script/src` | Workflow source for Google Apps Script |
| `apps-script/dist/cma.js` | The bundle the loader runs, built by `build/build_bundle.py` |
| `apps-script/Loader.gs` | The only file pasted into Apps Script |
| `n8n` | One importable n8n file per workflow, built by `build/make_n8n.py` |
| `docs` | Public sign-up, enquiry and link pages for GitHub Pages |
| `test/harness.js` | Runs every workflow against mocked Google services |

## Licence

MIT. Created by [Archana Panda](https://archanacontent.github.io/).

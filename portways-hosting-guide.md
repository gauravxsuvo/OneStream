# Hosting on Portways

Give this file to an AI coding agent that's preparing a repository to be deployed on this Portways instance. It describes the platform's contract with your code: what it expects, and how a deploy actually happens. It leaves out everything about operating the dashboard itself — that's in the Docs tab.

## Quick checklist

- [ ] App listens on `process.env.PORT` (Node/Python), or ships a `Dockerfile` with the right `EXPOSE`.
- [ ] A `Dockerfile`, `package.json`, `requirements.txt`, or `index.html` exists at the repo root (or the configured root directory, for a monorepo).
- [ ] Any framework-baked client env vars use a recognized prefix (`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `GATSBY_`, `VUE_APP_`, `PUBLIC_`).
- [ ] No env var value contains a line break.
- [ ] Deploys track one configured branch (`main` by default, changeable in Settings). A `git
      push` straight to Portways's own remote is the one exception — that path only auto-deploys
      `main`/`master` regardless of the branch setting; every other branch pushes fine but is
      ignored there.
- [ ] Backend and frontend are **separate projects** on the same repo, each with its own root
      directory (see below) — Portways builds one directory per project and does not guess.
- [ ] If you intend to autoscale it: no session state, uploads, caches or SQLite inside the
      container, and no `setInterval` jobs that must run once. See "Designing a project that
      autoscales".

## How Portways decides what to build

Portways inspects the repo root (or the configured root directory) in this order:

| Found | Treated as | Runs |
|---|---|---|
| `Dockerfile` | custom build | `docker build`, as-is |
| `package.json` | Node app | `npm install` [+ `npm run build` if present] then `npm start` |
| `requirements.txt` | Python app | `pip install -r requirements.txt` + a `Procfile`'s `web:` command, or `python app.py` |
| `index.html` | static site | served via nginx |

If nothing matches, the build fails with an explanation in the log. There is no silent fallback.

- Node and Python apps **must** listen on `process.env.PORT`. Portways sets this at container-run time; the app can't hardcode a port number.
- If `package.json` has a `build` script, it runs (with devDependencies installed) before `npm start`, then a dev-dependency prune keeps the final image slim. This is what makes Next.js, Vite, CRA, and anything else with a separate build step work with no extra configuration.
- A `Procfile`'s `web:` command runs through a shell, so it can reference `$PORT` or any other env var directly, same as Heroku.
- A Dockerfile's routed port comes from its `EXPOSE` line (defaults to 3000 if none found) — override it explicitly if that guess is wrong (see below).

## Build-time (client-bundled) env vars

Most env vars only need to exist at runtime. A frontend framework, though, bakes certain vars into the built JS bundle at *build* time, and no amount of runtime injection reaches that after the fact. Portways automatically also passes any var named with one of these prefixes to `docker build` as a `--build-arg`:

`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `GATSBY_`, `VUE_APP_`, `PUBLIC_`

Nothing else needs configuring — it's purely a naming convention, matching what these frameworks already require to expose a var to client code at all. Everything not matching one of those prefixes stays runtime-only.

## Monorepos, custom Dockerfile path, non-standard ports

These are set on the project's create form or its Settings tab, not in the repo itself:

- **Root directory** — scopes the build to a subfolder, e.g. `backend` or `frontend`.
- **Dockerfile path** — relative to the root directory, if it isn't at `<root>/Dockerfile`.
- **Port override** — forces the routed port when auto-detection guesses wrong.

All three are editable later without recreating the project. Hit `Redeploy` afterwards to apply.

### Backend and frontend are two projects, not one

Portways does not try to work out which part of your repo is the API and which is the UI. There is
no reliable way to guess that, and guessing wrong produces a container that builds cleanly and
serves nothing.

What it does instead never surprises you: **one project builds one directory.** So a frontend and
a backend are two projects, both pointing at the same repo URL, differing only in root directory:

```
my-app/
  api/       -> project "myapp-api",    root directory: api      (requirements.txt / Procfile)
  web/       -> project "myapp-web",    root directory: web      (package.json with a build script)
  worker/    -> project "myapp-worker", root directory: worker   (if you have one)
```

Each gets its own subdomain, its own resource limits, its own deploy history, and scales
independently — which matters, because a frontend and an API almost never need scaling at the same
moment. `myapp-web` reaches `myapp-api` over its public hostname, exactly like any other client.

Detection then runs per directory using the table above, so each one needs its own marker file
(`package.json`, `requirements.txt`, `Dockerfile` or `index.html`) at *its* root, not at the repo
root. If a directory matches two rows — a `package.json` next to an `index.html`, say — add a
`Dockerfile` to that directory. That is always the escape hatch, and the only one you need.

## Two ways a deploy actually happens

**1. Repo URL.** Portways clones/pulls it directly. A public URL needs nothing else. A **private**
GitHub repo works too, provided the repo is picked through the GitHub picker so the project knows
which App installation may read it — each clone then uses a freshly minted token scoped to that one
repo and valid for an hour. No long-lived credential is ever stored: the App's private key signs a
nine-minute JWT, which mints the short-lived token.

Portways can hold **more than one GitHub App**, and usually needs to. A private GitHub App can only
be installed on the account that owns it, so covering a personal account *and* an organization
means one app for each — connect them under Settings → GitHub → Connect another account. The repo
picker groups accounts under the app they belong to, which is the first thing to check when a
repository you expected is missing from the list.

**2. `git push`.** For a repo Portways can't reach at all (a non-GitHub host, or no App installed),
or any time you'd rather not hand Portways a URL:

```
git remote add portways <deploy-user>@<host>:portways/repos/<project>.git
git push portways main
```

A `post-receive` hook on the project's bare repo triggers the build automatically, streamed into the terminal that pushed. This path only deploys `main`/`master`, regardless of what the project's branch is set to — other branches push fine but are ignored. (A repo-URL project's own branch setting isn't restricted to `main`/`master`; it just means pushes to Portways's own remote outside that hardcoded pair won't auto-deploy.) Every project gets a git remote regardless of whether it also has a repo URL, so both can be used at once if useful.

**Auto-deploy on push** comes in two forms, both HMAC-SHA256 verified before anything runs. A
**per-repo webhook**: point one at the payload URL and secret on the project's Settings tab.
Or, if the repo came from a connected **GitHub App**, nothing to set up — the App's own webhook
already covers every repo in the installation, which is the manual step it exists to remove. With
several apps connected, a delivery is matched to whichever app's secret verifies its signature, so
nothing has to be configured per app. One repo can back several projects (a monorepo deployed twice with different root
directories); a push deploys every project that matches, not just the first.

## Preview deployments

If the project is connected to a GitHub repository through the GitHub App, its Settings tab has a
**Preview deployments** card with two independent switches:

- **Deploy previews from a branch.** Type a branch name (e.g. `develop` or `staging`) — the same
  idea as the production branch field, but for a throwaway copy. Every push to that branch
  redeploys `https://<subdomain>-preview.<domain>`.
- **Deploy previews for pull requests.** Every pull request opened *from a branch in the same
  repository* gets its own `https://<subdomain>-pr-<number>.<domain>`, rebuilt on each new commit
  and removed automatically when the PR is closed or merged. Pull requests opened from a fork are
  skipped.

Each preview build also shows up in GitHub itself — in the repo's (or the PR's) **Deployments**
panel, under a `preview` environment, with a **View deployment** button that opens the preview
URL. Production deploys appear there too, under `production`. The status tracks the build:
in progress while it runs, a green check when the site is live, and a red failure/error state if
the build broke or the container crashed on startup.

For a **pull request**, Portways also keeps **one comment** on the PR with the preview URL and
current status. It is created once and edited in place on every push (not a new comment per
commit), and changed to "removed" when the PR closes. That is the only thing Portways ever writes
to a pull request — it never opens, closes, reviews or labels one.

A few things worth knowing:

- A preview gets the project's own env vars, but **by default not the linked add-on connection
  strings** (`DATABASE_URL` / `REDIS_URL`). A preview runs unreviewed PR or branch code, so it does
  not reach the production database with the production password just because someone pushed. To
  change that, turn on **Share production data with previews** on the same card — then a preview is
  identical to production, including writing to the real database. (A key you set yourself in the
  project's env vars that merely shares a name with a link is always kept.)
- **Preview environment variables.** The same card has a list of `key = value` overrides applied
  *only* to preview builds, on top of the production variables. Values may contain `${{ ... }}`
  tokens that are filled in per preview:

  | Token | Resolves to |
  |---|---|
  | `${{ PREVIEW_URL }}` | this preview's URL, e.g. `https://app-pr-42.<domain>` |
  | `${{ PREVIEW_URL "other-project" }}` | another project's preview URL **for the same PR** (its branch preview for a branch preview) |
  | `${{ PREVIEW_HOST }}` / `${{ PREVIEW_HOST "other-project" }}` | the host only, no `https://` |
  | `${{ PR_NUMBER }}` | the PR number (empty for a branch preview) |
  | `${{ PREVIEW_SLUG }}` | `pr-42` or `preview` |
  | `${{ PREVIEW_BRANCH }}` | the branch being previewed |
  | `${{ COMMIT_SHA }}` / `${{ COMMIT_SHORT }}` | the previewed commit |
  | `${{ PROJECT_URL "other-project" }}` | another project's **production** URL |
  | `${{ PROD "KEY" }}` | this project's **production** value for `KEY` |

  Write `$${{` for a literal `${{`. Typical use: a monorepo front end sets
  `NEXT_PUBLIC_API_BASE_URL = ${{ PREVIEW_URL "my-api" }}` so its preview talks to *its PR's* API
  preview, and the API sets `ALLOWED_ORIGINS = ${{ PROD "ALLOWED_ORIGINS" }},${{ PREVIEW_URL "my-web" }}`
  so CORS lets the preview front end in. Because sibling URLs are worked out from the subdomain and
  PR number, the two previews can build in any order. Build-time-public variables
  (`NEXT_PUBLIC_*`, `VITE_*`, …) set here are baked into the preview's bundle, exactly like
  production ones.
- **A database per preview.** On a Postgres add-on's link (Databases tab) you can turn on **Give
  each preview its own database**. Each preview then gets a throwaway database on that add-on
  (`<db>_<project>_<pr-n>`), dropped when the preview is torn down, and its connection variable
  points there instead of at the withheld or shared production database. Choose whether it starts
  empty, with the production schema only, or with schema + data (the last copies production data
  into the preview, so treat it like "share production data").
- **Show deploys as a check on pull requests.** A separate opt-in on the same card. With it on,
  every production and preview build also posts a GitHub **commit status** against the built
  commit — pending while it builds, then success or failure — so a Portways deploy shows up in a
  pull request's checks box (the row of green ticks), the way Vercel's does, with a **Details**
  link back to the Portways build log. The check name is `portways/<project>`, so a
  branch-protection rule can require it, and two projects built from one monorepo post as separate
  checks. This needs the App's **Commit statuses: Read and write** permission approved (see
  below); until then it is skipped with a log line and nothing else changes. It requires a
  GitHub App connection — you cannot turn it on for a plain repo-URL project.
- Previews are always single plain containers, even if the main project runs in scaled mode.
- The first time you enable any of this, GitHub needs you to approve new permissions for the App —
  **Deployments: Read and write**, **Pull requests: Read and write** and **Commit statuses: Read
  and write** (and, if you also use the deploy ledger, **Contents: Read and write**) — plus the
  **pull_request** event (which only becomes tickable once the Pull requests permission is set).
  Do that from Settings → GitHub. Until then, production deploys keep working normally; only the
  GitHub-facing status reporting, the PR check, the PR comment, and PR previews wait on the
  approval, and each degrades on its own — approving **Commit statuses** later turns the check on
  without affecting anything that was already working.

### Requiring the check before a pull request can merge

Portways only *reports* the check — whether a PR is blocked until it passes is a GitHub repo
setting you make once. Portways deliberately does not do this for you: it would need the App to
hold `administration: write` (which also grants deleting the repo and managing collaborators),
far more than posting a status warrants.

The `portways/<project>` check has to have run at least once on the repo before GitHub will
offer it in the picker, so enable the toggle and push one commit first. Then, on github.com:

1. Repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
2. **Ruleset Name**: anything, e.g. `require-portways-deploy`.
3. **Enforcement status**: switch it from `Disabled` to **Active**.
4. **Target branches** → **Add target** → **Include default branch**.
5. Under **Rules**, tick **Require status checks to pass**.
6. **Add checks** → type `portways/<project>` (the exact check name, e.g. `portways/deepdarcy`)
   and select it. Add one line per project if a monorepo backs several.
7. Optionally tick **Require branches to be up to date before merging**.
8. **Create**.

The older **Settings → Branches → Add classic branch protection rule** flow still works and has
the same "Require status checks to pass before merging" option with the same check picker.

## Environment variables

- Set them **while creating the project**, or later from its `Env` tab. Either place accepts a
  pasted `.env` file for bulk import.
- Set them at creation if the *build* needs them. Build-time-public variables are compiled into
  the client bundle by `docker build`, so adding one afterwards means the first deploy already
  shipped a bundle without it and you need a redeploy to fix it.
- Values are encrypted at rest.
- **Values cannot contain line breaks.** The env file format is one `KEY=value` per line with no quoting, so a line break inside a value would be parsed as a separate variable and could silently overwrite another one. Base64-encode multi-line values (private keys, certificates) instead.
- A linked database injects `DATABASE_URL` (Postgres) or `REDIS_URL` (Redis) automatically. A variable set manually under the same name always wins over the injected one.
- Saving env vars does not restart the running container by itself — a new deploy or an explicit `Restart` is what applies them.

## Designing a project that autoscales

Autoscaling is opt-in per project, and switching a project to `scaled` mode asks you to confirm
it is stateless. That confirmation is stored, not just a checkbox, because **it is a promise
Portways cannot verify and cannot rescue you from.** Everything below is what that promise means
in practice.

### The one rule: nothing that matters may live inside the container

At two replicas, every request goes to whichever replica Traefik picked, round-robin. There are
**no sticky sessions**, and a scaled project gets **no volumes** — the container filesystem is
scratch space that disappears when a replica does. So:

| Don't | Do |
|---|---|
| Sessions in process memory | Sessions in Redis (a linked Redis add-on) |
| Uploaded files written to disk | Object storage, or a Postgres `bytea`/large object |
| An in-process cache you assume is shared | Redis, or accept per-replica caches that may disagree |
| SQLite in the container | The Postgres add-on |
| A cron/interval job in the app process | See "background work" below |
| Rate limiting in a local `Map` | Redis, or you get N times your intended limit |

The failure mode is worth picturing: with in-memory sessions and two replicas, roughly half of
each user's requests arrive at a replica that has never heard of them. It presents as "users get
logged out at random", not as an obvious scaling error, and it does not reproduce at one replica.

### The same rule decides whether a project can be moved to another machine

Portways can move a project onto a different physical machine (Settings -> Machine). It is the
same promise as scaled mode, for the same reason: the project gets a **new container on new
storage**, so anything it had written to its own filesystem stays behind on the old machine. If
your app would survive being redeployed from scratch, it will survive being moved.

A linked Postgres or Redis add-on does not block the move — the add-on container itself stays on
its original machine (its data volume is local, and backups run there), and the moved project
reaches back over an encrypted overlay network. Portways warns about this rather than hiding it:
the project now depends on two machines instead of one, and its queries cross the LAN instead of
loopback. Two things do still make a move a refusal rather than a surprise:

- **The add-on isn't reachable from both machines.** This only happens to add-ons created before
  cross-machine support existed, or if the container isn't running. The panel's fix is "Repair
  networking" on the add-on's card; Portways refuses the move rather than let a project pass every
  check and then fail on its first query.
- **It has never been deployed.** There is no image to send.

The move itself is designed so a failure costs nothing: the new copy has to answer a real HTTP
request on the new machine before your address is pointed at it, and if anything goes wrong the
project is put back where it was and the live address re-checked. Expect a few seconds of
downtime at the switchover, and no more.

### Background work at more than one replica

Every replica runs the same image, so a `setInterval` in your app runs *N times*, once per
replica. For a nightly email, that is N emails.

Three options, in order of how much work they are: put the job in its own separate Portways
project kept at one replica; or take a lock in Redis or Postgres before doing the work
(`SELECT ... FOR UPDATE SKIP LOCKED` is the usual shape); or make the job genuinely idempotent so
running it N times is harmless.

### Databases: what to use, and how to size it

Link a **Postgres add-on** and Portways injects `DATABASE_URL` automatically. Link a **Redis
add-on** and it injects `REDIS_URL`. A variable you set yourself under the same name always wins,
so pointing at an external database is just a matter of setting `DATABASE_URL` by hand.

The part that actually bites at scale is connection count. Postgres allows ~100 connections by
default, and your app opens *pool size x replicas* of them. A pool of 20 and 8 replicas is 160
connections — over the limit, and the failure arrives as `too many clients already` under exactly
the load that triggered the scale-up.

Two fixes, and you want both:

1. **Keep your pool small** — 5 or fewer per replica. Each replica serves a slice of the traffic,
   not all of it, so it does not need a big pool.
2. **Turn on PgBouncer** for that add-on (a toggle on the service). Portways then injects the
   pooled connection string instead, and hundreds of client connections collapse onto a handful of
   real Postgres ones. Measured here: PgBouncer sustained ~2.5x the direct-connection throughput
   under connection churn, which is precisely the autoscaling case.

If reads dominate, add **read replicas** to the Postgres add-on, and autoscale those too.
Portways will not route reads for you — your app has to choose the replica connection string
deliberately.

**An app hosted elsewhere can share the same database.** Turn on remote access for the add-on
and issue it a token; it then connects over `db.portways.app` while projects hosted here keep
using their injected `DATABASE_URL` directly and never touch the gateway. Issue one token per
external app rather than sharing one, so revoking a leaked token cuts off only that app. Those
tokens spend from the same ~100 connections everything above is competing for, and each carries
its own cap — so count them in the arithmetic, and point them at the pooled connection if
PgBouncer is on. The panel shows the granted total against the server's real limit.

### How the autoscaler actually decides

It reads Traefik's own metrics for your service every tick and compares against one threshold:

- **`rate`** — requests per second, **divided by the current replica count**. Your threshold is
  therefore "requests per second *per replica* I am happy with". Set it from a load test, not a
  guess.
- **`p95`** — 95th-percentile response time in milliseconds, not divided by anything.

Scale-up is immediate when the threshold is crossed. Scale-down waits for the cooldown to elapse
*continuously* below the threshold, so a spiky workload does not flap. Both directions are bounded
by the project's own min/max, a hard per-project ceiling of 10, and a global cap across every
autoscaling project.

Three consequences worth designing around:

- **A slow app scales up under `p95` even with no extra traffic.** If one endpoint is slow because
  of a missing database index, autoscaling will add replicas that are all equally slow. Autoscaling
  is not a fix for a slow query.
- **Start-up time is scale-up time.** A replica serves traffic only once it is running; a 60-second
  boot means a minute of the burst is handled by the old replica count. Keep boot fast, and do slow
  warm-up work lazily.
- **No metrics means no scaling, deliberately.** If Prometheus returns nothing for your service,
  the autoscaler does nothing rather than guessing — a fail-safe, but also why a project that has
  never received traffic shows no scaling activity. Metrics only exist once the project is in
  `scaled` mode and Traefik has actually routed to it.

### Getting there from a normal project

You do not have to design for this up front. A single-container project that keeps its state in a
linked Postgres or Redis add-on is already most of the way there — switch hosting mode to
`scaled`, redeploy, set a replica count by hand, watch the traffic chart, and only then turn on
autoscaling with a threshold you have actually seen. Going straight from one container to
autoscaling without ever running two replicas manually is how you find out about in-memory session
state during a traffic spike.

## Search indexing (SEO)

Portways does nothing to your project's search ranking, and there is no panel switch for it --
but it also does not get in the way. The `noindex` / `robots.txt` rules in the platform apply
only to the dashboard and the status page; your project container is served straight through
Traefik and Portways adds nothing to its responses. Whether a hosted site shows up in Google is
entirely a function of your repo and a couple of steps outside Portways.

**In the repo:**

- **`robots.txt`** at the site root, explicitly allowing crawling and pointing at your sitemap.
  For a static site, a `public/robots.txt` in the repo is just served as-is.
- **`sitemap.xml`** (or a generated one). This is how a crawler finds every page, which matters
  most for a single-page app whose routes only exist client-side.
- **`<title>` and `<meta name="description">` per page**, plus Open Graph / Twitter tags for
  link previews.
- **Server-render or pre-render if ranking matters.** A pure client-only bundle (plain
  React/Vite/Vue) *can* be indexed now, but framework SSR/SSG (Next.js, Astro, Nuxt, SvelteKit)
  is indexed far more reliably. Portways builds whatever your Dockerfile produces -- it does not
  add rendering.
- **`<link rel="canonical">`** pointing at your real domain if the site answers on both
  `<subdomain>.portways.app` and a custom domain, so ranking is not split across the two.

**The one thing to do in the panel:** add your **custom domain** (project Settings -> domains) and
treat that as the canonical address. A bare `<subdomain>.portways.app` works technically but is a
poor thing to rank and will not be discovered without inbound links. HTTPS is already handled by
Cloudflare.

**Two steps outside Portways:**

1. **Submit the site.** Google Search Console (and Bing Webmaster Tools): add the domain, verify
   it -- a DNS TXT record through Cloudflare, or a verification file / meta tag your app serves --
   then submit the sitemap. Very little gets indexed promptly without this.
2. **Check Cloudflare is not challenging crawlers.** Traffic runs Internet -> Cloudflare ->
   tunnel -> your container. If Bot Fight Mode, "Under Attack" mode, or a WAF / rate-limit rule
   is active for that hostname, Googlebot can be JS-challenged and fail to crawl. That is the
   Cloudflare dashboard for the domain, not the Portways panel.

---

## Limits worth designing around

- One container per project by default. A project can opt into running as a real multi-replica
  Swarm service instead (with manual or automatic replica scaling), but that's still one
  container *image* per project — there's no built-in multi-service orchestration within a
  single project. Model a multi-service app as several Portways projects (same repo, different
  root directories) instead.
- A project's **production** deploy always targets its one configured branch. Separately, preview
  deployments (a named branch and/or per-PR, opt-in on GitHub-App projects) publish to
  `<subdomain>-preview.portways.app` and `<subdomain>-pr-<n>.portways.app` — see "Preview
  deployments" above.
- Every project answers automatically at `<subdomain>.portways.app`; a custom domain is added later
  from the project's Settings tab. The one rule worth knowing in advance: a custom domain can't be
  a `<label>.portways.app` subdomain — that address space belongs to the subdomain field and to the
  platform's own routing (dashboard, status page, database gateway), so it's rejected rather than
  silently shadowing one. The bare apex `portways.app` and `www.portways.app` are the exceptions —
  a project may claim the apex for a landing page.
- A project can opt into a public, unauthenticated status page at `status.portways.app` (a per-project
  toggle, off by default) — uptime history and incidents only, nothing about the app's internals or
  its env vars. Purely optional, and has no bearing on how the repo itself needs to be built.
- Builds have a wall-clock timeout (30 minutes by default). One that hangs past it is killed and
  the deploy fails, rather than blocking every other project's deploy queue indefinitely.
- Private repos work through a connected GitHub App, not by pasting a URL and hoping. Pick the
  repo from the GitHub picker so the project records which app and installation may read it;
  Portways then mints a read-only, single-repo token that expires in an hour for each clone. A
  private repo with no installation linked still deploys the other way, by `git push` to Portways's
  own remote. One app per GitHub account: a private app installs only on its owner, so a personal
  account and an organization need one each.
- Storage limits are monitored, not OS-enforced. Nothing stops a project exceeding its storage
  threshold — the host runs overlay2 on ext4, which has no per-container quota support, so treat
  the disk figure in Resources as the real limit.
- Every project container gets a CPU and memory cap (2 CPU / 1 GB by default, adjustable per
  project). Memory is a hard ceiling: exceed it and the container is OOM-killed, not throttled.
  CPU is a throttle — exceeding it makes the app slower, never killed.
- Project containers run with `no-new-privileges` and the `NET_RAW` capability dropped. Normal
  web apps are unaffected — binding a low port, dropping privileges at startup, and outbound
  TCP/UDP all still work. What does not: raw sockets, so an in-container `ping`, `traceroute`,
  `tcpdump`, or a userspace packet sniffer will fail with a permissions error. Use `curl`/`wget`
  for health checks instead.
- Design for restarts. A deploy, an env-var change applied via Restart, and a resource-limit
  change all *re-create* the container rather than restarting it in place, because env vars,
  linked-service URLs and limits are fixed at container-creation time. Anything written to the
  container's own filesystem is lost; use a linked database or an add-on for state.
- There is more than one machine in the cluster, but **a project runs on one machine at a time,
  and by default that's the primary**. A second node exists, is reported on in Infrastructure, and
  can run a project that has been explicitly moved there (see "Machine" above) — but nothing moves
  on its own. Size against whichever machine your project actually runs on (the Resources page
  shows that machine's figures), not the cluster total.

---

Full end-user documentation — dashboard UI, machine settings, resource limits, and everything else about running Portways itself — lives in the Docs tab and this project's `README.md`. This file is intentionally scoped to just what's needed to make a repository deployable.

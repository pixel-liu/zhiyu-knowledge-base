# My Study Notes

A self-hostable, Notion-style notes app for publishing a personal knowledge base.
Write rich documents in a block editor, organize them into a nested tree, and
publish individual notes as clean, SEO-friendly public pages — while keeping
editing locked to a single owner account.

Built on Next.js (App Router), Convex, Clerk, BlockNote, and Cloudflare R2.

**Live demo:** [studynotes.terrydjony.com](https://studynotes.terrydjony.com)

![My Study Notes](public/livedemo.png)

## Features

* 📝 **Block editor** — rich text powered by [BlockNote](https://www.blocknotejs.org/)
  (headings, lists, checkboxes, code blocks, images, and more).
* ⚡ **Slash commands** — type `/` for blocks, plus a custom **page link** command
  to link to any of your other notes inline.
* 🌲 **Nested hierarchy** — organize notes into an arbitrarily deep tree of pages.
* ↕️ **Drag-and-drop reordering** — reorder pages in the sidebar (owner-only),
  built with [`@dnd-kit`](https://dndkit.com/).
* 🖼️ **Image uploads** — cover images and inline images stored in
  **Cloudflare R2** via presigned uploads.
* 🙂 **Icons & covers** — pick an emoji icon and a cover image per note.
* 🔎 **Quick search** — a `⌘K` command palette to jump between notes.
* 🌗 **Light / dark / system theme** — instant theme switcher in the sidebar
  ([next-themes](https://github.com/pacocoursey/next-themes)).
* ↔️ **Adjustable sidebar** — resizable and collapsible, mobile-friendly.
* 🗑️ **Trash** — archive, restore, and permanently delete notes.
* 🌍 **Publish & SEO** — publish a note to a public `/notes/<slug>` page with
  auto-generated Open Graph / Twitter cards (Satori), JSON-LD structured data,
  canonical tags, `sitemap.xml`, and `robots.txt`.
* 🔐 **Single-owner model** — anyone can read published notes, but only the
  configured `OWNER_EMAIL` account can create or edit. Authentication via
  [Clerk](https://clerk.com/) (Google OAuth); the owner email is compared
  server-side in Convex and never exposed to the client.
* 🔄 **Real-time** — every change syncs instantly via [Convex](https://convex.dev/).

## Tech stack

| Layer        | Choice                                                              |
| ------------ | ------------------------------------------------------------------- |
| Framework    | [Next.js 16](https://nextjs.org/) (App Router, RSC), [React 19](https://react.dev/) |
| Language     | TypeScript                                                          |
| Backend / DB | [Convex](https://convex.dev/) (real-time database + serverless functions) |
| Auth         | [Clerk](https://clerk.com/) (Google OAuth)                          |
| Editor       | [BlockNote](https://www.blocknotejs.org/)                           |
| Styling      | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) |
| Icons        | [lucide-react](https://lucide.dev/)                                 |
| File storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible, presigned uploads) |
| State        | [Zustand](https://github.com/pmndrs/zustand), [usehooks-ts](https://usehooks-ts.com/) |
| Drag & drop  | [@dnd-kit](https://dndkit.com/)                                     |
| Misc         | [sonner](https://sonner.emilkowal.ski/) (toasts), [zod](https://zod.dev/), emoji-picker-react, react-dropzone |

## Getting started

### Prerequisites

* Node.js 18+ and npm
* A [Convex](https://convex.dev/) account
* A [Clerk](https://clerk.com/) account
* A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket (for image uploads)

### 1. Clone & install

```bash
git clone <your-repo-url>
cd my-study-notes
npm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This provisions a dev deployment and writes `CONVEX_DEPLOYMENT` and
`NEXT_PUBLIC_CONVEX_URL` into your `.env.local`. Leave it running in a terminal
while developing.

### 3. Set up Clerk

1. Create an application in the [Clerk dashboard](https://dashboard.clerk.com/)
   and enable **Google** as a social connection.
2. Copy your **Publishable key** and **Secret key** into `.env.local`
   (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
3. Create a **JWT template** named exactly `convex`. Copy its **Issuer URL**.
4. In the **Convex dashboard → Settings → Environment Variables**, set
   `CLERK_JWT_ISSUER_DOMAIN` to that Issuer URL. (This is read by
   [`convex/auth.config.js`](convex/auth.config.js); do not put it in `.env.local`.)

### 4. Set up Cloudflare R2

1. Create an R2 bucket.
2. Create an **R2 API token** (Object Read & Write) and copy the Account ID,
   Access Key ID, and Secret Access Key.
3. Enable the bucket's **Public Development URL** (`pub-xxxx.r2.dev`) or attach a
   custom domain, and use it as `NEXT_PUBLIC_R2_PUBLIC_URL`.
4. Fill in `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET_NAME`, and `NEXT_PUBLIC_R2_PUBLIC_URL` in `.env.local`.

### 5. Configure the site owner

Editing is restricted to one account. Set `OWNER_EMAIL` to the Google email you
sign in with — in **both** places:

```bash
# For the Next.js upload route (.env.local)
OWNER_EMAIL=you@example.com

# For Convex write mutations (deployment env)
npx convex env set OWNER_EMAIL you@example.com
```

Anyone can read published notes; only this account can create/edit.

### 6. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with the owner
account to start writing.

## Environment variables

See [`.env.example`](.env.example) for the full annotated list. Summary:

| Variable                            | Where        | Purpose                                            |
| ----------------------------------- | ------------ | -------------------------------------------------- |
| `CONVEX_DEPLOYMENT`                 | `.env.local` | Set by `npx convex dev`                            |
| `NEXT_PUBLIC_CONVEX_URL`            | `.env.local` | Set by `npx convex dev`                            |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` | Clerk publishable key                              |
| `CLERK_SECRET_KEY`                  | `.env.local` | Clerk secret key                                   |
| `CLERK_JWT_ISSUER_DOMAIN`           | Convex env   | Issuer URL of the `convex` JWT template            |
| `R2_ACCOUNT_ID`                     | `.env.local` | Cloudflare R2 account ID                           |
| `R2_ACCESS_KEY_ID`                  | `.env.local` | R2 API token access key                            |
| `R2_SECRET_ACCESS_KEY`              | `.env.local` | R2 API token secret                                |
| `R2_BUCKET_NAME`                    | `.env.local` | R2 bucket name                                     |
| `NEXT_PUBLIC_R2_PUBLIC_URL`         | `.env.local` | Public base URL the bucket is served from          |
| `NEXT_PUBLIC_SITE_URL`              | `.env.local` | Canonical base for sitemap / OG / canonical tags   |
| `OWNER_EMAIL`                       | both         | The single account allowed to edit                 |

## Project structure

```
app/                  Next.js App Router
  (main)/             Authenticated editor app (sidebar, documents)
  notes/[slug]/       Public published note pages (+ OG/Twitter images)
  api/upload/         Presigned R2 upload/delete route (owner-gated)
  sitemap.ts          robots.ts          SEO endpoints
components/           Editor, toolbar, modals, shadcn/ui primitives
convex/               Schema, document queries/mutations, auth config
hooks/                Client hooks (owner check, search, cover image, ...)
lib/                  R2 client, slugify, note rendering, upload helpers
```

## Deployment

Deploy the frontend to [Vercel](https://vercel.com/) and push your Convex
functions to a production deployment with `npx convex deploy`. Use Clerk
**production** keys and set every environment variable above (including
`CLERK_JWT_ISSUER_DOMAIN` and `OWNER_EMAIL` in the production Convex deployment,
and `NEXT_PUBLIC_SITE_URL` to your real domain).

## Credit

Built by [terrydjony.com](https://terrydjony.com). Originally inspired by
[AntonioErdeljac/notion-clone-tutorial](https://github.com/AntonioErdeljac/notion-clone-tutorial).

## License

MIT

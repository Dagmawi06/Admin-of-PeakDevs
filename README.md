# SDS Admin Inbox

Standalone Netlify mini-site for securely viewing and managing `public.contact_messages` from Supabase.

## Security model

- Browser calls only Netlify Functions (`/.netlify/functions/*`).
- Supabase Service Role Key is used only in serverless functions.
- Every function requires valid HTTP Basic Auth using `ADMIN_USER` + `ADMIN_PASS`.
- Admin token is kept only in page memory (not persisted in `localStorage` or cookies).

## Required environment variables

Set these in Netlify Site settings (and locally for `netlify dev`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_USER`
- `ADMIN_PASS`

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a local `.env` file in project root:
   ```bash
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
   ADMIN_USER=your_admin_username
   ADMIN_PASS=your_admin_password
   ```
3. Run locally:
   ```bash
   npx netlify dev
   ```
   or
   ```bash
   npm run dev
   ```
4. Open the local URL shown by Netlify CLI (typically `http://localhost:8888`).

## Netlify deployment (Git-based)

1. Push this project to a Git repository.
2. In Netlify, create a new site from that repository.
3. Build settings:
   - Build command: (leave empty)
   - Publish directory: `.`
   - Functions directory: `netlify/functions` (already defined in `netlify.toml`)
4. Add environment variables in Netlify:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_USER`
   - `ADMIN_PASS`
5. Deploy site.

## Endpoints

- `GET /.netlify/functions/messages?limit=50&offset=0&q=&range=7d`
  - Auth required
  - Returns `{ ok: true, data: [...], nextOffset }`
- `DELETE /.netlify/functions/message-delete?id=<uuid>`
  - Auth required
  - Returns `{ ok: true }`
- `GET /.netlify/functions/export-csv?range=7d&q=term`
  - Auth required
  - Returns downloadable CSV

## Notes

- Date range supports: `1d`, `7d`, `30d`, `all`.
- Messages are ordered newest first by `created_at`.
- Pagination defaults to `limit=50`, max `100`.

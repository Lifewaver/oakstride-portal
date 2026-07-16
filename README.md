# OakStride Portal

Kundportal för OakStride Studio — kunder loggar in (Google eller magisk länk via e-post) och skickar ändringsförfrågningar för sin hemsida, med status och dialog per ärende.

**Live:** https://portal.oakstride.se

## Arkitektur

- **Frontend:** Statisk SPA (`index.html`, `app.js`, `styles.css`) på GitHub Pages, egen domän via `CNAME`.
- **Backend:** [Supabase](https://supabase.com) — auth (Google OAuth + magic link), Postgres med Row Level Security.
- **Aviseringar:** Postgres-trigger → `pg_net` → Make.com-webhook → mejl till info@oakstride.se vid ny registrering, nytt ärende och ny kundkommentar.

## Konfiguration

`config.js` innehåller `SUPABASE_URL` och `SUPABASE_ANON_KEY` (från Supabase → Settings → API). Anon-nyckeln är publik per design; all åtkomstkontroll sker via RLS-policies i `supabase/schema.sql`.

## Databas

Kör `supabase/schema.sql` i Supabase SQL Editor (ersätt `MAKE_WEBHOOK_URL` först). Flöde:

1. Ny användare loggar in → profil skapas automatiskt med `approved = false`.
2. Admin godkänner kontot under fliken **Kunder** och anger vilken hemsida kunden hör till.
3. Godkända kunder kan skapa ärenden och kommentera; admin ser allt och sätter status (`Ny / Pågående / Väntar på kund / Klar`).

Admin-konto: sätt `is_admin = true, approved = true` på din egen profil via SQL Editor (se slutet av `schema.sql`).

## Supabase-inställningar

- **Authentication → URL Configuration:** Site URL `https://portal.oakstride.se`, redirect URLs inkl. samma adress.
- **Authentication → Providers:** Google aktiverad med OAuth-klient från Google Cloud Console (redirect: `https://<projekt>.supabase.co/auth/v1/callback`). Email (magic link) aktiverad.

## Deploy

Push till `main` → GitHub Pages publicerar automatiskt. DNS: `portal.oakstride.se` CNAME → `<github-konto>.github.io` (hos Hostup).

# Japan Company Trip 2026 — React Web App

**OLC Japan Company Trip FY2025**
**Atami · Yokohama · Kamakura · 22–26 Oct 2026 · 30 pax**

Built with React + Vite, styled after the Atami Stamp Rally design system.

## 🚀 Quick Start

```bash
npm install
npm run dev
```

## 🔐 Supabase auth (invite-only)

The app requires sign-in (email + password). Accounts are invite-only: the committee invites each participant, and only allowlisted emails can be invited.

1. Create a Supabase project, then copy `.env.example` to `.env.local` and fill in the project URL and publishable key (Project Settings → API).
2. Run both files in `supabase/migrations/`, in filename order, in the SQL editor (or `supabase db push`).
3. Add each participant to the allowlist (emails lowercase):
   ```sql
   insert into public.allowed_emails (email, full_name, team, role)
   values ('someone@company.com', 'Someone', 'Team 1', 'Member');
   ```
   To make someone an admin (can manage the allowlist), set `is_admin`:
   ```sql
   update public.allowed_emails set is_admin = true where email = 'someone@company.com';
   ```
4. Invite them: Authentication → Users → **Invite user**. The email link opens the app on a "Welcome aboard" screen where they set their password. Invites for emails not on the allowlist are refused.
5. Authentication → Sign In / Providers: turn **off** "Allow new users to sign up". There is no sign-up form in the app; this closes the API route too (invites still work).
6. Authentication → URL Configuration: set **Site URL** to the deployed app URL and add `http://localhost:5173` to **Redirect URLs**, so invite and password-reset links land back in the app.

## 🔧 Build

```bash
npm run build
npm run preview
```

## 🗂️ What's Inside

| Section | Description |
|---------|-------------|
| **🗓️ Itinerary** | 5-day tabbed timeline with collapsible activity cards, participant/committee prep lists |
| **🚆 Logistics** | Transport table, weather, budget estimates, booking tips, flights |
| **👥 Group** | 5 group rosters with leader/member phone copy |
| **📞 Contact** | Key venue phone numbers |
| **🗺️ Atami Treasure Hunt** | Embedded stamp rally game on Day 4 (5 checkpoints, timed, photo uploads + riddles) |

## 🎨 Design

Atami Stamp Rally aesthetic: Anton display font, Zen Kaku Gothic New body, DM Mono for data. Ink (#17232F) on paper (#E7E0CF) with red (#DE3B2B) and gold (#E9A82C) accents.

## Trip Logistics

- **Flight**: AirAsia X KUL↔HND (D7522/D7523)
- **Route**: Yokohama (2 nights) → Kamakura (day trip) → Atami (2 nights)
- **Highlight**: Atami Seaside Fireworks — Sun 25 Oct, 8:20 PM

---

### Original Planning Docs

The email templates, and logistical research from the original README are preserved in the React app's data files (`src/data/schedule.js`, `src/data/groupRoster.js`).
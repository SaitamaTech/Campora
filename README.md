# CAMPORA

**Your Campus. Your Community. Your World.**

CAMPORA is a student-focused Progressive Web App for University of Ilesa, designed to complement existing university systems.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set the public Supabase project URL and anon/publishable key to enable account authentication and live database operations. Never put a Supabase service-role key in browser code.

Without Supabase settings, CAMPORA starts in a clearly labeled local preview mode. Preview changes are stored only in the current browser; they are not shared with students or presented as official University information.

## Supabase setup

1. Create a Supabase project.
2. Apply the SQL migrations in `supabase/migrations/` in filename order: `202611200001_initial_schema.sql`, `202611200002_rls_hardening.sql`, then `202611200003_storage_policies.sql`.
3. The Storage migration keeps all five buckets private, limits uploads to the signed-in user's UUID folder, and only permits expiring signed downloads for approved campus resources and approved marketplace/lost-and-found images. Avatars are only fetchable for active public profiles; support attachments stay private to ticket owners and moderators. No bucket listing or arbitrary public file reads are enabled.
4. Promote the first administrator from a trusted Supabase SQL session only. Never expose privileged credentials in client code.
5. Add verified faculties, departments, courses, opportunities, announcements and campus locations through an authorized admin workflow. CAMPORA intentionally contains no invented campus directory or student records.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to local development and the Vercel project. Use only the public anon/publishable key.
7. Set the Supabase Auth Site URL to `https://campora-puce.vercel.app` and allow the signup redirect `https://campora-puce.vercel.app` plus the password-reset redirect `https://campora-puce.vercel.app/?reset=1`.

The migrations create CAMPORA's core tables, RLS policies, private Storage buckets, and scoped object policies. Public reads are limited to approved content; user submissions, support tickets and protected contact requests are owner-scoped. Moderation states and official/verified account fields are protected from self-approval.

### Marketplace upgrade

For an existing CAMPORA database, apply `supabase/migrations/202611200014_marketplace_classifieds.sql` and then `supabase/migrations/202611200015_marketplace_privilege_hardening.sql`, after the existing CAMPORA schema and Storage policies are in place. These extend the legacy marketplace table, migrate its category and image metadata, seed the product and service categories, and add private contact preferences, reports, moderation, search, and least-privilege grants. Deploy the updated app only after both migrations succeed. The marketplace is a classified-ad service: buyers and sellers arrange any transaction independently; CAMPORA does not handle payments or delivery. Do not apply these migrations to an unrelated or empty Supabase project.

## Build and deploy

```bash
npm run build
```

Deploy the repository as a Vite project on Vercel with the same two public Supabase variables. The PWA precaches the static application shell. Database operations remain online-only; the interface indicates offline state rather than claiming a server submission succeeded.

## Product notes

- CAMPORA does not process payments.
- University announcements and representative status are only marked official/verified when an authorized administrator sets those fields.
- Campus coordinates and directions are administrator-managed; none are seeded.
- Support contact: [israellawal323@gmail.com](mailto:israellawal323@gmail.com).
- Developed and maintained by Saitama Tech. Founder: Lawal Israel.

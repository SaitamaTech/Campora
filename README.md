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
2. Apply the SQL migrations in `supabase/migrations/` in filename order: `202611200001_initial_schema.sql`, then `202611200002_rls_hardening.sql`. You can run each file from the SQL editor or use the Supabase CLI.
3. In Supabase Dashboard → Storage → Policies, create the policies for CAMPORA's five private buckets before relying on image or attachment uploads. Supabase manages `storage.objects` with a separate owner role, so these policies cannot be installed by every database migration connection. Keep owner access scoped to each user's UUID folder; allow public reads only for approved academic resources and approved marketplace/lost-and-found images; keep avatars and support attachments private.
4. Promote the first administrator from a trusted Supabase SQL session only. Never expose privileged credentials in client code.
5. Add verified faculties, departments, courses, opportunities, announcements and campus locations through an authorized admin workflow. CAMPORA intentionally contains no invented campus directory or student records.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to local development and the Vercel project. Use only the public anon/publishable key.
7. Set the Supabase Auth site URL and email redirect URLs to the deployed CAMPORA origin.

The migrations create CAMPORA's core tables and RLS policies and provision private Storage buckets. Public reads are limited to approved content; user submissions, support tickets and protected contact requests are owner-scoped. Moderation states and official/verified account fields are protected from self-approval.

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

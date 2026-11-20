-- Preserve recipient-scoped inbox visibility for every authenticated role.
-- The legacy admin manage policy exposed every recipient's notifications to admins.
drop policy if exists notifications_admin_manage on public.notifications;

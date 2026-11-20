import type { Role, SupportTicket } from './types';
import { supabase } from './supabase';

export type AdminQueueItem = { id: string; kind: string; title: string; created_at: string; status: string; details?: string[]; canApprove?: boolean };
export type AdminTrendPoint = { date: string; count: number };
export type AdminMetrics = {
  registered_students: number;
  active_users: number;
  total_marketplace_listings: number;
  pending_advertisements: number;
  academic_resources: number;
  campus_locations: number;
  pending_location_verifications: number;
  open_support_tickets: number;
  unresolved_reports: number;
};
export type AdminUser = { id: string; full_name: string; role: Role; is_active: boolean; created_at: string; faculty?: string; department?: string };
export type AdminReport = { id: string; resource_type: string; resource_id: string; reported_user_id?: string | null; reason: string; status: string; created_at: string };
export type AdminFeedback = { id: string; feedback_type: string; message: string; is_anonymous: boolean; created_at: string };
export type AdminLocation = { id: string; name: string; location_type: string; description: string; address: string; latitude: number | null; longitude: number | null; osm_url: string; image_path: string | null; image_url?: string; status: string; is_active: boolean; created_at: string };
export type AdminAnnouncement = { id: string; title: string; body: string; category: string; status: string; is_official: boolean; published_at: string | null; created_at: string };
export type AdminOpportunity = { id: string; title: string; description: string; eligibility: string; deadline: string | null; application_url: string | null; category: string; source: string; status: string; is_verified: boolean; created_at: string };
export type AdminResource = { id: string; title: string; course_code: string; faculty: string; department: string; academic_level: number | null; file_name: string; created_at: string; status: string };
export type AdminCommunityPost = { id: string; title: string | null; body: string; author_id: string; author_name: string; created_at: string; status: string };
export type AdminCommunityComment = { id: string; post_id: string; body: string; author_id: string; author_name: string; created_at: string; status: string };
export type AdminActivity = { id: string; actor_id: string | null; actor_name: string; action: string; entity_type: string; entity_id: string | null; summary: string; created_at: string };
export type AdminSnapshot = {
  role: 'administrator' | 'moderator';
  metrics: AdminMetrics;
  registrations: AdminTrendPoint[];
  platformActivity: AdminTrendPoint[];
  users: AdminUser[];
  reports: AdminReport[];
  feedback: AdminFeedback[];
  tickets: SupportTicket[];
  replies: { id: string; ticket_id: string; responder_name: string; message: string; created_at: string }[];
  queue: AdminQueueItem[];
  resources: AdminResource[];
  announcements: AdminAnnouncement[];
  locations: AdminLocation[];
  opportunities: AdminOpportunity[];
  communityPosts: AdminCommunityPost[];
  communityComments: AdminCommunityComment[];
  activities: AdminActivity[];
  settings: Record<string, string | boolean>;
  faculties: { id: string; name: string; is_active: boolean }[];
  departments: { id: string; name: string; faculty_id: string; is_active: boolean }[];
};

export async function requireAdministrator() {
  const context = await requireAdminRole(['administrator']);
  return context;
}

export async function requireModeratorOrAdministrator() {
  return requireAdminRole(['moderator', 'administrator']);
}

async function requireAdminRole(roles: Array<'administrator' | 'moderator'>) {
  if (!supabase) throw new Error('CAMPORA database is not connected.');
  const client = supabase;
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error('Sign in with an authorized CAMPORA account to continue.');
  const userId = authData.user.id;
  const { data: record, error } = await client.from('profiles').select('role,is_active').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!record?.is_active || !roles.includes(record.role as 'administrator' | 'moderator')) {
    throw new Error('This action is restricted to authorized CAMPORA administrators or moderators.');
  }
  return { client, userId, role: record.role as 'administrator' | 'moderator' };
}

export async function recordAdminLogin() {
  if (!supabase) return;
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;
  const { data: record } = await supabase.from('profiles').select('role,is_active').eq('id', authData.user.id).maybeSingle();
  if (record?.is_active && ['administrator', 'moderator'].includes(record.role || '')) {
    await supabase.rpc('record_admin_login');
  }
}

export type PublicPlatformControls = { maintenance_mode: boolean; registration_enabled: boolean; content_moderation_enabled: boolean };
export async function loadPublicPlatformControls(): Promise<PublicPlatformControls> {
  if (!supabase) throw new Error('CAMPORA database is not connected.');
  const { data, error } = await supabase.rpc('get_public_platform_controls');
  if (error) throw error;
  return {
    maintenance_mode: data?.maintenance_mode === true,
    registration_enabled: data?.registration_enabled !== false,
    content_moderation_enabled: data?.content_moderation_enabled !== false,
  };
}

export async function loadAdminSnapshot(): Promise<AdminSnapshot> {
  const { client, role } = await requireModeratorOrAdministrator();
  if (!navigator.onLine) throw new Error('Connect to the internet to load the admin workspace.');
  const isAdmin = role === 'administrator';
  const empty = { data: [], error: null };
  const queries = await Promise.all([
    isAdmin ? client.from('profiles').select('id,full_name,role,is_active,created_at,faculty_id,department_id').order('created_at', { ascending: false }).limit(1000) : Promise.resolve(empty),
    client.from('user_reports').select('id,resource_type,resource_id,reported_user_id,reason,status,created_at').order('created_at', { ascending: false }).limit(300),
    isAdmin ? client.from('feedback').select('id,feedback_type,message,is_anonymous,created_at').order('created_at', { ascending: false }).limit(300) : Promise.resolve(empty),
    client.from('support_tickets').select('id,ticket_reference,subject,category,description,status,created_at').order('created_at', { ascending: false }).limit(300),
    client.from('support_replies').select('id,ticket_id,author_id,body,created_at').order('created_at', { ascending: true }).limit(1000),
    client.from('academic_resources').select('id,title,course_code,faculty_id,department_id,academic_level,file_name,storage_path,created_at,status').order('created_at', { ascending: false }).limit(500),
    isAdmin ? client.from('announcements').select('id,title,body,category,status,is_official,published_at,created_at').order('created_at', { ascending: false }).limit(500) : Promise.resolve(empty),
    isAdmin ? client.from('campus_locations').select('id,name,location_type,description,address,latitude,longitude,osm_url,image_path,status,is_active,created_at').order('created_at', { ascending: false }).limit(500) : Promise.resolve(empty),
    isAdmin ? client.from('opportunities').select('id,title,description,eligibility,deadline,application_url,category,source,status,is_verified,created_at').order('created_at', { ascending: false }).limit(500) : Promise.resolve(empty),
    client.from('lost_found_items').select('id,title,description,item_type,location_description,occurred_on,created_at,status').order('created_at', { ascending: false }).limit(300),
    client.from('community_posts').select('id,title,body,author_id,created_at,status').order('created_at', { ascending: false }).limit(500),
    client.from('post_comments').select('id,post_id,body,author_id,created_at,status').order('created_at', { ascending: false }).limit(1000),
    isAdmin ? client.from('faculties').select('id,name,is_active').order('name').limit(500) : client.from('faculties').select('id,name,is_active').order('name').limit(200),
    isAdmin ? client.from('departments').select('id,name,faculty_id,is_active').order('name').limit(1000) : client.from('departments').select('id,name,faculty_id,is_active').order('name').limit(500),
    isAdmin ? client.from('admin_activity_logs').select('id,actor_id,action,entity_type,entity_id,summary,created_at').order('created_at', { ascending: false }).limit(100) : Promise.resolve(empty),
    isAdmin ? client.from('platform_settings').select('key,value').limit(100) : Promise.resolve(empty),
    isAdmin ? client.rpc('get_admin_dashboard_metrics') : Promise.resolve({ data: null, error: null }),
  ]);
  const failure = (queries as any[]).find((result) => result.error)?.error;
  if (failure) throw failure;
  const [usersResult, reportsResult, feedbackResult, ticketsResult, repliesResult, resourcesResult, announcementsResult, locationsResult, opportunitiesResult, lostResult, postsResult, commentsResult, facultiesResult, departmentsResult, activitiesResult, settingsResult, metricsResult] = queries as any[];
  const faculties = facultiesResult.data || [];
  const departments = departmentsResult.data || [];
  const facultyNames = new Map(faculties.map((row: any) => [row.id, row.name]));
  const departmentNames = new Map(departments.map((row: any) => [row.id, row.name]));
  const users: AdminUser[] = (usersResult.data || []).map((row: any) => ({
    id: row.id,
    full_name: row.full_name || 'CAMPORA student',
    role: row.role as Role,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    faculty: facultyNames.get(row.faculty_id) || undefined,
    department: departmentNames.get(row.department_id) || undefined,
  }));
  const userNames = new Map(users.map((user) => [user.id, user.full_name]));
  const resources: AdminResource[] = (resourcesResult.data || []).map((row: any) => ({
    id: row.id, title: row.title, course_code: row.course_code || '',
    faculty: row.faculty || facultyNames.get(row.faculty_id) || '',
    department: row.department || departmentNames.get(row.department_id) || '',
    academic_level: row.academic_level, file_name: row.file_name || '', created_at: row.created_at, status: row.status,
  }));
  const locations: AdminLocation[] = await Promise.all((locationsResult.data || []).map(async (row: any) => ({
    id: row.id, name: row.name, location_type: row.location_type || 'other', description: row.description || '', address: row.address || '',
    latitude: row.latitude == null ? null : Number(row.latitude), longitude: row.longitude == null ? null : Number(row.longitude),
    osm_url: row.osm_url || '', image_path: row.image_path || null,
    image_url: row.image_path ? await signedImageUrl(client, row.image_path) : undefined,
    status: row.status, is_active: Boolean(row.is_active), created_at: row.created_at,
  })));
  const announcements = (announcementsResult.data || []).map((row: any) => ({ ...row, category: row.category || 'general', body: row.body || '' })) as AdminAnnouncement[];
  const opportunities = (opportunitiesResult.data || []).map((row: any) => ({ ...row, eligibility: row.eligibility || '', source: row.source || '' })) as AdminOpportunity[];
  const communityPosts: AdminCommunityPost[] = (postsResult.data || []).map((row: any) => ({ ...row, author_name: userNames.get(row.author_id) || 'Community member', title: row.title || null }));
  const communityComments: AdminCommunityComment[] = (commentsResult.data || []).map((row: any) => ({ ...row, author_name: userNames.get(row.author_id) || 'Community member' }));
  const reports: AdminReport[] = (reportsResult.data || []) as AdminReport[];
  const feedback: AdminFeedback[] = (feedbackResult.data || []) as AdminFeedback[];
  const tickets: SupportTicket[] = (ticketsResult.data || []).map((row: any) => ({
    id: row.id, reference: row.ticket_reference, subject: row.subject, category: titleCase(row.category), message: row.description,
    status: normalizeTicketStatus(row.status), created_at: row.created_at,
  }));
  const replies = (repliesResult.data || []).map((row: any) => ({
    id: row.id, ticket_id: row.ticket_id, responder_name: userNames.get(row.author_id) || 'CAMPORA Support', message: row.body, created_at: row.created_at,
  }));
  const queue: AdminQueueItem[] = [];
  const appendQueue = (kind: string, rows: any[], titleOf: (row: any) => string, detailsOf?: (row: any) => string[], canApprove?: (row: any) => boolean) => {
    for (const row of rows || []) {
      if (row.status !== 'pending') continue;
      const details = (detailsOf?.(row) || []).filter(Boolean);
      queue.push({ id: row.id, kind, title: titleOf(row) || 'Untitled submission', created_at: row.created_at, status: row.status, details, canApprove: canApprove?.(row) ?? true });
    }
  };
  appendQueue('academic_resources', resourcesResult.data || [], (row) => row.title);
  appendQueue('campus_locations', locationsResult.data || [], (row) => row.name, undefined, (row) => row.latitude != null && row.longitude != null);
  appendQueue('opportunities', opportunitiesResult.data || [], (row) => row.title, (row) => [
    `Description: ${String(row.description || '').slice(0, 500)}`,
    row.category ? `Category: ${titleCase(row.category)}` : '',
    row.eligibility ? `Eligibility: ${String(row.eligibility).slice(0, 300)}` : '',
    row.deadline ? `Deadline: ${new Date(row.deadline).toLocaleDateString()}` : '',
    row.source ? `Source / organizer: ${row.source}` : 'Source / organizer: Not provided',
    row.application_url ? `Application link: ${row.application_url}` : '',
  ], (row) => Boolean(row.source?.trim()));
  appendQueue('lost_found_items', lostResult.data || [], (row) => row.title, (row) => [
    `Type: ${row.item_type === 'found' ? 'Found' : 'Lost'}`,
    row.location_description ? `Location: ${String(row.location_description).slice(0, 250)}` : '',
    row.occurred_on ? `Approximate date: ${row.occurred_on}` : '',
    `Description: ${String(row.description || '').slice(0, 500)}`,
  ]);
  appendQueue('community_posts', postsResult.data || [], (row) => row.title || row.body);
  appendQueue('post_comments', commentsResult.data || [], (row) => row.body);
  queue.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const rawMetrics = metricsResult.data?.counts || {};
  const metrics: AdminMetrics = {
    registered_students: Number(rawMetrics.registered_students ?? 0),
    active_users: Number(rawMetrics.active_users ?? 0),
    total_marketplace_listings: Number(rawMetrics.total_marketplace_listings ?? 0),
    pending_advertisements: Number(rawMetrics.pending_advertisements ?? 0),
    academic_resources: Number(rawMetrics.academic_resources ?? 0),
    campus_locations: Number(rawMetrics.campus_locations ?? 0),
    pending_location_verifications: Number(rawMetrics.pending_location_verifications ?? 0),
    open_support_tickets: Number(rawMetrics.open_support_tickets ?? 0),
    unresolved_reports: Number(rawMetrics.unresolved_reports ?? 0),
  };
  const activityRows = (activitiesResult.data || []) as any[];
  const activities: AdminActivity[] = activityRows.map((row) => ({
    ...row, actor_name: userNames.get(row.actor_id) || (row.actor_id ? 'Administrator' : 'System'),
  }));
  const settings: Record<string, string | boolean> = {};
  for (const row of settingsResult.data || []) {
    const value = row.value;
    settings[row.key] = typeof value === 'boolean' || typeof value === 'string' ? value : String(value ?? '');
  }
  if (!isAdmin) {
    metrics.registered_students = 0;
    metrics.active_users = 0;
    metrics.total_marketplace_listings = 0;
    metrics.pending_advertisements = 0;
    metrics.academic_resources = queue.filter((item) => item.kind === 'academic_resources').length;
    metrics.campus_locations = 0;
    metrics.pending_location_verifications = 0;
    metrics.open_support_tickets = tickets.filter((ticket) => !['Closed', 'Resolved'].includes(ticket.status)).length;
    metrics.unresolved_reports = reports.filter((report) => ['open', 'reviewing'].includes(report.status)).length;
  }
  return {
    role, metrics,
    registrations: (metricsResult.data?.registrations || []) as AdminTrendPoint[],
    platformActivity: (metricsResult.data?.platform_activity || []) as AdminTrendPoint[],
    users, reports, feedback, tickets, replies, queue,
    resources,
    announcements,
    locations,
    opportunities,
    communityPosts,
    communityComments,
    activities,
    settings,
    faculties: faculties.map((row: any) => ({ id: row.id, name: row.name, is_active: Boolean(row.is_active) })),
    departments: departments.map((row: any) => ({ id: row.id, name: row.name, faculty_id: row.faculty_id, is_active: Boolean(row.is_active) })),
  };
}

export async function adminReview(kind: string, id: string, approved: boolean) {
  const { client, userId, role } = await requireModeratorOrAdministrator();
  if (!navigator.onLine) throw new Error('Connect to the internet before reviewing content.');
  if (role === 'moderator' && ['campus_locations', 'announcements', 'opportunities'].includes(kind)) throw new Error('Only an administrator may approve this content type.');
  const status = approved ? 'approved' : 'rejected';
  let result: any;
  switch (kind) {
    case 'academic_resources': result = await client.from('academic_resources').update({ status, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq('id', id); break;
    case 'announcements': result = await client.from('announcements').update({ status, published_at: approved ? new Date().toISOString() : null }).eq('id', id); break;
    case 'campus_locations': {
      if (approved) {
        const { data: location, error } = await client.from('campus_locations').select('latitude,longitude').eq('id', id).maybeSingle();
        if (error) throw error;
        if (location?.latitude == null || location?.longitude == null) throw new Error('Add confirmed latitude and longitude before publishing this campus location.');
      }
      result = await client.from('campus_locations').update({ status, is_active: approved }).eq('id', id);
      break;
    }
    case 'opportunities': {
      if (approved) {
        const { data: opportunity, error } = await client.from('opportunities').select('source').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!opportunity?.source?.trim()) throw new Error('Add a source or organizer before approving this opportunity.');
      }
      result = await client.from('opportunities').update({ status, is_verified: approved, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq('id', id); break;
    }
    case 'lost_found_items': result = await client.from('lost_found_items').update({ status }).eq('id', id); break;
    case 'community_posts': result = await client.from('community_posts').update({ status }).eq('id', id); break;
    case 'post_comments': result = await client.from('post_comments').update({ status }).eq('id', id); break;
    default: throw new Error('This content type is not available for review.');
  }
  if (result.error) throw result.error;
}

export async function adminSaveAnnouncement(input: { id?: string; title: string; body: string; category: string; official: boolean }) {
  const { client, userId } = await requireAdministrator();
  const title = input.title.trim(); const body = input.body.trim();
  const categories = ['general', 'faculty', 'department', 'student_association', 'event', 'deadline', 'app_update'];
  if (title.length < 2 || body.length < 2 || !categories.includes(input.category)) throw new Error('Enter an announcement and choose a supported category.');
  const patch = { author_id: userId, title, body, category: input.category, status: 'approved', is_official: input.official, published_at: new Date().toISOString() };
  const result = input.id
    ? await client.from('announcements').update(patch).eq('id', input.id)
    : await client.from('announcements').insert(patch);
  if (result.error) throw result.error;
}

export type LocationDraft = { id?: string; name: string; location_type: string; description: string; address: string; latitude?: number; longitude?: number; osm_url: string; status: 'pending' | 'approved'; is_active: boolean; image?: File | null; removeImage?: boolean; currentImagePath?: string | null };
export async function adminSaveLocation(input: LocationDraft) {
  const { client, userId } = await requireAdministrator();
  const name = input.name.trim();
  if (name.length < 2) throw new Error('Enter a verified campus location name.');
  if ((input.latitude == null) !== (input.longitude == null)) throw new Error('Enter both coordinates, or leave both blank.');
  if (input.status === 'approved' && (input.latitude == null || input.longitude == null)) throw new Error('Add confirmed latitude and longitude before publishing this campus location.');
  if (input.is_active && input.status !== 'approved') throw new Error('A location must be verified before it can be active.');
  if (input.latitude != null && (input.latitude < -90 || input.latitude > 90)) throw new Error('Latitude must be between -90 and 90.');
  if (input.longitude != null && (input.longitude < -180 || input.longitude > 180)) throw new Error('Longitude must be between -180 and 180.');
  const allowedTypes = ['lecture_hall', 'administrative_office', 'laboratory', 'library', 'student_facility', 'essential_service', 'other'];
  if (!allowedTypes.includes(input.location_type)) throw new Error('Choose a supported campus location category.');
  let imagePath = input.removeImage ? null : input.currentImagePath || null;
  let uploadedPath: string | null = null;
  if (input.image) {
    const ext = imageExtension(input.image);
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    if (!await validImageSignature(input.image)) throw new Error('The selected file is not a valid JPEG, PNG or WebP image.');
    const { error } = await client.storage.from('campus-location-images').upload(path, input.image, { contentType: input.image.type, cacheControl: '3600', upsert: false });
    if (error) throw error;
    uploadedPath = path; imagePath = path;
  }
  const payload: Record<string, unknown> = {
    name, location_type: input.location_type,
    description: input.description.trim() || null,
    address: input.address.trim() || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    osm_url: safeHttpUrl(input.osm_url),
    image_path: imagePath,
    status: input.status,
    is_active: input.is_active,
  };
  if (!input.id || input.image) payload.created_by = userId;
  const result = input.id
    ? await client.from('campus_locations').update(payload).eq('id', input.id).select('id,image_path').maybeSingle()
    : await client.from('campus_locations').insert(payload).select('id,image_path').single();
  if (result.error || !result.data) {
    if (uploadedPath) await client.storage.from('campus-location-images').remove([uploadedPath]);
    if (result.error) throw result.error;
    throw new Error('CAMPORA could not confirm that the location was saved.');
  }
  const oldPath = input.currentImagePath;
  if (oldPath && oldPath !== imagePath) await client.storage.from('campus-location-images').remove([oldPath]);
}

export async function adminSetLocationActive(id: string, active: boolean) {
  const { client } = await requireAdministrator();
  if (active) {
    const { data: location, error: readError } = await client.from('campus_locations').select('status,latitude,longitude').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!location || location.status !== 'approved' || location.latitude == null || location.longitude == null) throw new Error('Only a verified location with confirmed coordinates can be active.');
  }
  const { error } = await client.from('campus_locations').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}

export async function adminDeleteLocation(id: string) {
  const { client } = await requireAdministrator();
  const { data: location, error: readError } = await client.from('campus_locations').select('image_path').eq('id', id).maybeSingle();
  if (readError) throw readError;
  const { error } = await client.from('campus_locations').delete().eq('id', id);
  if (error) throw error;
  if (location?.image_path) await client.storage.from('campus-location-images').remove([location.image_path]);
}

export async function adminArchiveContent(kind: string, id: string) {
  const { client, role } = await requireModeratorOrAdministrator();
  const moderatorAllowed = ['academic_resources', 'lost_found_items', 'community_posts', 'post_comments'];
  const adminAllowed = ['academic_resources', 'announcements', 'campus_locations', 'opportunities', 'lost_found_items', 'community_posts', 'post_comments'];
  const allowed = role === 'administrator' ? adminAllowed : moderatorAllowed;
  if (!allowed.includes(kind)) throw new Error('You do not have permission to remove this content type.');
  const { error } = await client.from(kind as 'academic_resources').update({ status: 'archived' }).eq('id', id);
  if (error) throw error;
}

export async function adminSaveSettings(settings: Record<string, string | boolean>) {
  const { client, userId } = await requireAdministrator();
  const textKeys = new Set(['platform_name', 'support_email', 'organization', 'founder', 'github']);
  const booleanKeys = new Set(['maintenance_mode', 'registration_enabled', 'content_moderation_enabled']);
  const allowedKeys = new Set([...textKeys, ...booleanKeys]);
  const entries = Object.entries(settings).filter(([key]) => allowedKeys.has(key));
  if (entries.length !== Object.keys(settings).length) throw new Error('A settings key was not recognized.');
  for (const [key, value] of entries) {
    if (textKeys.has(key) && typeof value !== 'string') throw new Error('Text settings must be entered as text.');
    if (booleanKeys.has(key) && typeof value !== 'boolean') throw new Error('Platform controls must be enabled or disabled.');
    if (typeof value === 'string' && value.length > 240) throw new Error('Platform text settings must be 240 characters or fewer.');
    if (key === 'support_email' && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Enter a valid support email address.');
    if (key === 'github' && typeof value === 'string' && !/^https:\/\//i.test(value)) throw new Error('The GitHub link must use HTTPS.');
  }
  const { error } = await client.from('platform_settings').upsert(entries.map(([key, value]) => ({ key, value, updated_by: userId })), { onConflict: 'key' });
  if (error) throw error;
}

export async function adminAddFaculty(value: string) {
  const { client } = await requireAdministrator();
  const name = value.trim();
  if (name.length < 2 || name.length > 160) throw new Error('Enter a faculty name between 2 and 160 characters.');
  const { error } = await client.from('faculties').insert({ name });
  if (error) throw error;
}

export async function adminAddDepartment(input: { name: string; faculty_id: string }) {
  const { client } = await requireAdministrator();
  const name = input.name.trim();
  if (name.length < 2 || name.length > 160 || !input.faculty_id) throw new Error('Enter a department name and choose its faculty.');
  const { data: faculty, error: facultyError } = await client.from('faculties').select('id,is_active').eq('id', input.faculty_id).maybeSingle();
  if (facultyError) throw facultyError;
  if (!faculty?.is_active) throw new Error('Choose an active faculty.');
  const { error } = await client.from('departments').insert({ name, faculty_id: input.faculty_id });
  if (error) throw error;
}

export async function adminSetFacultyActive(id: string, active: boolean) {
  const { client } = await requireAdministrator();
  const { error } = await client.from('faculties').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}
export async function adminSetDepartmentActive(id: string, active: boolean) {
  const { client } = await requireAdministrator();
  const { error } = await client.from('departments').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}
export async function adminRenameFaculty(id: string, name: string) {
  const { client } = await requireAdministrator();
  const value = name.trim(); if (value.length < 2 || value.length > 160) throw new Error('Enter a faculty name between 2 and 160 characters.');
  const { error } = await client.from('faculties').update({ name: value }).eq('id', id);
  if (error) throw error;
}
export async function adminRenameDepartment(id: string, name: string) {
  const { client } = await requireAdministrator();
  const value = name.trim(); if (value.length < 2 || value.length > 160) throw new Error('Enter a department name between 2 and 160 characters.');
  const { error } = await client.from('departments').update({ name: value }).eq('id', id);
  if (error) throw error;
}

export async function adminPublishOpportunity(input: { id?: string; title: string; description: string; eligibility: string; deadline: string; application_url: string; category: string; source: string; verified: boolean }) {
  const { client, userId } = await requireAdministrator();
  const title = input.title.trim(); const description = input.description.trim(); const source = input.source.trim();
  const categories = ['scholarship', 'internship', 'graduate_programme', 'competition', 'hackathon', 'online_course', 'conference', 'fellowship', 'volunteer', 'entrepreneurship', 'other'];
  const category = slug(input.category);
  if (title.length < 2 || description.length < 2) throw new Error('Enter an opportunity title and description.');
  if (!categories.includes(category)) throw new Error('Choose a supported opportunity category.');
  if (input.verified && !source) throw new Error('Add the checked source before marking the opportunity verified.');
  let applicationUrl: string | null = null;
  if (input.application_url.trim()) applicationUrl = safeHttpUrl(input.application_url.trim());
  const deadline = input.deadline ? new Date(`${input.deadline}T12:00:00.000Z`) : null;
  if (deadline && Number.isNaN(deadline.getTime())) throw new Error('Enter a valid opportunity deadline.');
  const patch = { submitted_by: userId, title, description, eligibility: input.eligibility.trim() || null, deadline: deadline?.toISOString() || null, application_url: applicationUrl, category, source: source || null, status: 'approved', is_verified: input.verified, reviewed_by: userId, reviewed_at: new Date().toISOString() };
  const result = input.id
    ? await client.from('opportunities').update(patch).eq('id', input.id)
    : await client.from('opportunities').insert(patch);
  if (result.error) throw result.error;
}

export async function adminReplyTicket(ticketId: string, message: string, status: string) {
  const { client, userId } = await requireModeratorOrAdministrator();
  if (!['resolved', 'in_progress', 'awaiting_response'].includes(status)) throw new Error('Choose a valid support status.');
  const body = message.trim();
  if (body) {
    const { error } = await client.from('support_replies').insert({ ticket_id: ticketId, author_id: userId, body });
    if (error) throw error;
  }
  const { error } = await client.from('support_tickets').update({ status, closed_at: status === 'resolved' ? new Date().toISOString() : null }).eq('id', ticketId);
  if (error) throw error;
}

export async function adminSetRole(id: string, role: Role) {
  const { client, userId } = await requireAdministrator();
  if (id === userId) throw new Error('You cannot change your own administrator role.');
  if (!['student', 'contributor', 'moderator', 'administrator'].includes(role)) throw new Error('Choose a valid CAMPORA role.');
  const { data: target, error: readError } = await client.from('profiles').select('role,is_active').eq('id', id).maybeSingle();
  if (readError) throw readError;
  if (!target) throw new Error('The selected account no longer exists.');
  if (target.role === 'administrator' && role !== 'administrator' && target.is_active) await ensureAnotherActiveAdministrator(client, id);
  const { error } = await client.from('profiles').update({ role }).eq('id', id);
  if (error) throw error;
}

export async function adminSetActive(id: string, active: boolean) {
  const { client, userId } = await requireAdministrator();
  if (id === userId) throw new Error('You cannot suspend your own administrator account.');
  const { data: target, error: readError } = await client.from('profiles').select('role,is_active').eq('id', id).maybeSingle();
  if (readError) throw readError;
  if (!target) throw new Error('The selected account no longer exists.');
  if (target.role === 'administrator' && !active && target.is_active) await ensureAnotherActiveAdministrator(client, id);
  const { error } = await client.from('profiles').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}

export async function adminResolveReport(id: string, status: string, notes: string) {
  const { client, userId } = await requireModeratorOrAdministrator();
  if (status !== 'resolved' && status !== 'dismissed' && status !== 'reviewing') throw new Error('Choose a valid report outcome.');
  const { error } = await client.from('user_reports').update({ status, reviewed_by: userId, resolution_notes: notes.trim().slice(0, 2000) }).eq('id', id);
  if (error) throw error;
}

async function ensureAnotherActiveAdministrator(client: NonNullable<typeof supabase>, exceptId: string) {
  const { count, error } = await client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'administrator').eq('is_active', true).neq('id', exceptId);
  if (error) throw error;
  if (!count) throw new Error('Keep at least one other active administrator before changing this account.');
}

async function signedImageUrl(client: NonNullable<typeof supabase>, path: string) {
  const { data, error } = await client.storage.from('campus-location-images').createSignedUrl(path, 3600);
  return error ? undefined : data?.signedUrl;
}
function normalizeTicketStatus(value: string): SupportTicket['status'] {
  const map: Record<string, SupportTicket['status']> = { open: 'Open', in_progress: 'In Progress', awaiting_response: 'Awaiting Response', resolved: 'Resolved', closed: 'Closed' };
  return map[value] || 'Open';
}
function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase()); }
function slug(value: string) { return value.trim().toLowerCase().replaceAll('&', 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function safeHttpUrl(value: string) {
  const text = value.trim();
  if (!text) return null;
  let parsed: URL;
  try { parsed = new URL(text); } catch { throw new Error('Enter a valid web link.'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Links must use HTTP or HTTPS.');
  return parsed.toString();
}
function imageExtension(file: File) {
  const allowed: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!allowed[file.type] || file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP image under 5 MB.');
  return allowed[file.type];
}
async function validImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  return file.type === 'image/webp' && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}

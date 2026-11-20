import { useCallback, useEffect, useRef, useState } from 'react';
import type { CamporaData, CamporaNotification, CommunityComment, CommunityPost, ExploreDraft, Profile, ProfileFollowStats, PublicStudentProfile, Resource, SupportTicket } from './types';
import * as adminApi from './admin';
import { demoData, demoStorageKey } from './demoData';
import { supabase, supabaseConfigured } from './supabase';

const profileKey = 'campora-profile-v1';
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();
const blankData = (): CamporaData => ({ ...demoData, announcements: [], resources: [], locations: [], opportunities: [], lostFound: [], listings: [], posts: [], comments: [], tickets: [], supportReplies: [], feedback: [] });

export function useCampora() {
  const [data, setData] = useState<CamporaData>(() => supabaseConfigured ? blankData() : readPreviewData());
  const [profile, setProfile] = useState<Profile>(() => readProfile());
  const [authenticated, setAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [syncError, setSyncError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [faculties, setFaculties] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; faculty_id: string }[]>([]);
  const [publicProfiles, setPublicProfiles] = useState<PublicStudentProfile[]>([]);
  const [followingProfiles, setFollowingProfiles] = useState<PublicStudentProfile[]>([]);
  const [followersProfiles, setFollowersProfiles] = useState<PublicStudentProfile[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingError, setFollowingError] = useState('');
  const [notifications, setNotifications] = useState<CamporaNotification[]>([]);
  const [platformControls, setPlatformControls] = useState({ maintenance_mode: false, registration_enabled: true, content_moderation_enabled: true });
  const authRef = useRef(false);
  const authUserIdRef = useRef<string | null>(null);
  const demo = !supabaseConfigured;

  const assertPlatformWriteAllowed = useCallback((contentSubmission = false) => {
    if (profile.role === 'administrator' || profile.role === 'moderator') return;
    if (platformControls.maintenance_mode) throw new Error('CAMPORA is in maintenance mode. Please try again later.');
    if (contentSubmission && !platformControls.content_moderation_enabled) throw new Error('Student content submissions are temporarily paused.');
  }, [profile.role, platformControls.content_moderation_enabled, platformControls.maintenance_mode]);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const requestingUserId = authUserIdRef.current;
    setSyncError('');
    try {
      const [announcementResult, resourceResult, locationResult, opportunityResult, lostResult, listingResult, postResult, commentResult, profileResult, facultyResult, departmentResult, controlsResult] = await Promise.all([
        supabase.from('announcements').select('*').eq('status', 'approved').not('published_at', 'is', null).order('created_at', { ascending: false }).limit(60),
        supabase.from('academic_resources').select('*').order('created_at', { ascending: false }).limit(60),
        supabase.from('campus_locations').select('*').eq('status', 'approved').eq('is_active', true).order('name').limit(100),
        supabase.from('opportunities').select('*').eq('status', 'approved').order('created_at', { ascending: false }).limit(60),
        supabase.from('lost_found_items').select('*').eq('status', 'approved').order('created_at', { ascending: false }).limit(60),
        supabase.from('marketplace_listings').select('id,seller_id,title,description,category,price,currency_code,image_paths,status,is_sold,created_at,updated_at,listing_type,category_id,price_type,listing_status,seller_display_name,location,landmark,is_featured,moderation_reason').eq('status', 'approved').eq('listing_status', 'active').order('created_at', { ascending: false }).limit(60),
        supabase.from('community_posts').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('post_comments').select('*').order('created_at', { ascending: true }).limit(300),
        supabase.rpc('get_public_student_profiles', { p_profile_id: null, p_search: null, p_limit: 500 }),
        supabase.from('faculties').select('id,name').limit(200),
        supabase.from('departments').select('id,name,faculty_id').limit(500),
        supabase.rpc('get_public_platform_controls'),
      ]);
      const firstError = [announcementResult, resourceResult, locationResult, opportunityResult, lostResult, listingResult, postResult, commentResult, profileResult, facultyResult, departmentResult, controlsResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setPlatformControls({
        maintenance_mode: controlsResult.data?.maintenance_mode === true,
        registration_enabled: controlsResult.data?.registration_enabled !== false,
        content_moderation_enabled: controlsResult.data?.content_moderation_enabled !== false,
      });
      setFaculties((facultyResult.data || []).map((row: any) => ({ id: row.id, name: row.name })));
      setDepartments((departmentResult.data || []).map((row: any) => ({ id: row.id, name: row.name, faculty_id: row.faculty_id })));
      const visibleProfiles: PublicStudentProfile[] = (profileResult.data || []).map((row: any) => ({
        id: row.id, full_name: row.full_name, username: row.username || undefined,
        faculty: row.faculty || undefined, department: row.department || undefined,
        level: row.academic_level_label || levelText(row.academic_level), bio: row.bio || undefined,
      }));
      setPublicProfiles(visibleProfiles);
      const profiles = new Map(visibleProfiles.map((row) => [row.id, row]));
      const faculties = new Map((facultyResult.data || []).map((row: any) => [row.id, row.name]));
      const departments = new Map((departmentResult.data || []).map((row: any) => [row.id, row.name]));
      const mappedResources: Resource[] = await Promise.all((resourceResult.data || []).map(async (row: any) => ({
        id: row.id, title: row.title, course_code: row.course_code || '', faculty_id: row.faculty_id || undefined, department_id: row.department_id || undefined,
        faculty: row.faculty || faculties.get(row.faculty_id) || '', department: row.department || departments.get(row.department_id) || '', level: levelText(row.academic_level ?? row.level),
        contributor: profiles.get(row.contributor_id)?.full_name || 'Student contributor', contributor_id: row.contributor_id || undefined,
        contributor_public: profiles.has(row.contributor_id), file_name: row.file_name || '', file_size: row.file_size_bytes || row.file_size,
        created_at: row.created_at, status: row.status === 'approved' ? 'approved' : row.status === 'rejected' ? 'rejected' : 'pending',
        file_url: row.storage_path ? await signedUrl('academic-resources', row.storage_path) : undefined,
      })));
      const mappedLostFound = await Promise.all((lostResult.data || []).map(async (row: any) => ({ id: row.id, item_type: row.item_type || 'lost', title: row.title, description: row.description || '', location_text: row.location_description || '', approximate_date: row.occurred_on, image_url: row.image_path ? await signedUrl('lost-found-images', row.image_path) : undefined, recovered: Boolean(row.is_recovered), created_at: row.created_at })));
      const mappedListings = await Promise.all((listingResult.data || []).map(async (row: any) => ({ id: row.id, title: row.title, description: row.description || '', category: titleCase(row.category || 'other'), price: Number(row.price || 0), currency: row.currency_code || 'NGN', image_url: row.image_paths?.[0] ? await signedUrl('marketplace-images', row.image_paths[0]) : undefined, seller_name: profiles.get(row.seller_id)?.full_name || 'Student seller', created_at: row.created_at, sold: Boolean(row.is_sold) })));
      const reactionCounts = new Map<string, number>();
      if (postResult.data?.length) {
        await Promise.all(postResult.data.slice(0, 20).map(async (row: any) => {
          const { data: count } = await supabase!.rpc('post_reaction_count', { p_post_id: row.id });
          reactionCounts.set(row.id, Number(count || 0));
        }));
      }
      const mappedComments: CommunityComment[] = (commentResult.data || []).map((row: any) => ({
        id: row.id, post_id: row.post_id, body: row.body,
        author_name: profiles.get(row.author_id)?.full_name || 'Community member', author_id: row.author_id,
        author_public: profiles.has(row.author_id), created_at: row.created_at,
      }));
      const next: CamporaData = {
        announcements: (announcementResult.data || []).map((row: any) => ({ id: row.id, title: row.title, body: row.body, category: titleCase(row.category || 'general'), officially_verified: Boolean(row.is_official), created_at: row.published_at || row.created_at, expires_at: row.expires_at, sample: false })),
        resources: mappedResources,
        locations: (locationResult.data || []).map((row: any) => ({ id: row.id, name: row.name, kind: titleCase(row.location_type || 'other'), description: [row.description, row.address].filter(Boolean).join(' · '), directions_url: row.osm_url || undefined, latitude: row.latitude, longitude: row.longitude })),
        opportunities: (opportunityResult.data || []).map((row: any) => ({ id: row.id, title: row.title, description: row.description || '', eligibility: row.eligibility || '', deadline: row.deadline, application_url: row.application_url, category: titleCase(row.category || 'other'), source: row.source, verification_status: row.deadline && new Date(row.deadline).getTime() < Date.now() ? 'expired' : row.is_verified ? 'verified' : 'unverified' })),
        lostFound: mappedLostFound,
        listings: mappedListings,
        posts: (postResult.data || []).map((row: any) => ({
          id: row.id, body: row.body, feeling: row.feeling || undefined,
          author_name: profiles.get(row.author_id)?.full_name || 'Community member', author_id: row.author_id,
          author_public: profiles.has(row.author_id), department: departments.get(row.department_id) || profiles.get(row.author_id)?.department || undefined,
          created_at: row.created_at, reactions: reactionCounts.get(row.id) || 0,
          comments: mappedComments.filter((comment) => comment.post_id === row.id).length,
        })),
        comments: mappedComments, tickets: [], supportReplies: [], feedback: [],
      };
      if (authRef.current) {
        const [ticketResult, replyResult, notificationResult] = await Promise.all([
          supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(50),
          supabase.from('support_replies').select('*').order('created_at', { ascending: true }).limit(300),
          supabase.from('notifications').select('id,notification_type,title,body,resource_type,resource_id,is_read,read_at,created_at').order('created_at', { ascending: false }).limit(100),
        ]);
        const privateError = [ticketResult, replyResult, notificationResult].find((result) => result.error)?.error;
        if (privateError) throw privateError;
        const names = profiles;
        next.tickets = (ticketResult.data || []).map((row: any) => ({ id: row.id, reference: row.ticket_reference, subject: row.subject, category: titleCase(row.category), message: row.description, status: normalizeTicketStatus(row.status), created_at: row.created_at }));
        next.supportReplies = (replyResult.data || []).map((row: any) => ({ id: row.id, ticket_id: row.ticket_id, responder_name: names.get(row.author_id)?.full_name || 'CAMPORA Support', message: row.body, created_at: row.created_at }));
        if (requestingUserId === authUserIdRef.current) setNotifications((notificationResult.data || []) as CamporaNotification[]);
      } else {
        setNotifications([]);
      }
      setData(next);
    } catch (error) {
      console.error('CAMPORA data refresh failed:', error);
      setSyncError('CAMPORA could not refresh from the connected database. Check your Supabase setup and try again.');
    } finally { setLoading(false); }
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    if (!supabase || !authRef.current) throw new Error('Sign in to open your notifications.');
    assertPlatformWriteAllowed();
    const { data: marked, error } = await supabase.rpc('mark_campora_notification_read', { p_notification_id: id });
    if (error) throw error;
    if (marked !== true) throw new Error('This notification is no longer available.');
    const readAt = now();
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, is_read: true, read_at: notification.read_at || readAt } : notification));
  }, [assertPlatformWriteAllowed]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let mounted = true;
    const start = async () => {
      const { data: sessionData } = await client.auth.getSession();
      if (!mounted) return;
      await applySession(sessionData.session?.user?.id, sessionData.session?.user?.email || undefined);
      setAuthReady(true);
      await refresh();
    };
    void start();
    const { data: listener } = client.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      await applySession(session?.user?.id, session?.user?.email || undefined);
      setAuthReady(true);
      void refresh();
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [refresh]);

  async function applySession(userId?: string, email?: string) {
    const previousUserId = authUserIdRef.current;
    const nextUserId = userId || null;
    if (authUserIdRef.current !== nextUserId) {
      setNotifications([]);
      setFollowingProfiles([]);
      setFollowersProfiles([]);
      setFollowingError('');
      setFollowingLoading(false);
    }
    authUserIdRef.current = nextUserId;
    authRef.current = Boolean(userId);
    setAuthenticated(Boolean(userId));
    if (!userId || !supabase) { setNotifications([]); setFollowingProfiles([]); setFollowersProfiles([]); setFollowingError(''); setFollowingLoading(false); setProfile({ full_name: '', is_public: false, role: 'student', is_verified_representative: false }); return; }
    const [{ data: row }, { data: departments }, { data: faculties }, { data: followStats }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('departments').select('id,name').limit(500),
      supabase.from('faculties').select('id,name').limit(200),
      supabase.rpc('get_profile_follow_stats', { p_profile_id: userId }),
    ]);
    const dept = (departments || []).find((item: any) => item.id === row?.department_id);
    const faculty = (faculties || []).find((item: any) => item.id === row?.faculty_id);
    const avatarUrl = row?.avatar_path ? await signedUrl('avatars', row.avatar_path) : undefined;
    if (row) setProfile({ id: userId, full_name: row.full_name || '', email, faculty: faculty?.name || '', department: dept?.name || '', level: row.academic_level_label || levelText(row.academic_level), username: row.username || undefined, bio: row.bio || undefined, is_public: row.is_public !== false, avatar_path: row.avatar_path || undefined, avatar_url: avatarUrl, role: row.role || 'student', is_active: row.is_active === true, is_verified_representative: Boolean(row.verified_representative), followers_count: followStats?.[0] ? Number(followStats[0].followers_count ?? 0) : undefined });
    else setProfile({ id: userId, full_name: '', email, is_public: true, role: 'student', is_verified_representative: false });
    if (previousUserId !== userId && row?.is_active && ['administrator', 'moderator'].includes(row.role || '')) void adminApi.recordAdminLogin();
  }
  async function loadPublicProfile(profileId: string): Promise<PublicStudentProfile> {
    if (demo) {
      const previewProfile = publicProfiles.find((item) => item.id === profileId);
      if (previewProfile) return previewProfile;
      throw new Error('That public student profile is not available in preview mode.');
    }
    if (!supabase) throw new Error('Student profiles require a database connection.');
    const [{ data: rows, error }, { data: followStats, error: followStatsError }] = await Promise.all([
      supabase.rpc('get_public_student_profiles', { p_profile_id: profileId, p_search: null, p_limit: 1 }),
      supabase.rpc('get_profile_follow_stats', { p_profile_id: profileId }),
    ]);
    if (error) throw error;
    if (followStatsError) throw followStatsError;
    const row = rows?.[0];
    if (!row) throw new Error('This profile is private or no longer available.');
    const followStat = followStats?.[0];
    const avatarUrl = row.avatar_path ? await signedUrl('avatars', row.avatar_path) : undefined;
    return {
      id: row.id, full_name: row.full_name, username: row.username || undefined,
      faculty: row.faculty || undefined, department: row.department || undefined,
      level: row.academic_level_label || levelText(row.academic_level), bio: row.bio || undefined, avatar_url: avatarUrl,
      followers_count: Number(followStat?.followers_count ?? 0), is_following: Boolean(followStat?.is_following),
    };
  }

  const searchPublicProfiles = useCallback(async (query: string): Promise<PublicStudentProfile[]> => {
    const search = query.trim();
    if (search.length < 2) return [];
    if (!supabase) throw new Error('Student account search requires a connected CAMPORA directory.');
    const { data: rows, error } = await supabase.rpc('get_public_student_profiles', {
      p_profile_id: null, p_search: search, p_limit: 20,
    });
    if (error) throw error;
    return (rows || []).map((row: any) => ({
      id: row.id, full_name: row.full_name, username: row.username || undefined,
      faculty: row.faculty || undefined, department: row.department || undefined,
      level: row.academic_level_label || levelText(row.academic_level), bio: row.bio || undefined,
    }));
  }, []);

  async function setProfileFollow(profileId: string, shouldFollow: boolean): Promise<ProfileFollowStats> {
    assertPlatformWriteAllowed();
    if (demo) throw new Error('Following other students requires a connected account.');
    if (!supabase || !authRef.current) throw new Error('Sign in to follow students.');
    if (!navigator.onLine) throw new Error('You are offline. Connect before updating follows.');
    const userId = await currentUserId();
    if (profileId === userId) throw new Error('You cannot follow your own profile.');
    const { error } = await supabase.rpc('set_profile_follow', { p_followed_id: profileId, p_follow: shouldFollow });
    if (error) throw error;
    const { data: stats, error: statsError } = await supabase.rpc('get_profile_follow_stats', { p_profile_id: profileId });
    if (statsError) throw statsError;
    const result = stats?.[0];
    if (!result) throw new Error('Could not refresh this profile’s follower count.');
    return { followers_count: Number(result.followers_count ?? 0), is_following: Boolean(result.is_following) };
  }

  const refreshProfileFollowStats = useCallback(async () => {
    const userId = authUserIdRef.current;
    if (!supabase || !userId) return;
    setFollowingLoading(true);
    setFollowingError('');
    try {
      const [statsResult, followingResult, followersResult] = await Promise.all([
        supabase.rpc('get_profile_follow_stats', { p_profile_id: userId }),
        supabase.rpc('get_my_following_profiles', { p_limit: 200 }),
        supabase.rpc('get_my_follower_profiles', { p_limit: 200 }),
      ]);
      if (userId !== authUserIdRef.current) return;
      if (!statsResult.error && statsResult.data?.[0]) {
        setProfile((current) => current.id === userId ? { ...current, followers_count: Number(statsResult.data[0].followers_count ?? 0) } : current);
      }
      if (followingResult.error) throw followingResult.error;
      if (followersResult.error) throw followersResult.error;
      setFollowingProfiles((followingResult.data || []).map((row: any) => ({
        id: row.id, full_name: row.full_name, username: row.username || undefined,
        faculty: row.faculty || undefined, department: row.department || undefined,
        level: row.academic_level_label || levelText(row.academic_level),
      })));
      setFollowersProfiles((followersResult.data || []).map((row: any) => ({
        id: row.id, full_name: row.full_name, username: row.username || undefined,
        faculty: row.faculty || undefined, department: row.department || undefined,
        level: row.academic_level_label || levelText(row.academic_level),
      })));
    } catch {
      if (userId === authUserIdRef.current) setFollowingError('Your follow lists could not be loaded. Check your connection and try again.');
    } finally {
      if (userId === authUserIdRef.current) setFollowingLoading(false);
    }
  }, []);

  function updateData(updater: (current: CamporaData) => CamporaData) { setData((current) => { const next = updater(current); if (demo) safeSave(demoStorageKey, next); return next; }); }

  async function saveProfile(next: Profile) {
    assertPlatformWriteAllowed();
    if (demo) { const local = { ...profile, ...next, username: next.username?.trim() || undefined, bio: next.bio?.trim() || undefined, is_public: next.is_public !== false, role: 'student' as const, is_verified_representative: false }; setProfile(local); safeSave(profileKey, local); return; }
    if (!supabase || !authRef.current) throw new Error('Sign in to save your profile.');
    const user = await currentUserId();
    const username = next.username?.trim() || null;
    const bio = next.bio?.trim() || null;
    if (username && !/^[a-zA-Z0-9_]{3,30}$/.test(username)) throw new Error('Usernames must be 3–30 letters, numbers or underscores.');
    if (bio && bio.length > 1000) throw new Error('Your bio must be 1,000 characters or fewer.');
    const facultyResult = next.faculty ? await supabase.from('faculties').select('id').ilike('name', next.faculty).eq('is_active', true).maybeSingle() : { data: null, error: null };
    if (facultyResult.error) throw facultyResult.error;
    if (next.faculty && !facultyResult.data) throw new Error('Choose a faculty from the official CAMPORA directory.');
    if (next.department && !facultyResult.data) throw new Error('Choose a faculty before selecting a department.');
    const departmentResult = next.department && facultyResult.data
      ? await supabase.from('departments').select('id,faculty_id').ilike('name', next.department).eq('faculty_id', facultyResult.data.id).eq('is_active', true).maybeSingle()
      : { data: null, error: null };
    if (departmentResult.error) throw departmentResult.error;
    if (next.department && !departmentResult.data) throw new Error('Choose a department from the official list for your faculty.');
    const selectedLevel = next.level?.trim() || '';
    const isPostgraduate = selectedLevel === 'Postgraduate';
    const level = isPostgraduate ? null : selectedLevel ? Number.parseInt(selectedLevel, 10) / 100 : null;
    if (selectedLevel && !isPostgraduate && ![1, 2, 3, 4, 5].includes(level || 0)) throw new Error('Choose a supported academic level.');
    const { data: savedProfile, error } = await supabase.from('profiles').update({ full_name: next.full_name.trim(), username, bio, is_public: next.is_public !== false, faculty_id: facultyResult.data?.id || null, department_id: departmentResult.data?.id || null, academic_level: level, academic_level_label: isPostgraduate ? 'Postgraduate' : null }).eq('id', user).select('id').maybeSingle();
    if (error?.code === '23505' && /username/i.test(`${error.message} ${error.details || ''}`)) {
      throw new Error('That username is already taken. Choose a different one. Usernames are not case-sensitive.');
    }
    if (error) throw error;
    if (!savedProfile) throw new Error('Your profile was not saved. The account could not be found; please sign in again and retry.');
    setProfile({ ...profile, ...next, full_name: next.full_name.trim(), username: username || undefined, bio: bio || undefined, level: selectedLevel || undefined, is_public: next.is_public !== false });
  }

  async function uploadProfilePhoto(file: File): Promise<string> {
    assertPlatformWriteAllowed();
    if (demo) throw new Error('Profile photo uploads are available after secure sign-in is connected.');
    if (!supabase || !authRef.current) throw new Error('Sign in to upload your profile photo.');
    if (!navigator.onLine) throw new Error('You are offline. Connect to the internet before uploading a profile photo.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      throw new Error('Choose a JPEG, PNG or WebP profile photo under 5 MB.');
    }
    if (!await hasAllowedImageSignature(file)) throw new Error('The selected file does not appear to be a valid JPEG, PNG or WebP image.');
    const user = await currentUserId();
    const oldPath = profile.avatar_path;
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    const path = `${user}/${makeId()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;
    const { data: savedProfile, error: profileError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user).select('id').maybeSingle();
    if (profileError || !savedProfile) {
      await supabase.storage.from('avatars').remove([path]);
      if (profileError) throw profileError;
      throw new Error('Your profile photo was not saved. Please sign in again and retry.');
    }
    const { data: signed, error: signedError } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
    if (signedError || !signed?.signedUrl) {
      const { data: restoredProfile, error: restoreError } = await supabase.from('profiles').update({ avatar_path: oldPath || null }).eq('id', user).select('id').maybeSingle();
      await supabase.storage.from('avatars').remove([path]);
      if (restoreError || !restoredProfile) throw new Error('The secure photo preview failed and CAMPORA could not restore the previous profile photo. Please contact support.');
      throw signedError || new Error('The profile photo uploaded, but its secure preview could not be created.');
    }
    setProfile({ ...profile, avatar_path: path, avatar_url: signed.signedUrl });
    if (oldPath && oldPath !== path) await supabase.storage.from('avatars').remove([oldPath]);
    return signed.signedUrl;
  }

  async function authenticate(mode: 'signin' | 'signup', values: { email: string; password: string; full_name: string }) {
    if (!supabase) throw new Error('Account authentication requires Supabase configuration.');
    if (mode === 'signin') { const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password }); if (error) throw error; return; }
    const controls = await adminApi.loadPublicPlatformControls();
    if (!controls.registration_enabled) throw new Error('New CAMPORA registrations are temporarily disabled.');
    const { data: signUpData, error } = await supabase.auth.signUp({ email: values.email, password: values.password, options: { data: { full_name: values.full_name }, emailRedirectTo: window.location.origin } });
    if (error) throw error;
    if (!signUpData.session) return 'Check your email for a verification link before signing in.';
  }
  async function signInWithGoogle() {
    if (!supabase) throw new Error('Google sign-in requires Supabase configuration.');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) throw error;
  }
  async function forgotPassword(email: string) { if (!supabase) throw new Error('Account recovery requires Supabase configuration.'); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?reset=1` }); if (error) throw error; }
  async function resetPassword(password: string) { if (!supabase) throw new Error('Password reset requires Supabase configuration.'); const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; setRecoveryMode(false); }
  async function logout() { if (supabase) { const { error } = await supabase.auth.signOut(); if (error) throw error; } setAuthenticated(false); authRef.current = false; setFollowingProfiles([]); setFollowersProfiles([]); setFollowingError(''); setFollowingLoading(false); setProfile({ full_name: '', is_public: false, role: 'student', is_verified_representative: false }); }

  async function createResource(draft: { title: string; course_code: string; faculty_id: string; department_id: string; level: string; file?: File }) {
    assertPlatformWriteAllowed(true);
    const level = Number.parseInt(draft.level, 10) / 100;
    const faculty = faculties.find((item) => item.id === draft.faculty_id);
    const department = departments.find((item) => item.id === draft.department_id && item.faculty_id === draft.faculty_id);
    if (!draft.title.trim() || !faculty || !department || ![1, 2, 3, 4].includes(level)) throw new Error('Choose a title, a 100–400 level, and a department from the selected faculty.');
    if (draft.file && (draft.file.size < 1 || draft.file.size > 10 * 1024 * 1024)) throw new Error('Choose a resource file under 10 MB.');
    if (demo) {
      const row: Resource = { id: makeId(), title: draft.title.trim(), course_code: draft.course_code.trim(), faculty_id: faculty.id, department_id: department.id, faculty: faculty.name, department: department.name, level: draft.level, contributor: profile.full_name || 'You', contributor_id: profile.id, contributor_public: Boolean(profile.id), file_name: draft.file?.name, file_size: draft.file?.size, created_at: now(), status: 'pending' };
      updateData((current) => ({ ...current, resources: [row, ...current.resources] })); return;
    }
    if (!supabase || !authRef.current) throw new Error('Sign in to submit a resource.'); if (!navigator.onLine) throw new Error('You are offline. Connect to the internet before uploading a resource.');
    const user = await currentUserId(); const path = draft.file ? `${user}/${makeId()}-${safeFileName(draft.file.name)}` : null;
    if (draft.file && path) { const { error } = await supabase.storage.from('academic-resources').upload(path, draft.file, { contentType: draft.file.type, cacheControl: '3600', upsert: false }); if (error) throw error; }
    const resourceType = fileType(draft.file?.name || '');
    const { error } = await supabase.from('academic_resources').insert({ contributor_id: user, title: draft.title.trim(), course_code: draft.course_code.trim(), faculty_id: faculty.id, department_id: department.id, faculty: faculty.name, department: department.name, academic_level: level, description: null, resource_type: resourceType, storage_path: path || 'metadata-only', file_name: draft.file?.name.slice(-255) || 'No file attached', file_size_bytes: draft.file?.size || null, mime_type: draft.file?.type || null, status: 'pending' });
    if (error) { if (path) await supabase.storage.from('academic-resources').remove([path]); throw error; }
    await refresh();
  }

  async function createExploreItem(kind: 'lostFound' | 'opportunity' | 'listing', draft: ExploreDraft) {
    assertPlatformWriteAllowed(true);
    const title = draft.title?.trim();
    const description = draft.description?.trim();
    if (!title || !description) throw new Error('Add a title and description first.');
    if (demo) {
      if (kind !== 'listing') throw new Error('Preview mode cannot send student submissions for admin review. Connect CAMPORA and sign in first.');
      const created_at = now();
      const item = { id: makeId(), title, description, category: draft.category || 'Other', price: Number(draft.price || 0), currency: 'NGN', seller_name: draft.seller_name || profile.full_name || 'You', created_at, sold: false };
      updateData((current) => ({ ...current, listings: [item, ...current.listings] }));
      return;
    }
    if (!supabase || !authRef.current) throw new Error('Sign in to submit content for admin review.'); if (!navigator.onLine) throw new Error('You are offline. Connect to the internet before submitting content.');
    const client = supabase;
    const user = await currentUserId();
    const opportunityCategories = ['scholarship', 'internship', 'graduate_programme', 'competition', 'hackathon', 'online_course', 'conference', 'fellowship', 'volunteer', 'entrepreneurship', 'other'];
    const opportunityCategory = slug(draft.category || 'other');
    const source = draft.source?.trim() || '';
    let applicationUrl: string | null = null;
    let deadline: string | null = null;
    if (kind === 'opportunity') {
      if (!opportunityCategories.includes(opportunityCategory)) throw new Error('Choose a supported opportunity category.');
      if (source.length < 2 || source.length > 240) throw new Error('Add an organization or source between 2 and 240 characters.');
      if ((draft.eligibility || '').length > 5000) throw new Error('Eligibility details must be 5,000 characters or fewer.');
      if (draft.application_url?.trim()) {
        let parsed: URL;
        try { parsed = new URL(draft.application_url.trim()); } catch { throw new Error('Enter a valid application link.'); }
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Application links must use HTTP or HTTPS.');
        applicationUrl = parsed.toString();
      }
      if (draft.deadline?.trim()) {
        const parsedDeadline = new Date(`${draft.deadline.trim()}T12:00:00.000Z`);
        if (Number.isNaN(parsedDeadline.getTime())) throw new Error('Enter a valid opportunity deadline.');
        deadline = parsedDeadline.toISOString();
      }
    }
    const bucket = kind === 'lostFound' ? 'lost-found-images' : 'marketplace-images';
    const imagePath = kind === 'lostFound' && draft.file ? `${user}/${makeId()}-${safeFileName(draft.file.name)}` : null;
    if (draft.file && imagePath) { const { error } = await client.storage.from(bucket).upload(imagePath, draft.file); if (error) throw error; }
    let insertError: Error | null = null;
    if (kind === 'lostFound') {
      const { error } = await client.from('lost_found_items').insert({ reporter_id: user, item_type: draft.item_type === 'found' ? 'found' : 'lost', title, description, location_description: draft.location_text?.trim() || null, occurred_on: draft.approximate_date || null, image_path: imagePath, status: 'pending' });
      insertError = error;
    } else if (kind === 'opportunity') {
      const { error } = await client.from('opportunities').insert({ submitted_by: user, title, description, eligibility: draft.eligibility?.trim() || null, deadline, application_url: applicationUrl, category: opportunityCategory, source, status: 'pending', is_verified: false });
      insertError = error;
    } else {
      const { error } = await client.from('marketplace_listings').insert({ seller_id: user, title, description, category: slug(draft.category || 'other'), price: Number(draft.price || 0), currency_code: 'NGN', image_paths: imagePath ? [imagePath] : [], status: 'pending' });
      insertError = error;
    }
    if (insertError) { if (imagePath) await client.storage.from(bucket).remove([imagePath]); throw insertError; }
    await refresh();
  }

  async function createPost(body: string, feeling?: string) {
    assertPlatformWriteAllowed(true);
    const text = body.trim();
    if (!text || text.length > 1000) throw new Error('Posts must be between 1 and 1,000 characters.');
    const allowedFeelings = ['Happy', 'Grateful', 'Excited', 'Motivated', 'Curious', 'Hopeful', 'Tired', 'Stressed', 'Anxious', 'Sad', 'Frustrated'];
    if (feeling && !allowedFeelings.includes(feeling)) throw new Error('Choose a feeling from the list.');
    if (demo) { const item: CommunityPost = { id: makeId(), body: text, feeling, author_name: profile.full_name || 'You', author_id: profile.id || 'preview-user', department: profile.department, created_at: now(), reactions: 0, comments: 0 }; updateData((current) => ({ ...current, posts: [item, ...current.posts] })); return; }
    if (!supabase || !authRef.current) throw new Error('Sign in to post to the community.'); if (!navigator.onLine) throw new Error('You are offline. Connect before posting.');
    const user = await currentUserId(); const { data: createdPost, error } = await supabase.from('community_posts').insert({ author_id: user, body: text, feeling: feeling || null, status: 'approved' }).select('id').single(); if (error) throw error; if (!createdPost?.id) throw new Error('CAMPORA could not confirm that your post was saved.'); await refresh();
  }
  async function deletePost(postId: string) {
    assertPlatformWriteAllowed();
    if (demo) {
      const post = data.posts.find((item) => item.id === postId);
      if (!post) return;
      if (post.author_id && post.author_id !== (profile.id || 'preview-user')) throw new Error('You can delete only your own posts.');
      updateData((current) => ({ ...current, posts: current.posts.filter((item) => item.id !== postId), comments: current.comments.filter((comment) => comment.post_id !== postId) }));
      return;
    }
    if (!supabase || !authRef.current) throw new Error('Sign in to delete a community post.');
    if (!navigator.onLine) throw new Error('You are offline. Connect before deleting a post.');
    const user = await currentUserId();
    const { data: deletedPost, error } = await supabase.from('community_posts').delete().eq('id', postId).eq('author_id', user).select('id').maybeSingle();
    if (error) throw error;
    if (!deletedPost) throw new Error('You can delete only your own posts.');
    await refresh();
  }
  async function createComment(postId: string, body: string) {
    assertPlatformWriteAllowed(true);
    const text = body.trim();
    if (!text || text.length > 500) throw new Error('Replies must be between 1 and 500 characters.');
    if (demo) { const comment: CommunityComment = { id: makeId(), post_id: postId, body: text, author_name: profile.full_name || 'You', author_id: profile.id, created_at: now() }; updateData((current) => ({ ...current, comments: [...current.comments, comment], posts: current.posts.map((post) => post.id === postId ? { ...post, comments: post.comments + 1 } : post) })); return; }
    if (!supabase || !authRef.current) throw new Error('Sign in to reply.'); if (!navigator.onLine) throw new Error('You are offline. Connect before replying.'); const user = await currentUserId(); const { data: createdComment, error } = await supabase.from('post_comments').insert({ post_id: postId, author_id: user, body: text, status: 'approved' }).select('id').single(); if (error) throw error; if (!createdComment?.id) throw new Error('CAMPORA could not confirm that your reply was saved.'); await refresh();
  }
  async function react(postId: string) {
    assertPlatformWriteAllowed();
    if (demo) { updateData((current) => ({ ...current, posts: current.posts.map((post) => post.id === postId ? { ...post, reactions: post.reactions + 1 } : post) })); return; }
    if (!supabase || !authRef.current) throw new Error('Sign in to react to a post.'); if (!navigator.onLine) throw new Error('You are offline. Connect before reacting.'); const user = await currentUserId();
    const { data: existing, error: readError } = await supabase.from('post_reactions').select('id').eq('post_id', postId).eq('user_id', user).maybeSingle(); if (readError) throw readError;
    const result = existing ? await supabase.from('post_reactions').delete().eq('id', existing.id) : await supabase.from('post_reactions').insert({ post_id: postId, user_id: user });
    if (result.error) throw result.error; await refresh();
  }
  async function createReport(type: string, id: string, reason: string) {
    assertPlatformWriteAllowed();
    if (demo) { updateData((current) => current); return; }
    if (!supabase || !authRef.current) throw new Error('Sign in to report content.'); if (!navigator.onLine) throw new Error('You are offline. Connect before sending a report.'); const user = await currentUserId(); const { error } = await supabase.from('user_reports').insert({ reporter_id: user, resource_type: type, resource_id: id, reason }); if (error) throw error;
  }
  async function contactRequest(kind: 'seller' | 'poster', id: string, message: string) {
    assertPlatformWriteAllowed();
    if (demo) return;
    if (!supabase || !authRef.current) throw new Error('Sign in to send a private contact request.'); if (!navigator.onLine) throw new Error('You are offline. Connect before sending a request.'); const user = await currentUserId();
    const targetType = kind === 'seller' ? 'marketplace_listing' : 'lost_found_item';
    let recipientId: string | undefined;
    if (kind === 'seller') { const { data: target, error } = await supabase.from('marketplace_listings').select('seller_id').eq('id', id).maybeSingle(); if (error) throw error; recipientId = target?.seller_id; }
    else { const { data: target, error } = await supabase.from('lost_found_items').select('reporter_id').eq('id', id).maybeSingle(); if (error) throw error; recipientId = target?.reporter_id; }
    if (!recipientId) throw new Error('This listing is no longer available.');
    const { error } = await supabase.from('contact_requests').insert({ requester_id: user, recipient_id: recipientId, target_type: targetType, target_id: id, private_message: message }); if (error) throw error;
  }
  async function createSupportTicket(input: { subject: string; category: string; message: string; attachment?: File }) {
    assertPlatformWriteAllowed();
    if (demo) { const reference = `CP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; const ticket: SupportTicket = { id: makeId(), reference, subject: input.subject, category: input.category, message: input.message, status: 'Open', created_at: now() }; updateData((current) => ({ ...current, tickets: [ticket, ...current.tickets] })); return reference; }
    if (!supabase || !authRef.current) throw new Error('Sign in to submit a support request.'); if (!navigator.onLine) throw new Error('You are offline. Connect before submitting a support request.'); const user = await currentUserId();
    const attachmentPaths: string[] = [];
    if (input.attachment) { const path = `${user}/${makeId()}-${safeFileName(input.attachment.name)}`; const { error: uploadError } = await supabase.storage.from('support-attachments').upload(path, input.attachment); if (uploadError) throw uploadError; attachmentPaths.push(path); }
    const { data: row, error } = await supabase.from('support_tickets').insert({ requester_id: user, category: slug(input.category), subject: input.subject, description: input.message, attachment_paths: attachmentPaths }).select('ticket_reference').single(); if (error) throw error; await refresh(); return row.ticket_reference;
  }
  async function closeTicket(id: string) { assertPlatformWriteAllowed(); if (demo) { updateData((current) => ({ ...current, tickets: current.tickets.map((ticket) => ticket.id === id ? { ...ticket, status: 'Closed' } : ticket) })); return; } if (!supabase || !authRef.current) throw new Error('Sign in to close a support ticket.'); const { error } = await supabase.from('support_tickets').update({ status: 'closed', closed_at: now() }).eq('id', id); if (error) throw error; await refresh(); }
  async function submitFeedback(input: { kind: string; message: string; anonymous: boolean }) {
    assertPlatformWriteAllowed();
    if (demo) { const item = { id: makeId(), kind: input.kind, message: input.message, anonymous: input.anonymous, created_at: now() }; updateData((current) => ({ ...current, feedback: [item, ...current.feedback] })); return; }
    if (!supabase) throw new Error('Feedback storage requires Supabase configuration.'); if (!navigator.onLine) throw new Error('You are offline. Connect before sending feedback.'); const user = authRef.current && !input.anonymous ? await currentUserId() : null;
    const { error } = await supabase.from('feedback').insert({ submitter_id: user, feedback_type: slug(input.kind), message: input.message, is_anonymous: input.anonymous }); if (error) throw error;
  }

  return { data, profile, setProfile, faculties, departments, publicProfiles, followingProfiles, followersProfiles, followingLoading, followingError, notifications, markNotificationRead, authenticated, authReady, loading, demo, configured: supabaseConfigured, syncError, recoveryMode, maintenanceMode: platformControls.maintenance_mode, registrationEnabled: platformControls.registration_enabled, contentModerationEnabled: platformControls.content_moderation_enabled, refresh, loadPublicProfile, searchPublicProfiles, setProfileFollow, refreshProfileFollowStats, saveProfile, uploadProfilePhoto, authenticate, signInWithGoogle, forgotPassword, resetPassword, logout, createResource, createExploreItem, createPost, deletePost, createComment, react, createReport, contactRequest, createSupportTicket, closeTicket, submitFeedback, loadAdminSnapshot: adminApi.loadAdminSnapshot, adminReview: adminApi.adminReview, adminPublishAnnouncement: adminApi.adminSaveAnnouncement, adminAddLocation: (draft: { name: string; location_type: string; description: string; address: string; latitude?: number; longitude?: number; osm_url: string }) => adminApi.adminSaveLocation({ ...draft, status: 'pending', is_active: false }), adminSaveLocation: adminApi.adminSaveLocation, adminSetLocationActive: adminApi.adminSetLocationActive, adminDeleteLocation: adminApi.adminDeleteLocation, adminArchiveContent: adminApi.adminArchiveContent, adminAddFaculty: adminApi.adminAddFaculty, adminAddDepartment: adminApi.adminAddDepartment, adminRenameFaculty: adminApi.adminRenameFaculty, adminRenameDepartment: adminApi.adminRenameDepartment, adminSetFacultyActive: adminApi.adminSetFacultyActive, adminSetDepartmentActive: adminApi.adminSetDepartmentActive, adminPublishOpportunity: adminApi.adminPublishOpportunity, adminReplyTicket: adminApi.adminReplyTicket, adminSetRole: adminApi.adminSetRole, adminSetActive: adminApi.adminSetActive, adminResolveReport: adminApi.adminResolveReport, adminSaveSettings: adminApi.adminSaveSettings };
}

async function currentUserId() { if (!supabase) throw new Error('Database is not connected.'); const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw new Error('Please sign in again.'); return data.user.id; }
async function signedUrl(bucket: string, path: string) { if (!supabase) return undefined; const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600); return data?.signedUrl; }
async function hasAllowedImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (file.type === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}
function safeFileName(name: string) { return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100); }
function fileType(name: string): string { const ext = name.split('.').pop()?.toLowerCase(); return ['pdf','doc','docx','ppt','pptx'].includes(ext || '') ? ext! : ['jpg','jpeg','png','webp'].includes(ext || '') ? 'image' : 'other'; }
function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()); }
function slug(value: string) { return value.trim().toLowerCase().replaceAll('&', 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function levelText(value: unknown) { const level = Number(value); return Number.isFinite(level) && level > 0 ? `${level * 100} Level` : ''; }
function normalizeTicketStatus(value: string): SupportTicket['status'] { const map: Record<string, SupportTicket['status']> = { open: 'Open', in_progress: 'In Progress', awaiting_response: 'Awaiting Response', resolved: 'Resolved', closed: 'Closed' }; return map[value] || 'Open'; }
function readPreviewData(): CamporaData { try { const value = localStorage.getItem(demoStorageKey); if (value) return { ...demoData, ...JSON.parse(value) }; } catch { /* reset broken local preview data */ } return demoData; }
function readProfile(): Profile { try { const value = localStorage.getItem(profileKey); if (value) { const saved = JSON.parse(value); return { ...saved, is_public: saved.is_public !== false, role: 'student', is_verified_representative: false }; } } catch { /* use blank preview profile */ } return { full_name: '', is_public: true, role: 'student', is_verified_representative: false }; }
function safeSave(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* local preview still works for this tab if storage is full */ } }

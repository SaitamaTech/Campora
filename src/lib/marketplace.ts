import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type MarketplaceType = 'product' | 'service';
export type MarketplacePriceType = 'fixed' | 'negotiable' | 'contact';
export type MarketplaceLifecycle = 'active' | 'sold' | 'unavailable';
export type MarketplaceModeration = 'pending' | 'approved' | 'rejected' | 'archived';
export type MarketplaceSort = 'newest' | 'oldest' | 'price_low' | 'price_high' | 'popular';

export interface MarketplaceCategory {
  id: string;
  name: string;
  slug: string;
  listing_type: MarketplaceType;
  is_active: boolean;
  sort_order: number;
}

export interface MarketplaceImage {
  id: string;
  storage_path: string;
  position: number;
  is_primary: boolean;
  url?: string;
}

export interface MarketplaceListing {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  listing_type: MarketplaceType;
  category_id: string | null;
  category_name: string;
  category_slug: string;
  price: number | null;
  currency_code: string;
  price_type: MarketplacePriceType;
  listing_status: MarketplaceLifecycle;
  seller_display_name: string;
  location: string;
  landmark: string;
  status: MarketplaceModeration;
  moderation_reason: string | null;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  images: MarketplaceImage[];
  view_count: number;
}

export interface MarketplaceStats {
  active_total: number;
  product_total: number;
  service_total: number;
}

export interface MarketplaceContact {
  phone_number: string | null;
  whatsapp_number: string | null;
  contact_email: string | null;
  preferred_contact_method: 'whatsapp' | 'phone' | 'email' | null;
}

export interface MarketplaceFilters {
  query?: string;
  listingType?: MarketplaceType | 'all';
  categoryId?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  location?: string;
  sort?: MarketplaceSort;
  limit?: number;
  offset?: number;
  featuredOnly?: boolean;
}

export interface MarketplaceDraftImage {
  id?: string;
  storage_path?: string;
  url?: string;
  file?: File;
  is_primary: boolean;
}

export interface MarketplaceDraft {
  id?: string;
  listing_type: MarketplaceType;
  category_id: string;
  title: string;
  description: string;
  price: string;
  price_type: MarketplacePriceType;
  seller_display_name: string;
  phone_number: string;
  whatsapp_number: string;
  contact_email: string;
  show_phone: boolean;
  show_whatsapp: boolean;
  show_email: boolean;
  preferred_contact_method: 'whatsapp' | 'phone' | 'email' | '';
  location: string;
  landmark: string;
  images: MarketplaceDraftImage[];
}

export interface MarketplaceReport {
  id: string;
  listing_id: string;
  seller_id: string | null;
  report_type: 'listing' | 'seller';
  reason: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  resolution_notes: string | null;
  created_at: string;
  listing_title: string;
}

export interface MarketplaceAdminData {
  listings: MarketplaceListing[];
  reports: MarketplaceReport[];
  categories: MarketplaceCategory[];
  stats: MarketplaceStats;
}

const LISTING_FIELDS = 'id,seller_id,title,description,category,price,currency_code,image_paths,status,is_sold,created_at,updated_at,listing_type,category_id,price_type,listing_status,seller_display_name,location,landmark,is_featured,moderation_reason';
const LISTING_RELATIONS = 'marketplace_categories(id,name,slug,listing_type),marketplace_images(id,storage_path,position,is_primary)';
const MAX_ORIGINAL_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function client(): SupabaseClient {
  if (!supabase) throw new Error('The marketplace needs a connected CAMPORA database.');
  return supabase;
}

function throwIfError<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function listingRowToModel(row: any, viewCount = 0): MarketplaceListing {
  const category = Array.isArray(row.marketplace_categories) ? row.marketplace_categories[0] : row.marketplace_categories;
  const imageRows = Array.isArray(row.marketplace_images) ? row.marketplace_images : [];
  return {
    id: row.id,
    seller_id: row.seller_id,
    title: row.title,
    description: row.description || '',
    listing_type: row.listing_type === 'service' ? 'service' : 'product',
    category_id: row.category_id || null,
    category_name: category?.name || legacyCategoryName(row.category),
    category_slug: category?.slug || '',
    price: row.price == null ? null : Number(row.price),
    currency_code: row.currency_code || 'NGN',
    price_type: row.price_type || (row.price == null ? 'contact' : 'fixed'),
    listing_status: row.listing_status || (row.is_sold ? 'sold' : 'active'),
    seller_display_name: row.seller_display_name || 'Student seller',
    location: row.location || '',
    landmark: row.landmark || '',
    status: row.status || 'pending',
    moderation_reason: row.moderation_reason || null,
    is_featured: Boolean(row.is_featured),
    created_at: row.created_at,
    updated_at: row.updated_at,
    images: imageRows.sort((a: any, b: any) => a.position - b.position).map((image: any) => ({
      id: image.id,
      storage_path: image.storage_path,
      position: image.position,
      is_primary: Boolean(image.is_primary),
    })),
    view_count: viewCount,
  };
}

function legacyCategoryName(category: string | null | undefined) {
  const names: Record<string, string> = {
    textbooks: 'Books and Academic Materials', electronics: 'Electronics', fashion: 'Clothing and Fashion',
    accommodation: 'Other Products', student_services: 'Other Services', other: 'Other Products',
  };
  return names[category || 'other'] || 'Other Products';
}

async function signMarketplaceImages(listings: MarketplaceListing[]): Promise<MarketplaceListing[]> {
  const paths = [...new Set(listings.flatMap((listing) => listing.images.map((image) => image.storage_path)).filter(Boolean))];
  const signed = new Map<string, string>();
  await Promise.all(paths.map(async (path) => {
    const { data, error } = await client().storage.from('marketplace-images').createSignedUrl(path, 60 * 60);
    if (!error && data?.signedUrl) signed.set(path, data.signedUrl);
  }));
  return listings.map((listing) => ({
    ...listing,
    images: listing.images.map((image) => ({ ...image, url: signed.get(image.storage_path) })),
  }));
}

export async function loadMarketplaceCategories(includeInactive = false): Promise<MarketplaceCategory[]> {
  let request = client().from('marketplace_categories').select('id,name,slug,listing_type,is_active,sort_order').order('sort_order').order('name');
  if (!includeInactive) request = request.eq('is_active', true);
  return throwIfError(await request) as MarketplaceCategory[];
}

export async function loadMarketplaceStats(): Promise<MarketplaceStats> {
  const data = throwIfError(await client().rpc('marketplace_public_stats')) as MarketplaceStats[] | MarketplaceStats | null;
  return Array.isArray(data) ? (data[0] || { active_total: 0, product_total: 0, service_total: 0 }) : data || { active_total: 0, product_total: 0, service_total: 0 };
}

export async function searchMarketplace(filters: MarketplaceFilters = {}): Promise<{ listings: MarketplaceListing[]; total: number }> {
  const { data: searchRows, error: searchError } = await client().rpc('search_marketplace_listings', {
    p_query: filters.query?.trim() || null,
    p_listing_type: filters.listingType && filters.listingType !== 'all' ? filters.listingType : null,
    p_category_id: filters.categoryId || null,
    p_min_price: filters.minPrice ?? null,
    p_max_price: filters.maxPrice ?? null,
    p_location: filters.location?.trim() || null,
    p_sort: filters.sort || 'newest',
    p_limit: Math.max(1, Math.min(filters.limit || 24, 100)),
    p_offset: Math.max(0, filters.offset || 0),
    p_featured: filters.featuredOnly ? true : null,
  });
  if (searchError) throw new Error(searchError.message);
  const rows = (searchRows || []) as { listing_id: string; total_count: number; view_count: number }[];
  if (!rows.length) return { listings: [], total: 0 };
  const ids = rows.map((row) => row.listing_id);
  const listingRows = throwIfError(await client().from('marketplace_listings').select(`${LISTING_FIELDS},${LISTING_RELATIONS}`).in('id', ids)) as any[];
  const byId = new Map(listingRows.map((row) => [row.id, listingRowToModel(row, Number(rows.find((item) => item.listing_id === row.id)?.view_count || 0))]));
  const ordered = ids.map((id) => byId.get(id)).filter((listing): listing is MarketplaceListing => Boolean(listing));
  return { listings: await signMarketplaceImages(ordered), total: Number(rows[0]?.total_count || 0) };
}

export async function loadMarketplaceListing(id: string): Promise<MarketplaceListing | null> {
  const { data, error } = await client().from('marketplace_listings').select(`${LISTING_FIELDS},${LISTING_RELATIONS}`).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [listing] = await signMarketplaceImages([listingRowToModel(data)]);
  return listing;
}

export async function loadMyMarketplaceListings(): Promise<MarketplaceListing[]> {
  const { data: userData, error: userError } = await client().auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in to view your advertisements.');
  const rows = throwIfError(await client().from('marketplace_listings').select(`${LISTING_FIELDS},${LISTING_RELATIONS}`).eq('seller_id', userData.user.id).order('created_at', { ascending: false }).limit(100)) as any[];
  return signMarketplaceImages(rows.map((row) => listingRowToModel(row)));
}

export async function loadMarketplaceContact(listingId: string): Promise<MarketplaceContact | null> {
  const { data, error } = await client().rpc('get_marketplace_contacts', { p_listing_ids: [listingId] });
  if (error) throw new Error(error.message);
  const contact = (data || [])[0];
  return contact ? {
    phone_number: contact.phone_number || null,
    whatsapp_number: contact.whatsapp_number || null,
    contact_email: contact.contact_email || null,
    preferred_contact_method: contact.preferred_contact_method || null,
  } : null;
}

export async function loadMarketplaceOwnerContact(listingId: string): Promise<Pick<MarketplaceDraft, 'phone_number' | 'whatsapp_number' | 'contact_email' | 'show_phone' | 'show_whatsapp' | 'show_email' | 'preferred_contact_method'> | null> {
  const { data: userData, error: userError } = await client().auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in to edit your advertisement contact preferences.');
  const { data, error } = await client().from('marketplace_listing_contacts')
    .select('phone_number,whatsapp_number,contact_email,show_phone,show_whatsapp,show_email,preferred_contact_method')
    .eq('listing_id', listingId).eq('seller_id', userData.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    phone_number: data.phone_number || '', whatsapp_number: data.whatsapp_number || '', contact_email: data.contact_email || '',
    show_phone: Boolean(data.show_phone), show_whatsapp: Boolean(data.show_whatsapp), show_email: Boolean(data.show_email),
    preferred_contact_method: data.preferred_contact_method || '',
  };
}

export async function recordMarketplaceView(listingId: string): Promise<void> {
  const { error } = await client().rpc('record_marketplace_listing_view', { p_listing_id: listingId });
  if (error && !error.message.toLowerCase().includes('sign in')) throw new Error(error.message);
}

export async function saveMarketplaceListing(draft: MarketplaceDraft): Promise<string> {
  const supabaseClient = client();
  if (!navigator.onLine) throw new Error('You are offline. Connect before publishing an advertisement.');
  const { data: userData, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in to publish an advertisement.');
  const userId = userData.user.id;
  const title = draft.title.trim();
  const description = draft.description.trim();
  if (title.length < 2 || title.length > 240) throw new Error('Title must be between 2 and 240 characters.');
  if (description.length < 2 || description.length > 10000) throw new Error('Description must be between 2 and 10,000 characters.');
  if (!draft.category_id) throw new Error('Choose a category.');
  if (!draft.seller_display_name.trim()) throw new Error('Add a display name for the advertisement.');
  const hasPrice = draft.price.trim() !== '';
  const price = hasPrice ? Number(draft.price) : null;
  if (draft.price_type === 'contact' && hasPrice) throw new Error('Leave the price blank when buyers should contact you for pricing.');
  if (draft.price_type !== 'contact' && (!Number.isFinite(price) || Number(price) < 0)) throw new Error('Enter a valid price of zero or more.');
  if (draft.show_phone && !validPhone(draft.phone_number)) throw new Error('Enter a valid phone number or turn off phone contact.');
  if (draft.show_whatsapp && !validPhone(draft.whatsapp_number)) throw new Error('Enter a valid WhatsApp number or turn off WhatsApp contact.');
  if (draft.show_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contact_email.trim())) throw new Error('Enter a valid contact email or turn off email contact.');
  if (!draft.show_phone && !draft.show_whatsapp && !draft.show_email) throw new Error('Choose at least one contact method to publish.');
  if (!draft.preferred_contact_method || !{
    phone: draft.show_phone, whatsapp: draft.show_whatsapp, email: draft.show_email,
  }[draft.preferred_contact_method]) throw new Error('Choose one of the contact methods you are publishing as your preferred option.');
  if (draft.images.length > 5) throw new Error('An advertisement can have up to five images.');
  if (draft.images.length && draft.images.filter((image) => image.is_primary).length !== 1) throw new Error('Choose exactly one primary advertisement photo.');

  const fields = {
    seller_id: userId,
    title,
    description,
    category: 'other',
    category_id: draft.category_id,
    listing_type: draft.listing_type,
    price: draft.price_type === 'contact' ? null : price,
    currency_code: 'NGN',
    price_type: draft.price_type,
    seller_display_name: draft.seller_display_name.trim().slice(0, 120),
    location: draft.location.trim().slice(0, 160) || null,
    landmark: draft.landmark.trim().slice(0, 160) || null,
  };
  const isNewListing = !draft.id;
  let listingId = draft.id;
  if (listingId) {
    const { seller_id: _sellerId, ...updateFields } = fields;
    const { error } = await supabaseClient.from('marketplace_listings').update(updateFields).eq('id', listingId).eq('seller_id', userId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabaseClient.from('marketplace_listings').insert(fields).select('id').single();
    if (error) throw new Error(error.message);
    listingId = data.id;
  }
  if (!listingId) throw new Error('The advertisement could not be saved.');

  const chosenContact = {
    listing_id: listingId,
    seller_id: userId,
    phone_number: draft.show_phone ? draft.phone_number.trim() : null,
    whatsapp_number: draft.show_whatsapp ? draft.whatsapp_number.trim() : null,
    contact_email: draft.show_email ? draft.contact_email.trim() : null,
    show_phone: draft.show_phone,
    show_whatsapp: draft.show_whatsapp,
    show_email: draft.show_email,
    preferred_contact_method: draft.preferred_contact_method,
  };
  const contactResult = await supabaseClient.from('marketplace_listing_contacts').upsert(chosenContact, { onConflict: 'listing_id' });
  if (contactResult.error) {
    if (isNewListing && listingId) await supabaseClient.from('marketplace_listings').delete().eq('id', listingId);
    throw new Error(contactResult.error.message);
  }

  let current: { id: string; storage_path: string; position: number; is_primary: boolean }[];
  try {
    current = throwIfError(await supabaseClient.from('marketplace_images').select('id,storage_path,position,is_primary').eq('listing_id', listingId)) as { id: string; storage_path: string; position: number; is_primary: boolean }[];
  } catch (error) {
    if (isNewListing && listingId) await supabaseClient.from('marketplace_listings').delete().eq('id', listingId);
    throw error;
  }
  const keepIds = new Set(draft.images.map((image) => image.id).filter((id): id is string => Boolean(id)));
  const newFiles = draft.images.filter((image) => image.file);
  const uploadedPaths: string[] = [];
  const insertedImageIds: string[] = [];
  const removed = current.filter((image) => !keepIds.has(image.id));
  let removedRowsDeleted = false;
  try {
    for (const item of newFiles) {
      const file = await compressMarketplaceImage(item.file!);
      const path = `${userId}/${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}.webp`;
      const { error } = await supabaseClient.storage.from('marketplace-images').upload(path, file, { contentType: 'image/webp', cacheControl: '3600', upsert: false });
      if (error) throw new Error(error.message);
      uploadedPaths.push(path);
      item.storage_path = path;
    }

    if (removed.length) {
      const { error } = await supabaseClient.from('marketplace_images').delete().eq('listing_id', listingId).in('id', removed.map((image) => image.id));
      if (error) throw new Error(error.message);
      removedRowsDeleted = true;
    }
    if (current.length) {
      const { error } = await supabaseClient.from('marketplace_images').update({ is_primary: false }).eq('listing_id', listingId);
      if (error) throw new Error(error.message);
    }
    const finalImages = draft.images.map((image, position) => ({ image, position }));
    const newImageRows = finalImages.filter(({ image }) => image.file).map(({ image, position }) => ({ listing_id: listingId, seller_id: userId, storage_path: image.storage_path!, position, is_primary: false }));
    const insertedByPath = new Map<string, string>();
    if (newImageRows.length) {
      const inserted = throwIfError(await supabaseClient.from('marketplace_images').insert(newImageRows).select('id,storage_path')) as { id: string; storage_path: string }[];
      for (const image of inserted) { insertedImageIds.push(image.id); insertedByPath.set(image.storage_path, image.id); }
    }
    let primaryId = '';
    for (const { image, position } of finalImages) {
      const imageId = image.id || (image.storage_path ? insertedByPath.get(image.storage_path) : undefined);
      if (!imageId) continue;
      const { error } = await supabaseClient.from('marketplace_images').update({ position }).eq('listing_id', listingId).eq('id', imageId);
      if (error) throw new Error(error.message);
      if (image.is_primary) primaryId = imageId;
    }
    if (primaryId) {
      const { error } = await supabaseClient.from('marketplace_images').update({ is_primary: true }).eq('listing_id', listingId).eq('id', primaryId);
      if (error) throw new Error(error.message);
    }
    const finalPaths = finalImages.map(({ image }) => image.storage_path).filter((path): path is string => Boolean(path));
    const { error: pathError } = await supabaseClient.from('marketplace_listings').update({ image_paths: finalPaths }).eq('id', listingId).eq('seller_id', userId);
    if (pathError) throw new Error(pathError.message);
    if (removed.length) {
      await supabaseClient.storage.from('marketplace-images').remove(removed.map((image) => image.storage_path));
    }
  } catch (error) {
    if (isNewListing && listingId) {
      await supabaseClient.from('marketplace_listings').delete().eq('id', listingId);
      if (uploadedPaths.length) await supabaseClient.storage.from('marketplace-images').remove(uploadedPaths);
      throw error;
    }
    if (insertedImageIds.length) await supabaseClient.from('marketplace_images').delete().eq('listing_id', listingId).in('id', insertedImageIds);
    if (removedRowsDeleted && removed.length) await supabaseClient.from('marketplace_images').insert(removed.map((image) => ({ id: image.id, listing_id: listingId, seller_id: userId, storage_path: image.storage_path, position: image.position, is_primary: image.is_primary })));
    for (const image of current) {
      if (keepIds.has(image.id)) await supabaseClient.from('marketplace_images').update({ position: image.position, is_primary: image.is_primary }).eq('listing_id', listingId).eq('id', image.id);
    }
    if (uploadedPaths.length) await supabaseClient.storage.from('marketplace-images').remove(uploadedPaths);
    throw error;
  }
  return listingId;
}

export async function setMarketplaceListingStatus(id: string, status: MarketplaceLifecycle): Promise<void> {
  const { data: userData, error: userError } = await client().auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in to update your advertisements.');
  const { error } = await client().from('marketplace_listings').update({ listing_status: status }).eq('id', id).eq('seller_id', userData.user.id);
  if (error) throw new Error(error.message);
}

export async function deleteMarketplaceListing(id: string): Promise<void> {
  const supabaseClient = client();
  const { data: userData, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in to delete an advertisement.');
  const images = throwIfError(await supabaseClient.from('marketplace_images').select('storage_path').eq('listing_id', id)) as { storage_path: string }[];
  const { error } = await supabaseClient.from('marketplace_listings').delete().eq('id', id).eq('seller_id', userData.user.id);
  if (error) throw new Error(error.message);
  if (images.length) await supabaseClient.storage.from('marketplace-images').remove(images.map((image) => image.storage_path));
}

export async function reportMarketplaceListing(listing: MarketplaceListing, reportType: 'listing' | 'seller', reason: string): Promise<void> {
  const { data: userData, error: userError } = await client().auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in to report an advertisement.');
  const { error } = await client().from('marketplace_reports').insert({
    listing_id: listing.id, seller_id: reportType === 'seller' ? listing.seller_id : null, reporter_id: userData.user.id, report_type: reportType, reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function loadMarketplaceAdminData(): Promise<MarketplaceAdminData> {
  const [listingResult, reportResult, categories, stats] = await Promise.all([
    client().from('marketplace_listings').select(`${LISTING_FIELDS},${LISTING_RELATIONS}`).order('created_at', { ascending: false }).limit(250),
    client().from('marketplace_reports').select('id,listing_id,seller_id,report_type,reason,status,resolution_notes,created_at,marketplace_listings(title)').order('created_at', { ascending: false }).limit(250),
    loadMarketplaceCategories(true), loadMarketplaceStats(),
  ]);
  const listingRows = throwIfError(listingResult) as any[];
  const reportRows = throwIfError(reportResult) as any[];
  const listings = await signMarketplaceImages(listingRows.map((row) => listingRowToModel(row)));
  const reports = reportRows.map((row) => ({
    id: row.id, listing_id: row.listing_id, seller_id: row.seller_id, report_type: row.report_type,
    reason: row.reason, status: row.status, resolution_notes: row.resolution_notes || null, created_at: row.created_at,
    listing_title: Array.isArray(row.marketplace_listings) ? row.marketplace_listings[0]?.title || 'Advertisement unavailable' : row.marketplace_listings?.title || 'Advertisement unavailable',
  })) as MarketplaceReport[];
  return { listings, reports, categories, stats };
}

export async function reviewMarketplaceListing(id: string, status: 'approved' | 'rejected' | 'archived', moderationReason = ''): Promise<void> {
  if (status === 'rejected' && moderationReason.trim().length < 5) throw new Error('Add a short reason before rejecting this advertisement.');
  const { data: userData, error: userError } = await client().auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in as an administrator or moderator to review marketplace ads.');
  const { error } = await client().from('marketplace_listings').update({ status, moderation_reason: status === 'rejected' ? moderationReason.trim() : null, reviewed_by: userData.user.id, reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function saveMarketplaceCategory(input: { id?: string; name: string; listing_type: MarketplaceType; is_active?: boolean }): Promise<void> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new Error('Category name must be 2–120 characters.');
  const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
  if (!slug) throw new Error('Add a valid category name.');
  const fields = { name, slug, listing_type: input.listing_type, is_active: input.is_active ?? true };
  const result = input.id
    ? await client().from('marketplace_categories').update(fields).eq('id', input.id)
    : await client().from('marketplace_categories').insert(fields);
  if (result.error) throw new Error(result.error.message);
}

export async function deleteMarketplaceCategory(id: string): Promise<void> {
  const { error } = await client().from('marketplace_categories').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateMarketplaceReport(id: string, status: 'reviewing' | 'resolved' | 'dismissed', resolutionNotes: string): Promise<void> {
  const { data: userData, error: userError } = await client().auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in as an administrator or moderator to manage reports.');
  const { error } = await client().from('marketplace_reports').update({ status, reviewed_by: userData.user.id, resolution_notes: resolutionNotes.trim() || null }).eq('id', id);
  if (error) throw new Error(error.message);
}

function validPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^[+0-9 ()-]+$/.test(value.trim());
}

async function compressMarketplaceImage(file: File): Promise<File> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error('Images must be JPEG, PNG or WebP.');
  if (file.size < 1 || file.size > MAX_ORIGINAL_IMAGE_BYTES) throw new Error('Each original image must be under 10 MB.');
  if (typeof createImageBitmap !== 'function') {
    if (file.size > 5 * 1024 * 1024 || file.type !== 'image/webp') throw new Error('This browser cannot optimize the image. Try a WebP photo under 5 MB.');
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('This image could not be optimized.'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
  if (!blob) throw new Error('This image could not be optimized.');
  if (blob.size > 5 * 1024 * 1024) throw new Error('This image is still over 5 MB after optimization. Choose a smaller image.');
  const filename = `${file.name.replace(/\.[^.]+$/, '') || 'marketplace-photo'}.webp`;
  return new File([blob], filename, { type: 'image/webp', lastModified: Date.now() });
}

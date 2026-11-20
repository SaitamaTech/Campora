import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  AlertTriangle, ArrowLeft, ChevronRight, Edit3, Eye, ImagePlus, LoaderCircle,
  Mail, MapPin, MessageCircle, Phone, Plus, Search, ShieldCheck, SlidersHorizontal,
  Trash2, Upload, UserRound, X
} from 'lucide-react';
import { Button, EmptyState, SectionTitle, Tag } from './ui';
import {
  deleteMarketplaceListing, loadMarketplaceCategories, loadMarketplaceContact, loadMarketplaceListing, loadMarketplaceOwnerContact,
  loadMarketplaceStats, loadMyMarketplaceListings, recordMarketplaceView, reportMarketplaceListing,
  saveMarketplaceListing, searchMarketplace, setMarketplaceListingStatus,
  type MarketplaceCategory, type MarketplaceContact, type MarketplaceDraft, type MarketplaceDraftImage,
  type MarketplaceFilters, type MarketplaceListing, type MarketplaceSort, type MarketplaceStats,
  type MarketplaceType,
} from '../lib/marketplace';

type Props = {
  authenticated: boolean;
  demo: boolean;
  profileName: string;
  initialView?: 'browse' | 'mine';
  onSignIn: () => void;
  onToast: (message: string) => void;
  onNavigateToMyListings?: () => void;
};
type Screen = 'browse' | 'mine' | 'form' | 'detail';

const emptyStats: MarketplaceStats = { active_total: 0, product_total: 0, service_total: 0 };
const blankDraft = (profileName: string): MarketplaceDraft => ({
  listing_type: 'product', category_id: '', title: '', description: '', price: '', price_type: 'fixed',
  seller_display_name: profileName || '', phone_number: '', whatsapp_number: '', contact_email: '',
  show_phone: false, show_whatsapp: false, show_email: false, preferred_contact_method: '',
  location: '', landmark: '', images: [],
});

function money(listing: MarketplaceListing) {
  if (listing.price_type === 'contact' || listing.price == null) return 'Contact for price';
  return `${listing.currency_code || 'NGN'} ${listing.price.toLocaleString()}${listing.price_type === 'negotiable' ? ' · Negotiable' : ''}`;
}
function imageOf(listing: MarketplaceListing) { return listing.images.find((image) => image.is_primary)?.url || listing.images[0]?.url; }
function niceDate(value: string) { return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }

export function Marketplace({ authenticated, demo, profileName, initialView = 'browse', onSignIn, onToast, onNavigateToMyListings }: Props) {
  const [screen, setScreen] = useState<Screen>(initialView === 'mine' ? 'mine' : 'browse');
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [stats, setStats] = useState<MarketplaceStats>(emptyStats);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [mine, setMine] = useState<MarketplaceListing[]>([]);
  const [selected, setSelected] = useState<MarketplaceListing | null>(null);
  const [formReturnScreen, setFormReturnScreen] = useState<'browse' | 'mine'>('browse');
  const [detailReturnScreen, setDetailReturnScreen] = useState<'browse' | 'mine'>('browse');
  const [contact, setContact] = useState<MarketplaceContact | null>(null);
  const [draft, setDraft] = useState<MarketplaceDraft>(() => blankDraft(profileName));
  const [filters, setFilters] = useState<MarketplaceFilters>({ listingType: 'all', sort: 'newest', limit: 36 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<'listing' | 'seller'>('listing');
  const [reportReason, setReportReason] = useState('');
  const [error, setError] = useState('');
  const configured = !demo && categories.length > 0;

  const run = useCallback(async (nextFilters = filters) => {
    await Promise.resolve();
    if (demo) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [categoryRows, statRows, result] = await Promise.all([
        categories.length ? Promise.resolve(categories) : loadMarketplaceCategories(), loadMarketplaceStats(), searchMarketplace(nextFilters),
      ]);
      setCategories(categoryRows); setStats(statRows); setListings(result.listings);
    } catch (e) { setError(errorText(e)); onToast(errorText(e)); }
    finally { setLoading(false); }
  }, [categories, demo, filters, onToast]);

  const refreshMine = useCallback(async () => {
    await Promise.resolve();
    setLoading(true); setError('');
    try { setMine(await loadMyMarketplaceListings()); }
    catch (e) { setError(errorText(e)); onToast(errorText(e)); }
    finally { setLoading(false); }
  }, [onToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void run(); }, 200);
    return () => window.clearTimeout(timer);
  }, [run]);
  useEffect(() => {
    if (screen !== 'mine' || !authenticated) return;
    const timer = window.setTimeout(() => { void refreshMine(); }, 0);
    return () => window.clearTimeout(timer);
  }, [screen, authenticated, refreshMine]);

  function updateFilter<K extends keyof MarketplaceFilters>(key: K, value: MarketplaceFilters[K]) {
    const next = { ...filters, [key]: value, offset: 0 }; setFilters(next);
  }
  async function openListing(listing: MarketplaceListing) {
    setDetailReturnScreen(screen === 'mine' ? 'mine' : 'browse');
    setSelected(listing); setScreen('detail'); setReportOpen(false); setContact(null);
    try { await recordMarketplaceView(listing.id); } catch { /* anonymous view errors are intentionally non-blocking */ }
    try { const fresh = await loadMarketplaceListing(listing.id); if (fresh) setSelected(fresh); setContact(await loadMarketplaceContact(listing.id)); }
    catch (e) { onToast(errorText(e)); }
  }
  function beginCreate() {
    if (demo || !configured) { onToast('Connect CAMPORA to publish a real advertisement.'); return; }
    if (!authenticated) { onSignIn(); return; }
    setDraft(blankDraft(profileName)); setPreview(false); setError(''); setFormReturnScreen('browse'); setScreen('form');
  }
  async function beginEdit(listing: MarketplaceListing) {
    const current = mine.find((item) => item.id === listing.id) || listing;
    setDraft({ ...blankDraft(profileName), id: current.id, listing_type: current.listing_type, category_id: current.category_id || '', title: current.title, description: current.description, price: current.price == null ? '' : String(current.price), price_type: current.price_type, seller_display_name: current.seller_display_name, location: current.location, landmark: current.landmark, images: current.images.map((image) => ({ id: image.id, storage_path: image.storage_path, url: image.url, is_primary: image.is_primary })) });
    setPreview(false); setFormReturnScreen('mine'); setScreen('form');
    try {
      const contactPreferences = await loadMarketplaceOwnerContact(current.id);
      if (contactPreferences) setDraft((previous) => previous.id === current.id ? { ...previous, ...contactPreferences } : previous);
    } catch (e) { onToast(errorText(e)); }
  }
  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    const accepted = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (accepted.length !== files.length) onToast('Only JPEG, PNG or WebP images are supported.');
    const room = Math.max(0, 5 - draft.images.length);
    if (files.length > room) onToast('You can add up to five images.');
    const additions: MarketplaceDraftImage[] = accepted.slice(0, room).map((file, index) => ({ file, url: URL.createObjectURL(file), is_primary: draft.images.length === 0 && index === 0 }));
    setDraft((value) => ({ ...value, images: [...value.images, ...additions] })); event.target.value = '';
  }
  function removeImage(index: number) {
    const image = draft.images[index]; if (image.url && image.file) URL.revokeObjectURL(image.url);
    const remaining = draft.images.filter((_, i) => i !== index); if (image.is_primary && remaining[0]) remaining[0] = { ...remaining[0], is_primary: true };
    setDraft((value) => ({ ...value, images: remaining }));
  }
  function setPrimary(index: number) { setDraft((value) => ({ ...value, images: value.images.map((image, i) => ({ ...image, is_primary: i === index })) })); }
  function submitDraft(event: FormEvent) { event.preventDefault(); setPreview(true); }
  async function publish() {
    setSaving(true); setError('');
    try { await saveMarketplaceListing(draft); draft.images.forEach((image) => { if (image.file && image.url) URL.revokeObjectURL(image.url); }); onToast(draft.id ? 'Advertisement updated.' : 'Advertisement submitted for review.'); setPreview(false); setScreen('mine'); await refreshMine(); }
    catch (e) { setError(errorText(e)); onToast(errorText(e)); }
    finally { setSaving(false); }
  }
  async function changeStatus(id: string, status: 'active' | 'sold' | 'unavailable') {
    try { await setMarketplaceListingStatus(id, status); onToast(`Advertisement marked ${status}.`); await refreshMine(); }
    catch (e) { onToast(errorText(e)); }
  }
  async function removeListing(id: string) {
    if (!window.confirm('Delete this advertisement? This cannot be undone.')) return;
    try { await deleteMarketplaceListing(id); onToast('Advertisement deleted.'); await refreshMine(); }
    catch (e) { onToast(errorText(e)); }
  }
  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!authenticated) { onSignIn(); return; }
    if (!selected || reportReason.trim().length < 5) { onToast('Add a little more detail to your report.'); return; }
    try { await reportMarketplaceListing(selected, reportType, reportReason); onToast('Thanks. Your report was submitted.'); setReportOpen(false); setReportReason(''); }
    catch (e) { onToast(errorText(e)); }
  }

  const featured = listings.filter((item) => item.is_featured).slice(0, 6);
  const popular = listings.filter((item) => item.view_count > 0).sort((a, b) => b.view_count - a.view_count).slice(0, 6);
  const services = listings.filter((item) => item.listing_type === 'service').slice(0, 6);
  const recent = listings.slice(0, 12);
  if (screen === 'form') return <MarketplaceForm draft={draft} categories={categories} preview={preview} saving={saving} error={error} onChange={setDraft} onSubmit={submitDraft} onBack={() => setScreen(formReturnScreen)} onPublish={publish} onEditPreview={() => setPreview(false)} onImages={addImages} onRemoveImage={removeImage} onPrimary={setPrimary} />;
  if (screen === 'detail' && selected) return <ListingDetail listing={selected} contact={contact} reportOpen={reportOpen} reportType={reportType} reportReason={reportReason} onBack={() => setScreen(detailReturnScreen)} onReport={() => setReportOpen(true)} onReportType={setReportType} onReportReason={setReportReason} onSubmitReport={submitReport} onCloseReport={() => setReportOpen(false)} />;
  if (screen === 'mine') return <MineView listings={mine} loading={loading} authenticated={authenticated} error={error} onBack={() => setScreen('browse')} onSignIn={onSignIn} onCreate={beginCreate} onEdit={beginEdit} onDelete={removeListing} onStatus={changeStatus} onPreview={openListing} />;

  return <div className="page-stack marketplace-page">
    <div className="page-heading"><div><p className="eyebrow">CAMPORA MARKETPLACE</p><h1>Buy, sell, and offer help.</h1><p>A student-to-student space for useful things and trusted services.</p></div><Button onClick={beginCreate}><Plus size={15} /> Publish ad</Button></div>
    {(demo || error && !categories.length) && <div className="inline-note"><AlertTriangle size={16} /><span>{demo ? 'Marketplace is in preview mode. Connect Supabase to load real advertisements and publish.' : error}</span>{!authenticated && <button className="text-action" onClick={onSignIn}>Sign in</button>}</div>}
    <div className="metrics-row"><Metric value={stats.active_total} label="Active ads" /><Metric value={stats.product_total} label="Products" /><Metric value={stats.service_total} label="Services" /><Metric value={featured.length} label="Featured" /></div>
    <section className="panel marketplace-controls"><div className="search-field"><Search size={15} /><input value={filters.query || ''} onChange={(e) => updateFilter('query', e.target.value)} placeholder="Search titles and descriptions" /></div><div className="filter-row"><select value={filters.listingType || 'all'} onChange={(e) => updateFilter('listingType', e.target.value as MarketplaceType | 'all')}><option value="all">All types</option><option value="product">Products</option><option value="service">Services</option></select><select value={filters.categoryId || ''} onChange={(e) => updateFilter('categoryId', e.target.value)}><option value="">All categories</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><select value={filters.sort || 'newest'} onChange={(e) => updateFilter('sort', e.target.value as MarketplaceSort)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="price_low">Price: low</option><option value="price_high">Price: high</option><option value="popular">Popular</option></select></div><div className="marketplace-filter-fields"><input type="number" min="0" placeholder="Min price" onChange={(e) => updateFilter('minPrice', e.target.value ? Number(e.target.value) : null)} /><input type="number" min="0" placeholder="Max price" onChange={(e) => updateFilter('maxPrice', e.target.value ? Number(e.target.value) : null)} /><input placeholder="Location" value={filters.location || ''} onChange={(e) => updateFilter('location', e.target.value)} /></div><div className="market-category-chips"><button className={!filters.categoryId ? 'active' : ''} onClick={() => updateFilter('categoryId', '')}>All</button>{categories.slice(0, 8).map((category) => <button className={filters.categoryId === category.id ? 'active' : ''} key={category.id} onClick={() => updateFilter('categoryId', category.id)}>{category.name}</button>)}</div></section>
    {loading ? <Loading /> : !configured ? <EmptyState title="Marketplace is not connected" text="Real marketplace categories and advertisements will appear after CAMPORA is connected to Supabase. No sample listings or counts are shown here." icon={<SlidersHorizontal size={20} />} /> : <>
      <ListingSection title="Featured advertisements" items={featured} onOpen={openListing} /><ListingSection title="Recent advertisements" items={recent} onOpen={openListing} /><ListingSection title="Popular this week" items={popular} onOpen={openListing} note="Only advertisements with recorded views appear here." /><ListingSection title="Student services" items={services} onOpen={openListing} />
      {!featured.length && !recent.length && <EmptyState title="No advertisements found" text="Try a different search or filter. Published advertisements appear here after moderation." icon={<Search size={20} />} />}
    </>}
    <div className="market-safety"><ShieldCheck size={16} /><span>Do not advertise illegal, counterfeit, stolen, or unsafe goods or services. Verify products and sellers before paying; meet in a safe public place where possible, and never share sensitive personal information. CAMPORA does not process payments, guarantee transactions, or arrange delivery.</span></div>
    <div className="marketplace-my-link"><button className="text-action" onClick={() => { if (!authenticated) onSignIn(); else { setScreen('mine'); onNavigateToMyListings?.(); } }}>View my advertisements <ChevronRight size={15} /></button></div>
  </div>;
}

function Metric({ value, label }: { value: number; label: string }) { return <div className="metric-card"><div className="metric-icon metric-purple"><Eye size={16} /></div><div><strong>{value}</strong><span>{label}</span></div></div>; }
function Loading() { return <div className="panel marketplace-loading"><LoaderCircle className="spin" size={22} /> Loading marketplace…</div>; }

function ListingSection({ title, items, onOpen, note }: { title: string; items: MarketplaceListing[]; onOpen: (listing: MarketplaceListing) => void; note?: string }) {
  return <section className="section-block"><SectionTitle eyebrow={note} title={title} />{items.length ? <div className="listing-grid">{items.map((listing) => <ListingCard key={listing.id} listing={listing} onOpen={onOpen} />)}</div> : <div className="panel"><EmptyState title="Nothing here yet" text="Verified advertisements will appear when students publish them." /></div>}</section>;
}
function ListingCard({ listing, onOpen }: { listing: MarketplaceListing; onOpen: (listing: MarketplaceListing) => void }) {
  const photo = imageOf(listing); return <article className="listing-card marketplace-listing-card"><button className="listing-art" onClick={() => onOpen(listing)} aria-label={`Open ${listing.title}`}>{photo ? <img className="listing-photo" src={photo} alt="" /> : <ImagePlus size={25} />}{listing.is_featured && <Tag tone="accent">Featured</Tag>}</button><div className="listing-card-body"><div className="listing-meta"><Tag tone={listing.listing_type === 'service' ? 'success' : 'neutral'}>{listing.listing_type}</Tag><span>{listing.category_name}</span></div><h3>{listing.title}</h3><div className="listing-price">{money(listing)}</div><div className="seller-row"><UserRound size={13} /> {listing.seller_display_name}</div>{listing.location && <div className="listing-location"><MapPin size={12} /> {listing.location}</div>}<div className="listing-date">Posted {niceDate(listing.created_at)}{listing.listing_status === 'sold' && <Tag tone="warning">Sold</Tag>}</div><div className="listing-card-actions"><button className="button button-secondary" onClick={() => onOpen(listing)}>View details</button></div></div></article>;
}

function MarketplaceForm({ draft, categories, preview, saving, error, onChange, onSubmit, onBack, onPublish, onEditPreview, onImages, onRemoveImage, onPrimary }: { draft: MarketplaceDraft; categories: MarketplaceCategory[]; preview: boolean; saving: boolean; error: string; onChange: (value: MarketplaceDraft) => void; onSubmit: (event: FormEvent) => void; onBack: () => void; onPublish: () => void; onEditPreview: () => void; onImages: (event: ChangeEvent<HTMLInputElement>) => void; onRemoveImage: (index: number) => void; onPrimary: (index: number) => void }) {
  const set = <K extends keyof MarketplaceDraft>(key: K, value: MarketplaceDraft[K]) => onChange({ ...draft, [key]: value });
  if (preview) return <div className="page-stack marketplace-form-page"><div className="page-heading"><div><button className="text-action" onClick={onEditPreview}><ArrowLeft size={15} /> Edit details</button><p className="eyebrow">PREVIEW BEFORE PUBLISHING</p><h1>{draft.title || 'Untitled advertisement'}</h1></div></div><div className="panel marketplace-preview"><ListingPreview draft={draft} /><div className="inline-note"><ShieldCheck size={16} /><span>Your advertisement will be sent for moderation. Only the contact methods you explicitly checked will be shared.</span></div><div className="form-actions"><Button variant="secondary" onClick={onEditPreview}>Keep editing</Button><Button onClick={onPublish} disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} {saving ? 'Publishing…' : 'Submit for review'}</Button></div></div></div>;
  return <div className="page-stack marketplace-form-page"><div className="page-heading"><div><button className="text-action" onClick={onBack}><ArrowLeft size={15} /> Back to marketplace</button><p className="eyebrow">SELL SAFELY ON CAMPORA</p><h1>{draft.id ? 'Edit advertisement' : 'Publish an advertisement'}</h1><p>Share a useful product or service. Contact fields stay blank until you enter and publish them.</p></div></div>{error && <div className="inline-note"><AlertTriangle size={16} />{error}</div>}<form className="panel marketplace-form" onSubmit={onSubmit}><div className="form-grid"><label>Type<select value={draft.listing_type} onChange={(e) => set('listing_type', e.target.value as MarketplaceType)}><option value="product">Product</option><option value="service">Service</option></select></label><label>Category<select required value={draft.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">Choose a category</option>{categories.filter((category) => category.listing_type === draft.listing_type || !category.is_active).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label className="field-wide">Title<input required minLength={2} maxLength={240} value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="What are you offering?" /></label><label className="field-wide">Description<textarea required minLength={2} maxLength={10000} rows={5} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Include useful details, condition, availability, or terms." /></label><label>Price<input type="number" min="0" value={draft.price} disabled={draft.price_type === 'contact'} onChange={(e) => set('price', e.target.value)} placeholder="Amount" /></label><label>Price type<select value={draft.price_type} onChange={(e) => set('price_type', e.target.value as MarketplaceDraft['price_type'])}><option value="fixed">Fixed price</option><option value="negotiable">Negotiable</option><option value="contact">Contact for price</option></select></label><label>Display name<input required value={draft.seller_display_name} onChange={(e) => set('seller_display_name', e.target.value)} placeholder="Name buyers can see" /></label><label>General location<input value={draft.location} onChange={(e) => set('location', e.target.value)} placeholder="Area or neighbourhood" /></label><label className="field-wide">Optional landmark<input value={draft.landmark} onChange={(e) => set('landmark', e.target.value)} placeholder="A nearby landmark (optional)" /></label></div><fieldset><legend>Contact methods to publish</legend><p className="form-help">These fields intentionally start blank. Check a method only if you want it visible to interested buyers.</p><div className="form-grid"><label className="check-field"><input type="checkbox" checked={draft.show_phone} onChange={(e) => set('show_phone', e.target.checked)} /> Publish phone<input type="tel" value={draft.phone_number} onChange={(e) => set('phone_number', e.target.value)} placeholder="Phone number" /></label><label className="check-field"><input type="checkbox" checked={draft.show_whatsapp} onChange={(e) => set('show_whatsapp', e.target.checked)} /> Publish WhatsApp<input type="tel" value={draft.whatsapp_number} onChange={(e) => set('whatsapp_number', e.target.value)} placeholder="WhatsApp number" /></label><label className="check-field"><input type="checkbox" checked={draft.show_email} onChange={(e) => set('show_email', e.target.checked)} /> Publish email<input type="email" value={draft.contact_email} onChange={(e) => set('contact_email', e.target.value)} placeholder="Contact email" /></label><label>Preferred contact<select value={draft.preferred_contact_method} onChange={(e) => set('preferred_contact_method', e.target.value as MarketplaceDraft['preferred_contact_method'])}><option value="">Choose after selecting a method</option><option value="phone" disabled={!draft.show_phone}>Phone</option><option value="whatsapp" disabled={!draft.show_whatsapp}>WhatsApp</option><option value="email" disabled={!draft.show_email}>Email</option></select></label></div></fieldset><fieldset><legend>Photos <small>(up to 5, JPEG/PNG/WebP)</small></legend><div className="marketplace-image-grid">{draft.images.map((image, index) => <div className={`marketplace-image ${image.is_primary ? 'primary' : ''}`} key={image.id || image.url || index}>{image.url && <img src={image.url} alt="Listing preview" />}<button type="button" className="icon-button" onClick={() => onRemoveImage(index)} aria-label="Remove image"><X size={14} /></button><button type="button" className="image-primary" onClick={() => onPrimary(index)}>{image.is_primary ? 'Primary' : 'Set primary'}</button></div>)}{draft.images.length < 5 && <label className="image-upload"><ImagePlus size={20} /><span>Add photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onImages} /></label>}</div></fieldset><div className="form-actions"><Button variant="secondary" onClick={onBack}>Cancel</Button><Button type="submit"><Eye size={15} /> Preview before publishing</Button></div></form></div>;
}

function ListingPreview({ draft }: { draft: MarketplaceDraft }) { return <article className="listing-preview"><div className="listing-grid-preview">{draft.images.map((image, index) => image.url && <img key={image.url || index} src={image.url} alt="" />)}</div><Tag tone={draft.listing_type === 'service' ? 'success' : 'neutral'}>{draft.listing_type}</Tag><h2>{draft.title || 'Untitled advertisement'}</h2><div className="listing-price">{draft.price_type === 'contact' ? 'Contact for price' : `NGN ${Number(draft.price || 0).toLocaleString()}`}</div><p>{draft.description || 'No description added yet.'}</p><div className="seller-row"><UserRound size={13} /> {draft.seller_display_name || 'Your display name'}</div>{draft.location && <div className="listing-location"><MapPin size={12} /> {draft.location}{draft.landmark && ` · ${draft.landmark}`}</div>}<div className="contact-preview">{draft.show_phone && <span><Phone size={14} /> Phone published</span>}{draft.show_whatsapp && <span><MessageCircle size={14} /> WhatsApp published</span>}{draft.show_email && <span><Mail size={14} /> Email published</span>}</div></article>; }

function ListingDetail({ listing, contact, reportOpen, reportType, reportReason, onBack, onReport, onReportType, onReportReason, onSubmitReport, onCloseReport }: { listing: MarketplaceListing; contact: MarketplaceContact | null; reportOpen: boolean; reportType: 'listing' | 'seller'; reportReason: string; onBack: () => void; onReport: () => void; onReportType: (value: 'listing' | 'seller') => void; onReportReason: (value: string) => void; onSubmitReport: (event: FormEvent) => void; onCloseReport: () => void }) {
  const message = encodeURIComponent(`Hello, I saw your advertisement on CAMPORA and I'm interested in ${listing.title}. Is it still available?`);
  const preferred = contact?.preferred_contact_method;
  const contactButtonClass = (method: 'phone' | 'whatsapp' | 'email') => `button ${preferred === method ? 'button-primary' : 'button-secondary'}`;
  return <div className="page-stack marketplace-detail-page">
    <button className="text-action" onClick={onBack}><ArrowLeft size={15} /> Back</button>
    <article className="panel listing-detail">
      <div className="detail-gallery">{listing.images.length ? listing.images.map((image) => image.url && <img key={image.id} src={image.url} alt={listing.title} />) : <div className="listing-art"><ImagePlus size={30} /></div>}</div>
      <div className="listing-meta"><Tag tone={listing.listing_type === 'service' ? 'success' : 'neutral'}>{listing.listing_type}</Tag><span>{listing.category_name}</span>{listing.status !== 'approved' && <Tag tone="warning">{listing.status}</Tag>}{listing.listing_status === 'sold' && <Tag tone="warning">Sold</Tag>}{listing.listing_status === 'unavailable' && <Tag tone="warning">Unavailable</Tag>}</div>
      <h1>{listing.title}</h1><div className="listing-price">{money(listing)}</div><p className="detail-description">{listing.description}</p>
      <div className="detail-facts"><span><UserRound size={14} /> {listing.seller_display_name}</span>{listing.location && <span><MapPin size={14} /> {listing.location}{listing.landmark && ` · ${listing.landmark}`}</span>}<span><Eye size={14} /> {listing.view_count} recorded views</span><span>Posted {niceDate(listing.created_at)}</span></div>
      {contact && <div className="seller-contact-actions"><strong>Contact seller{preferred ? ` · Preferred: ${preferred}` : ''}</strong><div>
        {contact.whatsapp_number && <a className={contactButtonClass('whatsapp')} href={`https://wa.me/${contact.whatsapp_number.replace(/\D/g, '')}?text=${message}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
        {contact.phone_number && <a className={contactButtonClass('phone')} href={`tel:${contact.phone_number}`}><Phone size={15} /> Call</a>}
        {contact.contact_email && <a className={contactButtonClass('email')} href={`mailto:${contact.contact_email}?subject=${encodeURIComponent(`CAMPORA: ${listing.title}`)}`}><Mail size={15} /> Email</a>}
      </div></div>}
      {listing.status === 'approved' && <button className="text-action report-link" onClick={onReport}><AlertTriangle size={14} /> Report listing or seller</button>}
    </article>
    {reportOpen && <form className="panel report-actions" onSubmit={onSubmitReport}><div className="section-title"><SectionTitle eyebrow="SAFETY" title="Report this advertisement" /><button className="icon-button" type="button" onClick={onCloseReport}><X size={16} /></button></div><label>Report type<select value={reportType} onChange={(e) => onReportType(e.target.value as 'listing' | 'seller')}><option value="listing">Report this listing</option><option value="seller">Report this seller</option></select></label><label>What happened?<textarea required minLength={5} rows={4} value={reportReason} onChange={(e) => onReportReason(e.target.value)} placeholder="Tell us what we should review." /></label><Button type="submit">Submit report</Button></form>}
  </div>;
}

function MineView({ listings, loading, authenticated, error, onBack, onSignIn, onCreate, onEdit, onDelete, onStatus, onPreview }: { listings: MarketplaceListing[]; loading: boolean; authenticated: boolean; error: string; onBack: () => void; onSignIn: () => void; onCreate: () => void; onEdit: (listing: MarketplaceListing) => void; onDelete: (id: string) => void; onStatus: (id: string, status: 'active' | 'sold' | 'unavailable') => void; onPreview: (listing: MarketplaceListing) => void }) {
  if (!authenticated) return <div className="page-stack"><button className="text-action" onClick={onBack}><ArrowLeft size={15} /> Marketplace</button><EmptyState title="Sign in to manage your advertisements" text="Your own advertisements are private and only available after you sign in." icon={<UserRound size={20} />} /><Button onClick={onSignIn}>Sign in</Button></div>;
  const groups = [
    { key: 'pending', title: 'Pending review' }, { key: 'rejected', title: 'Needs changes' },
    { key: 'archived', title: 'Archived by moderation' }, { key: 'active', title: 'Active' },
    { key: 'unavailable', title: 'Unavailable' }, { key: 'sold', title: 'Sold' },
  ];
  const groupFor = (listing: MarketplaceListing) => listing.status === 'approved' ? listing.listing_status : listing.status;
  return <div className="page-stack marketplace-mine">
    <div className="page-heading"><div><button className="text-action" onClick={onBack}><ArrowLeft size={15} /> Marketplace</button><p className="eyebrow">SELLER DASHBOARD</p><h1>My advertisements</h1><p>Manage only the advertisements owned by your signed-in account.</p></div><Button onClick={onCreate}><Plus size={15} /> New ad</Button></div>
    {error && <div className="inline-note"><AlertTriangle size={16} />{error}</div>}
    {loading ? <Loading /> : !listings.length ? <EmptyState title="You have no advertisements yet" text="Publish your first product or service when the marketplace is connected." icon={<Plus size={20} />} /> : groups.map(({ key, title }) => {
      const rows = listings.filter((listing) => groupFor(listing) === key);
      return rows.length ? <section className="section-block" key={key}><SectionTitle title={`${title} · ${rows.length}`} /><div className="listing-grid">
        {rows.map((listing) => <article className="panel my-listing-row" key={listing.id}><ListingCard listing={listing} onOpen={onPreview} />
          {listing.status === 'rejected' && listing.moderation_reason && <div className="inline-note"><AlertTriangle size={14} /> Rejection reason: {listing.moderation_reason}</div>}
          <div className="my-listing-actions"><Button variant="secondary" onClick={() => onPreview(listing)}><Eye size={14} /> Buyer preview</Button>
            {listing.status !== 'archived' && <Button variant="secondary" onClick={() => onEdit(listing)}><Edit3 size={14} /> Edit</Button>}
            {listing.status === 'approved' && listing.listing_status === 'active' && <><Button variant="ghost" onClick={() => onStatus(listing.id, 'sold')}>Mark sold</Button><Button variant="ghost" onClick={() => onStatus(listing.id, 'unavailable')}>Unavailable</Button></>}
            {listing.status === 'approved' && listing.listing_status === 'unavailable' && <Button variant="ghost" onClick={() => onStatus(listing.id, 'active')}>Reactivate</Button>}
            {listing.status === 'approved' && listing.listing_status === 'sold' && <Tag tone="warning">Sold</Tag>}
            <button className="icon-button" onClick={() => onDelete(listing.id)} aria-label="Delete advertisement"><Trash2 size={15} /></button>
          </div>
        </article>)}
      </div></section> : null;
    })}
  </div>;
}

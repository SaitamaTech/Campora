import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, CircleAlert, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { Button, EmptyState, SectionTitle, Tag } from './ui';
import {
  deleteMarketplaceCategory, loadMarketplaceAdminData, reviewMarketplaceListing,
  saveMarketplaceCategory, updateMarketplaceReport,
  type MarketplaceAdminData, type MarketplaceCategory, type MarketplaceType,
} from '../lib/marketplace';

type Props = { onToast: (message: string) => void; onSetSellerActive: (userId: string, active: boolean) => Promise<void> };

export function MarketplaceAdmin({ onToast, onSetSellerActive }: Props) {
  const [data, setData] = useState<MarketplaceAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<{ id?: string; name: string; listing_type: MarketplaceType; is_active: boolean }>({ name: '', listing_type: 'product', is_active: true });

  const reload = useCallback(async () => {
    await Promise.resolve();
    setLoading(true); setError('');
    try { setData(await loadMarketplaceAdminData()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load marketplace management.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  async function review(listingId: string, status: 'approved' | 'rejected' | 'archived') {
    const reason = reasons[listingId] || '';
    if (status === 'rejected' && reason.trim().length < 5) { setError('Enter at least five characters explaining why the advertisement is rejected.'); return; }
    setBusy(listingId); setError('');
    try { await reviewMarketplaceListing(listingId, status, reason); onToast(status === 'approved' ? 'Advertisement approved.' : status === 'rejected' ? 'Advertisement rejected.' : 'Advertisement archived.'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the advertisement.'); }
    finally { setBusy(''); }
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault(); setBusy('category'); setError('');
    try { await saveMarketplaceCategory(category); setCategory({ name: '', listing_type: 'product', is_active: true }); onToast('Marketplace category saved.'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this category.'); }
    finally { setBusy(''); }
  }

  async function removeCategory(item: MarketplaceCategory) {
    if (!window.confirm(`Remove the “${item.name}” category? Existing advertisements will remain but no longer have this category.`)) return;
    setBusy(item.id); setError('');
    try { await deleteMarketplaceCategory(item.id); onToast('Category removed.'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove this category.'); }
    finally { setBusy(''); }
  }

  async function updateReport(id: string, status: 'reviewing' | 'resolved' | 'dismissed') {
    setBusy(id); setError('');
    try { await updateMarketplaceReport(id, status, notes[id] || ''); onToast(`Report marked ${status}.`); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this report.'); }
    finally { setBusy(''); }
  }

  async function suspendSeller(userId: string) {
    if (!window.confirm('Suspend this CAMPORA account? The seller will no longer be able to use the app.')) return;
    setBusy(userId); setError('');
    try { await onSetSellerActive(userId, false); onToast('Seller account suspended.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not suspend this seller.'); }
    finally { setBusy(''); }
  }

  const listings = data?.listings || [];
  const pending = listings.filter((listing) => listing.status === 'pending');
  const openReports = data?.reports.filter((report) => report.status === 'open' || report.status === 'reviewing') || [];
  const groupedCategories = (data?.categories || []).reduce<Record<MarketplaceType, MarketplaceCategory[]>>((groups, item) => { groups[item.listing_type].push(item); return groups; }, { product: [], service: [] });

  return <div className="marketplace-admin">
    <div className="marketplace-admin-heading"><div><p className="eyebrow">MARKETPLACE MANAGEMENT</p><h2>Safety, listings &amp; categories</h2><p>Moderate student advertisements and reports; publish only categories approved for use.</p></div><Button variant="secondary" onClick={() => void reload()} disabled={loading}><RefreshCw size={14} /> Refresh</Button></div>
    {error && <div className="inline-note marketplace-admin-error" role="alert"><AlertTriangle size={15} />{error}<button onClick={() => void reload()}>Retry</button></div>}
    {loading && !data ? <div className="panel marketplace-loading"><LoaderCircle className="spin" size={22} /> Loading marketplace administration…</div> : <>
      <div className="marketplace-admin-stats">
        <AdminStat label="Active ads" value={data?.stats.active_total || 0} />
        <AdminStat label="Products" value={data?.stats.product_total || 0} />
        <AdminStat label="Services" value={data?.stats.service_total || 0} />
        <AdminStat label="Pending review" value={pending.length} />
        <AdminStat label="Open reports" value={openReports.length} />
      </div>

      <section className="section-block"><SectionTitle eyebrow="APPROVAL QUEUE" title="Pending advertisements" />
        {pending.length ? <div className="marketplace-admin-list">{pending.map((listing) => <article className="panel marketplace-admin-listing" key={listing.id}>
          <div className="marketplace-admin-card-head"><div><Tag tone={listing.listing_type === 'service' ? 'success' : 'accent'}>{listing.listing_type}</Tag><h3>{listing.title}</h3><p>{listing.category_name} · {listing.seller_display_name}{listing.location ? ` · ${listing.location}` : ''}</p></div><b>{listing.price == null ? 'Contact for price' : `${listing.currency_code} ${listing.price.toLocaleString()}`}</b></div>
          <p className="marketplace-admin-description">{listing.description}</p>
          {listing.images.length > 0 && <div className="marketplace-admin-images">{listing.images.map((image) => image.url && <img src={image.url} key={image.id} alt="Advertisement photo" />)}</div>}
          <label>Moderation reason<textarea rows={2} value={reasons[listing.id] || ''} onChange={(event) => setReasons({ ...reasons, [listing.id]: event.target.value })} placeholder="Required when rejecting; be clear and actionable." /></label>
          <div className="marketplace-admin-actions"><Button onClick={() => void review(listing.id, 'approved')} disabled={busy === listing.id}><Check size={14} /> Approve</Button><Button variant="secondary" onClick={() => void review(listing.id, 'rejected')} disabled={busy === listing.id}><X size={14} /> Reject</Button><Button variant="ghost" onClick={() => void review(listing.id, 'archived')} disabled={busy === listing.id}><Trash2 size={14} /> Remove / archive</Button></div>
        </article>)}</div> : <div className="panel"><EmptyState title="No advertisements waiting" text="New student submissions will appear here for moderation." icon={<ShieldCheck size={18} />} /></div>}
      </section>

      <section className="section-block"><SectionTitle eyebrow="TRUST & SAFETY" title="Advertisement reports" />
        {openReports.length ? <div className="marketplace-report-list">{openReports.map((report) => {
          const listing = listings.find((item) => item.id === report.listing_id);
          const sellerId = report.seller_id || listing?.seller_id;
          return <article className="panel marketplace-report" key={report.id}><div className="marketplace-admin-card-head"><div><Tag tone="warning">{report.report_type} report · {report.status}</Tag><h3>{report.listing_title}</h3><small>{new Date(report.created_at).toLocaleString()}</small></div><CircleAlert size={19} /></div><p>{report.reason}</p><label>Resolution note<textarea rows={2} value={notes[report.id] || report.resolution_notes || ''} onChange={(event) => setNotes({ ...notes, [report.id]: event.target.value })} placeholder="What was reviewed or changed?" /></label><div className="marketplace-admin-actions"><Button variant="secondary" onClick={() => void updateReport(report.id, 'reviewing')} disabled={busy === report.id}>Mark reviewing</Button>{sellerId && report.report_type === 'seller' && <Button variant="ghost" onClick={() => void suspendSeller(sellerId)} disabled={busy === sellerId}>Suspend seller</Button>}<Button onClick={() => void updateReport(report.id, 'resolved')} disabled={busy === report.id}>Resolve</Button><Button variant="ghost" onClick={() => void updateReport(report.id, 'dismissed')} disabled={busy === report.id}>Dismiss</Button></div></article>;
        })}</div> : <div className="panel"><EmptyState title="No open marketplace reports" text="New advertisement and seller reports will appear here." icon={<ShieldCheck size={18} />} /></div>}
      </section>

      <section className="section-block"><SectionTitle eyebrow="MARKETPLACE TAXONOMY" title="Manage categories" />
        <form className="panel marketplace-category-form" onSubmit={saveCategory}><label>Category name<input required minLength={2} maxLength={120} value={category.name} onChange={(event) => setCategory({ ...category, name: event.target.value })} placeholder="e.g. Design and creative" /></label><label>Listing type<select value={category.listing_type} onChange={(event) => setCategory({ ...category, listing_type: event.target.value as MarketplaceType })}><option value="product">Product</option><option value="service">Service</option></select></label><Button type="submit" disabled={busy === 'category'}><Plus size={14} /> {busy === 'category' ? 'Saving…' : category.id ? 'Update category' : 'Add category'}</Button>{category.id && <Button variant="secondary" onClick={() => setCategory({ name: '', listing_type: 'product', is_active: true })}>Cancel edit</Button>}</form>
        <div className="marketplace-category-groups">{(['product', 'service'] as const).map((type) => <div className="panel marketplace-category-group" key={type}><SectionTitle title={`${type === 'product' ? 'Product' : 'Service'} categories`} />{groupedCategories[type].length ? <div className="marketplace-category-list">{groupedCategories[type].map((item) => <div className="marketplace-category-row" key={item.id}><span><b>{item.name}</b><small>{item.slug} · {item.is_active ? 'Active' : 'Inactive'}</small></span><div><button className="text-action" onClick={() => setCategory({ id: item.id, name: item.name, listing_type: item.listing_type, is_active: item.is_active })}>Edit</button><button className="icon-button" onClick={() => void removeCategory(item)} disabled={busy === item.id} aria-label={`Remove ${item.name}`}><Trash2 size={14} /></button></div></div>)}</div> : <EmptyState title="No categories yet" text="Add a product or service category above." icon={<Plus size={18} />} />}</div>)}</div>
      </section>
    </>}
  </div>;
}

function AdminStat({ label, value }: { label: string; value: number }) { return <div className="marketplace-admin-stat"><b>{value.toLocaleString()}</b><span>{label}</span></div>; }

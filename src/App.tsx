import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, ArrowDown, ArrowUpRight, Bell, BookOpen, Check, ChevronRight, CircleHelp, Compass, House, LogIn, Menu, Search, Shield, Sparkles, Users, UserRound, Wifi, WifiOff, X } from 'lucide-react';
import { Home } from './components/Home';
import { Academics } from './components/Academics';
import { Explore } from './components/Explore';
import { Community } from './components/Community';
import { ProfilePage } from './components/Profile';
import { SupportCenter } from './components/SupportCenter';
import { AdminDashboard } from './components/AdminDashboard';
import { Modal } from './components/ui';
import { useCampora } from './lib/useCampora';
import './index.css';
import type { ExploreTab, Page } from './lib/types';

const navigation: { page: Page; label: string; icon: typeof House; key: string }[] = [
  { page: 'home', label: 'Home', icon: House, key: '01' },
  { page: 'academics', label: 'Academics', icon: BookOpen, key: '02' },
  { page: 'explore', label: 'Explore', icon: Compass, key: '03' },
  { page: 'community', label: 'Community', icon: Users, key: '04' },
  { page: 'profile', label: 'Profile', icon: UserRound, key: '05' },
];
const APP_YEAR = new Date().getFullYear();
type SearchResult = { title: string; detail: string; page: Page; tab?: ExploreTab; icon: typeof Search };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export default function App() {
  const app = useCampora();
  const [page, setPage] = useState<Page>(() => parseHash(window.location.hash).page);
  const [exploreTab, setExploreTab] = useState<ExploreTab>(() => parseHash(window.location.hash).tab || 'campus');
  const [special, setSpecial] = useState<'support' | 'admin' | null>(() => parseHash(window.location.hash).special ?? null);
  const [online, setOnline] = useState(navigator.onLine);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const results = useMemo(() => searchData(app.data, query), [app.data, query]);

  useEffect(() => {
    const onlineHandler = () => setOnline(true); const offlineHandler = () => setOnline(false);
    const installHandler = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallPromptEvent); };
    const hashHandler = () => { const route = parseHash(window.location.hash); setPage(route.page); setExploreTab(route.tab || 'campus'); setSpecial(route.special ?? null); };
    window.addEventListener('online', onlineHandler); window.addEventListener('offline', offlineHandler); window.addEventListener('beforeinstallprompt', installHandler); window.addEventListener('hashchange', hashHandler);
    return () => { window.removeEventListener('online', onlineHandler); window.removeEventListener('offline', offlineHandler); window.removeEventListener('beforeinstallprompt', installHandler); window.removeEventListener('hashchange', hashHandler); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4200); return () => window.clearTimeout(timer); }, [toast]);

  function navigate(nextPage: Page, nextTab?: ExploreTab) {
    setPage(nextPage); setSpecial(null); setMobileMenuOpen(false);
    if (nextPage === 'explore' && nextTab) setExploreTab(nextTab);
    const suffix = nextPage === 'explore' && nextTab ? `explore/${nextTab}` : nextPage;
    if (window.location.hash !== `#${suffix}`) window.history.pushState({}, '', `#${suffix}`);
  }
  function openSupport() { setSpecial('support'); setMobileMenuOpen(false); window.history.pushState({}, '', '#support'); }
  function openAdmin() { if (app.profile.role !== 'administrator') { setToast('Administrator access is required.'); return; } setSpecial('admin'); window.history.pushState({}, '', '#admin'); }
  function backFromSpecial() { setSpecial(null); setPage('profile'); window.history.pushState({}, '', '#profile'); }
  async function installApp() { if (!installEvent) { setInstallHelpOpen(true); return; } await installEvent.prompt(); const choice = await installEvent.userChoice; if (choice.outcome === 'accepted') setToast('CAMPORA is being added to your device.'); setInstallEvent(null); }
  async function safeAction<T>(action: () => Promise<T>): Promise<T> { try { return await action(); } catch (error) { setToast(error instanceof Error ? error.message : 'That action could not be completed.'); throw error; } }
  function runSearch(e: FormEvent) { e.preventDefault(); if (!query.trim()) return; setSearchOpen(true); }
  function openResult(item: SearchResult) { navigate(item.page, item.tab); setSearchOpen(false); setQuery(''); }

  const activeNav = special ? 'profile' : page;
  const welcome = app.profile.full_name?.trim().split(' ')[0] || 'Student';

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup" onClick={() => navigate('home')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate('home')}><div className="brand-mark"><img src="/campora-icon.svg" alt="" /></div><div><b>CAMPORA</b><small>YOUR CAMPUS. CONNECTED.</small></div><button className="mobile-close icon-button" onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); }} aria-label="Close menu"><X size={18} /></button></div>
      <div className="sidebar-section-label">YOUR CAMPUS</div>
      <nav className="side-nav" aria-label="Main navigation">{navigation.map(({ page: navPage, label, icon: Icon, key }) => <button key={navPage} className={`nav-item ${activeNav === navPage && !special ? 'active' : ''}`} onClick={() => navigate(navPage)}><span className="nav-icon"><Icon size={18} /></span><span>{label}</span><span className="nav-key">{key}</span></button>)}</nav>
      <button className={`sidebar-support ${special === 'support' ? 'active' : ''}`} onClick={openSupport}><CircleHelp size={17} /><span>Help & support</span><ArrowUpRight size={14} /></button>
      {app.profile.role === 'administrator' && <button className={`sidebar-support admin-shortcut ${special === 'admin' ? 'active' : ''}`} onClick={openAdmin}><Shield size={17} /><span>Administration</span><ArrowUpRight size={14} /></button>}
      <div className="sidebar-bottom"><div className="sidebar-campus-card"><span className="campus-orbit"><Sparkles size={16} /></span><div><b>Built for campus life</b><small>Designed for students, together.</small></div></div><button className="install-link" onClick={() => void installApp()}><ArrowDown size={15} />{installEvent ? 'Install CAMPORA' : 'Add to your home screen'}</button><div className="sidebar-footer"><span>© {APP_YEAR} CAMPORA</span><a href="mailto:israellawal323@gmail.com">Support</a></div></div>
    </aside>

    <div className="app-main">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="breadcrumb"><span>Campus</span><ChevronRight size={13} /><b>{special === 'support' ? 'Help & support' : special === 'admin' ? 'Administration' : navigation.find((item) => item.page === page)?.label}</b></div></div><form className="global-search" onSubmit={runSearch}><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search CAMPORA…" aria-label="Search CAMPORA" /><kbd>↵</kbd><button type="submit" aria-label="Search"><ArrowUpRight size={15} /></button></form><div className="topbar-actions"><div className={`network-status ${online ? 'online' : 'offline'}`}><span className="network-dot" />{online ? 'Online' : 'Offline'}</div><button className="icon-button notification-button" onClick={() => setToast('No new notifications yet.')} aria-label="Notifications"><Bell size={17} /><i /></button>{app.authenticated ? <button className="user-chip" onClick={() => navigate('profile')}><span className="avatar avatar-small">{app.profile.full_name?.slice(0,1) || 'S'}</span><span>{welcome}</span></button> : <button className="top-signin" onClick={() => navigate('profile')}><LogIn size={14} />Sign in</button>}</div></header>

      {!online && <div className="offline-banner"><WifiOff size={15} /><span>You’re offline. CAMPORA’s app shell is available; uploads and database actions need a connection.</span></div>}
      {app.syncError && <div className="sync-banner" role="alert"><Activity size={15} /><span>{app.syncError}</span><button onClick={() => void app.refresh()}>Retry sync</button></div>}

      <main className="main-content">
        {app.loading && <div className="loading-screen"><div className="loading-logo"><img src="/campora-icon.svg" alt="" /></div><div className="skeleton-line skeleton-wide" /><div className="skeleton-line" /><div className="skeleton-grid"><span /><span /><span /></div><p>Connecting to your campus space…</p></div>}
        {!app.loading && !special && page === 'home' && <Home data={app.data} profile={app.profile} demo={app.demo} onNavigate={navigate} onSupport={openSupport} />}
        {!app.loading && !special && page === 'academics' && <Academics resources={app.data.resources} demo={app.demo} onCreate={(draft) => safeAction(() => app.createResource(draft))} onReport={(type, id, reason) => safeAction(() => app.createReport(type, id, reason))} onToast={setToast} />}
        {!app.loading && !special && page === 'explore' && <Explore tab={exploreTab} onTab={setExploreTab} locations={app.data.locations} opportunities={app.data.opportunities} lostFound={app.data.lostFound} listings={app.data.listings} demo={app.demo} onCreate={(kind, draft) => safeAction(() => app.createExploreItem(kind, draft))} onReport={(type, id, reason) => safeAction(() => app.createReport(type, id, reason))} onContact={(kind, id, message) => safeAction(() => app.contactRequest(kind, id, message))} onToast={setToast} />}
        {!app.loading && !special && page === 'community' && <Community posts={app.data.posts} comments={app.data.comments} profile={app.profile} demo={app.demo} onCreate={(body) => safeAction(() => app.createPost(body))} onComment={(id, body) => safeAction(() => app.createComment(id, body))} onReact={(id) => safeAction(() => app.react(id))} onReport={(type, id, reason) => safeAction(() => app.createReport(type, id, reason))} onToast={setToast} />}
        {!app.loading && !special && page === 'profile' && <ProfilePage key={app.recoveryMode ? 'recovery' : 'normal'} profile={app.profile} authenticated={app.authenticated} configured={app.configured} demo={app.demo} recoveryMode={app.recoveryMode} onSave={(profile) => safeAction(() => app.saveProfile(profile))} onAuth={(mode, values) => safeAction(() => app.authenticate(mode, values))} onGoogleAuth={() => safeAction(() => app.signInWithGoogle())} onForgot={(email) => safeAction(() => app.forgotPassword(email))} onResetPassword={(password) => safeAction(() => app.resetPassword(password))} onLogout={() => safeAction(() => app.logout())} onSupport={openSupport} onAdmin={openAdmin} />}
        {!app.loading && special === 'support' && <SupportCenter tickets={app.data.tickets} replies={app.data.supportReplies} feedback={app.data.feedback} demo={app.demo} authenticated={app.authenticated} onBack={backFromSpecial} onCreateTicket={(draft) => safeAction(() => app.createSupportTicket(draft))} onCloseTicket={(id) => safeAction(() => app.closeTicket(id))} onFeedback={(draft) => safeAction(() => app.submitFeedback(draft))} onToast={setToast} />}
        {!app.loading && special === 'admin' && app.profile.role === 'administrator' && <AdminDashboard onBack={backFromSpecial} onLoad={() => app.loadAdminSnapshot()} onReview={(kind, id, approved) => safeAction(() => app.adminReview(kind, id, approved))} onPublishAnnouncement={(draft) => safeAction(() => app.adminPublishAnnouncement(draft))} onAddLocation={(draft) => safeAction(() => app.adminAddLocation(draft))} onAddFaculty={(name) => safeAction(() => app.adminAddFaculty(name))} onAddDepartment={(draft) => safeAction(() => app.adminAddDepartment(draft))} onPublishOpportunity={(draft) => safeAction(() => app.adminPublishOpportunity(draft))} onReplyTicket={(ticketId, message, status) => safeAction(() => app.adminReplyTicket(ticketId, message, status))} onSetRole={(id, role) => safeAction(() => app.adminSetRole(id, role))} onSetActive={(id, active) => safeAction(() => app.adminSetActive(id, active))} onResolveReport={(id, status, notes) => safeAction(() => app.adminResolveReport(id, status, notes))} onToast={setToast} />}
        {!app.loading && special === 'admin' && app.profile.role !== 'administrator' && <div className="access-denied"><Shield size={25} /><h2>Administrator access required</h2><p>Administrative tasks are protected by both the app and database policies.</p><button className="small-link" onClick={backFromSpecial}>Return to your profile <ArrowUpRight size={14} /></button></div>}
      </main>
      <footer className="main-footer"><span>Built by <b>Saitama Tech</b></span><span className="footer-dot">·</span><a href="mailto:israellawal323@gmail.com">Support <ArrowUpRight size={12} /></a><span className="footer-dot">·</span><a href="https://github.com/SaitamaTech" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={12} /></a><span className="footer-right">CAMPORA · Your Campus. Your Community. Your World.</span></footer>
    </div>

    <nav className="mobile-tabbar" aria-label="Mobile navigation">{navigation.map(({ page: navPage, label, icon: Icon }) => <button key={navPage} className={activeNav === navPage && !special ? 'active' : ''} onClick={() => navigate(navPage)}><Icon size={19} /><span>{label}</span></button>)}</nav>
    {toast && <div className="toast" role="status"><span className="toast-icon"><Check size={14} /></span><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
    {searchOpen && <Modal title={`Search results${query.trim() ? ` for “${query.trim()}”` : ''}`} onClose={() => setSearchOpen(false)} wide><div className="search-results">{results.length ? results.map((result, index) => { const Icon = result.icon; return <button key={`${result.title}-${index}`} className="search-result" onClick={() => openResult(result)}><span className="search-result-icon"><Icon size={16} /></span><span><b>{result.title}</b><small>{result.detail}</small></span><ArrowUpRight size={15} /></button>; }) : <div className="search-empty"><Search size={20} /><b>No results found</b><span>Try a course code, campus place or a different keyword.</span></div>}</div></Modal>}
    {installHelpOpen && <Modal title="Install CAMPORA" onClose={() => setInstallHelpOpen(false)}><div className="install-help"><div className="install-help-icon"><Wifi size={20} /></div><p>Install CAMPORA from your browser menu to add it to your home screen. On iPhone or iPad, choose <b>Share → Add to Home Screen</b>. On Android, choose <b>Install app</b> or <b>Add to Home screen</b>.</p><p>The offline app shell is available after the first visit. Database submissions still need an internet connection.</p><button className="button button-primary" onClick={() => setInstallHelpOpen(false)}>Got it</button></div></Modal>}
  </div>;
}

function parseHash(hash: string): { page: Page; tab?: ExploreTab; special?: 'support' | 'admin' } {
  const parts = hash.replace(/^#/, '').split('/');
  if (parts[0] === 'support') return { page: 'profile', special: 'support' };
  if (parts[0] === 'admin') return { page: 'profile', special: 'admin' };
  const page: Page = ['academics','explore','community','profile','home'].includes(parts[0]) ? parts[0] as Page : 'home';
  const tab = ['campus','opportunities','lost-found','marketplace'].includes(parts[1]) ? parts[1] as ExploreTab : undefined;
  return { page, tab };
}
function searchData(data: ReturnType<typeof useCampora>['data'], query: string): SearchResult[] {
  const q = query.trim().toLowerCase(); if (q.length < 2) return [];
  const results: SearchResult[] = [];
  data.announcements.forEach((item) => { if (matches(q, item.title, item.body, item.category)) results.push({ title: item.title, detail: `${item.category} · ${item.officially_verified ? 'Officially verified' : 'Community update'}`, page: 'home', icon: Bell }); });
  data.resources.forEach((item) => { if (matches(q, item.title, item.course_code, item.department, item.faculty)) results.push({ title: item.title, detail: `${item.course_code || 'Study resource'} · ${item.department || 'Academic library'}`, page: 'academics', icon: BookOpen }); });
  data.locations.forEach((item) => { if (matches(q, item.name, item.kind, item.description)) results.push({ title: item.name, detail: `Campus guide · ${item.kind}`, page: 'explore', tab: 'campus', icon: Compass }); });
  data.opportunities.forEach((item) => { if (matches(q, item.title, item.description, item.category)) results.push({ title: item.title, detail: `Opportunity · ${item.category}`, page: 'explore', tab: 'opportunities', icon: Sparkles }); });
  data.lostFound.forEach((item) => { if (matches(q, item.title, item.description, item.location_text)) results.push({ title: item.title, detail: `${item.item_type} item · Lost & found`, page: 'explore', tab: 'lost-found', icon: Compass }); });
  data.listings.forEach((item) => { if (matches(q, item.title, item.description, item.category)) results.push({ title: item.title, detail: `${item.category} · Marketplace`, page: 'explore', tab: 'marketplace', icon: Users }); });
  data.posts.forEach((item) => { if (matches(q, item.body, item.author_name, item.department)) results.push({ title: item.body.slice(0, 90), detail: `Community · ${item.author_name}`, page: 'community', icon: Users }); });
  return results.slice(0, 16);
}
function matches(query: string, ...values: (string | undefined)[]) { return values.some((value) => value?.toLowerCase().includes(query)); }

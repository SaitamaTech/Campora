import { ArrowUpRight, BookOpen, CalendarDays, Compass, GraduationCap, MapPin, Megaphone, Plus, ShieldCheck, ShoppingBag, Sparkles, Users, CircleHelp } from 'lucide-react';
import type { CamporaData, ExploreTab, Page, Profile } from '../lib/types';
import { EmptyState, SectionTitle, Tag } from './ui';

export function Home({ data, profile, demo, onNavigate, onSupport }: { data: CamporaData; profile: Profile; demo: boolean; onNavigate: (page: Page, tab?: ExploreTab) => void; onSupport: () => void }) {
  const greetingName = profile.full_name?.trim().split(' ')[0] || 'student';
  const shortcuts = [
    { title: 'Study library', caption: 'Find class materials', icon: BookOpen, page: 'academics' as Page, color: 'peach' },
    { title: 'Campus guide', caption: 'Explore verified places', icon: MapPin, page: 'explore' as Page, color: 'lilac' },
    { title: 'Student community', caption: 'Join the conversation', icon: Users, page: 'community' as Page, color: 'mint' },
    { title: 'Student marketplace', caption: 'Buy and sell safely', icon: ShoppingBag, page: 'explore' as Page, tab: 'marketplace' as ExploreTab, color: 'gold' },
  ];

  return <div className="page-stack">
    {demo && <div className="preview-banner"><Sparkles size={14} /><span><strong>Preview workspace</strong> · example content is clearly labeled and is not official university information.</span><Tag tone="accent">DEMO</Tag></div>}
    <section className="hero-card">
      <div className="hero-copy">
        <div className="hero-kicker"><span className="live-dot" /> YOUR CAMPUS, IN ONE PLACE</div>
        <h1>Your campus.<br /><span>Your community.</span></h1>
        <p>Good to see you, {greetingName}. Find the resources, people and opportunities that move campus life forward.</p>
        <div className="hero-actions"><button className="button button-primary" onClick={() => onNavigate('academics')}>Explore academics <ArrowUpRight size={16} /></button><button className="button button-light" onClick={() => onNavigate('community')}>Meet your community</button></div>
        <div className="hero-proof"><div className="proof-icon"><ShieldCheck size={16} /></div><span>Student-powered · Built for University of Ilesa</span></div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <div className="hero-orb"><div className="orb-core"><span>C</span></div><div className="orb-ring" /></div>
        <div className="float-chip chip-update"><span className="chip-icon"><Megaphone size={15} /></span><div><b>One campus pulse</b><small>Updates, all together</small></div></div>
        <div className="float-chip chip-learn"><span className="chip-icon chip-orange"><GraduationCap size={16} /></span><div><b>Learn in community</b><small>Resources for every level</small></div></div>
        <div className="sparkle-mark sparkle-a">✳</div><div className="sparkle-mark sparkle-b">✦</div>
      </div>
      <div className="hero-glow" />
    </section>

    <div className="metrics-row">
      <div className="metric-card"><span className="metric-icon metric-orange"><Megaphone size={17} /></span><div><strong>{data.announcements.length}</strong><span>Campus updates</span></div><span className="metric-note">latest</span></div>
      <div className="metric-card"><span className="metric-icon metric-blue"><BookOpen size={17} /></span><div><strong>{data.resources.filter((item) => item.status === 'approved').length}</strong><span>Study resources</span></div><span className="metric-note">library</span></div>
      <div className="metric-card"><span className="metric-icon metric-green"><Compass size={17} /></span><div><strong>{data.opportunities.filter((item) => item.verification_status !== 'expired').length}</strong><span>Opportunities</span></div><span className="metric-note">open now</span></div>
      <div className="metric-card"><span className="metric-icon metric-purple"><Users size={17} /></span><div><strong>{data.posts.length}</strong><span>Community posts</span></div><span className="metric-note">this space</span></div>
    </div>

    <section className="section-block">
      <SectionTitle eyebrow="MAKE IT YOURS" title="Your campus shortcuts" action={<button className="text-action" onClick={() => onNavigate('explore')}>Explore all <ArrowUpRight size={15} /></button>} />
      <div className="shortcut-grid">{shortcuts.map(({ title, caption, icon: Icon, page, tab, color }) => <button key={title} className="shortcut-card" onClick={() => onNavigate(page, tab)}><span className={`shortcut-icon icon-${color}`}><Icon size={19} /></span><span className="shortcut-copy"><strong>{title}</strong><small>{caption}</small></span><ArrowUpRight className="shortcut-arrow" size={16} /></button>)}</div>
    </section>

    <div className="home-columns">
      <section className="panel updates-panel">
        <SectionTitle eyebrow="THE NOTICEBOARD" title="News & updates" action={<button className="small-link" onClick={() => onNavigate('explore', 'news')}>View all <ArrowUpRight size={14} /></button>} />
        {data.announcements.length ? <div className="notice-list">{data.announcements.slice(0, 3).map((item) => <article className="notice-item" key={item.id}><div className="notice-mark"><Megaphone size={16} /></div><div className="notice-content"><div className="notice-meta"><Tag tone={item.officially_verified ? 'success' : 'warning'}>{item.officially_verified ? 'Official' : item.sample ? 'Preview' : 'Admin update'}</Tag><span>{item.category}</span></div><h3>{item.title}</h3><p>{item.body}</p><small>{new Date(item.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small></div></article>)}</div> : <EmptyState title="Nothing on the noticeboard yet" text="News and campus updates will appear here when CAMPORA administrators publish them." icon={<Megaphone size={20} />} />}
      </section>
      <section className="panel events-panel">
        <SectionTitle eyebrow="ON THE HORIZON" title="Upcoming events" action={<span className="muted-label"><CalendarDays size={14} /> Campus calendar</span>} />
        <EmptyState title="A space for what's next" text="Upcoming events will appear here once verified details are added." icon={<CalendarDays size={20} />} />
        <button className="calendar-cta" onClick={onSupport}><span className="calendar-cta-icon"><Plus size={17} /></span><span><b>Know about an event?</b><small>Help the community by sharing feedback.</small></span><ArrowUpRight size={15} /></button>
      </section>
    </div>

    <section className="section-block">
      <SectionTitle eyebrow="YOUR NEXT STEP" title="Room to grow" action={<button className="text-action" onClick={() => onNavigate('profile')}>Set up your profile <ArrowUpRight size={15} /></button>} />
      <div className="feature-strip">
        <div className="feature-main"><div className="feature-symbol"><GraduationCap size={20} /></div><div><Tag tone="accent">MADE FOR STUDENTS</Tag><h3>Good opportunities deserve to be found.</h3><p>Discover scholarships, internships and programmes in one trusted hub. Every listing shows its source and verification status.</p><button className="small-link" onClick={() => onNavigate('explore')}>Browse opportunities <ArrowUpRight size={14} /></button></div></div>
        <div className="feature-side"><div className="feature-rings" /><Sparkles className="feature-sparkle" size={20} /><div className="feature-side-copy"><span>OPEN KNOWLEDGE</span><strong>Share what<br />you learn.</strong><button onClick={() => onNavigate('academics')}>Add a resource <ArrowUpRight size={14} /></button></div></div>
      </div>
    </section>

    <div className="home-footer-note"><CircleHelp size={15} /><span>Need a hand? Our support team is one tap away.</span><button onClick={onSupport}>Help & support <ArrowUpRight size={14} /></button></div>
  </div>;
}

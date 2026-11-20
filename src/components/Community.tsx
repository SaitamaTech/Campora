import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Flag, Heart, LogIn, MessageCircle, Search, Send, Users } from 'lucide-react';
import type { CommunityComment, CommunityPost, Profile, PublicStudentProfile } from '../lib/types';
import { Button, EmptyState, Modal, SectionTitle, Tag } from './ui';

const feelings = ['Happy', 'Grateful', 'Excited', 'Motivated', 'Curious', 'Hopeful', 'Tired', 'Stressed', 'Anxious', 'Sad', 'Frustrated'];

export function Community({ posts, comments, profile, publicProfiles, demo, authenticated, onSignIn, onCreate, onComment, onReact, onReport, onViewProfile, onToast }: {
  posts: CommunityPost[]; comments: CommunityComment[]; profile: Profile; publicProfiles: PublicStudentProfile[]; demo: boolean; authenticated: boolean;
  onSignIn: () => void;
  onCreate: (body: string, feeling?: string) => Promise<void>; onComment: (postId: string, body: string) => Promise<void>; onReact: (postId: string) => Promise<void>;
  onReport: (type: string, id: string, reason: string) => Promise<void>; onViewProfile: (profileId: string) => void; onToast: (message: string) => void;
}) {
  const [body, setBody] = useState('');
  const [feeling, setFeeling] = useState('');
  const [filter, setFilter] = useState('All posts');
  const [replyPost, setReplyPost] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [reportPost, setReportPost] = useState<CommunityPost | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [reactingPosts, setReactingPosts] = useState<Set<string>>(() => new Set());
  const reactionLock = useRef(new Set<string>());
  const sorted = useMemo(() => [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).filter((post) => filter === 'All posts' || (filter === 'My department' && profile.department && post.department === profile.department)), [posts, filter, profile.department]);
  const matchingProfiles = useMemo(() => {
    const q = directoryQuery.trim().toLowerCase();
    return publicProfiles.filter((student) => !q || [student.full_name, student.username, student.faculty, student.department].some((item) => item?.toLowerCase().includes(q)));
  }, [publicProfiles, directoryQuery]);

  async function createPost(e: FormEvent) { e.preventDefault(); if (!body.trim()) return; setBusy(true); try { await onCreate(body.trim(), feeling || undefined); setBody(''); setFeeling(''); onToast(demo ? 'Post added to your preview feed.' : 'Your post is now in the community feed.'); } catch (error) { onToast(error instanceof Error ? error.message : 'Could not publish your post.'); } finally { setBusy(false); } }
  async function createReply(e: FormEvent) { e.preventDefault(); if (!replyPost || !replyDraft.trim()) return; setBusy(true); try { await onComment(replyPost, replyDraft.trim()); setReplyDraft(''); onToast('Reply posted.'); } catch (error) { onToast(error instanceof Error ? error.message : 'Could not post your reply.'); } finally { setBusy(false); } }
  async function submitReport(e: FormEvent) { e.preventDefault(); if (!reportPost || !reportReason.trim()) return; try { await onReport('community_post', reportPost.id, reportReason.trim()); setReportPost(null); setReportReason(''); onToast('Report sent to moderators.'); } catch (error) { onToast(error instanceof Error ? error.message : 'Could not send the report.'); } }
  async function toggleReaction(postId: string) {
    if (reactionLock.current.has(postId)) return;
    reactionLock.current.add(postId);
    setReactingPosts((current) => new Set(current).add(postId));
    try { await onReact(postId); }
    catch (error) { onToast(error instanceof Error ? error.message : 'Could not update your reaction.'); }
    finally {
      reactionLock.current.delete(postId);
      setReactingPosts((current) => { const next = new Set(current); next.delete(postId); return next; });
    }
  }
  function viewProfile(id: string) { setDirectoryOpen(false); onViewProfile(id); }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">BETTER, TOGETHER</p><h1>Community</h1><p>Share what’s on your mind, support classmates and meet students across campus.</p></div><div className="community-member-mark"><Users size={18} /><span>Student space</span></div></div>
    {demo && <div className="inline-note"><span className="note-dot" /> Preview mode: posts and replies are stored on this device, not shared with a live student community.</div>}
    <div className="community-layout">
      <section className="community-main">
        <form className="compose-card" onSubmit={createPost}>
          <div className="compose-heading"><span className="avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" aria-hidden="true" /> : profile.full_name?.slice(0, 1) || 'S'}</span><div><strong>What’s on your mind?</strong><small>Text-only posts keep the community fast and lightweight.</small></div></div>
          {!demo && !authenticated ? <div className="form-note community-signin-note"><span>Sign in to publish posts and replies to the student community.</span><Button type="button" variant="secondary" onClick={onSignIn}><LogIn size={14} /> Sign in</Button></div> : <>
            <textarea value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} placeholder="Share an update, ask a question or tell your campus how you’re feeling…" rows={3} aria-label="Write a post" />
            <div className="compose-footer"><span>{body.length}/1000</span><label className="feeling-select"><span>Feeling</span><select value={feeling} onChange={(e) => setFeeling(e.target.value)} aria-label="Add a feeling to your post"><option value="">Add a feeling</option>{feelings.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><Button type="submit" disabled={!body.trim() || busy}><Send size={14} />{busy ? 'Posting…' : 'Post'}</Button></div>
            <p className="text-only-note">No image uploads in posts or replies. Profile photos stay separate.</p>
          </>}
        </form>
        <div className="feed-heading"><SectionTitle eyebrow="STUDENT VOICES" title={`${filter === 'My department' ? 'Department' : 'Community'} feed`} /><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter community feed"><option>All posts</option>{profile.department && <option>My department</option>}</select></div>
        {sorted.length ? <div className="feed-list">{sorted.map((post) => {
          const postReplies = comments.filter((comment) => comment.post_id === post.id);
          const open = replyPost === post.id;
          return <article className="post-card" key={post.id}>
            <div className="post-head"><span className="avatar">{post.author_name?.slice(0, 1) || 'S'}</span><div className="post-byline">{post.author_id && post.author_public ? <button className="profile-name-link" onClick={() => viewProfile(post.author_id!)}>{post.author_name || 'Community member'}</button> : <strong>{post.author_name || 'Community member'}</strong>}<span>{post.department || 'Student community'} · {timeAgo(post.created_at)}</span></div><button className="icon-button" onClick={() => setReportPost(post)} aria-label="Report this post"><Flag size={15} /></button></div>
            {post.sample && <Tag tone="accent">Preview example</Tag>}{post.feeling && <span className="feeling-pill">Feeling {post.feeling.toLowerCase()}</span>}
            <p className="post-body">{post.body}</p>
            <div className="post-actions"><button onClick={() => void toggleReaction(post.id)} disabled={reactingPosts.has(post.id)} aria-label="React to post" aria-busy={reactingPosts.has(post.id)}><Heart size={16} />{post.reactions || 0} <span>Helpful</span></button><button onClick={() => { setReplyPost(open ? null : post.id); setReplyDraft(''); }} aria-expanded={open}><MessageCircle size={16} />{post.comments || postReplies.length} <span>Replies</span></button></div>
            {open && <div className="post-comments"><div className="comments-list">{postReplies.length ? postReplies.map((reply) => <div className="comment-row" key={reply.id}><span className="avatar avatar-small">{reply.author_name?.slice(0, 1) || 'S'}</span><p>{reply.author_id && reply.author_public ? <button className="profile-name-link" onClick={() => viewProfile(reply.author_id!)}>{reply.author_name || 'Community member'}</button> : <b>{reply.author_name || 'Community member'}</b>}<span>{reply.body}</span><small>{timeAgo(reply.created_at)}</small></p></div>) : <p className="comment-empty">No replies yet. Start a constructive conversation.</p>}</div><form className="comment-form" onSubmit={createReply}><input value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} maxLength={500} placeholder="Write a thoughtful reply…" aria-label="Write a reply" /><button className="icon-button comment-send" type="submit" disabled={busy || !replyDraft.trim()} aria-label="Send reply"><Send size={15} /></button></form></div>}
          </article>;
        })}</div> : <EmptyState title="The conversation starts with you" text="Share a question, a useful tip or an idea to help the student community grow." icon={<MessageCircle size={20} />} />}
      </section>
      <aside className="community-aside"><div className="community-aside-card"><span className="aside-icon"><Users size={18} /></span><p className="eyebrow">COMMUNITY GUIDELINES</p><h3>A good campus starts with respect.</h3><ul><li>Be kind and constructive.</li><li>Keep personal and student ID details private.</li><li>Share information responsibly.</li><li>Posts and replies are text-only.</li><li>Report content that feels unsafe.</li></ul><button className="small-link" onClick={() => onToast('Community guidelines: keep posts kind, useful, text-only, and privacy-conscious.')}>Read guidelines <ArrowUpRight size={14} /></button></div><div className="community-aside-card directory-card"><span className="eyebrow">STUDENT DIRECTORY</span><h3>Meet your campus community.</h3><p>Browse public student profiles. Only display names and campus details are shown.</p>{publicProfiles.slice(0, 4).map((student) => <button className="directory-student" key={student.id} onClick={() => viewProfile(student.id)}><span className="avatar avatar-small">{student.full_name.slice(0, 1)}</span><span><b>{student.full_name}</b><small>{student.department || student.faculty || 'Student'}</small></span><ArrowUpRight size={14} /></button>)}<button className="small-link" onClick={() => setDirectoryOpen(true)}>Browse students <ArrowUpRight size={14} /></button></div><div className="community-aside-card quiet-card"><span className="eyebrow">NEED HELP?</span><p>Issues with a post or your account? Our support team can help.</p><button className="small-link" onClick={() => onToast('Open Help & support from your Profile tab.')}>Go to support <ArrowUpRight size={14} /></button></div></aside>
    </div>
    {directoryOpen && <Modal title="Student directory" onClose={() => setDirectoryOpen(false)}><div className="student-directory"><label className="search-field"><Search size={16} /><input value={directoryQuery} onChange={(e) => setDirectoryQuery(e.target.value)} placeholder="Search name, faculty or department" aria-label="Search students" /></label>{matchingProfiles.length ? matchingProfiles.map((student) => <button className="directory-student directory-student-modal" key={student.id} onClick={() => viewProfile(student.id)}><span className="avatar">{student.full_name.slice(0, 1)}</span><span><b>{student.full_name}</b><small>{[student.department, student.faculty, student.level].filter(Boolean).join(' · ') || 'Student'}</small></span><ArrowUpRight size={15} /></button>) : <p className="comment-empty">No public profiles match that search.</p>}</div></Modal>}
    {reportPost && <Modal title="Report community content" onClose={() => setReportPost(null)}><form className="form-stack" onSubmit={submitReport}><p className="form-intro">Tell the moderators what to review in this post.</p><label>Reason<textarea required minLength={5} rows={4} value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="Describe the concern" /></label><div className="form-actions"><Button variant="secondary" onClick={() => setReportPost(null)}>Cancel</Button><Button type="submit">Send report</Button></div></form></Modal>}
  </div>;
}

function timeAgo(date: string) { const mins = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000)); if (mins < 1) return 'Just now'; if (mins < 60) return `${mins}m ago`; const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h ago`; return `${Math.floor(hours / 24)}d ago`; }

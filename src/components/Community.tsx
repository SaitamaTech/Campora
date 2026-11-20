import { useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, Flag, Heart, MessageCircle, Send, Users } from 'lucide-react';
import type { CommunityComment, CommunityPost, Profile } from '../lib/types';
import { Button, EmptyState, Modal, SectionTitle, Tag } from './ui';

export function Community({ posts, comments, profile, demo, onCreate, onComment, onReact, onReport, onToast }: {
  posts: CommunityPost[]; comments: CommunityComment[]; profile: Profile; demo: boolean;
  onCreate: (body: string) => Promise<void>; onComment: (postId: string, body: string) => Promise<void>; onReact: (postId: string) => Promise<void>;
  onReport: (type: string, id: string, reason: string) => Promise<void>; onToast: (message: string) => void;
}) {
  const [body, setBody] = useState('');
  const [filter, setFilter] = useState('All posts');
  const [commentPost, setCommentPost] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [reportPost, setReportPost] = useState<CommunityPost | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(() => [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).filter((post) => filter === 'All posts' || (filter === 'My department' && profile.department && post.department === profile.department)), [posts, filter, profile.department]);

  async function createPost(e: FormEvent) { e.preventDefault(); if (!body.trim()) return; setBusy(true); try { await onCreate(body.trim()); setBody(''); onToast(demo ? 'Post added to your preview feed.' : 'Your post is now in the community feed.'); } catch (error) { onToast(error instanceof Error ? error.message : 'Could not publish your post.'); } finally { setBusy(false); } }
  async function createComment(e: FormEvent) { e.preventDefault(); if (!commentPost || !commentDraft.trim()) return; setBusy(true); try { await onComment(commentPost, commentDraft.trim()); setCommentDraft(''); onToast('Comment posted.'); } catch (error) { onToast(error instanceof Error ? error.message : 'Could not post your comment.'); } finally { setBusy(false); } }
  async function submitReport(e: FormEvent) { e.preventDefault(); if (!reportPost || !reportReason.trim()) return; await onReport('community_post', reportPost.id, reportReason.trim()); setReportPost(null); setReportReason(''); onToast('Report sent to moderators.'); }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">BETTER, TOGETHER</p><h1>Community</h1><p>Share useful ideas, ask questions and make your campus feel a little smaller.</p></div><div className="community-member-mark"><Users size={18} /><span>Student space</span></div></div>
    {demo && <div className="inline-note"><span className="note-dot" /> Preview mode: posts and comments are stored on this device, not shared with a live student community.</div>}
    <div className="community-layout">
      <section className="community-main">
        <form className="compose-card" onSubmit={createPost}><div className="compose-heading"><span className="avatar">{profile.full_name?.slice(0, 1) || 'S'}</span><div><strong>Start a thoughtful conversation</strong><small>Keep it kind. Keep it useful.</small></div></div><textarea value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} placeholder="What would you like to share with your campus community?" rows={3} aria-label="Write a post" /><div className="compose-footer"><span>{body.length}/1000</span><Button type="submit" disabled={!body.trim() || busy}><Send size={14} />{busy ? 'Posting…' : 'Post to community'}</Button></div></form>
        <div className="feed-heading"><SectionTitle eyebrow="STUDENT VOICES" title="Community feed" /><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter community feed"><option>All posts</option>{profile.department && <option>My department</option>}</select></div>
        {sorted.length ? <div className="feed-list">{sorted.map((post) => {
          const postComments = comments.filter((comment) => comment.post_id === post.id);
          const open = commentPost === post.id;
          return <article className="post-card" key={post.id}><div className="post-head"><span className="avatar">{post.author_name?.slice(0, 1) || 'S'}</span><div className="post-byline"><strong>{post.author_name || 'Community member'}</strong><span>{post.department || 'Student community'} · {timeAgo(post.created_at)}</span></div><button className="icon-button" onClick={() => setReportPost(post)} aria-label="Report this post"><Flag size={15} /></button></div>{post.sample && <Tag tone="accent">Preview example</Tag>}<p className="post-body">{post.body}</p><div className="post-actions"><button onClick={() => onReact(post.id)} aria-label="React to post"><Heart size={16} />{post.reactions || 0} <span>Helpful</span></button><button onClick={() => setCommentPost(open ? null : post.id)} aria-expanded={open}><MessageCircle size={16} />{post.comments || postComments.length} <span>Comments</span></button></div>{open && <div className="post-comments"><div className="comments-list">{postComments.length ? postComments.map((comment) => <div className="comment-row" key={comment.id}><span className="avatar avatar-small">{comment.author_name?.slice(0, 1) || 'S'}</span><p><b>{comment.author_name || 'Community member'}</b><span>{comment.body}</span><small>{timeAgo(comment.created_at)}</small></p></div>) : <p className="comment-empty">No comments yet. Start a constructive conversation.</p>}</div><form className="comment-form" onSubmit={createComment}><input value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} maxLength={500} placeholder="Write a thoughtful reply…" aria-label="Write a comment" /><button className="icon-button comment-send" type="submit" disabled={busy || !commentDraft.trim()} aria-label="Send comment"><Send size={15} /></button></form></div>}</article>;
        })}</div> : <EmptyState title="The conversation starts with you" text="Share a question, a useful tip or an idea to help the student community grow." icon={<MessageCircle size={20} />} />}
      </section>
      <aside className="community-aside"><div className="community-aside-card"><span className="aside-icon"><Users size={18} /></span><p className="eyebrow">COMMUNITY GUIDELINES</p><h3>A good campus starts with respect.</h3><ul><li>Be kind and constructive.</li><li>Keep personal and student ID details private.</li><li>Share information responsibly.</li><li>Report content that feels unsafe.</li></ul><button className="small-link" onClick={() => onToast('Community guidelines: keep posts kind, useful, and privacy-conscious.')}>Read guidelines <ArrowUpRight size={14} /></button></div><div className="community-aside-card quiet-card"><span className="eyebrow">NEED HELP?</span><p>Issues with a post or your account? Our support team can help.</p><button className="small-link" onClick={() => onToast('Open Help & support from your Profile tab.')}>Go to support <ArrowUpRight size={14} /></button></div></aside>
    </div>
    {reportPost && <Modal title="Report community content" onClose={() => setReportPost(null)}><form className="form-stack" onSubmit={submitReport}><p className="form-intro">Tell the moderators what to review in this post.</p><label>Reason<textarea required minLength={5} rows={4} value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="Describe the concern" /></label><div className="form-actions"><Button variant="secondary" onClick={() => setReportPost(null)}>Cancel</Button><Button type="submit">Send report</Button></div></form></Modal>}
  </div>;
}

function timeAgo(date: string) { const mins = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000)); if (mins < 1) return 'Just now'; if (mins < 60) return `${mins}m ago`; const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h ago`; return `${Math.floor(hours / 24)}d ago`; }

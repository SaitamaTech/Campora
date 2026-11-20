import { useMemo, useState } from 'react';
import { CheckCircle2, Inbox, MessageSquareText, RefreshCw, Send } from 'lucide-react';
import type { SupportTicket } from '../lib/types';
import { Button, EmptyState, SectionTitle, Tag } from './ui';

type AdminFeedbackEntry = {
  id: string;
  feedback_type: string;
  message: string;
  is_anonymous: boolean;
  created_at: string;
};

type RequestStatusFilter = 'active' | 'all' | 'resolved';

export function AdminRequestsInbox({ tickets, feedback, onReplyTicket, onRefresh, onToast }: {
  tickets: SupportTicket[];
  feedback: AdminFeedbackEntry[];
  onReplyTicket: (ticketId: string, message: string, status: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onToast: (message: string) => void;
}) {
  const [tab, setTab] = useState<'requests' | 'feedback'>('requests');
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>('active');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const categories = useMemo(() => [...new Set(tickets.map((ticket) => ticket.category))].sort(), [tickets]);
  const activeCount = tickets.filter((ticket) => !['Closed', 'Resolved'].includes(ticket.status)).length;
  const visibleTickets = tickets.filter((ticket) => {
    const isResolved = ['Closed', 'Resolved'].includes(ticket.status);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'resolved' ? isResolved : !isResolved);
    return matchesStatus && (categoryFilter === 'all' || ticket.category === categoryFilter);
  });

  async function reply(ticket: SupportTicket) {
    const message = replyDrafts[ticket.id]?.trim();
    if (!message) return;
    setBusyId(ticket.id);
    setError('');
    try {
      await onReplyTicket(ticket.id, message, 'in_progress');
      setReplyDrafts((current) => ({ ...current, [ticket.id]: '' }));
      onToast('Support response sent.');
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your response.');
    } finally {
      setBusyId('');
    }
  }

  async function resolve(ticket: SupportTicket) {
    setBusyId(ticket.id);
    setError('');
    try {
      await onReplyTicket(ticket.id, '', 'resolved');
      onToast('Request marked resolved.');
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this request.');
    } finally {
      setBusyId('');
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return <div className="admin-requests-inbox">
    <div className="admin-inbox-heading">
      <div>
        <SectionTitle eyebrow="STUDENT SUPPORT" title="Requests & feedback" />
        <p>Support requests and student feedback submitted through CAMPORA arrive here for administrator review.</p>
      </div>
      <Button variant="secondary" onClick={() => void refresh()} disabled={refreshing}>
        <RefreshCw size={15} className={refreshing ? 'spin' : ''} />{refreshing ? 'Refreshing…' : 'Refresh inbox'}
      </Button>
    </div>

    {error && <div className="form-error admin-error" role="alert">{error}<button onClick={() => void refresh()}>Retry</button></div>}

    <div className="admin-inbox-tabs" role="tablist" aria-label="Administrator inbox">
      <button type="button" role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
        <MessageSquareText size={16} /><span>Support requests</span><b>{activeCount}</b>
      </button>
      <button type="button" role="tab" aria-selected={tab === 'feedback'} className={tab === 'feedback' ? 'active' : ''} onClick={() => setTab('feedback')}>
        <Inbox size={16} /><span>Student feedback</span><b>{feedback.length}</b>
      </button>
    </div>

    {tab === 'requests' && <>
      <div className="admin-inbox-filters">
        <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RequestStatusFilter)}>
          <option value="active">Open and in progress</option><option value="all">All requests</option><option value="resolved">Resolved and closed</option>
        </select></label>
        <label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select></label>
        <span>{visibleTickets.length} {visibleTickets.length === 1 ? 'request' : 'requests'}</span>
      </div>
      {visibleTickets.length ? <div className="ticket-list">{visibleTickets.map((ticket) => <article className="ticket-card admin-ticket" key={ticket.id}>
        <div className="admin-ticket-head"><div><span className="ticket-id">{ticket.reference}</span><h3>{ticket.subject}</h3><small>{ticket.category} · {new Date(ticket.created_at).toLocaleString()}</small></div><Tag tone={ticket.status === 'Resolved' || ticket.status === 'Closed' ? 'success' : ticket.status === 'In Progress' ? 'accent' : 'warning'}>{ticket.status}</Tag></div>
        <p className="admin-ticket-message">{ticket.message}</p>
        {!['Closed', 'Resolved'].includes(ticket.status) && <div className="admin-reply-form"><label className="admin-inbox-reply-label" htmlFor={`reply-${ticket.id}`}>Reply to this request</label><textarea id={`reply-${ticket.id}`} rows={3} value={replyDrafts[ticket.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="Write a helpful response…" /><div><Button variant="secondary" disabled={busyId === ticket.id} onClick={() => void resolve(ticket)}><CheckCircle2 size={14} />Mark resolved</Button><Button disabled={busyId === ticket.id || !replyDrafts[ticket.id]?.trim()} onClick={() => void reply(ticket)}><Send size={14} />Send response</Button></div></div>}
      </article>)}</div> : <EmptyState title={statusFilter === 'active' ? 'No open support requests' : 'No matching support requests'} text={statusFilter === 'active' ? 'New student requests will appear here as soon as they are submitted.' : 'Try a different status or category filter.'} icon={<MessageSquareText size={20} />} />}
    </>}

    {tab === 'feedback' && (feedback.length ? <div className="admin-feedback-list">{feedback.map((item) => <article className="admin-feedback-card" key={item.id}>
      <div className="admin-feedback-card-head"><Tag tone="accent">{item.feedback_type.replaceAll('_', ' ')}</Tag><time>{new Date(item.created_at).toLocaleString()}</time></div>
      <p>{item.message}</p><small>{item.is_anonymous ? 'Submitted anonymously' : 'Submitted by a registered student'}</small>
    </article>)}</div> : <EmptyState title="No feedback yet" text="Student feedback submitted through Help & support will appear here." icon={<Inbox size={20} />} />)}
  </div>;
}

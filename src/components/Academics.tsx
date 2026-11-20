import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, FileImage, FilePlus2, FileText, Flag, GraduationCap, Search, UploadCloud } from 'lucide-react';
import type { Resource } from '../lib/types';
import { Button, EmptyState, Modal, SectionTitle, Tag } from './ui';

type Draft = { title: string; course_code: string; faculty: string; department: string; level: string; file?: File };
const emptyDraft = (): Draft => ({ title: '', course_code: '', faculty: '', department: '', level: '' });
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/jpeg', 'image/png', 'image/webp'];

export function Academics({ resources, demo, onCreate, onReport, onToast }: { resources: Resource[]; demo: boolean; onCreate: (draft: Draft) => Promise<void>; onReport: (type: string, id: string, reason: string) => Promise<void>; onToast: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [faculty, setFaculty] = useState('All faculties');
  const [department, setDepartment] = useState('All departments');
  const [level, setLevel] = useState('All levels');
  const [showUpload, setShowUpload] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [reporting, setReporting] = useState<Resource | null>(null);
  const [reportReason, setReportReason] = useState('');

  const faculties = useMemo(() => ['All faculties', ...new Set(resources.map((r) => r.faculty).filter(Boolean))], [resources]);
  const departments = useMemo(() => ['All departments', ...new Set(resources.filter((r) => faculty === 'All faculties' || r.faculty === faculty).map((r) => r.department).filter(Boolean))], [resources, faculty]);
  const filtered = useMemo(() => resources.filter((r) => {
    const q = query.trim().toLowerCase();
    return (r.status === 'approved' || demo) && (faculty === 'All faculties' || r.faculty === faculty) && (department === 'All departments' || r.department === department) && (level === 'All levels' || r.level === level) && (!q || [r.title, r.course_code, r.faculty, r.department].join(' ').toLowerCase().includes(q));
  }), [resources, query, faculty, department, level, demo]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setUploadError('');
    if (!draft.title.trim() || !draft.course_code.trim()) { setUploadError('Add a resource title and course code first.'); return; }
    if (draft.file && (!ACCEPTED.includes(draft.file.type) || draft.file.size > MAX_FILE_BYTES)) { setUploadError('Choose a PDF, DOC/DOCX, PPT/PPTX or image under 10 MB.'); return; }
    setSubmitting(true);
    try { await onCreate(draft); setShowUpload(false); setDraft(emptyDraft()); onToast(demo ? 'Preview resource added on this device.' : 'Resource submitted for review.'); }
    catch (error) { setUploadError(error instanceof Error ? error.message : 'Could not submit this resource. Please try again.'); }
    finally { setSubmitting(false); }
  }

  async function submitReport(e: FormEvent) {
    e.preventDefault(); if (!reporting || !reportReason.trim()) return;
    await onReport('academic_resource', reporting.id, reportReason.trim()); setReporting(null); setReportReason(''); onToast('Report received. Thank you for helping keep the library useful.');
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">LEARN TOGETHER</p><h1>Academic library</h1><p>Find and share learning materials across your campus community.</p></div><Button onClick={() => setShowUpload(true)}><FilePlus2 size={16} /> Upload a resource</Button></div>
    {demo && <div className="inline-note"><span className="note-dot" /> Preview mode: submissions are saved locally on this device. Connect Supabase to store and share files securely.</div>}
    <section className="library-banner"><div className="library-banner-icon"><BookOpen size={23} /></div><div><span className="eyebrow">OPEN KNOWLEDGE, SHARED RESPONSIBLY</span><h2>Make your next study session count.</h2><p>Search by course code, department or level. Materials are community-shared unless explicitly verified by an authorized administrator.</p></div><div className="library-decoration"><GraduationCap size={34} /></div></section>
    <section className="panel library-panel">
      <SectionTitle eyebrow="RESOURCE LIBRARY" title={`${filtered.length} ${filtered.length === 1 ? 'resource' : 'resources'}`} action={<span className="muted-label">{demo ? 'Preview data' : 'Community shared'}</span>} />
      <div className="filter-row"><label className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or course code" aria-label="Search resources" /></label>
        <select value={faculty} onChange={(e) => { setFaculty(e.target.value); setDepartment('All departments'); }} aria-label="Filter faculty">{faculties.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Filter department">{departments.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter level"><option>All levels</option>{['100 Level', '200 Level', '300 Level', '400 Level', '500 Level', 'Postgraduate'].map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      {filtered.length ? <div className="resource-grid">{filtered.map((resource) => <article className="resource-card" key={resource.id}><div className="resource-file-icon">{resource.file_name?.match(/\.(png|jpe?g|webp)$/i) ? <FileImage size={19} /> : <FileText size={19} />}</div><div className="resource-tags"><Tag tone={resource.status === 'approved' ? 'success' : 'warning'}>{resource.status === 'approved' ? 'Community shared' : 'Pending review'}</Tag><span>{resource.level || 'Level not set'}</span></div><h3>{resource.title}</h3><p className="course-code">{resource.course_code}</p><div className="resource-details"><span>{resource.department || 'Department not set'}</span><span>·</span><span>{resource.contributor || 'Community contributor'}</span></div><div className="resource-footer"><small>{new Date(resource.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small><div className="resource-actions">{resource.file_url ? <a className="icon-button" href={resource.file_url} target="_blank" rel="noreferrer" aria-label="Download resource"><ArrowDownToLine size={16} /></a> : <button className="icon-button" onClick={() => onToast('File downloads are available after secure storage is configured.')} aria-label="Download unavailable"><ArrowDownToLine size={16} /></button>}<button className="icon-button" onClick={() => setReporting(resource)} aria-label="Report resource"><Flag size={15} /></button></div></div></article>)}</div> : <EmptyState title={query || faculty !== 'All faculties' || department !== 'All departments' || level !== 'All levels' ? 'No matching resources' : 'Your library starts here'} text={query ? 'Try a different search or clear some filters.' : 'When students share materials, you will find them here. You can upload the first resource to get started.'} icon={<BookOpen size={20} />} />}
    </section>
    <div className="safety-callout"><span><span className="safety-symbol">i</span><span><b>Keep it responsible.</b> Share materials you have permission to use. Community uploads are not official university documents.</span></span><button className="small-link" onClick={() => onToast('Use the flag icon on a resource to report copyright or safety concerns.')}>How reporting works <ArrowUpRight size={14} /></button></div>

    {showUpload && <Modal title="Share a learning resource" onClose={() => { setShowUpload(false); setUploadError(''); }}><form className="form-stack" onSubmit={submit}><div className="form-note"><UploadCloud size={16} /> {demo ? 'This preview saves resource details on this device. Files are uploaded only when Supabase is connected.' : 'Uploads are reviewed before they become visible to the campus community.'}</div><label>Resource title<input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Lecture notes or a past-question set" /></label><div className="form-grid"><label>Course code<input value={draft.course_code} onChange={(e) => setDraft({ ...draft, course_code: e.target.value.toUpperCase() })} placeholder="Optional course code" /></label><label>Level<select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })}><option value="">Select level</option>{['100 Level', '200 Level', '300 Level', '400 Level', '500 Level', 'Postgraduate'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Faculty<input value={draft.faculty} onChange={(e) => setDraft({ ...draft, faculty: e.target.value })} placeholder="Enter faculty" /></label><label>Department<input value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} placeholder="Enter department" /></label></div><label className="file-drop"><UploadCloud size={18} /><span><b>{draft.file?.name || 'Choose a file (optional)'}</b><small>PDF, DOC, DOCX, PPT, PPTX or image · max 10 MB</small></span><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] })} /></label>{uploadError && <p className="form-error" role="alert">{uploadError}</p>}<div className="form-actions"><Button variant="secondary" onClick={() => setShowUpload(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : demo ? 'Add preview resource' : 'Submit for review'}</Button></div></form></Modal>}
    {reporting && <Modal title="Report a resource" onClose={() => setReporting(null)}><form className="form-stack" onSubmit={submitReport}><p className="form-intro">Let the moderators know why “{reporting.title}” needs a review. Your report is private.</p><label>What should we review?<textarea required minLength={5} value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="Copyright concern, inappropriate content, broken file…" rows={4} /></label><div className="form-actions"><Button variant="secondary" onClick={() => setReporting(null)}>Cancel</Button><Button type="submit">Send report</Button></div></form></Modal>}
  </div>;
}

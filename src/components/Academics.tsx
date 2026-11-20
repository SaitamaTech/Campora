import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, FileImage, FilePlus2, FileText, Flag, GraduationCap, Search, UploadCloud } from 'lucide-react';
import type { Resource } from '../lib/types';
import { Button, EmptyState, Modal, SectionTitle, Tag } from './ui';

type FacultyOption = { id: string; name: string };
type DepartmentOption = { id: string; name: string; faculty_id: string };
type Draft = { title: string; course_code: string; faculty_id: string; department_id: string; level: string; file?: File };
const emptyDraft = (): Draft => ({ title: '', course_code: '', faculty_id: '', department_id: '', level: '' });
const LEVELS = ['100 Level', '200 Level', '300 Level', '400 Level'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/jpeg', 'image/png', 'image/webp'];

type ResourceSection = { key: string; level: string; faculty: string; department: string; resources: Resource[] };

export function Academics({ resources, faculties, departments, demo, onCreate, onReport, onViewProfile, onToast }: { resources: Resource[]; faculties: FacultyOption[]; departments: DepartmentOption[]; demo: boolean; onCreate: (draft: Draft) => Promise<void>; onReport: (type: string, id: string, reason: string) => Promise<void>; onViewProfile: (profileId: string) => void; onToast: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [facultyId, setFacultyId] = useState('all');
  const [departmentId, setDepartmentId] = useState('all');
  const [level, setLevel] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [reporting, setReporting] = useState<Resource | null>(null);
  const [reportReason, setReportReason] = useState('');
  const selectedUploadFaculty = faculties.find((item) => item.id === draft.faculty_id);
  const uploadDepartments = departments.filter((item) => item.faculty_id === draft.faculty_id);
  const visibleDepartments = departments.filter((item) => facultyId === 'all' || item.faculty_id === facultyId);
  const availableUploadDirectory = faculties.length > 0 && departments.length > 0;

  const filtered = useMemo(() => resources.filter((r) => {
    const q = query.trim().toLowerCase();
    return (r.status === 'approved' || demo) && (facultyId === 'all' || r.faculty_id === facultyId) && (departmentId === 'all' || r.department_id === departmentId) && (level === 'all' || r.level === level) && (!q || [r.title, r.course_code, r.faculty, r.department].join(' ').toLowerCase().includes(q));
  }), [resources, query, facultyId, departmentId, level, demo]);
  const sections = useMemo(() => {
    const groups = new Map<string, ResourceSection>();
    filtered.forEach((resource) => {
      const groupLevel = resource.level || 'Level not set';
      const groupFaculty = resource.faculty || 'Faculty not listed';
      const groupDepartment = resource.department || 'Department not listed';
      const key = `${groupLevel}\u0000${groupFaculty}\u0000${groupDepartment}`;
      const group = groups.get(key) || { key, level: groupLevel, faculty: groupFaculty, department: groupDepartment, resources: [] };
      group.resources.push(resource);
      groups.set(key, group);
    });
    return [...groups.values()].sort((a, b) => a.level.localeCompare(b.level, undefined, { numeric: true }) || a.faculty.localeCompare(b.faculty) || a.department.localeCompare(b.department));
  }, [filtered]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setUploadError('');
    if (!draft.title.trim() || !draft.faculty_id || !draft.department_id || !draft.level) { setUploadError('Choose a title, level, faculty and department first.'); return; }
    if (!LEVELS.includes(draft.level)) { setUploadError('Choose a level from 100 to 400.'); return; }
    if (!uploadDepartments.some((item) => item.id === draft.department_id)) { setUploadError('Choose a department listed under the selected faculty.'); return; }
    if (draft.file && (!ACCEPTED.includes(draft.file.type) || draft.file.size > MAX_FILE_BYTES)) { setUploadError('Choose a PDF, DOC/DOCX, PPT/PPTX or image under 10 MB.'); return; }
    setSubmitting(true);
    try { await onCreate(draft); setShowUpload(false); setDraft(emptyDraft()); onToast(demo ? 'Preview resource added on this device.' : 'Resource submitted for review.'); }
    catch (error) { setUploadError(error instanceof Error ? error.message : 'Could not submit this resource. Please try again.'); }
    finally { setSubmitting(false); }
  }

  async function submitReport(e: FormEvent) {
    e.preventDefault(); if (!reporting || !reportReason.trim()) return;
    try { await onReport('academic_resource', reporting.id, reportReason.trim()); setReporting(null); setReportReason(''); onToast('Report received. Thank you for helping keep the library useful.'); }
    catch (error) { onToast(error instanceof Error ? error.message : 'Could not send the report.'); }
  }

  function startUpload() {
    if (!availableUploadDirectory) { onToast('The verified faculty and department directory is not available yet.'); return; }
    setUploadError(''); setDraft(emptyDraft()); setShowUpload(true);
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">LEARN TOGETHER</p><h1>Academic library</h1><p>Find and share learning materials by level, faculty and department.</p></div><Button onClick={startUpload}><FilePlus2 size={16} /> Upload a resource</Button></div>
    {demo && <div className="inline-note"><span className="note-dot" /> Preview mode: submissions are saved locally on this device. Connect the campus directory and secure storage to share files.</div>}
    <section className="library-banner"><div className="library-banner-icon"><BookOpen size={23} /></div><div><span className="eyebrow">OPEN KNOWLEDGE, SHARED RESPONSIBLY</span><h2>Make your next study session count.</h2><p>Browse resources by 100, 200, 300 or 400 level, then narrow by the official faculty and department directory.</p></div><div className="library-decoration"><GraduationCap size={34} /></div></section>
    <section className="panel library-panel">
      <SectionTitle eyebrow="RESOURCE LIBRARY" title={`${filtered.length} ${filtered.length === 1 ? 'resource' : 'resources'}`} action={<span className="muted-label">{demo ? 'Preview data' : 'Community shared'}</span>} />
      <div className="filter-row"><label className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, course or department" aria-label="Search resources" /></label>
        <select value={facultyId} onChange={(e) => { setFacultyId(e.target.value); setDepartmentId('all'); }} aria-label="Filter faculty"><option value="all">All faculties</option>{faculties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="Filter department"><option value="all">All departments</option>{visibleDepartments.map((item) => { const itemFaculty = faculties.find((faculty) => faculty.id === item.faculty_id)?.name; return <option key={item.id} value={item.id}>{facultyId === 'all' && itemFaculty ? `${item.name} · ${itemFaculty}` : item.name}</option>; })}</select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter level"><option value="all">All levels</option>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      {sections.length ? <div className="resource-sections">{sections.map((section) => <section className="resource-section" key={section.key}><h3 className="resource-section-heading"><span>{section.level}</span><span>{section.faculty}</span><span>{section.department}</span></h3><div className="resource-grid">{section.resources.map((resource) => <article className="resource-card" key={resource.id}><div className="resource-file-icon">{resource.file_name?.match(/\.(png|jpe?g|webp)$/i) ? <FileImage size={19} /> : <FileText size={19} />}</div><div className="resource-tags"><Tag tone={resource.status === 'approved' ? 'success' : 'warning'}>{resource.status === 'approved' ? 'Community shared' : 'Pending review'}</Tag><span>{resource.level || 'Level not set'}</span></div><h3>{resource.title}</h3><p className="course-code">{resource.course_code || 'Study material'}</p><div className="resource-details"><span>{resource.faculty || 'Faculty not set'}</span><span>·</span><span>{resource.department || 'Department not set'}</span></div><div className="resource-uploader">{resource.contributor_id && resource.contributor_public ? <button onClick={() => onViewProfile(resource.contributor_id!)}>Uploaded by {resource.contributor || 'Student'} <ArrowUpRight size={13} /></button> : <span>Uploaded by {resource.contributor || 'Student contributor'}</span>}</div><div className="resource-footer"><small>{new Date(resource.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small><div className="resource-actions">{resource.file_url ? <a className="icon-button" href={resource.file_url} target="_blank" rel="noreferrer" aria-label="Download resource"><ArrowDownToLine size={16} /></a> : <button className="icon-button" onClick={() => onToast('File downloads are available after secure storage is configured.')} aria-label="Download unavailable"><ArrowDownToLine size={16} /></button>}<button className="icon-button" onClick={() => setReporting(resource)} aria-label="Report resource"><Flag size={15} /></button></div></div></article>)}</div></section>)}</div> : <EmptyState title={query || facultyId !== 'all' || departmentId !== 'all' || level !== 'all' ? 'No matching resources' : 'Your library starts here'} text={query ? 'Try a different search or clear some filters.' : 'When students share materials, you will find them here. You can upload the first resource to get started.'} icon={<BookOpen size={20} />} />}
    </section>
    <div className="safety-callout"><span><span className="safety-symbol">i</span><span><b>Keep it responsible.</b> Share materials you have permission to use. Community uploads are not official university documents.</span></span><button className="small-link" onClick={() => onToast('Use the flag icon on a resource to report copyright or safety concerns.')}>How reporting works <ArrowUpRight size={14} /></button></div>

    {showUpload && <Modal title="Share a learning resource" onClose={() => { setShowUpload(false); setUploadError(''); }}><form className="form-stack" onSubmit={submit}><div className="form-note"><UploadCloud size={16} /> {demo ? 'This preview saves resource details on this device. Files are uploaded only when secure storage is connected.' : 'Resources are grouped by level, faculty and department, then reviewed before public sharing.'}</div><label>Resource title<input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Lecture notes or a past-question set" /></label><div className="form-grid"><label>Course code <span className="optional-label">(optional)</span><input value={draft.course_code} onChange={(e) => setDraft({ ...draft, course_code: e.target.value.toUpperCase() })} placeholder="e.g. CSC 201" /></label><label>Level<select required value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })}><option value="">Select level</option>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Faculty<select required value={draft.faculty_id} onChange={(e) => setDraft({ ...draft, faculty_id: e.target.value, department_id: '' })}><option value="">Select faculty</option>{faculties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Department<select required value={draft.department_id} disabled={!draft.faculty_id} onChange={(e) => setDraft({ ...draft, department_id: e.target.value })}><option value="">{selectedUploadFaculty ? 'Select department' : 'Choose a faculty first'}</option>{uploadDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><label className="file-drop"><UploadCloud size={18} /><span><b>{draft.file?.name || 'Choose a file (optional)'}</b><small>PDF, DOC, DOCX, PPT, PPTX or image · max 10 MB</small></span><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] })} /></label>{uploadError && <p className="form-error" role="alert">{uploadError}</p>}<div className="form-actions"><Button variant="secondary" onClick={() => setShowUpload(false)}>Cancel</Button><Button type="submit" disabled={submitting || !availableUploadDirectory}>{submitting ? 'Submitting…' : demo ? 'Add preview resource' : 'Submit for review'}</Button></div></form></Modal>}
    {reporting && <Modal title="Report a resource" onClose={() => setReporting(null)}><form className="form-stack" onSubmit={submitReport}><p className="form-intro">Let the moderators know why “{reporting.title}” needs a review. Your report is private.</p><label>What should we review?<textarea required minLength={5} value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="Copyright concern, inappropriate content, broken file…" rows={4} /></label><div className="form-actions"><Button variant="secondary" onClick={() => setReporting(null)}>Cancel</Button><Button type="submit">Send report</Button></div></form></Modal>}
  </div>;
}

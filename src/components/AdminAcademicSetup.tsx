import { useState, type FormEvent } from 'react';
import { BookOpen, GraduationCap, Plus, Sparkles } from 'lucide-react';
import type { AdminSnapshot } from './AdminDashboard';
import { Button, EmptyState, SectionTitle, Tag } from './ui';

type OpportunityDraft = { title: string; description: string; eligibility: string; deadline: string; application_url: string; category: string; source: string; verified: boolean };
const emptyOpportunity = (): OpportunityDraft => ({ title: '', description: '', eligibility: '', deadline: '', application_url: '', category: 'scholarship', source: '', verified: false });

export function AdminAcademicSetup({ snapshot, onAddFaculty, onAddDepartment, onSetFacultyActive, onSetDepartmentActive, onRenameFaculty, onRenameDepartment, onPublishOpportunity, onRefresh, onToast }: {
  snapshot: AdminSnapshot;
  onAddFaculty: (name: string) => Promise<void>;
  onAddDepartment: (draft: { name: string; faculty_id: string }) => Promise<void>;
  onSetFacultyActive?: (id: string, active: boolean) => Promise<void>;
  onSetDepartmentActive?: (id: string, active: boolean) => Promise<void>;
  onRenameFaculty?: (id: string, name: string) => Promise<void>;
  onRenameDepartment?: (id: string, name: string) => Promise<void>;
  onPublishOpportunity: (draft: OpportunityDraft) => Promise<void>;
  onRefresh: () => Promise<void>;
  onToast: (message: string) => void;
}) {
  const [facultyName, setFacultyName] = useState('');
  const [department, setDepartment] = useState({ name: '', faculty_id: '' });
  const [opportunity, setOpportunity] = useState<OpportunityDraft>(emptyOpportunity());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function run(key: string, success: string, action: () => Promise<void>) {
    setBusy(key); setError('');
    try { await action(); onToast(success); await onRefresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'That change could not be saved.'); }
    finally { setBusy(''); }
  }
  async function addFaculty(e: FormEvent) { e.preventDefault(); const name = facultyName.trim(); if (!name) return; await run('faculty', 'Faculty added to campus setup.', async () => { await onAddFaculty(name); setFacultyName(''); }); }
  async function addDepartment(e: FormEvent) { e.preventDefault(); const draft = { name: department.name.trim(), faculty_id: department.faculty_id }; if (!draft.name || !draft.faculty_id) return; await run('department', 'Department added to campus setup.', async () => { await onAddDepartment(draft); setDepartment({ name: '', faculty_id: '' }); }); }
  async function publishOpportunity(e: FormEvent) { e.preventDefault(); await run('opportunity', 'Opportunity published.', async () => { await onPublishOpportunity({ ...opportunity, title: opportunity.title.trim(), description: opportunity.description.trim(), source: opportunity.source.trim(), eligibility: opportunity.eligibility.trim(), application_url: opportunity.application_url.trim() }); setOpportunity(emptyOpportunity()); }); }

  return <div className="admin-academic-setup">
    <SectionTitle eyebrow="CAMPUS CONFIGURATION" title="Faculties, departments & opportunities" />
    <p className="section-intro">Add only institution details and opportunity information confirmed by a trustworthy source. No campus data is pre-filled.</p>
    {error && <div className="form-error admin-error" role="alert">{error}</div>}
    <div className="admin-setup-grid">
      <div className="admin-setup-column">
        <form className="form-stack panel admin-form" onSubmit={addFaculty}>
          <SectionTitle eyebrow="ACADEMIC DIRECTORY" title="Add a faculty" />
          <label>Faculty name<input required maxLength={160} value={facultyName} onChange={(e) => setFacultyName(e.target.value)} placeholder="Use the confirmed university name" /></label>
          <Button type="submit" disabled={busy === 'faculty'}><Plus size={15} />{busy === 'faculty' ? 'Saving…' : 'Add faculty'}</Button>
        </form>
        <form className="form-stack panel admin-form" onSubmit={addDepartment}>
          <SectionTitle eyebrow="DEPARTMENT DIRECTORY" title="Add a department" />
          <label>Faculty<select required value={department.faculty_id} onChange={(e) => setDepartment({ ...department, faculty_id: e.target.value })}><option value="">Choose a faculty</option>{snapshot.faculties.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Department name<input required maxLength={160} value={department.name} onChange={(e) => setDepartment({ ...department, name: e.target.value })} placeholder="Use the confirmed university name" /></label>
          <Button type="submit" disabled={busy === 'department' || snapshot.faculties.length === 0}><Plus size={15} />{busy === 'department' ? 'Saving…' : 'Add department'}</Button>
        </form>
        <section className="panel admin-form academic-directory-list">
          <SectionTitle eyebrow="CURRENT SETUP" title={`${snapshot.faculties.length} faculties · ${snapshot.departments.length} departments`} />
          {snapshot.faculties.length ? <ul>{snapshot.faculties.map((item) => <li key={item.id}><div className="academic-directory-entry"><span><b>{item.name}</b><small>{item.is_active ? 'Active' : 'Inactive'}</small></span><div>{onRenameFaculty && <button type="button" className="text-action" onClick={() => { const next = window.prompt('Rename this faculty', item.name); if (next?.trim()) void run(`faculty-rename-${item.id}`, 'Faculty renamed.', () => onRenameFaculty(item.id, next)); }}>Rename</button>}{onSetFacultyActive && <button type="button" className="text-action" onClick={() => void run(`faculty-active-${item.id}`, item.is_active ? 'Faculty deactivated.' : 'Faculty activated.', () => onSetFacultyActive(item.id, !item.is_active))}>{item.is_active ? 'Deactivate' : 'Activate'}</button>}</div></div>{snapshot.departments.filter((entry) => entry.faculty_id === item.id).map((entry) => <div className="academic-directory-entry academic-department-entry" key={entry.id}><span><b>{entry.name}</b><small>{entry.is_active ? 'Active department' : 'Inactive department'}</small></span><div>{onRenameDepartment && <button type="button" className="text-action" onClick={() => { const next = window.prompt('Rename this department', entry.name); if (next?.trim()) void run(`department-rename-${entry.id}`, 'Department renamed.', () => onRenameDepartment(entry.id, next)); }}>Rename</button>}{onSetDepartmentActive && <button type="button" className="text-action" onClick={() => void run(`department-active-${entry.id}`, entry.is_active ? 'Department deactivated.' : 'Department activated.', () => onSetDepartmentActive(entry.id, !entry.is_active))}>{entry.is_active ? 'Deactivate' : 'Activate'}</button>}</div></div>)}</li>)}</ul> : <EmptyState title="No academic records yet" text="Create a faculty here after confirming its official name." icon={<GraduationCap size={18} />} />}
        </section>
      </div>
      <div className="admin-setup-column">
        <form className="form-stack panel admin-form" onSubmit={publishOpportunity}>
          <SectionTitle eyebrow="OPPORTUNITY HUB" title="Publish an opportunity" />
          <div className="admin-note"><Sparkles size={15} />Approved listings can still be marked unverified. Only mark one verified after checking the source.</div>
          <label>Title<input required maxLength={240} value={opportunity.title} onChange={(e) => setOpportunity({ ...opportunity, title: e.target.value })} placeholder="Scholarship, programme or event" /></label>
          <label>Description<textarea required minLength={2} maxLength={20000} rows={4} value={opportunity.description} onChange={(e) => setOpportunity({ ...opportunity, description: e.target.value })} placeholder="Describe what students should know" /></label>
          <label>Eligibility<textarea maxLength={4000} rows={2} value={opportunity.eligibility} onChange={(e) => setOpportunity({ ...opportunity, eligibility: e.target.value })} placeholder="Who can apply? (optional)" /></label>
          <div className="form-grid"><label>Category<select value={opportunity.category} onChange={(e) => setOpportunity({ ...opportunity, category: e.target.value })}>{[['scholarship','Scholarship'],['internship','Internship'],['graduate_programme','Graduate programme'],['competition','Competition'],['hackathon','Hackathon'],['online_course','Online course'],['conference','Conference'],['fellowship','Fellowship'],['volunteer','Volunteer'],['entrepreneurship','Entrepreneurship'],['other','Other']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Deadline<input type="date" value={opportunity.deadline} onChange={(e) => setOpportunity({ ...opportunity, deadline: e.target.value })} /></label></div>
          <label>Application URL<input type="url" value={opportunity.application_url} onChange={(e) => setOpportunity({ ...opportunity, application_url: e.target.value })} placeholder="https://…" /></label>
          <label>Source<input maxLength={240} value={opportunity.source} onChange={(e) => setOpportunity({ ...opportunity, source: e.target.value })} placeholder="Organization or source link" /></label>
          <label className="checkbox-row"><input type="checkbox" checked={opportunity.verified} onChange={(e) => setOpportunity({ ...opportunity, verified: e.target.checked })} /><span><b>Mark as verified</b><small>Only if you personally checked a reliable source. Verified listings require a source.</small></span></label>
          <Button type="submit" disabled={busy === 'opportunity'}><Sparkles size={15} />{busy === 'opportunity' ? 'Publishing…' : 'Publish opportunity'}</Button>
          {opportunity.verified && <Tag tone="warning">Will be marked verified after you confirm the source</Tag>}
        </form>
      </div>
    </div>
    <div className="admin-note"><BookOpen size={15} />Student profile options are matched to these faculty and department records; no student identity numbers are collected.</div>
  </div>;
}

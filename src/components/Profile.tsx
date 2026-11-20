import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, BadgeCheck, Bell, BookOpen, Camera, CircleHelp, LogIn, LogOut, Mail, Settings2, ShieldCheck, UserRound, Users } from 'lucide-react';
import type { Profile, Role } from '../lib/types';
import { Button, Modal, SectionTitle, Tag } from './ui';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';
type FacultyOption = { id: string; name: string };
type DepartmentOption = { id: string; name: string; faculty_id: string };

export function ProfilePage({ profile, faculties, departments, authenticated, configured, demo, recoveryMode, onSave, onUploadAvatar, onAuth, onForgot, onResetPassword, onLogout, onSupport, onAdmin, onGoogleAuth }: {
  profile: Profile; faculties: FacultyOption[]; departments: DepartmentOption[]; authenticated: boolean; configured: boolean; demo: boolean;
  recoveryMode: boolean;
  onSave: (profile: Profile) => Promise<void>; onUploadAvatar: (file: File) => Promise<string>; onAuth: (mode: 'signin' | 'signup', values: { email: string; password: string; full_name: string }) => Promise<string | void>; onGoogleAuth: () => Promise<void>;
  onForgot: (email: string) => Promise<void>; onResetPassword: (password: string) => Promise<void>; onLogout: () => Promise<void>; onSupport: () => void; onAdmin: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [authOpen, setAuthOpen] = useState(recoveryMode);
  const [authMode, setAuthMode] = useState<AuthMode>(recoveryMode ? 'reset' : 'signin');
  const [form, setForm] = useState<Profile>({ ...profile });
  const [email, setEmail] = useState(profile.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authName, setAuthName] = useState(profile.full_name || '');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [notice, setNotice] = useState(recoveryMode ? 'Choose a new password for your account.' : '');
  const [error, setError] = useState('');
  const selectedFaculty = faculties.find((item) => item.name === form.faculty);
  const facultyDepartments = selectedFaculty ? departments.filter((item) => item.faculty_id === selectedFaculty.id) : [];
  const useOfficialDirectory = !demo && faculties.length > 0;

  function openEdit() { setForm({ ...profile }); setError(''); setEdit(true); }
  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await onSave(form); setEdit(false); setNotice(demo ? 'Profile saved on this device.' : 'Profile updated.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save your profile.'); }
    finally { setBusy(false); }
  }
  async function uploadPhoto(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setPhotoBusy(true); setError('');
    try {
      const avatarUrl = await onUploadAvatar(file);
      setForm((current) => ({ ...current, avatar_url: avatarUrl }));
      setNotice('Profile photo updated.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not upload your profile photo.'); }
    finally { setPhotoBusy(false); input.value = ''; }
  }
  async function submitAuth(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (authMode === 'forgot') { await onForgot(email); setNotice('If this email is registered, you will receive a recovery link.'); setAuthMode('signin'); return; }
      if (authMode === 'reset') { if (password !== confirmPassword) throw new Error('Your passwords do not match.'); await onResetPassword(password); setNotice('Password updated. You can now sign in.'); setAuthMode('signin'); setPassword(''); setConfirmPassword(''); return; }
      const result = await onAuth(authMode, { email, password, full_name: authName });
      if (result) { setNotice(result); if (authMode === 'signup') { setAuthMode('signin'); setPassword(''); } }
      else setAuthOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Authentication could not be completed.'); }
    finally { setBusy(false); }
  }
  async function submitGoogleAuth() { setBusy(true); setError(''); setNotice(''); try { await onGoogleAuth(); } catch (err) { setError(err instanceof Error ? err.message : 'Google sign-in could not be started.'); } finally { setBusy(false); } }

  const role: Role = profile.role || 'student';
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">YOUR SPACE</p><h1>Profile & settings</h1><p>Manage your campus profile, account and help preferences.</p></div><Button variant="secondary" onClick={onSupport}><CircleHelp size={16} /> Help & support</Button></div>
    {demo && <div className="inline-note"><span className="note-dot" /> Preview mode: profile changes are saved only on this device until authentication is connected.</div>}
    {notice && <div className="success-banner" role="status"><ShieldCheck size={16} />{notice}<button className="close-note" onClick={() => setNotice('')}>Dismiss</button></div>}
    <div className="profile-layout">
      <section className="profile-main">
        <div className="profile-hero panel">
          <div className="profile-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt={`${profile.full_name || 'Your'} profile photo`} /> : profile.full_name?.slice(0, 1) || 'S'}</div>
          <div className="profile-identity"><p className="eyebrow">STUDENT PROFILE</p><h2>{profile.full_name || 'Campus explorer'}</h2><p>{profile.department || 'Add your department'}{profile.level ? ` · ${profile.level}` : ''}</p><div className="profile-badges"><Tag tone="accent">{roleLabel(role)}</Tag>{profile.is_verified_representative ? <Tag tone="success"><BadgeCheck size={12} /> Verified representative</Tag> : <Tag tone="neutral">Not a university representative</Tag>}</div></div>
          <Button variant="secondary" onClick={openEdit}><Settings2 size={15} /> Edit profile</Button>
        </div>
        <section className="panel settings-panel"><SectionTitle eyebrow="PROFILE DETAILS" title="Your information" action={<button className="small-link" onClick={openEdit}>Edit <ArrowUpRight size={14} /></button>} /><div className="profile-fields"><ProfileField icon={<UserRound size={15} />} label="Full name" value={profile.full_name || 'Not set'} /><ProfileField icon={<UserRound size={15} />} label="Username" value={profile.username ? `@${profile.username}` : 'Not set'} /><ProfileField icon={<Mail size={15} />} label="Email address" value={profile.email || 'Not connected'} /><ProfileField icon={<BookOpen size={15} />} label="Faculty" value={profile.faculty || 'Not set'} /><ProfileField icon={<Users size={15} />} label="Department" value={profile.department || 'Not set'} /><ProfileField icon={<Bell size={15} />} label="Academic level" value={profile.level || 'Not set'} /><ProfileField icon={<Users size={15} />} label="Profile visibility" value={profile.is_public === false ? 'Private' : 'Visible to students'} /></div>{profile.bio && <p className="profile-bio-summary">{profile.bio}</p>}</section>
        {role === 'administrator' && <button className="admin-entry-card" onClick={onAdmin}><span className="admin-entry-icon"><ShieldCheck size={18} /></span><span><b>Administration dashboard</b><small>Manage content, reports and support requests.</small></span><ArrowUpRight size={16} /></button>}
      </section>
      <aside className="profile-aside">
        <div className="account-card panel"><span className="aside-icon"><ShieldCheck size={18} /></span><p className="eyebrow">ACCOUNT SECURITY</p><h3>{authenticated ? 'Your account is connected' : configured ? 'Sign in to sync your profile' : 'Set up secure sign-in'}</h3><p>{authenticated ? 'Your profile and CAMPORA activity are linked to your verified email account.' : configured ? 'Sign in or create an account to save your activity across devices.' : 'Registration and email verification become available when a Supabase project is connected.'}</p>{authenticated ? <Button variant="secondary" onClick={() => void onLogout()}><LogOut size={15} /> Sign out</Button> : <Button onClick={() => { setAuthMode('signin'); setEmail(profile.email || ''); setAuthOpen(true); }}><LogIn size={15} /> {configured ? 'Sign in / create account' : 'Preview sign-in options'}</Button>}</div>
        <div className="account-card panel help-card"><span className="aside-icon"><CircleHelp size={18} /></span><p className="eyebrow">HERE TO HELP</p><h3>Need a hand?</h3><p>Find answers, track support requests or send us feedback.</p><button className="small-link" onClick={onSupport}>Open Help & support <ArrowUpRight size={14} /></button></div>
        <div className="account-card panel"><p className="eyebrow">CAMPORA · UNIVERSITY OF ILESA</p><p className="muted-paragraph">CAMPORA is an independent student platform. Profile details do not imply university verification.</p></div>
      </aside>
    </div>

    {edit && <Modal title="Edit your profile" onClose={() => setEdit(false)}><form className="form-stack" onSubmit={saveProfile}>
      <div className="form-note"><ShieldCheck size={16} />No student ID number is required. Only add details you are comfortable sharing.</div>
      <label>Full name<input required maxLength={100} value={form.full_name || ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your name" /></label>
      <label>Username<input autoComplete="username" maxLength={30} pattern="[A-Za-z0-9_]{3,30}" value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="3–30 letters, numbers or underscores" /></label>
      <label>Short bio<textarea rows={3} maxLength={1000} value={form.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="A little about you (optional)" /></label>
      <label className="profile-visibility-toggle"><input type="checkbox" checked={form.is_public !== false} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} /><span><b>Public student profile</b><small>When on, other CAMPORA students can see your name, username, profile photo, faculty, department, level and bio. Your email and account role remain private.</small></span></label>
      <label>Email address<input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" disabled={authenticated} /></label>
      {authenticated ? <label className="profile-photo-picker">
        <span className="profile-photo-preview">{form.avatar_url ? <img src={form.avatar_url} alt="Current profile photo" /> : <Camera size={19} />}</span>
        <span className="profile-photo-copy"><b>{photoBusy ? 'Uploading profile photo…' : form.avatar_url ? 'Change profile photo' : 'Add a profile photo'}</b><small>Profile photo only · JPEG, PNG or WebP · max 5 MB</small></span>
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy || busy} onChange={(e) => void uploadPhoto(e)} aria-label="Upload profile photo" />
      </label> : <div className="form-note"><Camera size={16} />Sign in to upload a photo. Photos are used only as profile images and follow your existing profile visibility settings.</div>}
      {useOfficialDirectory ? <>
        <label>Faculty<select value={form.faculty || ''} onChange={(e) => setForm({ ...form, faculty: e.target.value, department: '' })}><option value="">Select faculty (optional)</option>{faculties.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
        <label>Department<select value={form.department || ''} disabled={!selectedFaculty || facultyDepartments.length === 0} onChange={(e) => setForm({ ...form, department: e.target.value })}><option value="">{!selectedFaculty ? 'Select a faculty first' : facultyDepartments.length ? 'Select department (optional)' : 'No official departments listed yet'}</option>{facultyDepartments.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
      </> : <><label>Faculty<input maxLength={100} value={form.faculty || ''} onChange={(e) => setForm({ ...form, faculty: e.target.value, department: '' })} placeholder="Your faculty (optional)" /></label><label>Department<input maxLength={100} value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Your department (optional)" /></label></>}
      <label>Academic level<select value={form.level || ''} onChange={(e) => setForm({ ...form, level: e.target.value })}><option value="">Select level (optional)</option>{['100 Level', '200 Level', '300 Level', '400 Level', '500 Level', 'Postgraduate'].map((item) => <option key={item}>{item}</option>)}</select></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><Button variant="secondary" onClick={() => setEdit(false)}>Cancel</Button><Button type="submit" disabled={busy || photoBusy}>{busy ? 'Saving…' : 'Save profile'}</Button></div>
    </form></Modal>}

    {authOpen && <Modal title={authMode === 'signup' ? 'Create your account' : authMode === 'forgot' ? 'Recover your account' : authMode === 'reset' ? 'Set a new password' : 'Welcome back'} onClose={() => { setAuthOpen(false); setError(''); setNotice(''); }}><form className="form-stack" onSubmit={submitAuth}>
      {!configured && <div className="form-note"><ShieldCheck size={16} />Preview mode is active. Account creation will be available after a Supabase project is connected. You can still explore and edit a local preview profile.</div>}
      {configured && (authMode === 'signin' || authMode === 'signup') && <><button type="button" className="google-auth-button" onClick={() => void submitGoogleAuth()} disabled={busy}><GoogleMark />{busy ? 'Please wait…' : 'Continue with Google'}</button><div className="auth-divider" aria-hidden="true"><span>or continue with email</span></div></>}
      {authMode === 'signup' && <div className="form-note"><ShieldCheck size={16} />New student profiles are visible to other CAMPORA students by default so classmates can find each other. You can switch to a private profile in Profile &amp; settings at any time. Email and account role are never shown on your public profile.</div>}
      {authMode === 'signup' && <label>Full name<input required maxLength={100} value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Your name" /></label>}
      {authMode !== 'reset' && <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>}
      {(authMode === 'signin' || authMode === 'signup' || authMode === 'reset') && <label>{authMode === 'reset' ? 'New password' : 'Password'}<input required minLength={authMode === 'signin' ? undefined : 8} type="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={authMode === 'signin' ? 'Enter your password' : 'At least 8 characters'} /></label>}
      {authMode === 'reset' && <label>Confirm new password<input required minLength={8} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" /></label>}
      {notice && <p className="form-success" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" disabled={busy || !configured}>{busy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : authMode === 'forgot' ? 'Send recovery link' : authMode === 'reset' ? 'Update password' : 'Sign in'}</Button>
      {configured && <div className="auth-links">{authMode === 'signin' && <><button type="button" onClick={() => { setAuthMode('signup'); setError(''); setNotice(''); }}>Create a student account</button><button type="button" onClick={() => { setAuthMode('forgot'); setError(''); setNotice(''); }}>Forgot password?</button></>}{authMode !== 'signin' && <button type="button" onClick={() => { setAuthMode('signin'); setError(''); setNotice(''); }}>Back to sign in</button>}</div>}
    </form></Modal>}
  </div>;
}

function ProfileField({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="profile-field"><span className="profile-field-icon">{icon}</span><span><small>{label}</small><b>{value}</b></span></div>; }
function roleLabel(role: Role) { return role === 'administrator' ? 'Administrator' : role === 'moderator' ? 'Moderator' : role === 'contributor' ? 'Trusted contributor' : 'Student'; }
function GoogleMark() { return <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.93c-.58 2.96-2.26 5.48-4.72 7.18l7.62 5.91c4.45-4.11 7.15-10.16 7.15-17.56Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.89l-7.62-5.91c-2.12 1.42-4.84 2.27-8.28 2.27-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>; }

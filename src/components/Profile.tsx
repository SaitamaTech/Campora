import { useState, type FormEvent } from 'react';
import { ArrowUpRight, BadgeCheck, Bell, BookOpen, CircleHelp, LogIn, LogOut, Mail, Settings2, ShieldCheck, UserRound, Users } from 'lucide-react';
import type { Profile, Role } from '../lib/types';
import { Button, Modal, SectionTitle, Tag } from './ui';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

export function ProfilePage({ profile, authenticated, configured, demo, recoveryMode, onSave, onAuth, onForgot, onResetPassword, onLogout, onSupport, onAdmin }: {
  profile: Profile; authenticated: boolean; configured: boolean; demo: boolean;
  recoveryMode: boolean;
  onSave: (profile: Profile) => Promise<void>; onAuth: (mode: 'signin' | 'signup', values: { email: string; password: string; full_name: string }) => Promise<string | void>;
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
  const [notice, setNotice] = useState(recoveryMode ? 'Choose a new password for your account.' : '');
  const [error, setError] = useState('');

  function openEdit() { setForm({ ...profile }); setEdit(true); }
  async function saveProfile(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await onSave(form); setEdit(false); setNotice(demo ? 'Profile saved on this device.' : 'Profile updated.'); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save your profile.'); } finally { setBusy(false); } }
  async function submitAuth(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); setNotice(''); try {
    if (authMode === 'forgot') { await onForgot(email); setNotice('If this email is registered, you will receive a recovery link.'); setAuthMode('signin'); return; }
    if (authMode === 'reset') { if (password !== confirmPassword) throw new Error('Your passwords do not match.'); await onResetPassword(password); setNotice('Password updated. You can now sign in.'); setAuthMode('signin'); setPassword(''); setConfirmPassword(''); return; }
    const result = await onAuth(authMode, { email, password, full_name: authName }); if (result) { setNotice(result); if (authMode === 'signup') { setAuthMode('signin'); setPassword(''); } } else setAuthOpen(false);
  } catch (err) { setError(err instanceof Error ? err.message : 'Authentication could not be completed.'); } finally { setBusy(false); } }

  const role: Role = profile.role || 'student';
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">YOUR SPACE</p><h1>Profile & settings</h1><p>Manage your campus profile, account and help preferences.</p></div><Button variant="secondary" onClick={onSupport}><CircleHelp size={16} /> Help & support</Button></div>
    {demo && <div className="inline-note"><span className="note-dot" /> Preview mode: profile changes are saved only on this device until authentication is connected.</div>}
    {notice && <div className="success-banner" role="status"><ShieldCheck size={16} />{notice}<button className="close-note" onClick={() => setNotice('')}>Dismiss</button></div>}
    <div className="profile-layout">
      <section className="profile-main">
        <div className="profile-hero panel"><div className="profile-avatar">{profile.full_name?.slice(0, 1) || 'S'}</div><div className="profile-identity"><p className="eyebrow">STUDENT PROFILE</p><h2>{profile.full_name || 'Campus explorer'}</h2><p>{profile.department || 'Add your department'}{profile.level ? ` · ${profile.level}` : ''}</p><div className="profile-badges"><Tag tone="accent">{roleLabel(role)}</Tag>{profile.is_verified_representative ? <Tag tone="success"><BadgeCheck size={12} /> Verified representative</Tag> : <Tag tone="neutral">Not a university representative</Tag>}</div></div><Button variant="secondary" onClick={openEdit}><Settings2 size={15} /> Edit profile</Button></div>
        <section className="panel settings-panel"><SectionTitle eyebrow="PROFILE DETAILS" title="Your information" action={<button className="small-link" onClick={openEdit}>Edit <ArrowUpRight size={14} /></button>} /><div className="profile-fields"><ProfileField icon={<UserRound size={15} />} label="Full name" value={profile.full_name || 'Not set'} /><ProfileField icon={<Mail size={15} />} label="Email address" value={profile.email || 'Not connected'} /><ProfileField icon={<BookOpen size={15} />} label="Faculty" value={profile.faculty || 'Not set'} /><ProfileField icon={<Users size={15} />} label="Department" value={profile.department || 'Not set'} /><ProfileField icon={<Bell size={15} />} label="Academic level" value={profile.level || 'Not set'} /></div></section>
        {role === 'administrator' && <button className="admin-entry-card" onClick={onAdmin}><span className="admin-entry-icon"><ShieldCheck size={18} /></span><span><b>Administration dashboard</b><small>Manage content, reports and support requests.</small></span><ArrowUpRight size={16} /></button>}
      </section>
      <aside className="profile-aside">
        <div className="account-card panel"><span className="aside-icon"><ShieldCheck size={18} /></span><p className="eyebrow">ACCOUNT SECURITY</p><h3>{authenticated ? 'Your account is connected' : configured ? 'Sign in to sync your profile' : 'Set up secure sign-in'}</h3><p>{authenticated ? 'Your profile and CAMPORA activity are linked to your verified email account.' : configured ? 'Sign in or create an account to save your activity across devices.' : 'Registration and email verification become available when a Supabase project is connected.'}</p>{authenticated ? <Button variant="secondary" onClick={() => void onLogout()}><LogOut size={15} /> Sign out</Button> : <Button onClick={() => { setAuthMode('signin'); setEmail(profile.email || ''); setAuthOpen(true); }}><LogIn size={15} /> {configured ? 'Sign in / create account' : 'Preview sign-in options'}</Button>}</div>
        <div className="account-card panel help-card"><span className="aside-icon"><CircleHelp size={18} /></span><p className="eyebrow">HERE TO HELP</p><h3>Need a hand?</h3><p>Find answers, track support requests or send us feedback.</p><button className="small-link" onClick={onSupport}>Open Help & support <ArrowUpRight size={14} /></button></div>
        <div className="account-card panel"><p className="eyebrow">CAMPORA · UNIVERSITY OF ILESA</p><p className="muted-paragraph">CAMPORA is an independent student platform. Profile details do not imply university verification.</p></div>
      </aside>
    </div>

    {edit && <Modal title="Edit your profile" onClose={() => setEdit(false)}><form className="form-stack" onSubmit={saveProfile}><div className="form-note"><ShieldCheck size={16} />No student ID number is required. Only add details you are comfortable sharing.</div><label>Full name<input required maxLength={100} value={form.full_name || ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your name" /></label><label>Email address<input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" disabled={authenticated} /></label><label>Faculty<input maxLength={100} value={form.faculty || ''} onChange={(e) => setForm({ ...form, faculty: e.target.value })} placeholder="Your faculty (optional)" /></label><label>Department<input maxLength={100} value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Your department (optional)" /></label><label>Academic level<select value={form.level || ''} onChange={(e) => setForm({ ...form, level: e.target.value })}><option value="">Select level (optional)</option>{['100 Level', '200 Level', '300 Level', '400 Level', '500 Level', 'Postgraduate'].map((item) => <option key={item}>{item}</option>)}</select></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button variant="secondary" onClick={() => setEdit(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button></div></form></Modal>}

    {authOpen && <Modal title={authMode === 'signup' ? 'Create your account' : authMode === 'forgot' ? 'Recover your account' : authMode === 'reset' ? 'Set a new password' : 'Welcome back'} onClose={() => { setAuthOpen(false); setError(''); setNotice(''); }}><form className="form-stack" onSubmit={submitAuth}>
      {!configured && <div className="form-note"><ShieldCheck size={16} />Preview mode is active. Account creation will be available after a Supabase project is connected. You can still explore and edit a local preview profile.</div>}
      {authMode === 'signup' && <label>Full name<input required maxLength={100} value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Your name" /></label>}
      {authMode !== 'reset' && <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>}
      {(authMode === 'signin' || authMode === 'signup' || authMode === 'reset') && <label>{authMode === 'reset' ? 'New password' : 'Password'}<input required minLength={8} type="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>}
      {authMode === 'reset' && <label>Confirm new password<input required minLength={8} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" /></label>}
      {notice && <p className="form-success" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" disabled={busy || !configured}>{busy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : authMode === 'forgot' ? 'Send recovery link' : authMode === 'reset' ? 'Update password' : 'Sign in'}</Button>
      {configured && <div className="auth-links">{authMode === 'signin' && <><button type="button" onClick={() => { setAuthMode('signup'); setError(''); setNotice(''); }}>Create a student account</button><button type="button" onClick={() => { setAuthMode('forgot'); setError(''); setNotice(''); }}>Forgot password?</button></>}{authMode !== 'signin' && <button type="button" onClick={() => { setAuthMode('signin'); setError(''); setNotice(''); }}>Back to sign in</button>}</div>}
    </form></Modal>}
  </div>;
}

function ProfileField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="profile-field"><span className="profile-field-icon">{icon}</span><span><small>{label}</small><b>{value}</b></span></div>; }
function roleLabel(role: Role) { return role === 'administrator' ? 'Administrator' : role === 'moderator' ? 'Moderator' : role === 'contributor' ? 'Trusted contributor' : 'Student'; }

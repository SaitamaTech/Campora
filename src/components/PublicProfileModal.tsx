import { BookOpen, GraduationCap, UserRound } from 'lucide-react';
import type { PublicStudentProfile } from '../lib/types';
import { Button, Modal } from './ui';

export function PublicProfileModal({ profile, loading, onClose }: { profile: PublicStudentProfile | null; loading: boolean; onClose: () => void }) {
  return <Modal title="Student profile" onClose={onClose}>
    {loading || !profile ? <div className="profile-view-loading"><span className="loading-logo"><img src="/campora-icon.svg" alt="" /></span><p>Loading public profile…</p></div> : <div className="public-profile-view">
      <div className="public-profile-hero"><span className="public-profile-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt={`${profile.full_name}'s profile`} /> : <UserRound size={27} />}</span><div><p className="eyebrow">CAMPUS PROFILE</p><h2>{profile.full_name}</h2>{profile.username && <span className="public-profile-username">@{profile.username}</span>}</div></div>
      {(profile.faculty || profile.department || profile.level) && <div className="public-profile-facts">{profile.faculty && <div><GraduationCap size={17} /><span><small>Faculty</small><b>{profile.faculty}</b></span></div>}{profile.department && <div><BookOpen size={17} /><span><small>Department</small><b>{profile.department}</b></span></div>}{profile.level && <div><span className="level-fact-icon">{profile.level.slice(0, 3)}</span><span><small>Level</small><b>{profile.level}</b></span></div>}</div>}
      {profile.bio && <div className="public-profile-bio"><span className="eyebrow">ABOUT</span><p>{profile.bio}</p></div>}
      <p className="public-profile-privacy">This view contains public student profile details only. Contact and account information are not shared.</p>
      <div className="form-actions"><Button onClick={onClose}>Done</Button></div>
    </div>}
  </Modal>;
}

export type Role = 'student' | 'contributor' | 'moderator' | 'administrator';
export type Page = 'home' | 'academics' | 'explore' | 'community' | 'profile';
export type ExploreTab = 'campus' | 'opportunities' | 'lost-found' | 'marketplace';
export type ExploreDraft = {
  item_type?: string;
  title?: string;
  description?: string;
  location_text?: string;
  approximate_date?: string;
  category?: string;
  price?: string;
  seller_name?: string;
  file?: File;
};

export interface Profile {
  id?: string;
  user_id?: string;
  full_name: string;
  email?: string;
  faculty?: string;
  department?: string;
  level?: string;
  avatar_path?: string;
  avatar_url?: string;
  role?: Role;
  is_verified_representative?: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  officially_verified: boolean;
  created_at: string;
  expires_at?: string | null;
  sample?: boolean;
}

export interface Resource {
  id: string;
  title: string;
  course_code: string;
  faculty: string;
  department: string;
  level: string;
  contributor: string;
  file_name?: string;
  file_url?: string;
  file_size?: number;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  sample?: boolean;
}

export interface CampusLocation {
  id: string;
  name: string;
  kind: string;
  description: string;
  directions_url?: string;
  latitude?: number;
  longitude?: number;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  eligibility: string;
  deadline?: string | null;
  application_url?: string;
  category: string;
  source?: string;
  verification_status: 'verified' | 'unverified' | 'expired';
}

export interface LostFoundItem {
  id: string;
  item_type: 'lost' | 'found';
  title: string;
  description: string;
  location_text: string;
  approximate_date?: string | null;
  image_url?: string;
  recovered: boolean;
  created_at: string;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  image_url?: string;
  seller_name: string;
  created_at: string;
  sold: boolean;
}

export interface CommunityPost {
  id: string;
  body: string;
  author_name: string;
  department?: string;
  created_at: string;
  reactions: number;
  comments: number;
  sample?: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  body: string;
  author_name: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  reference: string;
  subject: string;
  category: string;
  message: string;
  status: 'Open' | 'In Progress' | 'Awaiting Response' | 'Resolved' | 'Closed';
  created_at: string;
}

export interface SupportReply {
  id: string;
  ticket_id: string;
  responder_name: string;
  message: string;
  created_at: string;
}

export interface FeedbackItem {
  id: string;
  kind: string;
  message: string;
  anonymous: boolean;
  created_at: string;
}

export interface CamporaData {
  announcements: Announcement[];
  resources: Resource[];
  locations: CampusLocation[];
  opportunities: Opportunity[];
  lostFound: LostFoundItem[];
  listings: Listing[];
  posts: CommunityPost[];
  comments: CommunityComment[];
  tickets: SupportTicket[];
  supportReplies: SupportReply[];
  feedback: FeedbackItem[];
}

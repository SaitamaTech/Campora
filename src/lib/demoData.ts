import type { CamporaData } from './types';

// The preview dataset contains CAMPORA product examples only. It is not university information.
export const demoData: CamporaData = {
  announcements: [
    {
      id: 'sample-welcome',
      title: 'Your campus, connected.',
      body: 'CAMPORA brings campus updates, resources and student opportunities into one place. This is a product preview notice, not an official university announcement.',
      category: 'Platform update',
      officially_verified: false,
      created_at: new Date().toISOString(),
      sample: true,
    },
  ],
  resources: [],
  locations: [],
  opportunities: [],
  lostFound: [],
  listings: [],
  posts: [],
  comments: [],
  tickets: [],
  supportReplies: [],
  feedback: [],
};

export const demoStorageKey = 'campora-preview-v1';

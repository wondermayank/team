// ---------------------------------------------------------------------------
// DATA: members, rooms and the office layout. Edit this file to change the
// office; run "npm run build" afterwards (see README.txt).
// ---------------------------------------------------------------------------

export const TINTS = {
  b: '#5B8DF5', // blue
  v: '#8B6BFF', // violet
  g: '#3FB57A', // green
  a: '#F0A63A', // amber
  p: '#E8679A', // pink
  t: '#2FB5C2', // teal
};

// id -> display name, nickname, portrait file (assets/<file>.webp)
export const MEMBERS = {
  wondermayank: { name: 'Wondermayank', nick: 'Founder', file: 'mayank', skills: ['Leading the team','Business','Design','Web tools'] },
  anamika: { name: 'Anamika', nick: 'Princess', file: 'anamika', skills: ['Chartered accountancy','Client work','Accounts'] },
  aahan: { name: 'Aahan', nick: 'Mind Master', file: 'aahan', skills: ['Backend coding','ACCA study'] },
  pragya: { name: 'Pragya', nick: 'Moon Princess', file: 'pragya', skills: ['Teaching science','Medical study'] },
  aashi: { name: 'Aashi', nick: 'Mind Mistress', file: 'aashi', skills: ['Teaching','Lesson planning'] },
  sara: { name: 'Sara', nick: 'Soulful', file: 'sara', skills: ['Photo editing','IAS preparation'] },
  rohit: { name: 'Rohit', nick: 'Pika', file: 'rohit', skills: ['Study and focus','Teamwork'] },
  shruti: { name: 'Shruti', nick: 'Bubble', file: 'shruti', skills: ['Design','Sketching'] },
  sora: { name: 'Sora', nick: 'Lovely', file: 'sora', skills: ['Design','Layouts and visuals'] },
  mahi: { name: 'Mahi', nick: 'Tiny', file: 'mahi', skills: ['Singing','Music'] },
  nani: { name: 'Nani', nick: 'Chatterbox', file: 'nani', skills: ['Dancing','Chatting'] },
  rohan: { name: 'Rohan', nick: 'Code Ninja', file: 'rohan', skills: ['Python','Coding'] },
  raj: { name: 'Raj', nick: 'Champ', file: 'raj', skills: ['Sports','Fitness'] },
};

const PERSONAL_WHY =
  'Every member has a personal room, so everyone has a private, quiet space to study, rest and recharge. Rooms are private, so we always knock and wait before entering.';

const personal = (id, tint, blurb, why) => ({
  id,
  kind: 'personal',
  member: id,
  title: MEMBERS[id].name,
  tag: 'Personal room',
  sub: MEMBERS[id].nick,
  blurb,
  why: why + ' ' + PERSONAL_WHY,
  who: [id],
  tint,
});

const shared = (id, title, tint, blurb, why, who, props) => ({
  id, kind: 'shared', title, tag: 'Shared room', sub: 'Shared room', blurb, why, who, tint, props: props || id,
});

export const ROOMS = {};
[
  personal('wondermayank', 'v', "The founder's room, where ideas for new tools begin.",
    'Mayank leads the team and plans new tools, pages and projects from here. It is also where student requests are read and sorted.'),
  personal('anamika', 'g', 'A private room, separate from her CA client room.',
    'Anamika has her own room to rest and recharge, apart from her CA client room.'),
  personal('aahan', 't', 'A quiet room for backend coding and ACCA study.',
    'Aahan builds the backend of our tools and studies for ACCA, so a quiet room of his own really helps.'),
  personal('pragya', 'b', 'A calm room for medical study and science lessons.',
    'Pragya studies medicine and prepares simple science lessons for students, and she needs calm to do both.'),
  personal('aashi', 'p', 'A quiet room for study and preparing lessons.',
    'Aashi is our go-to teacher. This is where she studies and prepares clear explanations for students.'),
  personal('sara', 'a', 'A room for IAS preparation and photo editing.',
    'Sara prepares for the IAS and is our photo editing expert, so she needs a focused space for both.'),
  personal('rohit', 'b', 'A room for focused study and good rest.',
    'Rohit is a student at heart, and this room gives him a quiet place to focus and to rest.'),
  personal('shruti', 'v', 'A bright room for sketching and design ideas.',
    'Shruti is one of our designers. A room of her own is where her sketches and design ideas take shape.'),
  personal('sora', 'p', 'A cosy room for design work and creative ideas.',
    'Sora is one of our designers and works on layouts and visuals from this space.'),
  personal('mahi', 't', 'A room for resting her voice and practising songs.',
    'Mahi is our singer, so she has a personal space to rest her voice and practise quietly.'),
  personal('nani', 'a', 'A room for dance ideas and a lot of chatting.',
    'Nani is our dancer and the heart of every conversation. This is where she plans her dance ideas.'),
  personal('rohan', 'g', 'A room for Python projects and coding.',
    'Rohan is our Python developer, and this is where he builds and tests his projects in peace.'),
  personal('raj', 'b', 'A room for rest, recovery and staying fit.',
    'Raj is our sports player, and this room gives him a place to rest and recover.'),

  shared('living', 'Living room', 'a', 'Where all thirteen of us meet, eat and play.',
    'This is the heart of the office. We celebrate wins, share pizza, play Uno and just talk. It is the room that makes us feel like a family and not only a team.',
    ['Everyone']),
  shared('singing', 'Singing room', 'p', 'Music, practice and a lot of happy, off-key singing.',
    'Mahi leads the music here and anyone who wants to sing is welcome. A separate room keeps the noise away from teammates who are studying.',
    ['mahi', 'Everyone is welcome']),
  shared('dancing', 'Dancing room', 'b', 'Space to move, practise steps and have fun.',
    'Nani leads the dancing here and the rest of us join in, even when nobody knows the steps. A room of its own means we can dance as loudly as we like.',
    ['nani', 'Everyone is welcome']),
  shared('creativity', 'Creativity room', 'v', 'Posters, videos and shorts are planned here.',
    'We make posters, videos and short-form content for companies and for our own channels. This is where ideas are shared and made, away from the quiet study rooms.',
    ['sara', 'mahi', 'nani', 'Anyone with an idea']),
  shared('designer', 'Designer room', 'p', 'Layouts, logos and the look of every page.',
    'Everything you see on ThunderStudy, from posters to page layouts, is designed here. Keeping the design work in one room lets the designers share ideas and give quick feedback.',
    ['shruti', 'sora', 'sara', 'wondermayank']),
  shared('tech', 'Tech room', 't', 'Websites, mock test engines and AI tools are built here.',
    'The coders work together here on our websites, CBT mock tests and AI study tools. Building side by side makes it faster to fix bugs and learn from each other.',
    ['rohan', 'aahan', 'wondermayank']),
  shared('ca', 'CA room', 'g', "Anamika's room for CA client work.",
    'Anamika works with clients here. A separate room keeps client work and calls apart from our study and creative rooms.',
    ['anamika']),
  Object.assign(shared('rest', 'Rest room', 'b', 'A calm place to sit back and relax.',
    'A quiet room on the ground floor where team members and approved guests can rest between work and study.', ['Everyone']), { noPics: true, props: 'rest', tag: 'Ground floor' }),
  Object.assign(shared('sleep', 'Sleep room', 'v', 'Beds for a proper night of sleep.',
    'Late work nights are common, so this room has beds for anyone who needs to sleep close to the office.', ['Everyone']), { noPics: true, props: 'sleep', tag: 'Ground floor' }),
].forEach((r) => (ROOMS[r.id] = r));

// Photos from "Life with the team" that hang on the living room walls.
export const LIFE_PHOTOS = ['life-working', 'life-pizza', 'life-uno', 'life-dancing', 'life-singing', 'life-banter'];

// ---------------------------------------------------------------------------
// BUILDING. Five floors plus a terrace (levels 0..5). Floors 2 to 5 each have
// a corridor that runs north from the lobby (core hall).
//   halfw : half width of the corridor      pitch : room slot length
//   sideD : depth of side rooms             left / right : rooms walking north
//   end   : room at the far end             endSize : inner width x depth
//   privates : closed "Private" doors on the corridor walls
// ---------------------------------------------------------------------------
export const FLOORS = [
  { level: 0, name: 'Ground floor', sign: 'Waiting area', sub: 'Rest and sleep rooms' },
  { level: 1, name: 'Floor 2', sign: 'CA room', sub: "Anamika's client room", halfw: 5, minLength: 22, left: [], right: [],
    end: 'ca', endSize: [12, 9], endDoor: 2.6, privates: [{ side: -1, back: 5 }, { side: 1, back: 5 }] },
  { level: 2, name: 'Floor 3', sign: 'Team rooms', sub: 'All 13 members', halfw: 2, pitch: 6.6, sideD: 9.6, start: 0.3,
    left: ['anamika', 'aahan', 'pragya', 'aashi', 'sara', 'rohit'], right: ['shruti', 'sora', 'mahi', 'nani', 'rohan', 'raj'],
    end: 'wondermayank', endSize: [9, 10], endDoor: 2 },
  { level: 3, name: 'Floor 4', sign: 'Common rooms', sub: 'Singing, dancing, living room', halfw: 3, pitch: 9.4, sideD: 8.6, start: 0.3,
    left: ['singing'], right: ['dancing'], end: 'living', endSize: [14, 10], endDoor: 2.6 },
  { level: 4, name: 'Floor 5', sign: 'Creative floor', sub: 'Creativity, designer, tech', halfw: 3, pitch: 9.4, sideD: 8.6, start: 0.3,
    left: ['creativity'], right: ['designer'], end: 'tech', endSize: [14, 10], endDoor: 2.6 },
];

// Members whose bathroom picture exists (assets/bath-<id>.webp). Add more ids here later.
export const BATH_IMAGES = ['wondermayank', 'anamika'];

// Framed pictures in the building (assets/<file>.webp)
export const EXTRA_PICS = {
  building: { file: 'building', title: 'Our building', tag: 'Thunder Office', why: 'Our five-floor home: a waiting area and rest rooms on the ground floor, the CA room on floor 2, the 13 member rooms on floor 3, common rooms on floors 4 and 5, and a terrace pool on top.' },
  terrace: { file: 'terrace', title: 'Terrace and pool', tag: 'Terrace', why: 'The roof terrace has a swimming pool, a garden swing and sofas. It is where the team relaxes after a long work night.' },
};

export const RULES = [
  'Knock and wait. Every room is private.',
  "Visitors need a team member's approval.",
  'Sign in at the waiting area first.',
  'No leaked or pirated material.',
  'Everything we publish is checked before it goes live.',
  'Be kind and keep the corridors calm.',
];

// Where the visitor starts: outside, at the garden entry.
export const SPAWN = 'outside';

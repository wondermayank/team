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
  wondermayank: { name: 'Wondermayank', nick: 'Founder', file: 'mayank' },
  anamika: { name: 'Anamika', nick: 'Princess', file: 'anamika' },
  aahan: { name: 'Aahan', nick: 'Mind Master', file: 'aahan' },
  pragya: { name: 'Pragya', nick: 'Moon Princess', file: 'pragya' },
  aashi: { name: 'Aashi', nick: 'Mind Mistress', file: 'aashi' },
  sara: { name: 'Sara', nick: 'Soulful', file: 'sara' },
  rohit: { name: 'Rohit', nick: 'Pika', file: 'rohit' },
  shruti: { name: 'Shruti', nick: 'Bubble', file: 'shruti' },
  sora: { name: 'Sora', nick: 'Lovely', file: 'sora' },
  mahi: { name: 'Mahi', nick: 'Tiny', file: 'mahi' },
  nani: { name: 'Nani', nick: 'Chatterbox', file: 'nani' },
  rohan: { name: 'Rohan', nick: 'Code Ninja', file: 'rohan' },
  raj: { name: 'Raj', nick: 'Champ', file: 'raj' },
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
].forEach((r) => (ROOMS[r.id] = r));

// Photos from "Life with the team" that hang on the living room walls.
export const LIFE_PHOTOS = ['life-working', 'life-pizza', 'life-uno', 'life-dancing', 'life-singing', 'life-banter'];

// ---------------------------------------------------------------------------
// LAYOUT. A central hub with four corridors.
//   heading : N / E / S / W (direction the corridor leaves the hub)
//   left / right : rooms on each side, as you walk AWAY from the hub
//   end : the room at the far end of the corridor
//   endSize : inner width x depth of the end room, in metres
// ---------------------------------------------------------------------------
export const LAYOUT = [
  {
    id: 'c1', heading: 'N', name: 'Corridor 1', sign: 'Team rooms', sub: 'All 13 members',
    left: ['anamika', 'aahan', 'pragya', 'aashi', 'sara', 'rohit'],
    right: ['shruti', 'sora', 'mahi', 'nani', 'rohan', 'raj'],
    end: 'wondermayank', endSize: [6.3, 8.6], pitch: 6.6, sideD: 8.6, start: 4.2,
  },
  {
    id: 'c2', heading: 'S', name: 'Corridor 2', sign: 'Shared rooms', sub: 'Singing, creativity, living room',
    left: ['singing'], right: ['creativity'],
    end: 'living', endSize: [7.2, 6.4], minLength: 8, start: 4.2,
    extra: [],
  },
  {
    id: 'c3', heading: 'E', name: 'Corridor 3', sign: 'Work rooms', sub: 'Tech, designer, dancing',
    left: ['tech'], right: ['designer'],
    end: 'dancing', endSize: [6.4, 5.6], minLength: 8, start: 4.6,
    extra: [{ side: -1, zc: 2.4, title: 'Stairs up', sub: 'Terrace and pool', tint: 'v' }],
  },
  {
    id: 'c4', heading: 'W', name: 'Corridor 4', sign: 'CA room', sub: 'Anamika\'s client room',
    left: [], right: [],
    end: 'ca', endSize: [5.6, 5.2], minLength: 10, cross: [6.4],
    extra: [{ side: -1, zc: 2.4, title: 'Stairs down', sub: 'Exit', tint: 'a' }],
  },
];

// Where the visitor starts.
export const SPAWN = 'hub';

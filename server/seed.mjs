import bcrypt from "bcryptjs";
import { randomUUID, randomBytes } from "node:crypto";
export const demoIds = Array.from(
  { length: 10 },
  (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const portrait = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=85`;
export async function seed(db) {
  if (
    (await db.query("SELECT id FROM users WHERE id=$1", [demoIds[0]])).rows
      .length
  )
    return;
  const pass = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
  const profiles = [
    [
      "Aarav",
      "aarav",
      "1998-05-14",
      "man",
      "Mumbai",
      "Coffee, conversations, and the occasional spontaneous trip.",
      ["Coffee", "Travel", "Music"],
      "user",
      null,
    ],
    [
      "Ananya",
      "ananya",
      "2000-07-12",
      "woman",
      "Mumbai",
      "Collecting sunsets, not things. Always up for a good coffee and a better conversation.",
      ["Travel", "Photography", "Coffee"],
      "creator",
      portrait("photo-1534528741775-53994a69daeb"),
    ],
    [
      "Riya",
      "riya",
      "1999-03-21",
      "woman",
      "Bengaluru",
      "A little music, a little adventure. Let’s find the best live gig in the city.",
      ["Music", "Art", "Hiking"],
      "creator",
      portrait("photo-1524504388940-b1c1722653e1"),
    ],
    [
      "Karthik",
      "karthik",
      "1997-11-10",
      "man",
      "Hyderabad",
      "Weekend explorer. Weekday designer. I know a great place for biryani.",
      ["Design", "Food", "Travel"],
      "user",
      portrait("photo-1506794778202-cad84cf45f1d"),
    ],
    [
      "Neha",
      "neha",
      "2001-01-17",
      "woman",
      "Delhi",
      "Making art and finding magic in ordinary days. Come paint with me.",
      ["Art", "Books", "Yoga"],
      "influencer",
      portrait("photo-1524250502761-1ac6f2e30d43"),
    ],
    [
      "Arjun",
      "arjun",
      "1998-09-03",
      "man",
      "Mumbai",
      "Acoustic evenings, long walks, and new stories.",
      ["Music", "Running", "Coffee"],
      "creator",
      portrait("photo-1500648767791-00dcc994a43e"),
    ],
    [
      "Meera",
      "meera",
      "2000-12-09",
      "woman",
      "Pune",
      "Bookshop enthusiast. Learning to say yes to more adventures.",
      ["Books", "Travel", "Food"],
      "user",
      portrait("photo-1531123897727-8f129e1688ce"),
    ],
    [
      "Kabir",
      "kabir",
      "1996-04-26",
      "man",
      "Goa",
      "Salt in the air, camera in hand. Always chasing the next great view.",
      ["Photography", "Surfing", "Travel"],
      "creator",
      portrait("photo-1517841905240-472988babdf9"),
    ],
    [
      "Priya",
      "priya",
      "1999-06-30",
      "woman",
      "Mumbai",
      "Food walks and film nights. Tell me your most underrated city spot.",
      ["Food", "Film", "Coffee"],
      "user",
      portrait("photo-1526510747491-58f928ec870f"),
    ],
    [
      "Moderator",
      "moderator",
      "1990-01-01",
      "custom",
      "Mumbai",
      "Development moderator. This account exists only in demo mode.",
      [],
      "user",
      null,
    ],
  ];
  await db.transaction(async (tx) => {
    for (let i = 0; i < profiles.length; i++) {
      const [name, username, dob, gender, city, bio, interests, role, avatar] =
        profiles[i];
      await tx.query(
        "INSERT INTO users(id,email,username,password_hash,display_name,dob,gender,city,bio,interests,role,avatar_url,email_verified,is_demo,staff_role) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,true,$13)",
        [
          demoIds[i],
          `${username}@demo.flingtopia.local`,
          username,
          pass,
          name,
          dob,
          gender,
          city,
          bio,
          interests,
          role,
          avatar,
          i === 9 ? "moderator" : null,
        ],
      );
    }
    for (const index of [1, 3])
      await tx.query("INSERT INTO likes(user_id,target_id) VALUES($1,$2)", [
        demoIds[index],
        demoIds[0],
      ]);
    const matchId = randomUUID();
    await tx.query("INSERT INTO matches(id,user_a,user_b) VALUES($1,$2,$3)", [
      matchId,
      demoIds[0],
      demoIds[2],
    ]);
    for (const [a, b] of [
      [0, 2],
      [2, 0],
    ])
      await tx.query("INSERT INTO likes(user_id,target_id) VALUES($1,$2)", [
        demoIds[a],
        demoIds[b],
      ]);
    await tx.query(
      "INSERT INTO messages(id,match_id,sender_id,body,client_id) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        matchId,
        demoIds[2],
        "Hey Aarav! Are you going to the acoustic evening? I heard the lineup is amazing 🎶",
        randomUUID(),
      ],
    );
    const events = [
      [
        "Sunset social",
        "A relaxed evening by the water. Meet new people, share a few stories, and catch the golden hour.",
        "Outdoors",
        "Mumbai",
        "Marine Drive promenade",
        7,
        "photo-1507525428034-b723cf961d3e",
        24,
      ],
      [
        "Coffee & conversations",
        "Pull up a chair for a small gathering of curious minds. Your next good conversation starts here.",
        "Community",
        "Bengaluru",
        "Indiranagar coffee house",
        10,
        "photo-1501339847302-ac426a4a7cbb",
        12,
      ],
      [
        "Acoustic evenings",
        "An intimate evening of acoustic music and new connections. Bring a friend or come as you are.",
        "Music",
        "Pune",
        "The Listening Room",
        14,
        "photo-1516280440614-37939bbacd81",
        30,
      ],
    ];
    for (const [
      title,
      description,
      category,
      city,
      venue,
      days,
      image,
      capacity,
    ] of events) {
      const starts = new Date(Date.now() + days * 86400000);
      starts.setUTCHours(12, 30, 0, 0);
      await tx.query(
        "INSERT INTO events(id,title,description,category,city,venue,starts_at,image_url,capacity,is_demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)",
        [
          randomUUID(),
          title,
          description,
          category,
          city,
          venue,
          starts,
          portrait(image),
          capacity,
        ],
      );
    }
  });
}

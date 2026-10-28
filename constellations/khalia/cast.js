// Life Constellation — Khalia (born 6 Sept 1999). Ages are Khalia's age.
// side: L/R of me; rank: 1 = closest lane. apart: [from, to) drifts to the edge, dim.
// with: follows that person's apart spans. origin: where a newcomer's line comes from.
// star: { at, x, y } fixed spot in the sky (top half). Ages marked * are imagined.
window.LC_CONFIG = {
  me: "khalia",
  child: "roman",
  endAge: 85,
  preRoll: 2,
  clockSeconds: 116,
  // [fromAge, toAge, seconds per year] — normalised so 0→85 fills the clock.
  clockBands: [
    [0, 5, 1.6], [5, 20, 1.25], [20, 30, 1.6], [30, 46, 0.5],
    [46, 55, 0.95], [55, 67, 1.55], [67, 74, 0.75], [74, 85, 1.45],
  ],
  constellation: ["khalia", "stephen", "mom", "grandma", "meama", "dad", "khalia"],
  title: "Life is a journey",
  subtitle: ["Some walk with you for a while.", "Others stay in your sky forever."],
  people: [
    { id: "khalia", name: "Khalia", color: "#FFD36E" },

    // Mom's side (left, warm pinks)
    { id: "mom", name: "Mom", color: "#FF7FA8", side: "L", rank: 1,
      apart: [[16, 21], [21.5, 25]], apartSide: "L", star: { at: 66, x: 900, y: 440 } },
    { id: "aminu", name: "Aminu", color: "#E8A07A", side: "L", rank: 2, from: 8, origin: "left",
      apart: [[16, 27]], apartSide: "L", star: { at: 63, x: 85, y: 270 } },
    { id: "yussef", name: "Yussef", color: "#FF9E8A", side: "L", rank: 3, from: 13, origin: "mom", with: "mom", apartSide: "L" },
    { id: "samiyah", name: "Samiyah", color: "#FFB8D9", side: "L", rank: 4, from: 17, origin: "mom", with: "mom", apartSide: "L" },
    { id: "shareef", name: "Shareef", color: "#FFD0A8", side: "L", rank: 5, from: 25, origin: "mom", with: "mom", apartSide: "L" },
    { id: "grandma", name: "Grandma", color: "#A99BFF", side: "L", rank: 6,
      apart: [[16, 25]], apartSide: "L", star: { at: 49, x: 720, y: 215 } },
    { id: "meama", name: "Meama", color: "#FF9F4A", side: "L", rank: 7, star: { at: 22, x: 400, y: 185 } },

    // Dad's side (right, blues)
    { id: "jamila", name: "Jamila", color: "#C6B3FF", side: "R", rank: 3, star: { at: 78, x: 235, y: 85 } },
    { id: "dad", name: "Dad", color: "#5AB0FF", side: "R", rank: 4,
      apart: [[8, 16], [16.5, 20]], apartSide: "R", star: { at: 61, x: 190, y: 445 } },
    { id: "anna", name: "Anna", color: "#8EC9FF", side: "R", rank: 5, from: 12, origin: "right", with: "dad", apartSide: "R",
      star: { at: 57, x: 80, y: 610 } },
    { id: "sahara", name: "Sahara", color: "#B8E6FF", side: "R", rank: 6, from: 13, origin: "dad", with: "dad", apartSide: "R" },

    // Friends
    { id: "jackie", name: "Jackie", color: "#FF6B6B", side: "L", rank: 9, from: 11, origin: "left", leaves: { at: 13, side: "L" } },
    { id: "jennifer", name: "Jennifer", color: "#D38BFF", side: "L", rank: 8, from: 14, origin: "left", star: { at: 76, x: 215, y: 715 } },
    { id: "kalena", name: "Kalena", color: "#E6E86A", side: "L", rank: 10, from: 22, origin: "left",
      changes: [{ at: 27, gap: 1.8, alpha: 0.62, label: "drifts a little further out" }], star: { at: 83, x: 330, y: 835 } },
    { id: "kissam", name: "Kissam", color: "#9AF0D8", side: "L", rank: 11, from: 24, origin: "kalena" },

    // Stephen's family (right, greens)
    { id: "stephen", name: "Stephen", color: "#3EE6C0", side: "R", rank: 2, from: 21, origin: "right",
      changes: [{ at: 24, gap: 0.55, rename: "Stephen ♥", flash: true, label: "becomes my husband" }],
      star: { at: 80, x: 770, y: 690 } },
    { id: "ren", name: "Ren", color: "#8FF0E8", side: "R", rank: 7, from: 21, origin: "right", star: { at: 84, x: 975, y: 800 } },
    { id: "johna", name: "Johna", color: "#B5EB6A", side: "R", rank: 8, from: 21, origin: "right", star: { at: 60, x: 1000, y: 290 } },
    { id: "steve", name: "Steve", color: "#7FE09A", side: "R", rank: 9, from: 21, origin: "right", star: { at: 56, x: 1000, y: 590 } },
    { id: "nana", name: "Nana", color: "#F28AD8", side: "R", rank: 10, from: 21, origin: "right", star: { at: 25, x: 860, y: 95 } },
    { id: "pop", name: "Pop", color: "#7F9CFF", side: "R", rank: 11, from: 21, origin: "right", star: { at: 29, x: 560, y: 70 } },

    // Next generation
    { id: "roman", name: "Roman", color: "#FFF1C9", side: "R", rank: 1, from: 26.5, origin: "khalia" },
  ],
};

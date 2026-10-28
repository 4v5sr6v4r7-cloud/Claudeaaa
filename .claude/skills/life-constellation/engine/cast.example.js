// Life Constellation — default cast (no real people). Ages are MY age.
// kind: family (there before I'm born) | joins (from) | crosses (passes at `from`, gone ~3 s later)
// leaves: { at, side } bends off-screen.  star: { at, x, y } becomes a star at a fixed spot (top half).
// apart: [[from, to], ...] drifts to the screen edge and dims, then rejoins.  with: follows another person's apart spans.
// side: L/R of me, rank: 1 = closest lane.  origin: "left" | "right" | <id> (a child is born out of a parent's line).
// changes: [{ at, gap, alpha, rename, flash, label }] closer/further lane, dimmer, new label.
window.LC_CONFIG = {
  me: "me",
  child: "son",
  endAge: 85,
  preRoll: 2,
  clockSeconds: 116,
  clockBands: [[0, 5, 1.6], [5, 20, 1.3], [20, 32, 1.3], [32, 60, 0.55], [60, 74, 1.0], [74, 85, 1.5]],
  constellation: ["me", "wife", "mom", "grandma", "grandpa", "dad", "me"],
  title: "Life is a journey",
  subtitle: ["Some walk with you for a while.", "Others stay in your sky forever."],
  people: [
    { id: "me", name: "Me", color: "#FFD36E" },
    { id: "mom", name: "Mom", color: "#FF7FA8", side: "L", rank: 1, star: { at: 70, x: 900, y: 440 } },
    { id: "grandma", name: "Grandma", color: "#A99BFF", side: "L", rank: 2, star: { at: 30, x: 720, y: 215 } },
    { id: "dad", name: "Dad", color: "#5AB0FF", side: "R", rank: 3, star: { at: 66, x: 190, y: 445 } },
    { id: "grandpa", name: "Grandpa", color: "#FF9F4A", side: "R", rank: 4, star: { at: 18, x: 400, y: 185 } },
    { id: "kinder", name: "Kindergarten friend", color: "#9AF0D8", kind: "crosses", from: 4.5 },
    { id: "childhood", name: "Childhood friend", color: "#FF6B6B", side: "L", rank: 3, from: 6, origin: "left", leaves: { at: 12, side: "L" } },
    { id: "grade", name: "Grade school friend", color: "#B5EB6A", kind: "crosses", from: 9, direction: "rtl" },
    { id: "middle", name: "Middle school friend", color: "#E6E86A", kind: "crosses", from: 13 },
    { id: "firstlove", name: "First love", color: "#F28AD8", side: "R", rank: 2, from: 16, origin: "right", leaves: { at: 18, side: "R" } },
    { id: "highschool", name: "High school friend", color: "#8EC9FF", kind: "crosses", from: 16.8, direction: "rtl" },
    { id: "college", name: "College friend", color: "#D38BFF", side: "L", rank: 4, from: 19, origin: "left", leaves: { at: 23, side: "L" } },
    { id: "wife", name: "Wife", color: "#3EE6C0", side: "R", rank: 2, from: 26, origin: "right",
      changes: [{ at: 28, gap: 0.6, flash: true, label: "wedding" }], star: { at: 83, x: 770, y: 690 } },
    { id: "coworker", name: "Coworker", color: "#7FE09A", kind: "crosses", from: 31 },
    { id: "son", name: "Son", color: "#FFF1C9", side: "R", rank: 1, from: 33, origin: "me" },
  ],
};

export const BASIC_ENERGY_NAMES = new Set([
  "Grass Energy",       "Basic Grass Energy",
  "Fire Energy",        "Basic Fire Energy",
  "Water Energy",       "Basic Water Energy",
  "Lightning Energy",   "Basic Lightning Energy",
  "Psychic Energy",     "Basic Psychic Energy",
  "Fighting Energy",    "Basic Fighting Energy",
  "Darkness Energy",    "Basic Darkness Energy",
  "Metal Energy",       "Basic Metal Energy",
  "Fairy Energy",       "Basic Fairy Energy",
  "Dragon Energy",      "Basic Dragon Energy",
  "Colorless Energy",   "Basic Colorless Energy",
]);

export const isBasicEnergy = (name) => BASIC_ENERGY_NAMES.has(name);

export const formatDeckList = (cards) => {
  if (!cards || cards.length === 0) return "";
  const sections = [
    { label: "Pokémon", cards: cards.filter((c) => c.category === "Pokemon") },
    { label: "Trainer", cards: cards.filter((c) => c.category === "Trainer") },
    { label: "Energy",  cards: cards.filter((c) => c.category === "Energy") },
  ];
  return sections
    .filter((s) => s.cards.length > 0)
    .map((s) => {
      const lines = s.cards.map((c) => `${c.count} ${c.name} ${c.setId} ${c.number}`);
      return `${s.label}\n${lines.join("\n")}`;
    })
    .join("\n\n");
};

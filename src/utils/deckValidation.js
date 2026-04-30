import { isBasicEnergy } from "./deckUtils";

// Returns a consistent validation summary for any deck (array of card objects).
// hasBasicPokemon is true when there are no Pokémon at all, OR when at least
// one Basic Pokémon is present — mirrors tournament legality rules.
export const validateDeck = (cards) => {
  const totalCards = cards.reduce((s, c) => s + c.count, 0);
  const hasIllegalCards = cards.some((c) => !c.isStandardLegal);
  const hasPokemon = cards.some((c) => c.category === "Pokemon");
  const hasBasicPokemon =
    !hasPokemon || cards.some((c) => c.category === "Pokemon" && c.stage === "Basic");
  const hasOverLimit = cards.some((c) => !isBasicEnergy(c.name) && c.count > 4);
  return { totalCards, hasIllegalCards, hasBasicPokemon, hasOverLimit };
};

import { STANDARD_REG_MARKS, ENERGY_TYPES } from "../config/deckConfig";
import { isBasicEnergy } from "./deckUtils";

export const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

export const calcStandardLegal = (card) =>
  isBasicEnergy(card.name) || card.legal?.standard === true || STANDARD_REG_MARKS.has(card.regulationMark);

export const calcExpandedLegal = (card) =>
  isBasicEnergy(card.name) || card.legal?.expanded === true || STANDARD_REG_MARKS.has(card.regulationMark);

// Basic energy cards have no types[] in TCGdex — infer from name ("Water Energy" → "Water")
export const getCardTypes = (card) => {
  if (Array.isArray(card.types) && card.types.length > 0) return card.types;
  const name = (card.name || "").toLowerCase();
  if (!name.endsWith("energy")) return [];
  const found = ENERGY_TYPES.find((t) => name.includes(t.toLowerCase()));
  return found ? [found] : [];
};

// TCGdex list endpoint returns set as a plain string ID; full card objects return {id, name}
export const getSetId = (set) => (typeof set === "string" ? set : set?.id ?? "");
export const getSetName = (set) => (typeof set === "string" ? set : set?.name ?? "");

export const padCardNumber = (n) =>
  /^\d{1,2}$/.test(String(n)) ? String(n).padStart(3, "0") : String(n);

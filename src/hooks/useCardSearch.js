import { useState, useEffect, useRef } from "react";
import { ITEMS_PER_PAGE } from "../config/deckConfig";
import { BASIC_ENERGY_NAMES } from "../utils/deckUtils";
import {
  TCGDEX_BASE,
  calcStandardLegal,
  calcExpandedLegal,
  getCardTypes,
  getSetId,
  getSetName,
  padCardNumber,
} from "../utils/tcgdexUtils";

// ── Internal helpers ────────────────────────────────────────────────────────

const extractSetId = (cardId) => {
  if (!cardId) return "";
  const i = cardId.lastIndexOf("-");
  return i === -1 ? cardId : cardId.slice(0, i);
};

export { extractSetId };

const parseSearchQuery = (query, sets, setsLegality) => {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const remaining = [...tokens];

  const codeToSetId = {};
  const idToSetId = {};
  const nameToSetId = {};
  for (const s of sets) {
    idToSetId[s.id.toLowerCase()] = s.id;
    nameToSetId[s.name.toLowerCase()] = s.id;
  }
  for (const [setId, info] of Object.entries(setsLegality)) {
    if (info.officialCode) codeToSetId[info.officialCode.toLowerCase()] = setId;
  }

  let numberFilter = null;
  for (let i = 0; i < remaining.length; i++) {
    if (/^\d{1,3}$/.test(remaining[i])) {
      numberFilter = remaining.splice(i, 1)[0];
      break;
    }
  }

  let setFilter = null;
  for (let i = 0; i < remaining.length && !setFilter; i++) {
    const t = remaining[i];
    if (codeToSetId[t]) { setFilter = codeToSetId[t]; remaining.splice(i, 1); }
    else if (idToSetId[t]) { setFilter = idToSetId[t]; remaining.splice(i, 1); }
  }
  if (!setFilter) {
    outer: for (let size = remaining.length; size >= 1; size--) {
      for (let start = 0; start <= remaining.length - size; start++) {
        const phrase = remaining.slice(start, start + size).join(" ");
        if (nameToSetId[phrase]) {
          setFilter = nameToSetId[phrase];
          remaining.splice(start, size);
          break outer;
        }
      }
    }
  }
  if (!setFilter) {
    const setNames = Object.keys(nameToSetId);
    outer2: for (let size = remaining.length; size >= 1; size--) {
      for (let start = 0; start <= remaining.length - size; start++) {
        const phrase = remaining.slice(start, start + size).join(" ");
        if (phrase.length < 5) continue;
        const match = setNames.find((n) => n.startsWith(phrase));
        if (match) {
          setFilter = nameToSetId[match];
          remaining.splice(start, size);
          break outer2;
        }
      }
    }
  }

  const name = remaining.join(" ")
    .replace(/\bpokemon\b/g, "pokémon")
    .replace(/\bpoke\b/g, "poké");
  return { name, setFilter, numberFilter };
};

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Manages card search state and API calls for the DeckBuilder.
 *
 * setsLegalityRef — a ref to DeckBuilder's setsLegality map, kept in sync by
 * the parent so the search effect always reads fresh data without depending on
 * setsLegality as a reactive value (which would restart the search on every
 * abbreviation fetch).
 */
export const useCardSearch = ({
  searchQuery,
  selectedSet,
  categoryFilter,
  typeFilter,
  formatFilter,
  sets,
  setsLegalityRef,
  ensureSetOfficialCode,
}) => {
  const [allResults, setAllResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const searchTimeoutRef = useRef(null);
  const cardCacheRef = useRef({});
  const cardDetailFetchRef = useRef({});

  // ── Derived: filter + paginate results ────────────────────────────────────

  const filteredResults = allResults
    .filter((c) =>
      formatFilter === "standard" ? c.isStandardLegal
        : formatFilter === "expanded" ? c.isExpandedLegal
        : true
    )
    .filter((c) => {
      if (categoryFilter === "all") return true;
      if (categoryFilter === "Pokemon")       return c.category === "Pokemon";
      if (categoryFilter === "Trainer")       return c.category === "Trainer";
      if (categoryFilter === "Item")          return c.category === "Trainer" && c.trainerType === "Item";
      if (categoryFilter === "Supporter")     return c.category === "Trainer" && c.trainerType === "Supporter";
      if (categoryFilter === "Stadium")       return c.category === "Trainer" && c.trainerType === "Stadium";
      if (categoryFilter === "Tool")          return c.category === "Trainer" && c.trainerType === "Tool";
      if (categoryFilter === "Energy")        return c.category === "Energy" && (typeFilter ? getCardTypes(c).includes(typeFilter) : true);
      if (categoryFilter === "SpecialEnergy") return c.category === "Energy";
      return true;
    })
    .sort((a, b) => {
      if (selectedSet) {
        const na = parseInt(a.localId, 10);
        const nb = parseInt(b.localId, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a.localId ?? "").localeCompare(String(b.localId ?? ""));
      }
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / ITEMS_PER_PAGE));
  const pageResults = filteredResults.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // ── Effect: enrich card details for current page when browsing a set ──────

  useEffect(() => {
    if (!selectedSet || pageResults.length === 0) return;

    const missingDetailIds = pageResults
      .map((c) => c.id)
      .filter(Boolean)
      .filter((id) => {
        const card = pageResults.find((c) => c.id === id);
        if (!card) return false;
        const cached = cardCacheRef.current[id];
        const hasDetail = !!(card.regulationMark || card.legal || cached?.regulationMark || cached?.legal);
        return !hasDetail && !cardDetailFetchRef.current[id];
      });

    if (missingDetailIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled(
        missingDetailIds.map((id) => {
          const req = fetch(`${TCGDEX_BASE}/cards/${id}`)
            .then((r) => r.json())
            .then((full) => {
              cardCacheRef.current[id] = { ...(cardCacheRef.current[id] || {}), ...full };
              return [id, full];
            })
            .finally(() => { delete cardDetailFetchRef.current[id]; });
          cardDetailFetchRef.current[id] = req;
          return req;
        })
      );

      if (cancelled) return;

      const byId = {};
      for (const r of results) {
        if (r.status === "fulfilled") {
          const [id, full] = r.value;
          byId[id] = full;
        }
      }
      if (Object.keys(byId).length === 0) return;

      setAllResults((prev) =>
        prev.map((card) => {
          const full = byId[card.id];
          if (!full) return card;
          const merged = { ...card, ...full };
          const hasLegalityData = merged.legal || merged.regulationMark;
          return {
            ...merged,
            isStandardLegal: hasLegalityData ? calcStandardLegal(merged) : (card.isStandardLegal ?? true),
            isExpandedLegal: hasLegalityData ? calcExpandedLegal(merged) : (card.isExpandedLegal ?? true),
          };
        })
      );
    })();

    return () => { cancelled = true; };
  }, [pageResults, selectedSet]);

  // ── Effect: reset page when format changes ────────────────────────────────

  useEffect(() => {
    setCurrentPage(1);
  }, [formatFilter]);

  // ── Effect: main search ───────────────────────────────────────────────────

  useEffect(() => {
    clearTimeout(searchTimeoutRef.current);
    if (searchQuery.trim() || selectedSet || categoryFilter !== "all" || typeFilter) {
      setIsSearching(true);
    }
    searchTimeoutRef.current = setTimeout(async () => {
      if (!searchQuery.trim() && !selectedSet && categoryFilter === "all" && !typeFilter) {
        setAllResults([]);
        setHasSearched(false);
        setCurrentPage(1);
        setIsSearching(false);
        return;
      }
      setHasSearched(true);
      try {
        let cards = [];
        if (selectedSet) {
          const setName = sets.find((s) => s.id === selectedSet)?.name || selectedSet;
          const { name: nameQuery, numberFilter } = parseSearchQuery(
            searchQuery, sets, setsLegalityRef.current
          );

          const apiParams = { "set.id": selectedSet };
          if (nameQuery) apiParams.name = nameQuery;
          if (categoryFilter === "Pokemon") {
            apiParams.category = "Pokemon";
          } else if (["Trainer", "Item", "Supporter", "Stadium", "Tool"].includes(categoryFilter)) {
            apiParams.category = "Trainer";
            if (categoryFilter === "Item") apiParams.trainerType = "Item";
            else if (categoryFilter === "Supporter") apiParams.trainerType = "Supporter";
            else if (categoryFilter === "Stadium") apiParams.trainerType = "Stadium";
            else if (categoryFilter === "Tool") apiParams.trainerType = "Tool";
          } else if (["Energy", "SpecialEnergy"].includes(categoryFilter)) {
            apiParams.category = "Energy";
            if (categoryFilter === "SpecialEnergy") apiParams.energyType = "Special";
          }
          // For selected-set queries, avoid API `types` filter so basic energies
          // (which often lack types[] in stubs) are not dropped.

          const data = await fetch(
            `${TCGDEX_BASE}/cards?${new URLSearchParams(apiParams)}`
          ).then((r) => r.json());
          let allSetCards = (Array.isArray(data) ? data : []).filter(
            (c) => extractSetId(c.id) === selectedSet
          );

          if (typeFilter) {
            allSetCards = allSetCards.filter((card) => getCardTypes(card).includes(typeFilter));
          }
          if (numberFilter) {
            const n = numberFilter.replace(/^0+/, "");
            allSetCards = allSetCards.filter(
              (c) => String(c.localId ?? "").replace(/^0+/, "") === n
            );
          }

          ensureSetOfficialCode(selectedSet);

          cards = allSetCards.map((card) => {
            const hasLegalityData = card.legal || card.regulationMark;
            return {
              ...card,
              set: { id: selectedSet, name: setName },
              // List responses can be stubs without legality fields; avoid hiding
              // all cards under default Standard filter when data is missing.
              isStandardLegal: hasLegalityData ? calcStandardLegal(card) : true,
              isExpandedLegal: hasLegalityData ? calcExpandedLegal(card) : true,
            };
          });
        } else {
          const { name, setFilter, numberFilter } = parseSearchQuery(
            searchQuery, sets, setsLegalityRef.current
          );
          if (!name && !setFilter && !numberFilter && categoryFilter === "all" && !typeFilter) {
            setAllResults([]);
            setHasSearched(false);
            setCurrentPage(1);
            setIsSearching(false);
            return;
          }

          // Fast path: exact set + number → direct card ID lookup
          if (setFilter && numberFilter && !name && categoryFilter === "all" && !typeFilter) {
            const paddedNum = padCardNumber(numberFilter);
            const unpaddedNum = String(parseInt(numberFilter, 10));
            const candidates = [...new Set([`${setFilter}-${paddedNum}`, `${setFilter}-${unpaddedNum}`])];
            const results = await Promise.allSettled(
              candidates.map((id) => {
                if (cardCacheRef.current[id]) return Promise.resolve(cardCacheRef.current[id]);
                return fetch(`${TCGDEX_BASE}/cards/${id}`)
                  .then((r) => r.json())
                  .then((card) => { cardCacheRef.current[id] = card; return card; })
                  .catch(() => null);
              })
            );
            const seen = new Set();
            cards = results
              .filter((r) => r.status === "fulfilled" && r.value?.id)
              .map((r) => r.value)
              .filter((c) => !seen.has(c.id) && seen.add(c.id))
              .map((card) => {
                const setId = extractSetId(card.id);
                const setName = sets.find((s) => s.id === setId)?.name || setId;
                return {
                  ...card,
                  set: { id: setId, name: setName },
                  isStandardLegal: calcStandardLegal(card),
                  isExpandedLegal: calcExpandedLegal(card),
                };
              });
            setAllResults(cards);
            setCurrentPage(1);
            setIsSearching(false);
            return;
          }

          const apiParams = {};
          if (name) apiParams.name = name;
          if (setFilter) apiParams["set.id"] = setFilter;
          if (categoryFilter === "Pokemon") {
            apiParams.category = "Pokemon";
          } else if (["Trainer", "Item", "Supporter", "Stadium", "Tool"].includes(categoryFilter)) {
            apiParams.category = "Trainer";
            if (categoryFilter === "Item") apiParams.trainerType = "Item";
            else if (categoryFilter === "Supporter") apiParams.trainerType = "Supporter";
            else if (categoryFilter === "Stadium") apiParams.trainerType = "Stadium";
            else if (categoryFilter === "Tool") apiParams.trainerType = "Tool";
          } else if (["Energy", "SpecialEnergy"].includes(categoryFilter)) {
            apiParams.category = "Energy";
            if (categoryFilter === "SpecialEnergy") apiParams.energyType = "Special";
          }
          // Basic energies often miss types[] in list responses, so API-level
          // type filtering drops them. Let client-side filtering handle Energy.
          if (typeFilter && categoryFilter !== "Energy") apiParams.types = typeFilter;

          // When a set was inferred from the query text, also search the full raw
          // query as a card name so cards whose names share words with set names appear.
          const fullNameFetch = setFilter
            ? fetch(`${TCGDEX_BASE}/cards?${new URLSearchParams({ name: searchQuery.trim() })}`).then((r) => r.json()).catch(() => [])
            : Promise.resolve([]);
          const energyFetch = (typeFilter && categoryFilter === "all")
            ? fetch(`${TCGDEX_BASE}/cards?${new URLSearchParams({ name: `${typeFilter} Energy` })}`).then((r) => r.json()).catch(() => [])
            : Promise.resolve([]);

          const [mainData, fullNameData, energyData] = await Promise.all([
            fetch(`${TCGDEX_BASE}/cards?${new URLSearchParams(apiParams)}`).then((r) => r.json()),
            fullNameFetch,
            energyFetch,
          ]);

          const mainArr = Array.isArray(mainData) ? mainData : [];
          const fullNameArr = Array.isArray(fullNameData) ? fullNameData : [];
          const energyArr = Array.isArray(energyData) ? energyData : [];
          const seenIds = new Set(mainArr.map((c) => c.id));
          const allFetched = [
            ...mainArr,
            ...fullNameArr.filter((c) => !seenIds.has(c.id)),
          ];
          allFetched.forEach((c) => seenIds.add(c.id));
          const energyToEnrich = energyArr.filter((c) => !seenIds.has(c.id));

          // Enrich stubs with full card data (legal, regulationMark, etc.).
          // cardCacheRef avoids re-fetching cards seen in previous searches.
          const enrichStub = (stub) => {
            if (cardCacheRef.current[stub.id]) return Promise.resolve(cardCacheRef.current[stub.id]);
            return fetch(`${TCGDEX_BASE}/cards/${stub.id}`)
              .then((r) => r.json())
              .then((card) => { cardCacheRef.current[stub.id] = card; return card; })
              .catch(() => stub);
          };

          const [enrichedMain, enrichedEnergy] = await Promise.all([
            Promise.allSettled(allFetched.map(enrichStub)),
            Promise.allSettled(energyToEnrich.map(enrichStub)),
          ]);

          const fullCards = enrichedMain.filter((r) => r.status === "fulfilled").map((r) => r.value);
          const fullEnergy = enrichedEnergy.filter((r) => r.status === "fulfilled").map((r) => r.value);

          const mapCard = (card, fallbackCategory) => {
            const setId = extractSetId(card.id);
            const setName = sets.find((s) => s.id === setId)?.name || setId;
            const rawCategory = card.category ?? fallbackCategory;
            const category = rawCategory ?? (BASIC_ENERGY_NAMES.has(card.name) ? "Energy" : undefined);
            return {
              ...card,
              category,
              trainerType: card.trainerType ?? apiParams.trainerType,
              set: { id: setId, name: setName },
              isStandardLegal: calcStandardLegal(card),
              isExpandedLegal: calcExpandedLegal(card),
            };
          };

          cards = [
            ...fullCards.map((c) => mapCard(c, apiParams.category)),
            ...fullEnergy.map((c) => mapCard(c, "Energy")),
          ];
          if (setFilter) {
            cards = cards.filter(
              (c) => extractSetId(c.id) === setFilter || fullNameArr.some((f) => f.id === c.id)
            );
          }
          if (numberFilter) {
            const n = numberFilter.replace(/^0+/, "");
            cards = cards.filter(
              (c) => String(c.localId ?? "").replace(/^0+/, "") === n
            );
          }
        }
        setAllResults(cards);
        setCurrentPage(1);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery, selectedSet, sets, categoryFilter, typeFilter, ensureSetOfficialCode]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    allResults,
    setAllResults,
    isSearching,
    hasSearched,
    currentPage,
    setCurrentPage,
    filteredResults,
    pageResults,
    totalPages,
    cardCacheRef,
  };
};

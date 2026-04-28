import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { database } from "../../firestoreConfig";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import { getAuthContext } from "../../context/authContext";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";
import Toast from "../../components/Toast/Toast";
import styles from "./DeckBuilder.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faPlus,
  faMinus,
  faTrash,
  faMagnifyingGlass,
  faSpinner,
  faCheck,
  faTriangleExclamation,
  faCopy,
  faFileImport,
  faPrint,
  faFloppyDisk,
  faCircleQuestion,
  faCircleInfo,
} from "@fortawesome/free-solid-svg-icons";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const CARD_BACK_URL = "https://images.pokemontcg.io/back.png";
const ITEMS_PER_PAGE = 20;
const MAX_DECK_CARDS = 70;
const MAX_COPIES = 4;
const STANDARD_REG_MARKS = new Set(["H", "I", "J"]);
// First SV set number in standard rotation (sv05 = Temporal Forces, first H-mark set).
// Update this cutoff each season rotation.
const STANDARD_MIN_SV_NUMBER = 5;

const BASIC_ENERGY_NAMES = new Set([
  "Grass Energy",
  "Fire Energy",
  "Water Energy",
  "Lightning Energy",
  "Psychic Energy",
  "Fighting Energy",
  "Darkness Energy",
  "Metal Energy",
  "Fairy Energy",
  "Dragon Energy",
  "Colorless Energy",
]);

const isBasicEnergy = (name) => BASIC_ENERGY_NAMES.has(name);

// Basic energy cards have no types[] in TCGdex — infer from name ("Water Energy" → "Water")
const getCardTypes = (card) => {
  if (Array.isArray(card.types) && card.types.length > 0) return card.types;
  const match = card.name?.match(/^(\w+)\s+Energy$/i);
  return match ? [match[1]] : [];
};

// TCGdex's legal.standard field is unreliable (stale after rotation).
// Use the set ID pattern: sv05+ and all Mega Evolution era (me*) sets are standard legal.
const isSetStandardLegal = (setId) => {
  if (!setId) return false;
  const sv = setId.match(/^sv(\d+(?:\.\d+)?)/i);
  if (sv) return parseFloat(sv[1]) >= STANDARD_MIN_SV_NUMBER;
  return /^me/i.test(setId); // All ME-era sets (me01, me02, me03…) are standard legal
};

// Basic energies are always standard legal regardless of set or whether category is available in the stub
const isCardStandardLegal = (setId, name, regulationMark) =>
  isBasicEnergy(name) ||
  (regulationMark ? STANDARD_REG_MARKS.has(regulationMark) : isSetStandardLegal(setId));

// TCGdex list endpoint returns set as a plain string ID; full card objects return {id, name}
const getSetId = (set) => (typeof set === "string" ? set : set?.id ?? "");
const getSetName = (set) => (typeof set === "string" ? set : set?.name ?? "");

const formatDeckList = (deck) => {
  const sections = [
    { label: "Pokémon", cards: deck.filter((c) => c.category === "Pokemon") },
    { label: "Trainer", cards: deck.filter((c) => c.category === "Trainer") },
    { label: "Energy", cards: deck.filter((c) => c.category === "Energy") },
  ];
  return sections
    .filter((s) => s.cards.length > 0)
    .map((s) => {
      const lines = s.cards.map(
        (c) => `${c.count} ${c.name} ${c.setId} ${c.number}`
      );
      return `${s.label}\n${lines.join("\n")}`;
    })
    .join("\n\n");
};

const CATEGORY_HEADERS = new Set([
  "Pokémon", "Pokemon", "Trainer", "Energy",
  "Pokémon:", "Pokemon:", "Trainer:", "Energy:",
]);

const parseSearchQuery = (query, sets, setsLegality) => {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const remaining = [...tokens];

  // Build lookup maps
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

  // Extract card number (1–3 digit token, possibly zero-padded)
  let numberFilter = null;
  for (let i = 0; i < remaining.length; i++) {
    if (/^\d{1,3}$/.test(remaining[i])) {
      numberFilter = remaining.splice(i, 1)[0];
      break;
    }
  }

  // Match set: try single-token codes/IDs first, then multi-word names
  let setFilter = null;
  for (let i = 0; i < remaining.length && !setFilter; i++) {
    const t = remaining[i];
    if (codeToSetId[t]) { setFilter = codeToSetId[t]; remaining.splice(i, 1); }
    else if (idToSetId[t]) { setFilter = idToSetId[t]; remaining.splice(i, 1); }
  }
  if (!setFilter) {
    // First pass: exact set name match
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
    // Second pass: prefix match against set names (longest match wins)
    const setNames = Object.keys(nameToSetId);
    outer2: for (let size = remaining.length; size >= 1; size--) {
      for (let start = 0; start <= remaining.length - size; start++) {
        const phrase = remaining.slice(start, start + size).join(" ");
        if (phrase.length < 3) continue;
        const match = setNames.find((n) => n.startsWith(phrase));
        if (match) {
          setFilter = nameToSetId[match];
          remaining.splice(start, size);
          break outer2;
        }
      }
    }
  }

  return { name: remaining.join(" "), setFilter, numberFilter };
};

const padCardNumber = (n) => /^\d{1,2}$/.test(String(n)) ? String(n).padStart(3, "0") : String(n);

const extractSetId = (cardId) => {
  if (!cardId) return "";
  const i = cardId.lastIndexOf("-");
  return i === -1 ? cardId : cardId.slice(0, i);
};

const DeckBuilder = () => {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = getAuthContext();

  const [setsLegality, setSetsLegality] = useState({});
  const setsLegalityRef = useRef({});
  const [sets, setSets] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSet, setSelectedSet] = useState("");
  const [formatFilter, setFormatFilter] = useState("standard"); // "standard" | "expanded"
  const [categoryFilter, setCategoryFilter] = useState("all"); // "all" | "Pokemon" | "Trainer"
  const [typeFilter, setTypeFilter] = useState(null);
  const [allResults, setAllResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [flashCardId, setFlashCardId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const [deck, setDeck] = useState([]);
  const [deckName, setDeckName] = useState("");
  const [selectedPlayerKey, setSelectedPlayerKey] = useState("");
  const [accountPlayers, setAccountPlayers] = useState([]);

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSaveWarningModal, setShowSaveWarningModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [pageLoading, setPageLoading] = useState(!!deckId);
  const [collapsedSections, setCollapsedSections] = useState({});

  const searchTimeoutRef = useRef(null);
  const setCardsCacheRef = useRef({});

  const LS_KEY = "deckbuilder_draft";


  useEffect(() => {
    if (!deckId) {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        try {
          const { deck: d, deckName: n } = JSON.parse(saved);
          if (d?.length) setDeck(d);
          if (n) setDeckName(n);
        } catch {
          localStorage.removeItem(LS_KEY);
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authLoading && !user && !deckId) setShowGuestModal(true);
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (deckId) return;
    if (deck.length === 0 && !deckName) {
      localStorage.removeItem(LS_KEY);
      return;
    }
    localStorage.setItem(LS_KEY, JSON.stringify({ deck, deckName }));
  }, [deck, deckName, deckId]);

  const [setSearch, setSetSearch] = useState("");
  const [showSetDropdown, setShowSetDropdown] = useState(false);
  const setDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (setDropdownRef.current && !setDropdownRef.current.contains(e.target)) {
        setShowSetDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalCards = deck.reduce((sum, c) => sum + c.count, 0);
  const hasIllegalCards = deck.some((c) => !c.isStandardLegal);

  const filteredResults = allResults
    .filter((c) => formatFilter === "standard" ? c.isStandardLegal : formatFilter === "expanded" ? c.isExpandedLegal : true)
    .filter((c) => {
      if (categoryFilter === "all") return true;
      if (categoryFilter === "Pokemon")       return c.category === "Pokemon";
      if (categoryFilter === "Trainer")       return c.category === "Trainer";
      if (categoryFilter === "Item")          return c.category === "Trainer" && c.trainerType === "Item";
      if (categoryFilter === "Supporter")     return c.category === "Trainer" && c.trainerType === "Supporter";
      if (categoryFilter === "Stadium")       return c.category === "Trainer" && c.trainerType === "Stadium";
      if (categoryFilter === "Tool")          return c.category === "Trainer" && c.trainerType === "Tool";
      if (categoryFilter === "Energy")        return c.category === "Energy";
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

  const deckSections = [
    { key: "Pokemon", label: "Pokémon", cards: deck.filter((c) => c.category === "Pokemon").sort((a, b) => a.name.localeCompare(b.name)) },
    { key: "Trainer", label: "Trainer", cards: deck.filter((c) => c.category === "Trainer").sort((a, b) => a.name.localeCompare(b.name)) },
    { key: "Energy", label: "Energy", cards: deck.filter((c) => c.category === "Energy").sort((a, b) => a.name.localeCompare(b.name)) },
  ];

  useEffect(() => {
    fetch(`${TCGDEX_BASE}/sets`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSets([...data].sort((a, b) => a.name.localeCompare(b.name)));
        }
      })
      .catch(console.error);
  }, []);

  // Background-fetch official abbreviations for all sets so the dropdown can match by shorthand.
  // The sets list endpoint doesn't include abbreviation — only individual set endpoints do.
  useEffect(() => {
    if (sets.length === 0) return;
    const uncached = sets.filter((s) => !(s.id in setsLegalityRef.current));
    if (uncached.length === 0) return;
    const CHUNK = 30;
    (async () => {
      for (let i = 0; i < uncached.length; i += CHUNK) {
        const entries = (
          await Promise.allSettled(
            uncached.slice(i, i + CHUNK).map((s) =>
              fetch(`${TCGDEX_BASE}/sets/${s.id}`)
                .then((r) => r.json())
                .then((data) => [s.id, {
                  standard: isSetStandardLegal(s.id),
                  expanded: data.legal?.expanded === true,
                  officialCode: data.abbreviation?.official || null,
                }])
            )
          )
        )
          .filter((r) => r.status === "fulfilled")
          .map((r) => r.value);
        if (entries.length > 0) {
          setSetsLegality((prev) => {
            const next = { ...prev };
            for (const [id, info] of entries) {
              if (!(id in next)) next[id] = info;
            }
            return next;
          });
        }
      }
    })();
  }, [sets]);

  useEffect(() => {
    if (!deckId || !user) {
      setPageLoading(false);
      return;
    }
    getDoc(doc(database, "users", user.uid, "decklists", deckId))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setDeckName(d.deckName || "");
          setDeck(d.cards || []);
          if (d.linkedFamilyMemberId) {
            setSelectedPlayerKey(`fm_${d.linkedFamilyMemberId}`);
          } else if (d.linkedPlayerId) {
            setSelectedPlayerKey("main");
          }
        }
      })
      .catch(console.error)
      .finally(() => setPageLoading(false));
  }, [deckId, user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const userSnap = await getDoc(doc(database, "users", user.uid));
      const userData = userSnap.exists() ? userSnap.data() : {};
      const list = [];
      if (userData.playerId) {
        list.push({
          playerId: userData.playerId,
          firstName: userData.firstName || "",
          lastName: userData.lastName || "",
          familyMemberId: null,
        });
      }
      const fmSnap = await getDocs(
        collection(database, "users", user.uid, "familyMembers")
      );
      fmSnap.forEach((d) => {
        const fm = d.data();
        if (fm.playerId) {
          list.push({
            playerId: fm.playerId,
            firstName: fm.firstName || "",
            lastName: fm.lastName || "",
            familyMemberId: d.id,
          });
        }
      });
      setAccountPlayers(list);
    };
    load().catch(console.error);
  }, [user]);

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
          const { name: nameQuery, numberFilter } = parseSearchQuery(searchQuery, sets, setsLegalityRef.current);
          const needsCategoryFetch = categoryFilter !== "all" || !!typeFilter;

          const data = await fetch(`${TCGDEX_BASE}/sets/${selectedSet}`).then((r) => r.json());
          const isExpandedLegal = data.legal?.expanded === true;
          const stubs = Array.isArray(data.cards) ? data.cards : [];

          setSetsLegality((prev) =>
            prev[selectedSet]
              ? prev
              : { ...prev, [selectedSet]: { standard: isSetStandardLegal(selectedSet), expanded: isExpandedLegal, officialCode: data.abbreviation?.official || null } }
          );

          if (needsCategoryFetch) {
            // Fetch each card individually to get category/trainerType/legal data.
            // Results are cached so changing filters within the same set doesn't re-fetch.
            if (!setCardsCacheRef.current[selectedSet]) {
              const results = await Promise.allSettled(
                stubs.map((stub) =>
                  fetch(`${TCGDEX_BASE}/cards/${stub.id}`)
                    .then((r) => r.json())
                    .catch(() => stub)
                )
              );
              setCardsCacheRef.current[selectedSet] = results
                .filter((r) => r.status === "fulfilled")
                .map((r) => r.value);
            }

            let allSetCards = setCardsCacheRef.current[selectedSet];
            allSetCards = allSetCards.filter((card) => {
              let categoryMatch = true;
              if (categoryFilter === "Pokemon") categoryMatch = card.category === "Pokemon";
              else if (categoryFilter === "Trainer") categoryMatch = card.category === "Trainer";
              else if (categoryFilter === "Item") categoryMatch = card.category === "Trainer" && card.trainerType === "Item";
              else if (categoryFilter === "Supporter") categoryMatch = card.category === "Trainer" && card.trainerType === "Supporter";
              else if (categoryFilter === "Stadium") categoryMatch = card.category === "Trainer" && card.trainerType === "Stadium";
              else if (categoryFilter === "Tool") categoryMatch = card.category === "Trainer" && card.trainerType === "Tool";
              else if (categoryFilter === "Energy") categoryMatch = card.category === "Energy";
              else if (categoryFilter === "SpecialEnergy") categoryMatch = card.category === "Energy" && card.energyType === "Special";
              const typeMatch = typeFilter
                ? getCardTypes(card).includes(typeFilter)
                : true;
              return categoryMatch && typeMatch;
            });

            if (nameQuery) {
              const q = nameQuery.toLowerCase();
              allSetCards = allSetCards.filter((c) => c.name?.toLowerCase().includes(q));
            }
            if (numberFilter) {
              const n = numberFilter.replace(/^0+/, "");
              allSetCards = allSetCards.filter((c) => String(c.localId ?? "").replace(/^0+/, "") === n);
            }

            cards = allSetCards.map((card) => ({
              ...card,
              set: { id: selectedSet, name: setName },
              isStandardLegal: isCardStandardLegal(selectedSet, card.name, card.regulationMark),
              isExpandedLegal,
            }));
          } else {
            let setCards = [...stubs];
            if (nameQuery) {
              const q = nameQuery.toLowerCase();
              setCards = setCards.filter((c) => c.name?.toLowerCase().includes(q));
            }
            if (numberFilter) {
              const n = numberFilter.replace(/^0+/, "");
              setCards = setCards.filter((c) => String(c.localId ?? "").replace(/^0+/, "") === n);
            }
            cards = setCards.map((card) => ({
              ...card,
              set: { id: selectedSet, name: setName },
              isStandardLegal: isCardStandardLegal(selectedSet, card.name, card.regulationMark),
              isExpandedLegal,
            }));
          }
        } else {
          const { name, setFilter, numberFilter } = parseSearchQuery(searchQuery, sets, setsLegalityRef.current);
          if (!name && !setFilter && !numberFilter && categoryFilter === "all" && !typeFilter) {
            setAllResults([]);
            setHasSearched(false);
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
          if (typeFilter) apiParams.types = typeFilter;
          // When a set was inferred from the query text, also search the full raw query as a
          // card name so cards whose names happen to share words with set names still appear.
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
          const mapCard = (card, fallbackCategory) => {
            const setId = extractSetId(card.id);
            const legal = setsLegalityRef.current[setId];
            const setName = sets.find((s) => s.id === setId)?.name || setId;
            const rawCategory = card.category ?? fallbackCategory;
            const category = rawCategory ?? (BASIC_ENERGY_NAMES.has(card.name) ? "Energy" : undefined);
            return {
              ...card,
              category,
              trainerType: card.trainerType ?? apiParams.trainerType,
              set: { id: setId, name: setName },
              isStandardLegal: isCardStandardLegal(setId, card.name, card.regulationMark),
              isExpandedLegal: BASIC_ENERGY_NAMES.has(card.name) || legal?.expanded !== false,
            };
          };
          const seenIds = new Set(mainArr.map((c) => c.id));
          const allFetched = [
            ...mainArr,
            ...fullNameArr.filter((c) => !seenIds.has(c.id)),
          ];
          allFetched.forEach((c) => seenIds.add(c.id));
          cards = [
            ...allFetched.map((c) => mapCard(c, apiParams.category)),
            ...energyArr.filter((c) => !seenIds.has(c.id)).map((c) => mapCard(c, "Energy")),
          ];
          if (setFilter) {
            cards = cards.filter((c) => extractSetId(c.id) === setFilter || fullNameArr.some((f) => f.id === c.id));
          }
          if (numberFilter) {
            const n = numberFilter.replace(/^0+/, "");
            cards = cards.filter((c) => {
              const localId = String(c.localId ?? "").replace(/^0+/, "");
              return localId === n;
            });
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
  }, [searchQuery, selectedSet, sets, categoryFilter, typeFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [formatFilter]);

  // Batch-fetch legality for any sets not yet in the cache when name-search results arrive
  useEffect(() => {
    if (allResults.length === 0 || selectedSet) return;
    const uncached = [
      ...new Set(allResults.map((c) => extractSetId(c.id)).filter(Boolean)),
    ].filter((id) => !(id in setsLegality));
    if (uncached.length === 0) return;
    Promise.all(
      uncached.map((id) =>
        fetch(`${TCGDEX_BASE}/sets/${id}`)
          .then((r) => r.json())
          .then((data) => [id, { standard: isSetStandardLegal(id), expanded: data.legal?.expanded === true, officialCode: data.abbreviation?.official || null }])
          .catch(() => [id, { standard: isSetStandardLegal(id), expanded: false, officialCode: null }])
      )
    ).then((entries) => {
      setSetsLegality((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
  }, [allResults, setsLegality, selectedSet]);

  // Keep ref in sync so the search effect can read latest legality without depending on it
  useEffect(() => {
    setsLegalityRef.current = setsLegality;
  }, [setsLegality]);

  // Update isExpandedLegal in-place when legality cache is populated (no re-fetch needed)
  useEffect(() => {
    if (selectedSet) return;
    setAllResults((prev) =>
      prev.map((card) => ({
        ...card,
        isExpandedLegal: setsLegality[extractSetId(card.id)]?.expanded === true,
      }))
    );
  }, [setsLegality, selectedSet]);

  const countCopiesByName = (name) =>
    deck.reduce((s, c) => s + (c.name.toLowerCase() === name.toLowerCase() ? c.count : 0), 0);

  const addCardToDeck = async (card) => {
    let resolvedCard = card;
    if (!resolvedCard.category) {
      try {
        const full = await fetch(`${TCGDEX_BASE}/cards/${resolvedCard.id}`).then((r) => r.json());
        resolvedCard = { ...resolvedCard, ...full };
        setAllResults((prev) => prev.map((c) => c.id === resolvedCard.id ? {
          ...c,
          category: resolvedCard.category,
          trainerType: resolvedCard.trainerType,
          isStandardLegal: isCardStandardLegal(extractSetId(resolvedCard.id), resolvedCard.name, resolvedCard.regulationMark),
        } : c));
      } catch { /* keep card as-is */ }
    }

    const isLegal = true;
    const basic = isBasicEnergy(resolvedCard.name);
    const existing = deck.find((c) => c.tcgdexId === resolvedCard.id);
    const total = deck.reduce((s, c) => s + c.count, 0);
    const nameTotal = countCopiesByName(resolvedCard.name);

    if (!basic && nameTotal >= MAX_COPIES) {
      setFlashCardId(resolvedCard.id);
      setTimeout(() => setFlashCardId(null), 700);
      setToastMessage(`${MAX_COPIES} Kopier av "${resolvedCard.name}" er allerede i dekket`);
      return;
    }

    if (total >= MAX_DECK_CARDS) {
      setToastMessage(`Dekket er fullt — maks ${MAX_DECK_CARDS} kort`);
      return;
    }

    if (existing) {
      setDeck((prev) =>
        prev.map((c) =>
          c.tcgdexId === resolvedCard.id ? { ...c, count: c.count + 1 } : c
        )
      );
    } else {
      setDeck((prev) => [
        ...prev,
        {
          tcgdexId: resolvedCard.id,
          name: resolvedCard.name,
          setId: setsLegality[getSetId(resolvedCard.set)]?.officialCode || getSetId(resolvedCard.set),
          setName: getSetName(resolvedCard.set),
          number: resolvedCard.localId || "",
          category: resolvedCard.category || "Pokemon",
          isBasicEnergy: basic,
          isStandardLegal: isLegal,
          imageUrl: resolvedCard.image ? `${resolvedCard.image}/high.webp` : null,
          count: 1,
        },
      ]);
    }
  };

  const incrementCard = (tcgdexId) => {
    const card = deck.find((c) => c.tcgdexId === tcgdexId);
    const total = deck.reduce((s, c) => s + c.count, 0);
    if (!card) return;
    if (!card.isBasicEnergy && countCopiesByName(card.name) >= MAX_COPIES) {
      setToastMessage(`${MAX_COPIES} Kopier av "${card.name}" er allerede i dekket`);
      return;
    }
    if (total >= MAX_DECK_CARDS) return;
    setDeck((prev) =>
      prev.map((c) => c.tcgdexId === tcgdexId ? { ...c, count: c.count + 1 } : c)
    );
  };

  const decrementCard = (tcgdexId) => {
    setDeck((prev) =>
      prev
        .map((c) => c.tcgdexId === tcgdexId ? { ...c, count: c.count - 1 } : c)
        .filter((c) => c.count > 0)
    );
  };

  const removeCard = (tcgdexId) => {
    setDeck((prev) => prev.filter((c) => c.tcgdexId !== tcgdexId));
  };

  const toggleSection = (key) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveClick = () => {
    if (!user) {
      setShowGuestModal(true);
      return;
    }
    if (!deckName.trim()) {
      setToastMessage("Gi decket eit navn før du lagrer.");
      return;
    }
    if (totalCards !== 60) {
      setShowSaveWarningModal(true);
    } else {
      doSave();
    }
  };

  const doSave = async () => {
    setShowSaveWarningModal(false);
    setSaving(true);
    try {
      let linkedPlayerId = null;
      let linkedFamilyMemberId = null;
      if (selectedPlayerKey === "main") {
        const p = accountPlayers.find((p) => !p.familyMemberId);
        linkedPlayerId = p?.playerId || null;
      } else if (selectedPlayerKey.startsWith("fm_")) {
        const fmId = selectedPlayerKey.slice(3);
        const p = accountPlayers.find((p) => p.familyMemberId === fmId);
        linkedPlayerId = p?.playerId || null;
        linkedFamilyMemberId = fmId;
      }

      const payload = {
        deckName: deckName.trim(),
        linkedPlayerId,
        linkedFamilyMemberId,
        cards: deck,
        updatedAt: new Date(),
      };

      if (deckId) {
        await updateDoc(
          doc(database, "users", user.uid, "decklists", deckId),
          payload
        );
      } else {
        const ref = await addDoc(
          collection(database, "users", user.uid, "decklists"),
          { ...payload, createdAt: new Date() }
        );
        navigate(`/deck-builder/${ref.id}`, { replace: true });
      }
      localStorage.removeItem(LS_KEY);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error(err);
      alert("Noe gikk galt ved lagring. Prøv igjen.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatDeckList(deck));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      alert("Kunne ikke kopiere til utklippstavlen.");
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportErrors([]);

    const lines = importText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Track the current section so we can assign category even for cards
    // that TCGdex doesn't recognise (newer/obscure sets).
    let currentCategory = "Pokemon";
    const parsed = [];
    for (const line of lines) {
      if (/^pok[eé]mon/i.test(line)) { currentCategory = "Pokemon"; continue; }
      if (/^trainer/i.test(line)) { currentCategory = "Trainer"; continue; }
      if (/^energy/i.test(line)) { currentCategory = "Energy"; continue; }
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;
      const count = parseInt(parts[0], 10);
      if (isNaN(count) || count <= 0) continue;
      const number = parts[parts.length - 1];
      const setId = parts[parts.length - 2];
      const name = parts.slice(1, parts.length - 2).join(" ");
      parsed.push({ count, name, setId, number, category: currentCategory });
    }

    if (parsed.length === 0) {
      setImportErrors([
        "Ingen gyldige linjer funnet. Forventet format: «4 Charizard ex sv3 54»",
      ]);
      setImporting(false);
      return;
    }

    // TCGdex uses its own set IDs (sv6, sv3…) which differ from the
    // official abbreviations players use (TWM, PAL, TEF…). Search by
    // name only and match by card number (localId) instead.
    const uniqueNames = [...new Set(parsed.map((p) => p.name))];
    const cache = {};
    for (const name of uniqueNames) {
      try {
        const [mainRes, ...regMarkRes] = await Promise.all([
          fetch(`${TCGDEX_BASE}/cards?${new URLSearchParams({ name })}`),
          ...[...STANDARD_REG_MARKS].map((mark) =>
            fetch(`${TCGDEX_BASE}/cards?${new URLSearchParams({ name, regulationMark: mark })}`)
          ),
        ]);
        const [mainData, ...regMarkData] = await Promise.all([
          mainRes.json(),
          ...regMarkRes.map((r) => r.json()),
        ]);
        const allCards = [
          ...(Array.isArray(mainData) ? mainData : []),
          ...regMarkData.flatMap((d) => (Array.isArray(d) ? d : [])),
        ];
        // Deduplicate by card id
        const seen = new Set();
        cache[name] = allCards.filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
      } catch {
        cache[name] = [];
      }
    }

    const errors = [];
    const newDeck = [];
    for (const p of parsed) {
      const candidates = cache[p.name] || [];
      const found =
        candidates.find((c) => String(c.localId) === String(p.number)) ||
        candidates.find((c) => c.name === p.name);

      if (found) {
        const isLegal = true;
        const basic = isBasicEnergy(found.name);
        const existing = newDeck.find((c) => c.tcgdexId === found.id);
        if (existing) {
          existing.count += p.count;
        } else {
          newDeck.push({
            tcgdexId: found.id,
            name: found.name,
            // Keep the original abbreviation (e.g. TWM) so that
            // exports round-trip correctly for tournament submission.
            setId: p.setId,
            setName: getSetName(found.set),
            number: p.number,
            // Use TCGdex category when available; fall back to the
            // section header we tracked during parsing.
            category: found.category || p.category,
            isBasicEnergy: basic,
            isStandardLegal: isLegal,
            imageUrl: found.image ? `${found.image}/high.webp` : null,
            count: p.count,
          });
        }
      } else {
        errors.push(`Fant ikke: ${p.name} ${p.setId} ${p.number}`);
        newDeck.push({
          tcgdexId: `${p.setId}-${p.number}`,
          name: p.name,
          setId: p.setId,
          setName: "",
          number: p.number,
          // Use the section-tracked category — accurate for all cards
          // whose set TCGdex doesn't cover yet.
          category: p.category,
          isBasicEnergy: isBasicEnergy(p.name),
          isStandardLegal: true,
          imageUrl: null,
          count: p.count,
        });
      }
    }

    setDeck(newDeck);
    setImportErrors(errors);
    setImporting(false);
    if (errors.length === 0) setShowImportModal(false);
  };

  if (pageLoading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.loadingCenter}>
          <FontAwesomeIcon icon={faSpinner} spin size="2x" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.topBar}>
        {user && (
          <button
            className={styles.backBtn}
            onClick={() => navigate("/my-decklists")}
          >
            <FontAwesomeIcon icon={faArrowLeft} /> Mine Dekklister
          </button>
        )}
        <div className={styles.topBarTitleRow}>
          <h1 className={styles.pageTitle}>
            {deckId ? "Rediger Deck" : "Nytt Deck"}
          </h1>
          <button
            className={styles.helpBtn}
            onClick={() => setShowHelpModal(true)}
          >
            <FontAwesomeIcon icon={faCircleQuestion} /> Hjelp
          </button>
        </div>
      </div>

      <div className={styles.builderGrid}>
        {/* ── Search Panel ─────────────────── */}
        <div className={styles.searchPanel}>
          <div className={styles.searchControls}>
            <div className={styles.searchInputWrapper}>
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className={styles.searchIcon}
              />
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Søk etter kort…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className={styles.setDropdownWrapper} ref={setDropdownRef}>
                <div className={styles.setSearchInputWrapper}>
                  <input
                    className={styles.setSearchInput}
                    type="text"
                    placeholder="Filtrer sett…"
                    value={setSearch}
                    onFocus={() => setShowSetDropdown(true)}
                    onChange={(e) => {
                      setSetSearch(e.target.value);
                      setShowSetDropdown(true);
                      if (!e.target.value) {
                        setSelectedSet("");
                        setCurrentPage(1);
                      }
                    }}
                  />
                  {selectedSet && (
                    <button
                      className={styles.setClearBtn}
                      onClick={() => {
                        setSelectedSet("");
                        setSetSearch("");
                        setCurrentPage(1);
                      }}
                      title="Fjern sett-filter"
                    >
                      ×
                    </button>
                  )}
                </div>
                {showSetDropdown && (
                  <ul className={styles.setDropdownList}>
                    <li
                      className={`${styles.setDropdownItem} ${!selectedSet ? styles.setDropdownItemSelected : ""}`}
                      onMouseDown={() => {
                        setSelectedSet("");
                        setSetSearch("");
                        setShowSetDropdown(false);
                        setCurrentPage(1);
                      }}
                    >
                      Alle sett
                    </li>
                    {sets
                      .filter(
                        (s) =>
                          !setSearch.trim() ||
                          s.name.toLowerCase().includes(setSearch.toLowerCase()) ||
                          s.id.toLowerCase().includes(setSearch.toLowerCase()) ||
                          (s.abbreviation?.official || setsLegality[s.id]?.officialCode || "").toLowerCase().includes(setSearch.toLowerCase())
                      )
                      .map((s) => (
                        <li
                          key={s.id}
                          className={`${styles.setDropdownItem} ${selectedSet === s.id ? styles.setDropdownItemSelected : ""}`}
                          onMouseDown={() => {
                            setSelectedSet(s.id);
                            setSetSearch(s.name);
                            setShowSetDropdown(false);
                            setCurrentPage(1);
                          }}
                        >
                          {s.name}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            <div className={styles.searchInputRow}>
              
              <div className={styles.formatToggle}>
                {["standard", "expanded"].map((f) => (
                  <button
                    key={f}
                    className={[styles.formatToggleBtn, formatFilter === f ? styles.formatToggleBtnActive : ""].join(" ")}
                    onClick={() => setFormatFilter(f)}
                  >
                    {f === "standard" ? "Standard" : "Expanded"}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.filterSelects}>
              <select
                className={styles.filterSelect}
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  if (e.target.value !== "Pokemon") setTypeFilter(null);
                  setCurrentPage(1);
                }}
              >
                <option value="all">Alle kort</option>
                <optgroup label="Pokémon">
                  <option value="Pokemon">Alle Pokémon</option>
                </optgroup>
                <optgroup label="Trainer">
                  <option value="Trainer">Alle Trainere</option>
                  <option value="Item">Item</option>
                  <option value="Supporter">Supporter</option>
                  <option value="Stadium">Stadium</option>
                  <option value="Tool">Pokémon Tool</option>
                </optgroup>
                <optgroup label="Energy">
                  <option value="Energy">Alle Energy</option>
                  <option value="SpecialEnergy">Special Energy</option>
                </optgroup>
              </select>
              <select
                className={styles.filterSelect}
                value={typeFilter || ""}
                disabled={["Trainer", "Item", "Supporter", "Stadium", "Tool", "Energy", "SpecialEnergy"].includes(categoryFilter)}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setTypeFilter(val);
                  setCurrentPage(1);
                }}
              >
                <option value="">Alle typer</option>
                {["Grass","Fire","Water","Lightning","Psychic","Fighting","Darkness","Metal","Dragon","Colorless"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <p className={styles.legalityNotice}>
            <FontAwesomeIcon icon={faCircleInfo} />
            {" "}Lovlighetsdata kan være ufullstendig. Kort legges til på eget ansvar.
          </p>

          {isSearching ? (
            <div className={styles.searchStatus}>
              <FontAwesomeIcon icon={faSpinner} spin /> Søker…
            </div>
          ) : !hasSearched ? (
            <div className={styles.searchStatus}>
              Søk etter kortnavn eller velg et sett for å vise kort.
            </div>
          ) : filteredResults.length === 0 ? (
            <div className={styles.searchStatus}>
              {selectedSet && allResults.length > 0 ? (
                <>
                  Dette settet har ingen {formatFilter === "standard" ? "Standard" : "Expanded"}-lovlige kort.{" "}
                  <button
                    className={styles.inlineTextBtn}
                    onClick={() => setFormatFilter(formatFilter === "standard" ? "expanded" : "standard")}
                  >
                    Bytt til {formatFilter === "standard" ? "Expanded" : "Standard"}
                  </button>
                </>
              ) : (
                <>
                  Ingen kort funnet.{" "}
                  <button
                    className={styles.inlineTextBtn}
                    onClick={() => {
                      setFormatFilter("standard");
                      setCategoryFilter("all");
                      setTypeFilter(null);
                      setCurrentPage(1);
                    }}
                  >
                    Nullstill filtre
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className={styles.cardGrid}>
                {pageResults.map((card) => {
                  const count =
                    deck.find((c) => c.tcgdexId === card.id)?.count || 0;
                  return (
                    <div
                      key={card.id}
                      className={[
                        styles.cardResult,
                        !card.isStandardLegal ? styles.cardResultIllegal : "",
                        flashCardId === card.id ? styles.cardResultFlash : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={
                        card.isStandardLegal
                          ? card.name
                          : `${card.name} — ikke Standard-lovlig`
                      }
                    >
                      <div
                        className={`${styles.cardHalf} ${styles.cardHalfLeft}`}
                        onClick={() => count > 0 && decrementCard(card.id)}
                        title="Fjern én"
                      />
                      <div
                        className={`${styles.cardHalf} ${styles.cardHalfRight}`}
                        onClick={() => addCardToDeck(card)}
                        title="Legg til"
                      />
                      <div className={styles.cardImageWrapper}>
                        {card.image ? (
                          <img
                            src={`${card.image}/high.webp`}
                            alt={card.name}
                            className={styles.cardImage}
                            loading="lazy"
                            onError={(e) => {
                              if (e.target.src.includes("/high.webp")) {
                                e.target.src = `${card.image}/low.webp`;
                              } else {
                                e.target.style.display = "none";
                              }
                            }}
                          />
                        ) : (
                          <img
                            src={CARD_BACK_URL}
                            alt="Card back"
                            className={styles.cardImage}
                          />
                        )}
                        {!card.isStandardLegal && (
                          <div className={styles.illegalOverlay}>
                            Not Standard Legal
                          </div>
                        )}
                      </div>
                      {count > 0 && (
                        <div className={styles.cardCountBadge}>{count}</div>
                      )}
                      <div className={styles.cardInfo}>
                        <p className={styles.cardName}>{card.name}</p>
                        <p className={styles.cardMeta}>
                          {setsLegality[getSetId(card.set)]?.officialCode || getSetName(card.set)} · {padCardNumber(card.localId)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button
                    className={styles.pageBtn}
                    onClick={() =>
                      setCurrentPage((p) => Math.max(1, p - 1))
                    }
                    disabled={currentPage === 1}
                  >
                    ←
                  </button>
                  <span className={styles.pageInfo}>
                    Side {currentPage} / {totalPages}
                  </span>
                  <button
                    className={styles.pageBtn}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Deck Panel ───────────────────── */}
        <div className={styles.deckPanel}>
          <div className={styles.deckHeader}>
            <input
              className={styles.deckNameInput}
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Decknavn…"
            />
            <select
              className={styles.playerSelect}
              value={selectedPlayerKey}
              onChange={(e) => setSelectedPlayerKey(e.target.value)}
            >
              <option value="">— Ingen spiller —</option>
              {accountPlayers.map((p) => (
                <option
                  key={p.familyMemberId || "main"}
                  value={p.familyMemberId ? `fm_${p.familyMemberId}` : "main"}
                >
                  {p.firstName} {p.lastName} (#{p.playerId})
                </option>
              ))}
            </select>
            <div
              className={[
                styles.deckCounter,
                totalCards === 60
                  ? styles.deckCounterGreen
                  : styles.deckCounterRed,
              ].join(" ")}
            >
              {totalCards} / 60
            </div>
            {hasIllegalCards && (
              <div className={styles.illegalBanner}>
                <FontAwesomeIcon icon={faTriangleExclamation} />
                {" "}Dette dekket inneholder kort som ikke er Standard-lovlige.
              </div>
            )}
          </div>

          <div className={styles.deckContent}>
            {deck.length === 0 ? (
              <p className={styles.deckEmpty}>
                Klikk på et kort i søket for å legge det til.
              </p>
            ) : (
              deckSections.map((section) => {
                if (section.cards.length === 0) return null;
                const isCollapsed = !!collapsedSections[section.key];
                const sectionTotal = section.cards.reduce(
                  (s, c) => s + c.count,
                  0
                );
                return (
                  <div key={section.key} className={styles.deckSection}>
                    <button
                      className={styles.deckSectionHeader}
                      onClick={() => toggleSection(section.key)}
                    >
                      <span className={styles.deckSectionLabel}>
                        {section.label}
                      </span>
                      <span className={styles.deckSectionCount}>
                        {sectionTotal}
                      </span>
                      <span className={styles.deckSectionChevron}>
                        {isCollapsed ? "▼" : "▲"}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <ul className={styles.deckCardList}>
                        {section.cards.map((card) => {
                          const overLimit =
                            !card.isBasicEnergy && countCopiesByName(card.name) > MAX_COPIES;
                          return (
                            <li key={card.tcgdexId} className={styles.deckCardRow}>
                              <span className={styles.deckCardCount}>
                                {card.count}
                              </span>
                              <div className={styles.deckCardInfo}>
                                <span
                                  className={[
                                    styles.deckCardName,
                                    !card.isStandardLegal
                                      ? styles.deckCardIllegal
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                >
                                  {card.name}
                                </span>
                                <span className={styles.deckCardMeta}>
                                  {card.setId} {padCardNumber(card.number)}
                                </span>
                                {overLimit && (
                                  <span className={styles.deckCardViolation}>
                                    Maks {MAX_COPIES} kopier tillatt
                                  </span>
                                )}
                              </div>
                              <div className={styles.deckCardActions}>
                                <button
                                  className={styles.deckCardBtn}
                                  onClick={() => decrementCard(card.tcgdexId)}
                                  title="Fjern én"
                                >
                                  <FontAwesomeIcon icon={faMinus} />
                                </button>
                                <button
                                  className={styles.deckCardBtn}
                                  onClick={() => incrementCard(card.tcgdexId)}
                                  title="Legg til én"
                                >
                                  <FontAwesomeIcon icon={faPlus} />
                                </button>
                                <button
                                  className={`${styles.deckCardBtn} ${styles.deckCardBtnRemove}`}
                                  onClick={() => removeCard(card.tcgdexId)}
                                  title="Fjern kort"
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className={styles.deckActions}>
            <button
              className={[
                styles.actionBtn,
                styles.actionBtnPrimary,
                styles.actionBtnFull,
                saveSuccess ? styles.actionBtnSuccess : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={handleSaveClick}
              disabled={saving}
            >
              {saving ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> Lagrer…
                </>
              ) : saveSuccess ? (
                <>
                  <FontAwesomeIcon icon={faCheck} /> Lagret!
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faFloppyDisk} /> Lagre
                </>
              )}
            </button>
            <div className={styles.deckActionsSub}>
              <button
                className={[
                  styles.actionBtn,
                  copySuccess ? styles.actionBtnSuccess : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={handleCopy}
                disabled={deck.length === 0}
              >
                {copySuccess ? (
                  <>
                    <FontAwesomeIcon icon={faCheck} /> Kopiert!
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCopy} /> Kopier
                  </>
                )}
              </button>
              <button
                className={styles.actionBtn}
                onClick={() => setShowImportModal(true)}
              >
                <FontAwesomeIcon icon={faFileImport} /> Importer
              </button>
              <button
                className={styles.actionBtn}
                onClick={() => window.print()}
                disabled={deck.length === 0}
              >
                <FontAwesomeIcon icon={faPrint} /> Skriv ut
              </button>
              <button
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                onClick={() => setShowClearModal(true)}
                disabled={deck.length === 0}
              >
                <FontAwesomeIcon icon={faTrash} /> Tøm deck
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Print-only section */}
      <div className={styles.printOnly}>
        <div className={styles.printHeader}>
          <div className={styles.printHeaderMain}>
            <h1 className={styles.printDeckName}>{deckName || "Unnamed Deck"}</h1>
            {(() => {
              const player =
                selectedPlayerKey === "main"
                  ? accountPlayers.find((p) => !p.familyMemberId)
                  : selectedPlayerKey.startsWith("fm_")
                  ? accountPlayers.find((p) => p.familyMemberId === selectedPlayerKey.slice(3))
                  : null;
              return player ? (
                <p className={styles.printPlayerName}>
                  {player.firstName} {player.lastName}
                </p>
              ) : null;
            })()}
          </div>
          <div className={styles.printHeaderMeta}>
            <span className={[styles.printTotalBadge, totalCards === 60 ? styles.printTotalBadgeValid : styles.printTotalBadgeInvalid].join(" ")}>
              {totalCards} / 60 kort
            </span>
            <span className={styles.printFormat}>
              {formatFilter === "standard" ? "Standard" : "Expanded"}
            </span>
          </div>
        </div>

        <div className={styles.printSections}>
          {deckSections.map((section) => {
            if (section.cards.length === 0) return null;
            const sectionTotal = section.cards.reduce((s, c) => s + c.count, 0);
            return (
              <div key={section.key} className={styles.printSection}>
                <div className={styles.printSectionHeader}>
                  <span className={styles.printSectionLabel}>{section.label}</span>
                  <span className={styles.printSectionCount}>{sectionTotal}</span>
                </div>
                <ul className={styles.printCardList}>
                  {section.cards.map((c) => (
                    <li key={c.tcgdexId} className={styles.printCardRow}>
                      <span className={styles.printCardCount}>{c.count}</span>
                      <span className={styles.printCardName}>{c.name}</span>
                      <span className={styles.printCardMeta}>{c.setId} {padCardNumber(c.number)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className={styles.printFooter}>
          <span>Kanoncon Pokemon League</span>
          <span>{new Date().toLocaleDateString("nb-NO")}</span>
        </div>
      </div>

      {showGuestModal && (
        <div className={styles.modalOverlay} onClick={() => setShowGuestModal(false)}>
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Bygg ditt deck</h2>
            <p className={styles.modalHint}>
              Du kan bygge, importere, kopiere og printe eit deck uten konto.
              <br /><br />
              For å <strong>lagre</strong> decket til nettsiden trenger du en bruker.
            </p>
            <div className={styles.modalButtons}>
              <button
                className={styles.modalCancel}
                onClick={() => setShowGuestModal(false)}
              >
                Fortsett uten konto
              </button>
              <Link to="/register" className={styles.modalConfirm}>
                Opprett bruker
              </Link>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showClearModal}
        message="Er du sikker på at du vil tømme hele dekket?"
        onConfirm={() => { setDeck([]); setShowClearModal(false); }}
        onCancel={() => setShowClearModal(false)}
      />

      <ConfirmDialog
        isOpen={showSaveWarningModal}
        message={`Dette dekket er ikke turneringsgyldig (${totalCards} kort). Et gyldig deck må inneholde nøyaktig 60 kort. Vil du lagre likevel?`}
        onConfirm={doSave}
        onCancel={() => setShowSaveWarningModal(false)}
      />

      {showImportModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => !importing && setShowImportModal(false)}
        >
          <div
            className={styles.modalDialog}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>Importer Dekkliste</h2>
            <p className={styles.modalHint}>
              Lim inn dekklisten din. Forventet format per linje:
              <br />
              <code>4 Charizard ex PFL 54</code>
              <br />
              <span className={styles.modalHintSmall}>
                Kategori-overskrifter (Pokémon, Trainer, Energy) hoppes over automatisk.
              </span>
            </p>
            <textarea
              className={styles.importTextarea}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                "Pokémon\n4 Charizard ex sv3 54\n2 Pidgey sv1 42\n\nTrainer\n4 Professor's Research sv1 189\n\nEnergy\n10 Fire Energy sve 3"
              }
              rows={12}
              disabled={importing}
            />
            {importErrors.length > 0 && (
              <div className={styles.importErrors}>
                <p className={styles.importErrorTitle}>
                  Disse kortene ble ikke funnet i TCGdex (lagt til uten bilde):
                </p>
                <ul>
                  {importErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className={styles.modalButtons}>
              <button
                className={styles.modalCancel}
                onClick={() => {
                  setShowImportModal(false);
                  setImportErrors([]);
                }}
                disabled={importing}
              >
                Avbryt
              </button>
              <button
                className={styles.modalConfirm}
                onClick={handleImport}
                disabled={importing || !importText.trim()}
              >
                {importing ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> Importerer…
                  </>
                ) : (
                  "Importer"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className={styles.modalOverlay} onClick={() => setShowHelpModal(false)}>
          <div className={styles.helpDialog} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Slik bruker du Deck Builder</h2>

            <div className={styles.helpSection}>
              <h3 className={styles.helpSectionTitle}>Søk og filtrering</h3>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Søkefelt:</strong> Skriv inn kortnavnet du leter etter. Du kan kombinere navn og sett i samme søk — f.eks. <em>"Charizard Phantasmal"</em> eller <em>"Boss MEG 114"</em>.
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Sett-filter:</strong> Klikk på "Filtrer sett…" for å begrense søket til ett sett. Støtter settnavn (f.eks. "Surging Sparks"), sett-ID (f.eks. "sv08") og offisiell kode (f.eks. "SSP").
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Standard / Expanded:</strong> Velg format. Standard viser (for det meste) kun kort som er gyldige i gjeldende turneringssesong.
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Korttype-filter:</strong> Filtrer på kategori — Pokémon, Trainer, Item, Supporter, Stadium, Tool, Energy eller Special Energy.
                </p>
              </div>
            </div>

            <div className={styles.helpSection}>
              <h3 className={styles.helpSectionTitle}>Legge til og fjerne kort</h3>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Legg til:</strong> Klikk på <strong>høyre halvdel</strong> av et kort (+) for å legge det til dekket.
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Fjern ett:</strong> Klikk på <strong>venstre halvdel</strong> av et kort (−) for å fjerne ett eksemplar fra dekket.
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Maks kopier:</strong> Du kan ha maks 4 kopier av samme kort. Grunnenergi (Grass, Fire, Water osv.) har ingen begrensning.
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Antall-badge:</strong> Det blå tallet i hjørnet av et kort viser hvor mange eksemplarer du har lagt til.
                </p>
              </div>
            </div>

            <div className={styles.helpSection}>
              <h3 className={styles.helpSectionTitle}>Deck-panelet</h3>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Navn og spiller:</strong> Gi dekket et navn og koble det til en spiller fra kontoen din (valgfritt — brukes ved turnerings­innlevering).
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Kortteller:</strong> Viser antall kort. Et turneringsgyldig deck krever nøyaktig <strong>60 kort</strong> — telleren er rød ved feil antall og grønn ved 60.
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Juster antall:</strong> Bruk + og − knappene i listen for å endre antall, eller søppelbøtten for å fjerne kortet helt.
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Skjul seksjoner:</strong> Klikk på Pokémon-, Trainer- eller Energy-overskriften for å vise eller skjule seksjonen.
                </p>
              </div>
            </div>

            <div className={styles.helpSection}>
              <h3 className={styles.helpSectionTitle}>Handlinger</h3>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Lagre:</strong> Lagrer dekket til kontoen din (krever innlogging).
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Kopier:</strong> Kopierer dekket som tekstliste — nyttig for å sende til andre eller bruke i turneringsverktøy som Limitless TCG.
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Importer:</strong> Lim inn en deckliste i standard tekstformat (f.eks. fra Pokémon Live) for å laste inn et ferdig deck raskt.
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Skriv ut:</strong> Åpner utskriftsdialog med en oversiktlig deckliste.
                </p>
              </div>
            </div>

            <div className={styles.modalButtons}>
              <button className={styles.modalConfirm} onClick={() => setShowHelpModal(false)}>
                Lukk
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  );
};

export default DeckBuilder;

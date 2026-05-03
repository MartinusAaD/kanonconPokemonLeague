import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { database } from "../../firestoreConfig";
import {
  doc,
  getDoc,
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
import { BASIC_ENERGY_NAMES, isBasicEnergy, formatDeckList } from "../../utils/deckUtils";
import { STANDARD_REG_MARKS, ENERGY_TYPES, MAX_COPIES, MAX_DECK_CARDS } from "../../config/deckConfig";
import { TCGDEX_BASE, calcStandardLegal, calcExpandedLegal, getSetId, getSetName, padCardNumber } from "../../utils/tcgdexUtils";
import { useCardSearch } from "../../hooks/useCardSearch";
import useAccountPlayers from "../../hooks/useAccountPlayers";

const CARD_BACK_URL = "https://images.pokemontcg.io/back.png";
const SET_CODES_CACHE_KEY = "deckbuilder_set_codes_v1";

const BASIC_POKEMON_STAGES = new Set(["Basic"]);

// TCGdex /sets list doesn't include releaseDate, so we fall back to a
// generation score derived from the set ID prefix to keep modern sets first.
const setGenScore = (id = "") => {
  if (/^sv/.test(id))   return 100;
  if (/^swsh/.test(id)) return 90;
  if (/^sm/.test(id))   return 80;
  if (/^xy/.test(id))   return 70;
  if (/^bw/.test(id))   return 60;
  if (/^hgss/.test(id)) return 50;
  if (/^dp/.test(id))   return 40;
  if (/^ex/.test(id))   return 30;
  if (/^neo/.test(id))  return 20;
  if (/^base/.test(id)) return 10;
  return 25;
};
const compareSetsByNewestRelease = (a, b) => {
  const da = Date.parse(a.releaseDate || "");
  const db = Date.parse(b.releaseDate || "");
  if (!Number.isNaN(da) && !Number.isNaN(db)) return db - da;
  if (!Number.isNaN(db)) return 1;
  if (!Number.isNaN(da)) return -1;
  const diff = setGenScore(b.id) - setGenScore(a.id);
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name);
};

// Runs Promise.allSettled in chunks to avoid flooding the browser connection pool
const batchedSettle = async (items, fn, concurrency = 10) => {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
};

const normalizeSetToken = (token) => String(token || "").trim().toLowerCase();

const DeckBuilder = () => {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = getAuthContext();

  const [setsLegality, setSetsLegality] = useState({});
  const setsLegalityRef = useRef({});
  const [sets, setSets] = useState([]);
  const [setsLoading, setSetsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSet, setSelectedSet] = useState("");
  const [formatFilter, setFormatFilter] = useState("standard");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState(null);
  const [flashCardId, setFlashCardId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const [deck, setDeck] = useState([]);
  const [deckName, setDeckName] = useState("");
  const [selectedPlayerKey, setSelectedPlayerKey] = useState("");
  const accountPlayers = useAccountPlayers(user);

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSaveWarningModal, setShowSaveWarningModal] = useState(false);
  const [showBasicPokemonWarningModal, setShowBasicPokemonWarningModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [importWarnings, setImportWarnings] = useState([]);
  const [showIllegalCardsWarningModal, setShowIllegalCardsWarningModal] = useState(false);
  const [pageLoading, setPageLoading] = useState(!!deckId);
  const [collapsedSections, setCollapsedSections] = useState({});

  const setMetaFetchRef = useRef({});
  const deckPanelRef = useRef(null);

  const LS_KEY = "deckbuilder_draft";

  // ── Search hook ──────────────────────────────────────────────────────────

  const ensureSetOfficialCode = useCallback((setId) => {
    if (setsLegalityRef.current[setId]) return Promise.resolve(setsLegalityRef.current[setId]);
    if (setMetaFetchRef.current[setId]) return setMetaFetchRef.current[setId];

    const req = fetch(`${TCGDEX_BASE}/sets/${setId}`)
      .then((r) => r.json())
      .then((data) => {
        const info = { officialCode: data.abbreviation?.official || null };
        setSetsLegality((prev) => (prev[setId] ? prev : { ...prev, [setId]: info }));
        return info;
      })
      .catch(() => {
        const info = { officialCode: null };
        setSetsLegality((prev) => (prev[setId] ? prev : { ...prev, [setId]: info }));
        return info;
      })
      .finally(() => {
        delete setMetaFetchRef.current[setId];
      });

    setMetaFetchRef.current[setId] = req;
    return req;
  }, []);

  const {
    allResults,
    setAllResults,
    isSearching,
    hasSearched,
    currentPage,
    setCurrentPage,
    filteredResults,
    pageResults,
    totalPages,
  } = useCardSearch({
    searchQuery,
    selectedSet,
    categoryFilter,
    typeFilter,
    formatFilter,
    sets,
    setsLegalityRef,
    ensureSetOfficialCode,
  });

  // ── Draft persistence ────────────────────────────────────────────────────

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

  // ── UI layout effects ────────────────────────────────────────────────────

  useEffect(() => {
    const panel = deckPanelRef.current;
    if (!panel) return;
    let prevHeight = panel.offsetHeight;
    const observer = new ResizeObserver(() => {
      if (window.innerWidth > 900) { prevHeight = panel.offsetHeight; return; }
      const newHeight = panel.offsetHeight;
      const diff = newHeight - prevHeight;
      prevHeight = newHeight;
      if (diff !== 0) window.scrollBy({ top: diff, behavior: "instant" });
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (setDropdownRef.current && !setDropdownRef.current.contains(e.target)) {
        setShowSetDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Sets loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${TCGDEX_BASE}/sets`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSets([...data].sort((a, b) => a.name.localeCompare(b.name)));
        }
      })
      .catch(console.error)
      .finally(() => setSetsLoading(false));
  }, []);

  useEffect(() => {
    if (sets.length === 0) return;
    try {
      const raw = localStorage.getItem(SET_CODES_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const validIds = new Set(sets.map((s) => s.id));
      const restored = {};
      for (const [id, info] of Object.entries(parsed)) {
        if (validIds.has(id) && info && typeof info === "object") {
          restored[id] = { officialCode: info.officialCode || null };
        }
      }
      if (Object.keys(restored).length === 0) return;
      setSetsLegality((prev) => ({ ...restored, ...prev }));
    } catch {
      // Ignore corrupted cache; fresh metadata will be fetched as needed.
    }
  }, [sets]);

  useEffect(() => {
    if (Object.keys(setsLegality).length === 0) return;
    try {
      localStorage.setItem(SET_CODES_CACHE_KEY, JSON.stringify(setsLegality));
    } catch {
      // Ignore storage failures (private mode/quota).
    }
  }, [setsLegality]);

  // Background-fetch official abbreviations for all sets so the dropdown can match by shorthand.
  useEffect(() => {
    if (sets.length === 0) return;
    const uncached = [...sets]
      .sort(compareSetsByNewestRelease)
      .filter((s) => !(s.id in setsLegalityRef.current));
    if (uncached.length === 0) return;
    const seed = uncached.slice(0, 60);
    (async () => {
      await batchedSettle(seed, (s) => ensureSetOfficialCode(s.id), 6);
    })();
  }, [ensureSetOfficialCode, sets]);

  // On-demand abbreviation fetch when typing in the set dropdown
  useEffect(() => {
    const query = setSearch.trim().toLowerCase();
    if (sets.length === 0 || query.length < 2) return;

    const hasMatch = sets.some((s) => {
      const code = (setsLegalityRef.current[s.id]?.officialCode || "").toLowerCase();
      return (
        s.name.toLowerCase().includes(query)
        || s.id.toLowerCase().includes(query)
        || code.includes(query)
      );
    });
    if (hasMatch) return;

    const uncached = [...sets]
      .sort(compareSetsByNewestRelease)
      .filter((s) => !(s.id in setsLegalityRef.current));
    if (uncached.length === 0) return;

    let cancelled = false;
    const isCodeLikeQuery = !query.includes(" ") && /^[a-z0-9]{2,5}$/.test(query);
    const CHUNK = isCodeLikeQuery ? 40 : 12;
    (async () => {
      for (let i = 0; i < uncached.length && !cancelled; i += CHUNK) {
        await Promise.allSettled(uncached.slice(i, i + CHUNK).map((s) => ensureSetOfficialCode(s.id)));
        if (cancelled) return;
        const found = sets.some((s) =>
          (setsLegalityRef.current[s.id]?.officialCode || "").toLowerCase().includes(query)
        );
        if (found) return;
      }
    })();

    return () => { cancelled = true; };
  }, [ensureSetOfficialCode, setSearch, sets]);

  // Keep setsLegalityRef in sync with state
  useEffect(() => {
    setsLegalityRef.current = setsLegality;
  }, [setsLegality]);

  // Batch-fetch legality for any sets not yet in the cache when name-search results arrive
  useEffect(() => {
    if (allResults.length === 0 || selectedSet) return;
    const uncached = [
      ...new Set(allResults.map((c) => {
        if (!c.id) return "";
        const i = c.id.lastIndexOf("-");
        return i === -1 ? c.id : c.id.slice(0, i);
      }).filter(Boolean)),
    ].filter((id) => !(id in setsLegality));
    if (uncached.length === 0) return;
    Promise.all(
      uncached.map((id) =>
        fetch(`${TCGDEX_BASE}/sets/${id}`)
          .then((r) => r.json())
          .then((data) => [id, { officialCode: data.abbreviation?.official || null }])
          .catch(() => [id, { officialCode: null }])
      )
    ).then((entries) => {
      setSetsLegality((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
  }, [allResults, setsLegality, selectedSet]);

  // ── Deck load (edit mode) ────────────────────────────────────────────────

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

  // ── Deck computed values ─────────────────────────────────────────────────

  const totalCards = deck.reduce((sum, c) => sum + c.count, 0);
  const hasIllegalCards = deck.some((c) => !c.isStandardLegal);
  const hasBasicPokemon = !deck.some((c) => c.category === "Pokemon")
    || deck.some((c) => c.category === "Pokemon" && BASIC_POKEMON_STAGES.has(c.stage));

  const deckSections = [
    { key: "Pokemon", label: "Pokémon", cards: deck.filter((c) => c.category === "Pokemon").sort((a, b) => a.name.localeCompare(b.name)) },
    { key: "Trainer", label: "Trainer", cards: deck.filter((c) => c.category === "Trainer").sort((a, b) => a.name.localeCompare(b.name)) },
    { key: "Energy",  label: "Energy",  cards: deck.filter((c) => c.category === "Energy").sort((a, b) => a.name.localeCompare(b.name)) },
  ];

  const countCopiesByName = (name) =>
    deck.reduce((s, c) => s + (c.name.toLowerCase() === name.toLowerCase() ? c.count : 0), 0);

  // ── Deck operations ──────────────────────────────────────────────────────

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
          isStandardLegal: calcStandardLegal({ name: resolvedCard.name, legal: full.legal, regulationMark: full.regulationMark }),
        } : c));
      } catch { /* keep card as-is */ }
    }

    const basic = isBasicEnergy(resolvedCard.name);
    const existing = deck.find((c) => c.tcgdexId === resolvedCard.id);
    const total = deck.reduce((s, c) => s + c.count, 0);
    const nameTotal = countCopiesByName(resolvedCard.name);

    if (!basic && nameTotal >= MAX_COPIES) {
      setFlashCardId(resolvedCard.id);
      setTimeout(() => setFlashCardId(null), 700);
      setToastMessage(`${MAX_COPIES} Kopier av "${resolvedCard.name}" er allerede i decket`);
      return;
    }
    if (total >= MAX_DECK_CARDS) {
      setToastMessage(`Decket er fullt — maks ${MAX_DECK_CARDS} kort`);
      return;
    }

    if (existing) {
      setDeck((prev) =>
        prev.map((c) => c.tcgdexId === resolvedCard.id ? { ...c, count: c.count + 1 } : c)
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
          stage: resolvedCard.stage || null,
          isBasicEnergy: basic,
          isStandardLegal: resolvedCard.isStandardLegal ?? true,
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
      setToastMessage(`${MAX_COPIES} Kopier av "${card.name}" er allerede i decket`);
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

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSaveClick = () => {
    if (!user) { setShowGuestModal(true); return; }
    if (!deckName.trim()) { setToastMessage("Gi decket eit navn før du lagrer."); return; }
    if (totalCards !== 60) { setShowSaveWarningModal(true); return; }
    if (!hasBasicPokemon) { setShowBasicPokemonWarningModal(true); return; }
    if (hasIllegalCards) { setShowIllegalCardsWarningModal(true); return; }
    doSave();
  };

  const doSave = async () => {
    setShowSaveWarningModal(false);
    setShowBasicPokemonWarningModal(false);
    setShowIllegalCardsWarningModal(false);
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

  // ── Import ───────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportErrors([]);

    const lines = importText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

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
      setImportErrors(["Ingen gyldige linjer funnet. Forventet format: «4 Charizard ex sv3 54»"]);
      setImporting(false);
      return;
    }

    const setTokenToId = {};
    for (const s of sets) {
      setTokenToId[normalizeSetToken(s.id)] = s.id;
      if (s.abbreviation?.official) {
        setTokenToId[normalizeSetToken(s.abbreviation.official)] = s.id;
      }
    }
    for (const [id, info] of Object.entries(setsLegalityRef.current)) {
      if (info?.officialCode) setTokenToId[normalizeSetToken(info.officialCode)] = id;
    }

    const resolveImportedSetToken = async (token) => {
      const normalized = normalizeSetToken(token);
      if (!normalized) return null;
      if (setTokenToId[normalized]) return setTokenToId[normalized];

      const uncached = sets.filter((s) => !(s.id in setsLegalityRef.current));
      for (let i = 0; i < uncached.length; i += 30) {
        await Promise.allSettled(
          uncached.slice(i, i + 30).map((s) => ensureSetOfficialCode(s.id))
        );
        for (const [id, info] of Object.entries(setsLegalityRef.current)) {
          if (info?.officialCode) setTokenToId[normalizeSetToken(info.officialCode)] = id;
        }
        if (setTokenToId[normalized]) return setTokenToId[normalized];
      }
      return null;
    };

    const uniqueSetTokens = [...new Set(parsed.map((p) => p.setId))];
    const resolvedImportSets = {};
    for (const setToken of uniqueSetTokens) {
      resolvedImportSets[setToken] = await resolveImportedSetToken(setToken);
    }

    const uniqueQueries = [
      ...new Set(parsed.map((p) => `${p.name}__${resolvedImportSets[p.setId] || ""}`)),
    ];
    const cache = {};
    for (const queryKey of uniqueQueries) {
      const [name, resolvedSetId = ""] = queryKey.split("__");
      try {
        let allCards = [];
        if (resolvedSetId) {
          const mainData = await fetch(
            `${TCGDEX_BASE}/cards?${new URLSearchParams({ name, "set.id": resolvedSetId })}`
          ).then((r) => r.json());
          allCards = Array.isArray(mainData) ? mainData : [];
        } else {
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
          allCards = [
            ...(Array.isArray(mainData) ? mainData : []),
            ...regMarkData.flatMap((d) => (Array.isArray(d) ? d : [])),
          ];
        }
        const seen = new Set();
        cache[queryKey] = allCards.filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
      } catch {
        cache[queryKey] = [];
      }
    }

    const errors = [];
    const warnings = [];
    const newDeck = [];

    for (const p of parsed) {
      const resolvedSetId = resolvedImportSets[p.setId] || null;
      const queryKey = `${p.name}__${resolvedSetId || ""}`;
      const candidates = cache[queryKey] || [];
      const cardSetId = (c) => getSetId(c.set) || (c.id ? c.id.slice(0, c.id.lastIndexOf("-")) : "");
      const exactSetCandidates = resolvedSetId
        ? candidates.filter((c) => cardSetId(c) === resolvedSetId)
        : candidates;

      const found =
        exactSetCandidates.find((c) => String(c.localId) === String(p.number)) ||
        exactSetCandidates.find((c) => c.name === p.name) ||
        candidates.find((c) => String(c.localId) === String(p.number)) ||
        candidates.find((c) => c.name === p.name);

      if (found) {
        const basic = isBasicEnergy(found.name);
        let cardStage = null;
        let cardLegal = null;
        let cardRegMark = null;
        let cardImage = found.image || null;
        let cardCategory = found.category || null;
        try {
          const full = await fetch(`${TCGDEX_BASE}/cards/${found.id}`).then((r) => r.json());
          cardStage = full.stage || null;
          cardLegal = full.legal || null;
          cardRegMark = full.regulationMark || null;
          cardImage = full.image || cardImage;
          cardCategory = full.category || cardCategory;
        } catch { /* leave nulls, fall back to stub data */ }
        const existing = newDeck.find((c) => c.tcgdexId === found.id);
        if (existing) {
          existing.count += p.count;
        } else {
          newDeck.push({
            tcgdexId: found.id,
            name: found.name,
            // Keep the original abbreviation so exports round-trip correctly.
            setId: p.setId,
            setName: getSetName(found.set),
            number: p.number,
            category: cardCategory || p.category,
            stage: cardStage,
            isBasicEnergy: basic,
            isStandardLegal: calcStandardLegal({ name: found.name, legal: cardLegal, regulationMark: cardRegMark }),
            isExpandedLegal: calcExpandedLegal({ name: found.name, legal: cardLegal, regulationMark: cardRegMark }),
            imageUrl: cardImage ? `${cardImage}/high.webp` : null,
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
          category: p.category,
          isBasicEnergy: isBasicEnergy(p.name),
          isStandardLegal: true,
          imageUrl: null,
          count: p.count,
        });
      }
    }

    const nameTotals = {};
    for (const card of newDeck) {
      const key = card.name.toLowerCase();
      nameTotals[key] = (nameTotals[key] || 0) + card.count;
    }
    const warnedOverLimit = new Set();
    for (const card of newDeck) {
      const key = card.name.toLowerCase();
      if (!card.isBasicEnergy && !warnedOverLimit.has(key) && nameTotals[key] > MAX_COPIES) {
        warnings.push(`"${card.name}": ${nameTotals[key]} kopier i decket (maks ${MAX_COPIES} tillatt).`);
        warnedOverLimit.add(key);
      }
    }

    const warnedIllegal = new Set();
    for (const card of newDeck) {
      const key = card.name.toLowerCase();
      if (!card.isStandardLegal && !warnedIllegal.has(key)) {
        warnings.push(`"${card.name}" er ikke Standard-lovlig.`);
        warnedIllegal.add(key);
      }
    }

    setDeck(newDeck);
    setImportErrors(errors);
    setImportWarnings(warnings);
    setImporting(false);
    if (errors.length === 0 && warnings.length === 0) setShowImportModal(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────

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
                  placeholder={setsLoading ? "Laster sett…" : "Filtrer sett…"}
                  disabled={setsLoading}
                  value={setSearch}
                  onFocus={() => !setsLoading && setShowSetDropdown(true)}
                  onChange={(e) => {
                    setSetSearch(e.target.value);
                    setShowSetDropdown(true);
                    if (!e.target.value) {
                      setSelectedSet("");
                      setCurrentPage(1);
                    }
                  }}
                />
                {setsLoading && (
                  <FontAwesomeIcon icon={faSpinner} spin className={styles.setLoadingIcon} />
                )}
                {selectedSet && !setsLoading && (
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
              {showSetDropdown && !setsLoading && (
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
                disabled={["Trainer", "Item", "Supporter", "Stadium", "Tool", "SpecialEnergy"].includes(categoryFilter)}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setTypeFilter(val);
                  setCurrentPage(1);
                }}
              >
                <option value="">Alle typer</option>
                {ENERGY_TYPES.map((t) => (
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
                {pageResults.map((card, i) => {
                  const count = deck.find((c) => c.tcgdexId === card.id)?.count || 0;
                  return (
                    <div
                      key={card.id}
                      style={{ "--i": i }}
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
                          {setsLegality[getSetId(card.set)]?.officialCode || getSetName(card.set)} · {padCardNumber(card.localId)}{card.regulationMark ? ` · ${card.regulationMark}` : ""}
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
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    ←
                  </button>
                  <span className={styles.pageInfo}>
                    Side {currentPage} / {totalPages}
                  </span>
                  <button
                    className={styles.pageBtn}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
        <div className={styles.deckPanel} ref={deckPanelRef}>
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
                totalCards === 60 ? styles.deckCounterGreen : styles.deckCounterRed,
              ].join(" ")}
            >
              {totalCards} / 60
            </div>
            {hasIllegalCards && (
              <div className={styles.illegalBanner}>
                <FontAwesomeIcon icon={faTriangleExclamation} />
                {" "}Dette decket inneholder kort som ikke er Standard-lovlige.
              </div>
            )}
            {!hasBasicPokemon && (
              <div className={styles.illegalBanner}>
                <FontAwesomeIcon icon={faTriangleExclamation} />
                {" "}Decket inneholder ingen basic-Pokémon.
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
                const sectionTotal = section.cards.reduce((s, c) => s + c.count, 0);
                return (
                  <div key={section.key} className={styles.deckSection}>
                    <button
                      className={[
                        styles.deckSectionHeader,
                        styles[`deckSectionHeader${section.key}`],
                      ].join(" ")}
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
                                    !card.isStandardLegal ? styles.deckCardIllegal : "",
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
                <><FontAwesomeIcon icon={faSpinner} spin /> Lagrer…</>
              ) : saveSuccess ? (
                <><FontAwesomeIcon icon={faCheck} /> Lagret!</>
              ) : (
                <><FontAwesomeIcon icon={faFloppyDisk} /> Lagre</>
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
                  <><FontAwesomeIcon icon={faCheck} /> Kopiert!</>
                ) : (
                  <><FontAwesomeIcon icon={faCopy} /> Kopier</>
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

      {/* ── Modals ───────────────────────────────────────────────────────── */}

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
        message="Er du sikker på at du vil tømme hele decket?"
        onConfirm={() => { setDeck([]); setShowClearModal(false); }}
        onCancel={() => setShowClearModal(false)}
      />

      <ConfirmDialog
        isOpen={showSaveWarningModal}
        message={`Dette decket er ikke turneringsgyldig (${totalCards} kort). Et gyldig deck må inneholde nøyaktig 60 kort. Vil du lagre likevel?`}
        onConfirm={() => {
          setShowSaveWarningModal(false);
          if (!hasBasicPokemon) { setShowBasicPokemonWarningModal(true); }
          else if (hasIllegalCards) { setShowIllegalCardsWarningModal(true); }
          else { doSave(); }
        }}
        onCancel={() => setShowSaveWarningModal(false)}
      />

      <ConfirmDialog
        isOpen={showBasicPokemonWarningModal}
        message="Decket inneholder ingen basic-Pokémon. Et gyldig deck må ha minst én basic-Pokémon. Vil du lagre likevel?"
        onConfirm={() => {
          setShowBasicPokemonWarningModal(false);
          if (hasIllegalCards) { setShowIllegalCardsWarningModal(true); } else { doSave(); }
        }}
        onCancel={() => setShowBasicPokemonWarningModal(false)}
      />

      <ConfirmDialog
        isOpen={showIllegalCardsWarningModal}
        message="Decket inneholder kort som ikke er Standard-lovlige. Vil du lagre likevel?"
        onConfirm={doSave}
        onCancel={() => setShowIllegalCardsWarningModal(false)}
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
            {importWarnings.length > 0 && (
              <div className={styles.importWarnings}>
                <p className={styles.importErrorTitle}>Merk følgende:</p>
                <ul>
                  {importWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
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
                  setImportWarnings([]);
                }}
                disabled={importing}
              >
                Avbryt
              </button>
              {importWarnings.length > 0 || importErrors.length > 0 ? (
                <button
                  className={styles.modalConfirm}
                  onClick={() => {
                    setShowImportModal(false);
                    setImportErrors([]);
                    setImportWarnings([]);
                  }}
                >
                  Forstått
                </button>
              ) : (
                <button
                  className={styles.modalConfirm}
                  onClick={handleImport}
                  disabled={importing || !importText.trim()}
                >
                  {importing ? (
                    <><FontAwesomeIcon icon={faSpinner} spin /> Importerer…</>
                  ) : (
                    "Importer"
                  )}
                </button>
              )}
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
                  <strong>Legg til:</strong> Klikk på <strong>høyre halvdel</strong> av et kort (+) for å legge det til decket.
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Fjern ett:</strong> Klikk på <strong>venstre halvdel</strong> av et kort (−) for å fjerne ett eksemplar fra decket.
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
                  <strong>Navn og spiller:</strong> Gi decket et navn og koble det til en spiller fra kontoen din (valgfritt — brukes ved turnerings­innlevering).
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
                  <strong>Lagre:</strong> Lagrer decket til kontoen din (krever innlogging).
                </p>
              </div>
              <div className={styles.helpTip}>
                <p className={styles.helpTipText}>
                  <strong>Kopier:</strong> Kopierer decket som tekstliste — nyttig for å sende til andre eller bruke i turneringsverktøy som Limitless TCG.
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

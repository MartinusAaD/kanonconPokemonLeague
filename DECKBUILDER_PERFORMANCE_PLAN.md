# DeckBuilder Performance Plan

## Context
The DeckBuilder fetches card data from the TCGDex API. After a recent commit added per-card regulation mark enrichment, searches slowed from ~2s to 10-20s. A quick fix (restoring `Promise.allSettled` for name search enrichment at lines 536–539) helped, but it still doesn't feel as fast as before. Three root causes remain.

---

## Root Causes

### 1. Background set abbreviation fetches saturate the connection pool
- **Lines 311–342**: On every page load, a background effect fetches every set's detail endpoint (`GET /sets/{id}`) to extract `abbreviation.official` (used for shorthand search like "SSP 114")
- **200+ sets × 1 fetch each**, in chunks of 30 — Chrome allows only ~6 connections per host, so background requests queue up and compete with actual user searches
- The data is **static** (set codes never change) but nothing persists it — every page reload refetches everything

### 2. Set browsing fetches every card individually on first load
- **Lines 399–410**: Selecting a set now always fetches every card individually (`GET /cards/{id}`) even when no category/type filter is active
- A 200-card set = 200 API calls on first browse
- The old code had a fast path: show stubs with set-level legality instantly when `categoryFilter === "all"` and no `typeFilter`. This was removed when regulation mark display was added.
- Results ARE cached in `setCardsCacheRef` after first load, so only the first browse is slow

### 3. Deck import fetches full card data sequentially
- **Lines 858–878**: A `for` loop with `await` inside fetches each matched card's full data one-at-a-time
- A 60-card import with 30 unique cards = 30 sequential network round-trips

---

## Fix 1 — localStorage Cache for Set Abbreviations (highest impact)

**File:** `src/pages/DeckBuilder/DeckBuilder.jsx`

### Add two constants after line 41:
```js
const LS_ABBREV_KEY = "tcgdex_set_abbrev";
const LS_ABBREV_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
```

### Add two helpers after `batchedSettle` (after line 142):
```js
const loadAbbrevsFromStorage = () => {
  try {
    const raw = localStorage.getItem(LS_ABBREV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.loadedAt) return null;
    if (Date.now() - parsed.loadedAt > LS_ABBREV_TTL) {
      localStorage.removeItem(LS_ABBREV_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
};

const saveAbbrevsToStorage = (data) => {
  try {
    localStorage.setItem(LS_ABBREV_KEY, JSON.stringify({ data, loadedAt: Date.now() }));
  } catch { /* quota errors — silently skip */ }
};
```

### Replace the background fetch effect (lines 311–342):
- **Phase 1**: Call `loadAbbrevsFromStorage()` and immediately hydrate `setsLegality` state + `setsLegalityRef.current` with cached data (zero API calls, instant)
- **Phase 2**: Filter to sets NOT in the merged cache, fetch only those
- **Reduce chunk size from 30 → 6** (matches Chrome's actual connection limit — stops competing with user searches)
- After fetching, call `saveAbbrevsToStorage({ ...persistedData, ...freshEntries })` to persist new entries

```js
useEffect(() => {
  if (sets.length === 0) return;

  // Phase 1: instant hydration from localStorage
  const stored = loadAbbrevsFromStorage();
  const persistedData = stored?.data ?? {};
  if (Object.keys(persistedData).length > 0) {
    setSetsLegality((prev) => ({ ...persistedData, ...prev }));
    setsLegalityRef.current = { ...persistedData, ...setsLegalityRef.current };
  }

  // Phase 2: fetch only sets missing from cache
  const merged = { ...persistedData, ...setsLegalityRef.current };
  const uncached = sets.filter((s) => !(s.id in merged));
  if (uncached.length === 0) return;

  const CHUNK = 6; // matches Chrome's connection-per-host limit
  (async () => {
    const freshEntries = {};
    for (let i = 0; i < uncached.length; i += CHUNK) {
      const entries = (
        await Promise.allSettled(
          uncached.slice(i, i + CHUNK).map((s) =>
            fetch(`${TCGDEX_BASE}/sets/${s.id}`)
              .then((r) => r.json())
              .then((data) => [s.id, { officialCode: data.abbreviation?.official || null }])
          )
        )
      )
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);

      if (entries.length > 0) {
        for (const [id, info] of entries) freshEntries[id] = info;
        setSetsLegality((prev) => {
          const next = { ...prev };
          for (const [id, info] of entries) {
            if (!(id in next)) next[id] = info;
          }
          return next;
        });
      }
    }
    if (Object.keys(freshEntries).length > 0) {
      saveAbbrevsToStorage({ ...persistedData, ...freshEntries });
    }
  })();
}, [sets]);
```

**Result**: After the first-ever page load, set abbreviation data is instant. Zero background network requests on subsequent loads.

---

## Fix 2 — Restore Set Browsing Fast Path

**File:** `src/pages/DeckBuilder/DeckBuilder.jsx`

### Add one ref after line 195:
```js
const setEnrichmentPromiseRef = useRef({}); // setId → in-flight Promise<void>
```

### Replace the set card fetch block (lines 396–412):

```js
// Fast path: show stubs immediately when no filter needs per-card data.
// Background enrichment fills cardCacheRef so filter changes are instant after.
const ensureEnrichment = (setId, stubs) => {
  if (setCardsCacheRef.current[setId]) return Promise.resolve();
  if (!setEnrichmentPromiseRef.current[setId]) {
    setEnrichmentPromiseRef.current[setId] = batchedSettle(stubs, (stub) => {
      if (cardCacheRef.current[stub.id]) return Promise.resolve(cardCacheRef.current[stub.id]);
      return fetch(`${TCGDEX_BASE}/cards/${stub.id}`)
        .then((r) => r.json())
        .then((card) => { cardCacheRef.current[stub.id] = card; return card; })
        .catch(() => stub);
    }).then((results) => {
      setCardsCacheRef.current[setId] = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);
      delete setEnrichmentPromiseRef.current[setId];
    });
  }
  return setEnrichmentPromiseRef.current[setId];
};

const needsEnrichment = categoryFilter !== "all" || !!typeFilter;

if (needsEnrichment) {
  await ensureEnrichment(selectedSet, stubs); // wait — needs per-card category/type data
} else {
  ensureEnrichment(selectedSet, stubs); // fire in background, don't await
}

let allSetCards;
if (setCardsCacheRef.current[selectedSet]) {
  allSetCards = setCardsCacheRef.current[selectedSet];
} else {
  // Fast path: stubs with set-level legality
  allSetCards = stubs.map((stub) => ({
    ...stub,
    legal: data.legal ?? {},
    regulationMark: undefined, // fills in once background enrichment completes
    category: undefined,
    trainerType: undefined,
  }));
}
```

**Behavior:**

| Scenario | Before | After |
|---|---|---|
| First browse, no filter | 200 API calls, slow | Instant stubs, enrichment in background |
| First browse, category filter | 200 API calls, slow | Wait for enrichment (same as before) |
| Second browse, any filter | Cache hit, instant | Cache hit, instant |
| Switch to category filter mid-browse | Wait for enrichment | Reuses in-flight promise, no duplicate requests |

**Note:** In the fast path, `regulationMark` is `undefined` until background enrichment completes. Cards already in `cardCacheRef` from previous searches will have it immediately. This is the only functionality difference.

---

## Fix 3 — Parallelize Deck Import Card Fetches

**File:** `src/pages/DeckBuilder/DeckBuilder.jsx`, lines 826–919

### Fix 3a — Merge double `await Promise.all` (lines 828–836):
```js
// Before: fetch, then separately parse
const [mainRes, ...regMarkRes] = await Promise.all([...]);
const [mainData, ...regMarkData] = await Promise.all([mainRes.json(), ...]);

// After: fetch and parse in one await
const [mainData, ...regMarkData] = await Promise.all([
  fetch(`${TCGDEX_BASE}/cards?${new URLSearchParams({ name })}`).then((r) => r.json()),
  ...[...STANDARD_REG_MARKS].map((mark) =>
    fetch(`${TCGDEX_BASE}/cards?${new URLSearchParams({ name, regulationMark: mark })}`).then((r) => r.json())
  ),
]);
```

### Fix 3b — Replace sequential for-loop (lines 858–919) with parallel fetches:

```js
// Pass 1: resolve stub matches in-memory (no fetch)
const resolvedItems = parsed.map((p) => {
  const candidates = cache[p.name] || [];
  const found =
    candidates.find((c) => String(c.localId) === String(p.number)) ||
    candidates.find((c) => c.name === p.name);
  return { p, found };
});

// Pass 2: collect unique card IDs needing enrichment
const uniqueFoundIds = [...new Set(
  resolvedItems.filter(({ found }) => !!found).map(({ found }) => found.id)
)];

// Pass 3: fetch all in parallel (concurrency 15), populate shared cache
const fullCardMap = {};
await batchedSettle(uniqueFoundIds, async (id) => {
  try {
    const full = await fetch(`${TCGDEX_BASE}/cards/${id}`).then((r) => r.json());
    cardCacheRef.current[id] = full;
    fullCardMap[id] = full;
  } catch { fullCardMap[id] = null; }
}, 15);

// Pass 4: assemble newDeck (same logic as before, no awaits)
for (const { p, found } of resolvedItems) {
  if (found) {
    const full = fullCardMap[found.id];
    const basic = isBasicEnergy(found.name);
    const cardStage = full?.stage || null;
    const cardLegal = full?.legal || null;
    const cardRegMark = full?.regulationMark || null;
    const cardImage = full?.image || found.image || null;
    const cardCategory = full?.category || found.category || null;
    const existing = newDeck.find((c) => c.tcgdexId === found.id);
    if (existing) {
      existing.count += p.count;
    } else {
      newDeck.push({
        tcgdexId: found.id,
        name: found.name,
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
```

**Result**: 30 sequential round-trips → 2 parallel batches of 15. Also populates `cardCacheRef` so subsequent set-browse loads for those cards are faster.

---

## Implementation Order
1. **Fix 1** — Independent, highest impact, zero risk to search behavior
2. **Fix 3a + 3b** — Self-contained to the import function
3. **Fix 2** — Most complex, test filter-switching edge cases carefully

## Files Changed
- `src/pages/DeckBuilder/DeckBuilder.jsx` — all changes (no other files)

## Verification Checklist
- [ ] Search for a Pokémon name — speed should be same or better
- [ ] Browse a set for the first time — stubs appear instantly, regulation marks fill in after
- [ ] Browse same set with Pokémon/Trainer filter — waits for enrichment, then shows filtered
- [ ] Switch from "all" to "Pokémon" filter while set is still enriching — waits, no duplicate requests
- [ ] Import a full 60-card deck — noticeably faster
- [ ] Refresh the page — set shorthand search (e.g. "SSP 114") still works immediately
- [ ] DevTools Network tab — far fewer background requests after page load on second visit

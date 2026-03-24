import React, { useState, useEffect, useRef } from "react";
import styles from "./DeckCheckPicker.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShuffle,
  faRotateRight,
  faTrophy,
  faCircleCheck,
  faMinus,
  faPlus,
  faTriangleExclamation,
  faDice,
} from "@fortawesome/free-solid-svg-icons";
import { database } from "../../firestoreConfig";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";

const defaultCount = (total) => Math.max(1, Math.round(total * 0.1));

const DeckCheckPicker = ({ players, eventId }) => {
  const totalCount = players.length;

  const [count, setCount] = useState(() => defaultCount(totalCount));
  // phase: 'loading' | 'idle' | 'spinning' | 'revealing' | 'done'
  const [phase, setPhase] = useState("loading");
  // Store only IDs so cards always reflect live player data from props
  const [selectedIds, setSelectedIds] = useState([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [displayName, setDisplayName] = useState("");
  // incrementing key forces CSS animation to re-run on each name change
  const [displayKey, setDisplayKey] = useState(0);
  // tracks which result-card indices are mid-reroll
  const [rerollingIndices, setRerollingIndices] = useState(new Set());

  // Derive live player objects from current props — arrived status stays in sync
  const selectedPlayers = selectedIds
    .map((pid) => players.find((p) => p.playerId === pid))
    .filter(Boolean);

  const timeoutsRef = useRef([]);

  // Keep default in sync as players register, but only while idle
  const prevTotalRef = useRef(totalCount);
  useEffect(() => {
    if (phase === "idle" && totalCount !== prevTotalRef.current) {
      setCount(defaultCount(totalCount));
      prevTotalRef.current = totalCount;
    }
  }, [totalCount, phase]);

  // Sync ref so snapshot callbacks can read phase without stale closure
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Persist current picks to the event document
  const savePicks = (ids) => {
    if (!eventId) return;
    updateDoc(doc(database, "events", eventId), { deckCheckPicks: ids });
  };

  // Restore picks from Firestore and stay in sync across devices
  useEffect(() => {
    if (!eventId) {
      setPhase("idle");
      return;
    }
    const eventRef = doc(database, "events", eventId);
    let initialised = false;
    const unsub = onSnapshot(eventRef, (snap) => {
      if (!snap.exists()) {
        if (!initialised) {
          initialised = true;
          setPhase("idle");
        }
        return;
      }
      const picks = snap.data().deckCheckPicks ?? [];
      if (!initialised) {
        initialised = true;
        if (picks.length > 0) {
          setSelectedIds(picks);
          setRevealedCount(picks.length);
          setPhase("done");
        } else {
          setPhase("idle");
        }
        return;
      }
      // subsequent real-time updates (other admin rerolled, etc.)
      if (phaseRef.current !== "idle") return;
      if (picks.length > 0) {
        setSelectedIds(picks);
        setRevealedCount(picks.length);
        setPhase("done");
      }
    });
    return () => unsub();
  }, [eventId]);

  const safeCount = Math.max(1, Math.min(count, totalCount || 1));

  const clearAll = () => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  };

  useEffect(() => () => clearAll(), []);

  const addTimeout = (fn, delay) => {
    const t = setTimeout(fn, delay);
    timeoutsRef.current.push(t);
    return t;
  };

  const adjustCount = (delta) => {
    setCount((prev) => Math.max(1, Math.min(totalCount, prev + delta)));
  };

  const startDraw = () => {
    if (players.length === 0) return;
    clearAll();

    // Determine final picks from the full pool
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, safeCount);

    setSelectedIds(picked.map((p) => p.playerId));
    setRevealedCount(0);
    setRerollingIndices(new Set());
    setPhase("spinning");

    // ── Phase 1: Spin with natural deceleration for 2.8 s ──────────────
    const SPIN_DURATION = 2800;
    const startTime = Date.now();

    const spin = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= SPIN_DURATION) {
        revealSequential(picked, 0);
        return;
      }
      const progress = elapsed / SPIN_DURATION;
      const interval = 60 + Math.pow(progress, 2) * 260;
      const r = players[Math.floor(Math.random() * players.length)];
      setDisplayName(`${r.firstName} ${r.lastName}`);
      setDisplayKey((k) => k + 1);
      addTimeout(spin, interval);
    };

    spin();
  };

  // ── Phase 2: Reveal each selected player one by one ────────────────────
  const revealSequential = (picked, index) => {
    if (index >= picked.length) {
      setPhase("done");
      setDisplayName("");
      return;
    }

    setPhase("revealing");
    setDisplayName(`${picked[index].firstName} ${picked[index].lastName}`);
    setDisplayKey((k) => k + 1);

    addTimeout(() => {
      setRevealedCount(index + 1);

      const isLast = index === picked.length - 1;
      addTimeout(
        () => {
          if (isLast) {
            setPhase("done");
            setDisplayName("");
            savePicks(picked.map((p) => p.playerId));
          } else {
            revealSequential(picked, index + 1);
          }
        },
        isLast ? 700 : 950,
      );
    }, 850);
  };

  // ── Reroll a single result card ────────────────────────────────────────
  const rerollPlayer = (index) => {
    if (rerollingIndices.has(index)) return;

    // Build pool: all players except those already selected (excluding the slot being replaced)
    const currentIds = new Set(selectedIds.filter((_, i) => i !== index));
    const pool = players.filter((p) => !currentIds.has(p.playerId));
    if (pool.length === 0) return;

    setRerollingIndices((prev) => new Set([...prev, index]));

    const newPlayer = pool[Math.floor(Math.random() * pool.length)];

    addTimeout(() => {
      setSelectedIds((prev) => {
        const next = [...prev];
        next[index] = newPlayer.playerId;
        savePicks(next);
        return next;
      });
      setRerollingIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }, 1200);
  };

  const reset = () => {
    clearAll();
    setPhase("idle");
    setSelectedIds([]);
    setRevealedCount(0);
    setDisplayName("");
    setDisplayKey(0);
    setRerollingIndices(new Set());
    if (eventId) {
      updateDoc(doc(database, "events", eventId), { deckCheckPicks: [] });
    }
  };

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIconContainer}>
            <FontAwesomeIcon icon={faShuffle} className={styles.headerIcon} />
          </span>
          <h2 className={styles.title}>Deck Check Roulette</h2>
        </div>
        {phase === "done" && (
          <button className={styles.resetBtn} onClick={reset}>
            <FontAwesomeIcon icon={faRotateRight} /> Ny Trekking
          </button>
        )}
      </div>

      {/* ── Loading skeleton ── */}
      {phase === "loading" && (
        <div className={styles.skeletonControls}>
          <div className={`${styles.skeletonLine} ${styles.skeletonLabel}`} />
          <div className={styles.skeletonStepper}>
            <div className={styles.skeletonStepBtn} />
            <div
              className={`${styles.skeletonLine} ${styles.skeletonStepVal}`}
            />
            <div className={styles.skeletonStepBtn} />
          </div>
          <div className={`${styles.skeletonLine} ${styles.skeletonNote}`} />
          <div className={`${styles.skeletonLine} ${styles.skeletonDrawBtn}`} />
        </div>
      )}

      {/* ── No players yet ── */}
      {phase !== "loading" && totalCount === 0 && (
        <p className={styles.emptyNote}>
          Ingen spillere er registrert på dette eventet enda.
        </p>
      )}

      {/* ── Idle: count selector + draw button ── */}
      {phase === "idle" && totalCount > 0 && (
        <div className={styles.controls}>
          <p className={styles.controlsLabel}>
            Velg antall spillere for deck check:
          </p>
          <div className={styles.stepper}>
            <button
              className={styles.stepBtn}
              onClick={() => adjustCount(-1)}
              disabled={safeCount <= 1}
              aria-label="Reduser antall"
            >
              <FontAwesomeIcon icon={faMinus} />
            </button>
            <span className={styles.stepValue}>{safeCount}</span>
            <button
              className={styles.stepBtn}
              onClick={() => adjustCount(1)}
              disabled={safeCount >= totalCount}
              aria-label="Øk antall"
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          <p className={styles.arrivedNote}>
            {totalCount} spillere i poolen &nbsp;·&nbsp;{" "}
            {players.filter((p) => p.arrived).length} møtt opp
          </p>
          <button className={styles.drawBtn} onClick={startDraw}>
            <FontAwesomeIcon icon={faShuffle} className={styles.drawBtnSvg} />
            Start Trekking
          </button>
        </div>
      )}

      {/* ── Spinning / Revealing display ── */}
      {(phase === "spinning" || phase === "revealing") && (
        <div
          className={`${styles.spinDisplay} ${
            phase === "spinning" ? styles.spinActive : styles.spinRevealing
          }`}
        >
          <span className={styles.spinLabel}>
            {phase === "spinning"
              ? "Trekker spillere…"
              : `Spiller ${revealedCount + 1} av ${selectedPlayers.length}`}
          </span>

          <span
            key={displayKey}
            className={`${styles.spinName} ${
              phase === "revealing" ? styles.spinNameReveal : ""
            }`}
          >
            {displayName}
          </span>

          {phase === "revealing" && selectedPlayers.length > 1 && (
            <div className={styles.progressDots} aria-hidden="true">
              {selectedPlayers.map((_, i) => (
                <span
                  key={i}
                  className={`${styles.dot} ${
                    i < revealedCount
                      ? styles.dotFilled
                      : i === revealedCount
                        ? styles.dotActive
                        : ""
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Revealed cards ── */}
      {selectedPlayers.length > 0 && revealedCount > 0 && (
        <div className={styles.resultsSection}>
          <p className={styles.resultsTitle}>Valgte spillere</p>
          <div className={styles.resultsGrid}>
            {selectedPlayers.slice(0, revealedCount).map((player, i) => {
              const isRerolling = rerollingIndices.has(i);
              const hasArrived = player.arrived;
              return (
                <div
                  key={`${player.playerId}-${i}`}
                  className={`${styles.resultCard} ${
                    !hasArrived ? styles.resultCardAbsent : ""
                  } ${isRerolling ? styles.resultCardRerolling : ""}`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <div className={styles.cardNum}>{i + 1}</div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardName}>
                      {player.firstName} {player.lastName}
                    </p>
                    <p className={styles.cardId}>{player.playerId}</p>
                  </div>
                  {hasArrived ? (
                    <FontAwesomeIcon
                      icon={faCircleCheck}
                      className={styles.cardCheck}
                    />
                  ) : (
                    <div className={styles.cardAbsentActions}>
                      <span
                        className={styles.absentBadge}
                        title="Ikke møtt opp"
                        aria-label="Ikke møtt opp"
                        role="img"
                      >
                        <FontAwesomeIcon
                          icon={faTriangleExclamation}
                          className={styles.cardWarning}
                          aria-hidden="true"
                        />
                        <span className={styles.absentLabel}>
                          Ikke møtt opp
                        </span>
                      </span>
                      {phase === "done" && (
                        <button
                          className={styles.rerollBtn}
                          onClick={() => rerollPlayer(i)}
                          disabled={isRerolling}
                          title="Trekk ny spiller"
                          aria-label="Trekk ny spiller"
                        >
                          <FontAwesomeIcon icon={faDice} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Done banner ── */}
      {phase === "done" && (
        <div className={styles.doneBanner}>
          <FontAwesomeIcon icon={faTrophy} className={styles.trophyIcon} />
          <span>
            {selectedPlayers.length} spiller
            {selectedPlayers.length !== 1 ? "e" : ""} er trukket for deck check!
          </span>
        </div>
      )}
    </div>
  );
};

export default DeckCheckPicker;

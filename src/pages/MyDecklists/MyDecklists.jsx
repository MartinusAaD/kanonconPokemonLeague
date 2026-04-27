import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { database } from "../../firestoreConfig";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { getAuthContext } from "../../context/authContext";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";
import styles from "./MyDecklists.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faEdit,
  faCopy,
  faTrash,
  faCheck,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

const formatDeckList = (cards) => {
  if (!cards || cards.length === 0) return "";
  const sections = [
    { label: "Pokémon", cards: cards.filter((c) => c.category === "Pokemon") },
    { label: "Trainer", cards: cards.filter((c) => c.category === "Trainer") },
    { label: "Energy", cards: cards.filter((c) => c.category === "Energy") },
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

const formatDate = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const MyDecklists = () => {
  const navigate = useNavigate();
  const { user } = getAuthContext();

  const [decklists, setDecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, deckId: null, deckName: "" });

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(database, "users", user.uid, "decklists"),
      (snap) => {
        const decks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        decks.sort((a, b) => {
          const aTime = a.updatedAt?.toDate?.() || new Date(a.updatedAt || 0);
          const bTime = b.updatedAt?.toDate?.() || new Date(b.updatedAt || 0);
          return bTime - aTime;
        });
        setDecklists(decks);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  const handleCopy = async (deck) => {
    try {
      await navigator.clipboard.writeText(formatDeckList(deck.cards));
      setCopiedId(deck.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert("Kunne ikke kopiere til utklippstavlen.");
    }
  };

  const handleDeleteConfirm = async () => {
    const { deckId } = confirmDelete;
    setConfirmDelete({ isOpen: false, deckId: null, deckName: "" });
    try {
      await deleteDoc(doc(database, "users", user.uid, "decklists", deckId));
    } catch (err) {
      console.error(err);
      alert("Noe gikk galt ved sletting.");
    }
  };

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className={styles.topBar}>
            <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
            <div className={`${styles.skeleton} ${styles.skeletonBtn}`} />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.topBar}>
          <h1 className={styles.title}>Mine Decklister</h1>
          <button
            className={styles.newBtn}
            onClick={() => navigate("/deck-builder/new")}
          >
            <FontAwesomeIcon icon={faPlus} /> Nytt Deck
          </button>
        </div>

        {decklists.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              Du har ingen lagrede decklister ennå.
            </p>
            <button
              className={styles.newBtnLarge}
              onClick={() => navigate("/deck-builder/new")}
            >
              <FontAwesomeIcon icon={faPlus} /> Lag ditt første deck
            </button>
          </div>
        ) : (
          <div className={styles.deckGrid}>
            {decklists.map((deck) => {
              const totalCards = (deck.cards || []).reduce(
                (s, c) => s + c.count,
                0
              );
              const hasIllegal = (deck.cards || []).some(
                (c) => !c.isStandardLegal
              );
              const isLegal = totalCards === 60 && !hasIllegal;

              return (
                <div key={deck.id} className={styles.deckCard}>
                  <div className={styles.deckCardTop}>
                    <div className={styles.deckCardMeta}>
                      <h2 className={styles.deckCardName}>{deck.deckName}</h2>
                      {deck.linkedPlayerId && (
                        <span className={styles.deckCardPlayer}>
                          #{deck.linkedPlayerId}
                        </span>
                      )}
                    </div>
                    <div className={styles.deckCardBadges}>
                      <span
                        className={[
                          styles.countBadge,
                          totalCards === 60
                            ? styles.countBadgeGreen
                            : styles.countBadgeRed,
                        ].join(" ")}
                      >
                        {totalCards} / 60
                      </span>
                      {hasIllegal && (
                        <span className={styles.illegalBadge}>
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                          {" "}Ikke Standard-lovlig
                        </span>
                      )}
                      {isLegal && (
                        <span className={styles.legalBadge}>
                          <FontAwesomeIcon icon={faCheck} />
                          {" "}Turneringsgyldig
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={styles.deckCardStats}>
                    {["Pokemon", "Trainer", "Energy"].map((cat) => {
                      const count = (deck.cards || [])
                        .filter((c) => c.category === cat)
                        .reduce((s, c) => s + c.count, 0);
                      const label =
                        cat === "Pokemon"
                          ? "Pokémon"
                          : cat;
                      return count > 0 ? (
                        <span key={cat} className={styles.statPill}>
                          {label}: {count}
                        </span>
                      ) : null;
                    })}
                  </div>

                  <div className={styles.deckCardFooter}>
                    <span className={styles.updatedAt}>
                      Oppdatert {formatDate(deck.updatedAt)}
                    </span>
                    <div className={styles.deckCardActions}>
                      <button
                        className={styles.actionBtn}
                        onClick={() => navigate(`/deck-builder/${deck.id}`)}
                        title="Rediger deck"
                      >
                        <FontAwesomeIcon icon={faEdit} /> Rediger
                      </button>
                      <button
                        className={[
                          styles.actionBtn,
                          copiedId === deck.id ? styles.actionBtnSuccess : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => handleCopy(deck)}
                        title="Kopier deckliste"
                      >
                        {copiedId === deck.id ? (
                          <><FontAwesomeIcon icon={faCheck} /> Kopiert!</>
                        ) : (
                          <><FontAwesomeIcon icon={faCopy} /> Kopier</>
                        )}
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={() =>
                          setConfirmDelete({
                            isOpen: true,
                            deckId: deck.id,
                            deckName: deck.deckName,
                          })
                        }
                        title="Slett deck"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        message={`Er du sikker på at du vil slette "${confirmDelete.deckName}"? `}
        onConfirm={handleDeleteConfirm}
        onCancel={() =>
          setConfirmDelete({ isOpen: false, deckId: null, deckName: "" })
        }
      />
    </div>
  );
};

export default MyDecklists;

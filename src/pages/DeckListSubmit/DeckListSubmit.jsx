import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { database, storage } from "../../firestoreConfig";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes, deleteObject } from "firebase/storage";
import styles from "./DeckListSubmit.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faList,
  faUpload,
  faCheck,
  faSpinner,
  faXmark,
  faArrowLeft,
  faLayerGroup,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { getAuthContext } from "../../context/authContext";

const DECK_LIST_EVENT_TYPES = ["leagueChallenge", "leagueCup"];

const DeckListSubmit = () => {
  const { eventId, playerId: urlPlayerId } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = getAuthContext();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventTitle, setEventTitle] = useState("");

  // "picker" | "guest-input" | "form"
  const [phase, setPhase] = useState("picker");
  const [linkedPlayers, setLinkedPlayers] = useState([]);
  const [fromPicker, setFromPicker] = useState(false);

  // Active form player
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [playerName, setPlayerName] = useState("");
  const [attendanceDocId, setAttendanceDocId] = useState(null);
  const [existingDeckList, setExistingDeckList] = useState(null);

  const [mode, setMode] = useState("text");
  const [textInput, setTextInput] = useState("");
  const [file, setFile] = useState(null);

  const [showReplaceWarning, setShowReplaceWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [builderDecks, setBuilderDecks] = useState([]);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState(null);

  const [adminPlayerIdInput, setAdminPlayerIdInput] = useState("");
  const [adminLookupError, setAdminLookupError] = useState(null);
  const [adminLookupLoading, setAdminLookupLoading] = useState(false);

  const [guestPlayerIdInput, setGuestPlayerIdInput] = useState("");
  const [guestLookupError, setGuestLookupError] = useState(null);
  const [guestLookupLoading, setGuestLookupLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      try {
        const eventSnap = await getDoc(doc(database, "events", eventId));
        if (!eventSnap.exists()) {
          setError("Event ikke funnet.");
          setPageLoading(false);
          return;
        }
        const event = eventSnap.data();
        if (!DECK_LIST_EVENT_TYPES.includes(event.eventData?.typeOfEvent)) {
          setError("Dette eventet krever ikke deckliste.");
          setPageLoading(false);
          return;
        }
        const eventDate = new Date(event.eventData?.eventDate);
        const today = new Date();
        eventDate.setHours(23, 59, 59, 999);
        today.setHours(0, 0, 0, 0);
        if (today > eventDate) {
          setError("Fristen for å levere deckliste er utløpt.");
          setPageLoading(false);
          return;
        }
        setEventTitle(event.eventData?.eventTitle || "");

        if (urlPlayerId) {
          const err = await loadFormData(urlPlayerId);
          if (err) {
            setError(err);
            setPageLoading(false);
            return;
          }
          setPhase("form");
        } else if (user) {
          await loadLinkedPlayers();
          setPhase("picker");
        } else {
          setPhase("guest-input");
        }
        setPageLoading(false);
      } catch (err) {
        console.error(err);
        setError("Noe gikk galt. Vennligst prøv igjen.");
        setPageLoading(false);
      }
    };
    load();
  }, [eventId, urlPlayerId, authLoading, user?.uid]);

  const loadLinkedPlayers = async () => {
    const userSnap = await getDoc(doc(database, "users", user.uid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    const players = [];
    if (userData.playerId) {
      players.push({
        playerId: userData.playerId,
        firstName: userData.firstName || "",
        lastName: userData.lastName || "",
      });
    }
    const familySnap = await getDocs(
      collection(database, "users", user.uid, "familyMembers")
    );
    familySnap.forEach((d) => {
      const fm = d.data();
      if (fm.playerId) {
        players.push({
          playerId: fm.playerId,
          firstName: fm.firstName || "",
          lastName: fm.lastName || "",
        });
      }
    });

    if (players.length === 0) {
      setLinkedPlayers([]);
      return;
    }

    const withStatus = await Promise.all(
      players.map(async (p) => {
        const activeSnap = await getDocs(
          query(
            collection(database, "events", eventId, "activePlayersList"),
            where("playerId", "==", p.playerId)
          )
        );
        if (!activeSnap.empty) {
          const ad = activeSnap.docs[0];
          return {
            ...p,
            status: "active",
            attendanceDocId: ad.id,
            deckList: ad.data().deckList || null,
          };
        }
        const waitSnap = await getDocs(
          query(
            collection(database, "events", eventId, "waitListedPlayers"),
            where("playerId", "==", p.playerId)
          )
        );
        if (!waitSnap.empty) return { ...p, status: "waitlisted" };
        return { ...p, status: "not_registered" };
      })
    );

    setLinkedPlayers(withStatus);
  };

  const loadFormData = async (pId) => {
    const activeSnap = await getDocs(
      query(
        collection(database, "events", eventId, "activePlayersList"),
        where("playerId", "==", pId)
      )
    );
    if (activeSnap.empty) {
      const waitSnap = await getDocs(
        query(
          collection(database, "events", eventId, "waitListedPlayers"),
          where("playerId", "==", pId)
        )
      );
      return waitSnap.empty
        ? "Spilleren er ikke registrert som aktiv deltaker i dette eventet."
        : "Spilleren er på ventelisten for dette eventet.";
    }
    const ad = activeSnap.docs[0];
    setAttendanceDocId(ad.id);
    setActivePlayerId(pId);

    const existing = ad.data().deckList || null;
    setExistingDeckList(existing);
    if (existing?.type === "text") {
      setMode("text");
      setTextInput(existing.text || "");
    } else if (existing?.type === "file") {
      setMode("file");
    } else {
      setMode("text");
      setTextInput("");
    }

    const playerSnap = await getDocs(
      query(collection(database, "players"), where("playerId", "==", pId))
    );
    if (!playerSnap.empty) {
      const p = playerSnap.docs[0].data();
      setPlayerName(`${p.firstName} ${p.lastName}`);
    }
    return null;
  };

  const handleAdminLookup = async (e) => {
    e.preventDefault();
    const id = adminPlayerIdInput.trim();
    if (!id) return;
    setAdminLookupError(null);
    setAdminLookupLoading(true);
    try {
      const err = await loadFormData(id);
      if (err) {
        setAdminLookupError(err);
      } else {
        setFromPicker(true);
        setPhase("form");
      }
    } catch (err) {
      console.error(err);
      setAdminLookupError("Noe gikk galt. Prøv igjen.");
    } finally {
      setAdminLookupLoading(false);
    }
  };

  const handleGuestLookup = async (e) => {
    e.preventDefault();
    const id = guestPlayerIdInput.trim();
    if (!id) return;
    setGuestLookupError(null);
    setGuestLookupLoading(true);
    try {
      const err = await loadFormData(id);
      if (err) {
        setGuestLookupError(err);
      } else {
        setFromPicker(true);
        setPhase("form");
      }
    } catch (err) {
      console.error(err);
      setGuestLookupError("Noe gikk galt. Prøv igjen.");
    } finally {
      setGuestLookupLoading(false);
    }
  };

  const handlePickerSelect = (player) => {
    if (player.status !== "active") return;
    setActivePlayerId(player.playerId);
    setPlayerName(`${player.firstName} ${player.lastName}`);
    setAttendanceDocId(player.attendanceDocId);
    const existing = player.deckList;
    setExistingDeckList(existing);
    if (existing?.type === "text") {
      setMode("text");
      setTextInput(existing.text || "");
    } else if (existing?.type === "file") {
      setMode("file");
    } else {
      setMode("text");
      setTextInput("");
    }
    setFromPicker(true);
    setPhase("form");
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(f.type)) {
      alert("Kun PDF og bilder (JPG, PNG, WEBP) er tillatt.");
      e.target.value = "";
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      alert("Filen er for stor. Maksimum 10 MB.");
      e.target.value = "";
      return;
    }
    setFile(f);
  };

  // Load builder decks as soon as the user is known
  useEffect(() => {
    if (!user) return;
    setBuilderLoading(true);
    getDocs(collection(database, "users", user.uid, "decklists"))
      .then((snap) => {
        const decks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        decks.sort((a, b) => {
          const aT = a.updatedAt?.toDate?.() || new Date(a.updatedAt || 0);
          const bT = b.updatedAt?.toDate?.() || new Date(b.updatedAt || 0);
          return bT - aT;
        });
        setBuilderDecks(decks);
      })
      .catch(console.error)
      .finally(() => setBuilderLoading(false));
  }, [user]);

  const formatBuilderDeckList = (cards) => {
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

  const handleBuilderSelect = (deck) => {
    setBuilderError(null);
    const cards = deck.cards || [];
    const totalCards = cards.reduce((s, c) => s + c.count, 0);
    const hasIllegal = cards.some((c) => !c.isStandardLegal);
    const hasBasicPokemon = !cards.some((c) => c.category === "Pokemon")
      || cards.some((c) => c.category === "Pokemon" && c.stage === "Basic");

    const errors = [];
    if (totalCards !== 60) {
      errors.push(`Dekket har ${totalCards} kort — må inneholde nøyaktig 60.`);
    }
    if (hasIllegal) {
      errors.push("Dekket inneholder kort som ikke er Standard-lovlige.");
    }
    if (!hasBasicPokemon) {
      errors.push("Dekket inneholder ingen basic-Pokémon.");
    }
    if (errors.length > 0) {
      setBuilderError(errors.join(" "));
      return;
    }

    setTextInput(formatBuilderDeckList(cards));
    setMode("text");
  };

  const canSubmit = () => {
    if (mode === "text") return textInput.trim().length > 0;
    if (mode === "file") return !!file;
    return false;
  };

  const handleSubmitClick = () => {
    if (!canSubmit()) return;
    if (existingDeckList) setShowReplaceWarning(true);
    else doSubmit();
  };

  const doSubmit = async () => {
    setShowReplaceWarning(false);
    setSubmitting(true);
    try {
      const docRef = doc(
        database,
        "events",
        eventId,
        "activePlayersList",
        attendanceDocId
      );
      if (mode === "text") {
        if (existingDeckList?.type === "file" && user) {
          try {
            await deleteObject(ref(storage, `deckLists/${eventId}/${activePlayerId}/decklist`));
          } catch { /* file may already be gone */ }
        }
        await updateDoc(docRef, {
          deckListReceived: true,
          deckList: { type: "text", text: textInput.trim(), uploadedAt: new Date() },
        });
      } else {
        const filePath = `deckLists/${eventId}/${activePlayerId}/decklist`;
        await uploadBytes(ref(storage, filePath), file, { contentType: file.type });
        await updateDoc(docRef, {
          deckListReceived: true,
          deckList: {
            type: "file",
            filePath,
            fileName: file.name,
            fileType: file.type,
            uploadedAt: new Date(),
          },
        });
      }
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert("Noe gikk galt ved innsending. Prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (pageLoading || authLoading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className={`${styles.skeleton} ${styles.skeletonHeader}`} />
          <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <button
            className={styles.backBtn}
            onClick={() => navigate(`/event/${eventId}`)}
          >
            <FontAwesomeIcon icon={faArrowLeft} /> Tilbake til event
          </button>
          <div className={styles.errorCard}>
            <p className={styles.errorText}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Guest input ───────────────────────────────────────────────────────────

  if (phase === "guest-input") {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className={styles.header}>
            <button
              className={styles.backBtn}
              onClick={() => navigate(`/event/${eventId}`)}
            >
              <FontAwesomeIcon icon={faArrowLeft} /> Tilbake til event
            </button>
            <h1 className={styles.title}>Lever deckliste</h1>
            <p className={styles.eventName}>{eventTitle}</p>
          </div>

          <div className={styles.adminSection}>
            <p className={styles.adminSectionTitle}>Skriv inn din Player ID for å levere deckliste</p>
            <form className={styles.adminInputRow} onSubmit={handleGuestLookup}>
              <input
                className={styles.adminInput}
                type="text"
                placeholder="Player ID"
                value={guestPlayerIdInput}
                onChange={(e) => {
                  setGuestPlayerIdInput(e.target.value.replace(/\D/g, ""));
                  setGuestLookupError(null);
                }}
              />
              <button
                type="submit"
                className={styles.adminLookupBtn}
                disabled={guestLookupLoading || !guestPlayerIdInput.trim()}
              >
                {guestLookupLoading ? (
                  <FontAwesomeIcon icon={faSpinner} spin />
                ) : (
                  "Søk"
                )}
              </button>
            </form>
            {guestLookupError && (
              <p className={styles.adminLookupError}>{guestLookupError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Picker ────────────────────────────────────────────────────────────────

  if (phase === "picker") {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className={styles.header}>
            <button
              className={styles.backBtn}
              onClick={() => navigate(`/event/${eventId}`)}
            >
              <FontAwesomeIcon icon={faArrowLeft} /> Tilbake til event
            </button>
            <h1 className={styles.title}>Lever deckliste</h1>
            <p className={styles.eventName}>{eventTitle}</p>
          </div>

          {linkedPlayers.length === 0 && !isAdmin ? (
            <div className={styles.errorCard}>
              <p className={styles.errorText}>
                Du har ingen spillere koblet til kontoen din.{" "}
                <a href="/my-profile" className={styles.profileLink}>
                  Gå til Min Profil
                </a>{" "}
                for å koble til din Player ID.
              </p>
            </div>
          ) : (
            <>
              {linkedPlayers.length > 0 && (
                <>
                  <p className={styles.pickerHint}>
                    Velg hvilken spiller du vil levere deckliste for:
                  </p>
                  <div className={styles.pickerGrid}>
                    {linkedPlayers.map((p) => {
                      const cardClass = [
                        styles.playerCard,
                        p.status === "active" ? styles.playerCardActive : "",
                        p.status === "waitlisted" ? styles.playerCardWaitlisted : "",
                        p.status === "not_registered"
                          ? styles.playerCardNotRegistered
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <button
                          key={p.playerId}
                          className={cardClass}
                          onClick={() => handlePickerSelect(p)}
                          disabled={p.status !== "active"}
                        >
                          <div className={styles.playerCardInfo}>
                            <span className={styles.playerCardName}>
                              {p.firstName} {p.lastName}
                            </span>
                            <span className={styles.playerCardId}>
                              #{p.playerId}
                            </span>
                          </div>
                          <div className={styles.playerCardMeta}>
                            {p.status === "active" && (
                              <>
                                <span
                                  className={`${styles.statusBadge} ${styles.statusBadgeActive}`}
                                >
                                  Aktiv deltaker
                                </span>
                                {p.deckList && (
                                  <span className={styles.decklistBadge}>
                                    <FontAwesomeIcon icon={faCheck} /> deckliste
                                    innlevert
                                  </span>
                                )}
                              </>
                            )}
                            {p.status === "waitlisted" && (
                              <span
                                className={`${styles.statusBadge} ${styles.statusBadgeWaitlisted}`}
                              >
                                På venteliste
                              </span>
                            )}
                            {p.status === "not_registered" && (
                              <span
                                className={`${styles.statusBadge} ${styles.statusBadgeNotRegistered}`}
                              >
                                Ikke påmeldt
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {isAdmin && (
                <div className={styles.adminSection}>
                  <p className={styles.adminSectionTitle}>
                    Admin: Lever på vegne av spiller
                  </p>
                  <form className={styles.adminInputRow} onSubmit={handleAdminLookup}>
                    <input
                      className={styles.adminInput}
                      type="text"
                      placeholder="Player ID"
                      value={adminPlayerIdInput}
                      onChange={(e) => {
                        setAdminPlayerIdInput(e.target.value);
                        setAdminLookupError(null);
                      }}
                    />
                    <button
                      type="submit"
                      className={styles.adminLookupBtn}
                      disabled={adminLookupLoading || !adminPlayerIdInput.trim()}
                    >
                      {adminLookupLoading ? (
                        <FontAwesomeIcon icon={faSpinner} spin />
                      ) : (
                        "Søk"
                      )}
                    </button>
                  </form>
                  {adminLookupError && (
                    <p className={styles.adminLookupError}>{adminLookupError}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>
              <FontAwesomeIcon icon={faCheck} />
            </div>
            <h2 className={styles.successTitle}>deckliste innlevert!</h2>
            <p className={styles.successText}>
              Takk, {playerName}! Din deckliste er mottatt.
            </p>
            <button
              className={styles.backBtn}
              onClick={() => navigate(`/event/${eventId}`)}
            >
              <FontAwesomeIcon icon={faArrowLeft} /> Tilbake til event
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <button
            className={styles.backBtn}
            onClick={() =>
              fromPicker
                ? setPhase("picker")
                : navigate(`/event/${eventId}`)
            }
          >
            <FontAwesomeIcon icon={faArrowLeft} />{" "}
            {fromPicker ? "Velg annen spiller" : "Tilbake til event"}
          </button>
          <h1 className={styles.title}>Lever deckliste</h1>
          <p className={styles.eventName}>{eventTitle}</p>
          {playerName && (
            <p className={styles.playerLabel}>
              Spiller: <strong>{playerName}</strong>
            </p>
          )}
        </div>

        <div className={styles.sortBanner}>
          <p className={styles.sortBannerTitle}>
            Sorter decket ditt i samme rekkefølge som du har listet det i
            tilfelle deck check.
          </p>
        </div>

        {existingDeckList && (
          <div className={styles.existingBanner}>
            Du har allerede levert en deckliste. Du kan erstatte den nedenfor.
          </div>
        )}

        <div className={styles.card}>
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${mode === "text" ? styles.modeBtnActive : ""}`}
              onClick={() => setMode("text")}
            >
              <FontAwesomeIcon icon={faList} /> Skriv liste
            </button>
            <button
              className={`${styles.modeBtn} ${mode === "file" ? styles.modeBtnActive : ""}`}
              onClick={() => setMode("file")}
            >
              <FontAwesomeIcon icon={faUpload} className={styles.uploadSvg}/> Last opp fil
            </button>
            {user && (
              <button
                className={`${styles.modeBtn} ${mode === "builder" ? styles.modeBtnActive : ""}`}
                onClick={() => { setMode("builder"); setBuilderError(null); }}
              >
                <FontAwesomeIcon icon={faLayerGroup} className={styles.uploadSvg} /> Fra builder
              </button>
            )}
          </div>

          <div className={styles.textMode} style={{ display: mode === "text" ? undefined : "none" }}>
              <p className={styles.hint}>
                Skriv inn decklisten din (eit kort per linje):
              </p>
              <textarea
                className={styles.textarea}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={
                  "4 Mega Starmie ex | POR-21\n2 Staryu | POR-20\n4 Poké Pad | ASC-198\n..."
                }
                rows={20}
              />
            </div>

          <div className={styles.fileMode} style={{ display: mode === "file" ? undefined : "none" }}>
              <p className={styles.hintWarning}>
                Bildet skal bestå av ein skriftleg liste med antal kort, namn på kort, sett og nummer — ikkje bilde av sjølve korta.
              </p>

              {existingDeckList?.type === "file" && !file && (
                <div className={styles.existingFile}>
                  Nåværende fil:{" "}
                  <a
                    href={existingDeckList.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {existingDeckList.fileName}
                  </a>
                </div>
              )}

              <label className={styles.fileDropZone}>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleFileChange}
                  className={styles.fileInput}
                />
                {file ? (
                  <div className={styles.fileSelected}>
                    <FontAwesomeIcon
                      icon={faCheck}
                      className={styles.fileCheckIcon}
                    />
                    <span className={styles.fileName}>{file.name}</span>
                    <button
                      type="button"
                      className={styles.clearFile}
                      onClick={(e) => {
                        e.preventDefault();
                        setFile(null);
                      }}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                ) : (
                  <div className={styles.filePrompt}>
                    <FontAwesomeIcon
                      icon={faUpload}
                      className={styles.fileIcon}
                    />
                    <span>Klikk for å velge fil</span>
                    <span className={styles.fileTypes}>
                      PDF, JPG, PNG — maks 10 MB
                    </span>
                  </div>
                )}
              </label>
            </div>

          {user && (
            <div className={styles.builderMode} style={{ display: mode === "builder" ? undefined : "none" }}>
              {builderLoading ? (
                <p className={styles.hint}>
                  <FontAwesomeIcon icon={faSpinner} spin /> Laster decklister…
                </p>
              ) : builderDecks.length === 0 ? (
                <p className={styles.hint}>
                  Du har ingen lagrede decklister.{" "}
                  <a href="/deck-builder/new" className={styles.profileLink}>
                    Lag en i Deck Builder.
                  </a>
                </p>
              ) : (
                <>
                  {builderError && (
                    <div className={styles.builderErrorBanner}>
                      <FontAwesomeIcon icon={faTriangleExclamation} />{" "}
                      {builderError}
                    </div>
                  )}
                  <p className={styles.hint}>Velg deckliste fra builder:</p>
                  <div className={styles.builderDeckList}>
                    {builderDecks.map((deck) => {
                      const cards = deck.cards || [];
                      const total = cards.reduce((s, c) => s + c.count, 0);
                      const hasIllegal = cards.some((c) => !c.isStandardLegal);
                      const isValid = total === 60 && !hasIllegal;
                      const pokemon = cards.filter((c) => c.category === "Pokemon").reduce((s, c) => s + c.count, 0);
                      const trainer = cards.filter((c) => c.category === "Trainer").reduce((s, c) => s + c.count, 0);
                      const energy = cards.filter((c) => c.category === "Energy").reduce((s, c) => s + c.count, 0);
                      const updatedAt = deck.updatedAt?.toDate?.() || (deck.updatedAt ? new Date(deck.updatedAt) : null);
                      return (
                        <button
                          key={deck.id}
                          className={[
                            styles.builderDeckItem,
                            !isValid ? styles.builderDeckItemInvalid : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => handleBuilderSelect(deck)}
                        >
                          <div className={styles.builderDeckHeader}>
                            <span className={styles.builderDeckName}>
                              {deck.deckName}
                            </span>
                            {updatedAt && (
                              <span className={styles.builderDeckDate}>
                                {updatedAt.toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" })}
                              </span>
                            )}
                          </div>
                          <div className={styles.builderDeckBreakdown}>
                            <span className={styles.builderDeckStat}>🔴 {pokemon} Pokémon</span>
                            <span className={styles.builderDeckStat}>🔵 {trainer} Trainer</span>
                            <span className={styles.builderDeckStat}>⚡ {energy} Energi</span>
                          </div>
                          <span className={styles.builderDeckMeta}>
                            <span
                              className={[
                                styles.statusBadge,
                                total === 60
                                  ? styles.statusBadgeActive
                                  : styles.statusBadgeNotRegistered,
                              ].join(" ")}
                            >
                              {total} / 60
                            </span>
                            {hasIllegal && (
                              <span
                                className={`${styles.statusBadge} ${styles.statusBadgeWaitlisted}`}
                              >
                                Ikke Standard-lovlig
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <button
            className={styles.submitBtn}
            onClick={handleSubmitClick}
            disabled={submitting || !canSubmit()}
          >
            {submitting ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin /> Sender inn...
              </>
            ) : existingDeckList ? (
              "Erstatt deckliste"
            ) : (
              "Send inn deckliste"
            )}
          </button>
          <p className={styles.contactNote}>
            Om problem ved opplasting, send listen til{" "}
            <a href="mailto:kanonconpokemonleague@gmail.com">
              kanonconpokemonleague@gmail.com
            </a>
          </p>
        </div>
      </div>

      {showReplaceWarning && (
        <div
          className={styles.overlay}
          onClick={() => setShowReplaceWarning(false)}
        >
          <div
            className={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <p className={styles.dialogMessage}>
              Dette vil slette og erstatte din tidligere deckliste. Er du
              sikker?
            </p>
            <div className={styles.dialogButtons}>
              <button
                className={styles.dialogCancel}
                onClick={() => setShowReplaceWarning(false)}
              >
                Avbryt
              </button>
              <button className={styles.dialogConfirm} onClick={doSubmit}>
                Erstatt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeckListSubmit;

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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import styles from "./DeckListSubmit.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faList,
  faUpload,
  faCheck,
  faSpinner,
  faXmark,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";

const DECK_LIST_EVENT_TYPES = ["leagueChallenge", "leagueCup"];

const DeckListSubmit = () => {
  const { eventId, playerId } = useParams();
  const navigate = useNavigate();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventTitle, setEventTitle] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [attendanceDocId, setAttendanceDocId] = useState(null);
  const [existingDeckList, setExistingDeckList] = useState(null);

  const [mode, setMode] = useState("text");
  const [textInput, setTextInput] = useState("");
  const [file, setFile] = useState(null);

  const [showReplaceWarning, setShowReplaceWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
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
          setError("Dette eventet krever ikke dekkliste.");
          setPageLoading(false);
          return;
        }

        const eventDate = new Date(event.eventData?.eventDate);
        const today = new Date();
        eventDate.setHours(23, 59, 59, 999);
        today.setHours(0, 0, 0, 0);
        if (today > eventDate) {
          setError("Fristen for å levere dekkliste er utløpt.");
          setPageLoading(false);
          return;
        }

        setEventTitle(event.eventData?.eventTitle || "");

        const activeRef = collection(database, "events", eventId, "activePlayersList");
        const activeQ = query(activeRef, where("playerId", "==", playerId));
        const activeSnap = await getDocs(activeQ);

        if (activeSnap.empty) {
          const waitRef = collection(database, "events", eventId, "waitListedPlayers");
          const waitQ = query(waitRef, where("playerId", "==", playerId));
          const waitSnap = await getDocs(waitQ);
          if (!waitSnap.empty) {
            setError("Du er på ventelisten for dette eventet. dekkliste kan leveres når du er bekreftet som aktiv deltaker.");
          } else {
            setError("Du er ikke registrert som aktiv deltaker i dette eventet.");
          }
          setPageLoading(false);
          return;
        }

        const attendanceDoc = activeSnap.docs[0];
        setAttendanceDocId(attendanceDoc.id);

        const existing = attendanceDoc.data().deckList || null;
        setExistingDeckList(existing);
        if (existing?.type === "text") {
          setMode("text");
          setTextInput(existing.text || "");
        } else if (existing?.type === "file") {
          setMode("file");
        }

        const playersRef = collection(database, "players");
        const playerQ = query(playersRef, where("playerId", "==", playerId));
        const playerSnap = await getDocs(playerQ);
        if (!playerSnap.empty) {
          const p = playerSnap.docs[0].data();
          setPlayerName(`${p.firstName} ${p.lastName}`);
        }

        setPageLoading(false);
      } catch (err) {
        console.error(err);
        setError("Noe gikk galt. Vennligst prøv igjen.");
        setPageLoading(false);
      }
    };

    load();
  }, [eventId, playerId]);

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

  const canSubmit = () => {
    if (mode === "text") return textInput.trim().length > 0;
    if (mode === "file") return !!file;
    return false;
  };

  const handleSubmitClick = () => {
    if (!canSubmit()) return;
    if (existingDeckList) {
      setShowReplaceWarning(true);
    } else {
      doSubmit();
    }
  };

  const doSubmit = async () => {
    setShowReplaceWarning(false);
    setSubmitting(true);
    try {
      const docRef = doc(database, "events", eventId, "activePlayersList", attendanceDocId);

      if (mode === "text") {
        await updateDoc(docRef, {
          deckListReceived: true,
          deckList: {
            type: "text",
            text: textInput.trim(),
            uploadedAt: new Date(),
          },
        });
      } else {
        const storageRef = ref(storage, `deckLists/${eventId}/${playerId}/decklist`);
        await uploadBytes(storageRef, file, { contentType: file.type });
        const fileUrl = await getDownloadURL(storageRef);
        await updateDoc(docRef, {
          deckListReceived: true,
          deckList: {
            type: "file",
            fileUrl,
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

  if (pageLoading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className={`${styles.skeleton} ${styles.skeletonHeader}`} />
          <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <button className={styles.backBtn} onClick={() => navigate(`/event/${eventId}`)}>
            <FontAwesomeIcon icon={faArrowLeft} /> Tilbake til event
          </button>
          <div className={styles.errorCard}>
            <p className={styles.errorText}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>
              <FontAwesomeIcon icon={faCheck} />
            </div>
            <h2 className={styles.successTitle}>Dekkliste innlevert!</h2>
            <p className={styles.successText}>
              Takk, {playerName}! Din dekkliste er mottatt.
            </p>
            <button className={styles.backBtn} onClick={() => navigate(`/event/${eventId}`)}>
              <FontAwesomeIcon icon={faArrowLeft} /> Tilbake til event
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate(`/event/${eventId}`)}>
            <FontAwesomeIcon icon={faArrowLeft} /> Tilbake til event
          </button>
          <h1 className={styles.title}>Lever dekkliste</h1>
          <p className={styles.eventName}>{eventTitle}</p>
          {playerName && (
            <p className={styles.playerLabel}>
              Spiller: <strong>{playerName}</strong>
            </p>
          )}
        </div>

        <div className={styles.sortBanner}>
          <p className={styles.sortBannerTitle}>Sorter decket ditt i samme rekkefølge som du har listet det i tilfelle deck check.</p>
        </div>

        {existingDeckList && (
          <div className={styles.existingBanner}>
            Du har allerede levert en dekkliste. Du kan erstatte den nedenfor.
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
              <FontAwesomeIcon icon={faUpload} /> Last opp fil
            </button>
          </div>

          {mode === "text" ? (
            <div className={styles.textMode}>
              <p className={styles.hint}>
                Skriv inn dekklisten din (eit kort per linje):
              </p>
              <textarea
                className={styles.textarea}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={"4 Mega Starmie ex | POR-21\n2 Staryu | POR-20\n4 Poké Pad | ASC-198\n..."}
                rows={20}
              />
            </div>
          ) : (
            <div className={styles.fileMode}>
              <p className={styles.hint}>
                Last opp bilde eller PDF av dekklisten (maks 10 MB):
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
              "Erstatt dekkliste"
            ) : (
              "Send inn dekkliste"
            )}
          </button>
          <p className={styles.contactNote}>
            Om problem ved opplasting, send listen til{" "}
            <a href="mailto:kanonconpokemonleague@gmail.com">kanonconpokemonleague@gmail.com</a>
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
              Dette vil slette og erstatte din tidligere dekkliste. Er du
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

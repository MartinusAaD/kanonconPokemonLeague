import React, { useEffect, useState } from "react";
import styles from "./Attendance.module.css";
import { database } from "../../firestoreConfig";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";
import { getAuthContext } from "../../context/authContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCheck } from "@fortawesome/free-solid-svg-icons";

const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

const Attendance = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, loading } = getAuthContext();

  const [eventData, setEventData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  // Separate ref for player details so attendance toggles don't re-fetch names
  const playerDetailsRef = React.useRef({});

  // Real-time event metadata
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(database, "events", id), (snapshot) => {
      if (snapshot.exists()) {
        setEventData({ id: snapshot.id, ...snapshot.data() });
      }
    });
    return () => unsub();
  }, [id]);

  // Fetch player details once, then start the real-time attendance listener
  useEffect(() => {
    if (!id) return;

    const activeRef = collection(database, "events", id, "activePlayersList");
    const playersRef = collection(database, "players");
    let unsub = () => {};

    const init = async () => {
      // 1. Load player details into ref first
      const activeSnap = await getDocs(activeRef);
      const playerIds = activeSnap.docs
        .map((d) => d.data().playerId)
        .filter(Boolean);

      if (playerIds.length > 0) {
        for (const chunk of chunkArray(playerIds, 10)) {
          const q = query(playersRef, where("playerId", "in", chunk));
          const snap = await getDocs(q);
          snap.docs.forEach((d) => {
            playerDetailsRef.current[d.data().playerId] = d.data();
          });
        }
      }

      // 2. Now start listener — ref is guaranteed populated
      setDataLoading(false);
      unsub = onSnapshot(activeRef, (snap) => {
        const activeDocs = snap.docs.map((d) => ({
          docId: d.id,
          playerId: d.data().playerId,
          joinedAt: d.data().joinedAt?.seconds || 0,
          arrived: d.data().arrived || false,
          deckListReceived: d.data().deckListReceived || false,
          ...playerDetailsRef.current[d.data().playerId],
        }));

        setPlayers(
          activeDocs
            .filter((p) => p.firstName)
            .sort((a, b) =>
              `${a.firstName} ${a.lastName}`.localeCompare(
                `${b.firstName} ${b.lastName}`,
              ),
            ),
        );
      });
    };

    init();
    return () => unsub();
  }, [id]);

  const handleToggle = async (docId, field, currentValue) => {
    // Optimistic update — flip locally immediately, Firestore confirms in background
    setPlayers((prev) =>
      prev.map((p) =>
        p.docId === docId ? { ...p, [field]: !currentValue } : p,
      ),
    );
    const ref = doc(database, "events", id, "activePlayersList", docId);
    await updateDoc(ref, { [field]: !currentValue });
  };

  if (loading) return null;
  if (!isAdmin) return null;

  if (dataLoading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <button
            className={styles.backButton}
            onClick={() => navigate(`/event/${id}`)}
          >
            <FontAwesomeIcon icon={faArrowLeft} /> Tilbake til event
          </button>
          <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
          <div
            className={`${styles.skeletonLine} ${styles.skeletonEventName}`}
          />
          <div className={styles.statsRow}>
            {[0, 1].map((i) => (
              <div key={i} className={styles.skeletonStatCard}>
                <div
                  className={`${styles.skeletonLine} ${styles.skeletonStatNumber}`}
                />
                <div
                  className={`${styles.skeletonLine} ${styles.skeletonStatLabel}`}
                />
              </div>
            ))}
          </div>
          <div className={styles.tableWrapper}>
            <div className={styles.tableHeader}>
              <span className={styles.colName}>Spiller</span>
              <span className={styles.colCheck}>Møtt opp</span>
              <span className={styles.colCheck}>Dekksliste</span>
            </div>
            <ul className={styles.list}>
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className={styles.skeletonRow}>
                  <div className={styles.colName}>
                    <div className={styles.skeletonBadge} />
                    <div className={styles.skeletonPlayerInfo}>
                      <div
                        className={`${styles.skeletonLine} ${styles.skeletonPlayerName}`}
                      />
                      <div
                        className={`${styles.skeletonLine} ${styles.skeletonPlayerId}`}
                      />
                    </div>
                  </div>
                  <div className={styles.colCheck}>
                    <div className={styles.skeletonToggle} />
                  </div>
                  <div className={styles.colCheck}>
                    <div className={styles.skeletonToggle} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const arrivedCount = players.filter((p) => p.arrived).length;
  const deckCount = players.filter((p) => p.deckListReceived).length;
  const total = players.length;

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <button
          className={styles.backButton}
          onClick={() => navigate(`/event/${id}`)}
        >
          <FontAwesomeIcon icon={faArrowLeft} /> Tilbake til event
        </button>

        <h1 className={styles.title}>Oppmøteregistrering</h1>
        {eventData && (
          <p className={styles.eventName}>{eventData.eventData?.eventTitle}</p>
        )}

        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statNumber}>
              {arrivedCount}/{total}
            </span>
            <span className={styles.statLabel}>Møtt opp</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statNumber}>
              {deckCount}/{total}
            </span>
            <span className={styles.statLabel}>Dekksliste mottatt</span>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <div className={styles.tableHeader}>
            <span className={styles.colName}>Spiller</span>
            <span className={styles.colCheck}>Møtt opp</span>
            <span className={styles.colCheck}>Deckliste</span>
          </div>
          <ul className={styles.list}>
            {players.length > 0 ? (
              players.map((player, index) => (
                <li
                  key={player.playerId}
                  className={`${styles.row} ${player.arrived ? styles.rowArrived : ""}`}
                  style={{ animationDelay: `${0.2 + index * 0.05}s` }}
                >
                  <div className={styles.colName}>
                    <span className={styles.badge}>{index + 1}</span>
                    <div className={styles.playerInfo}>
                      <p className={styles.playerName}>
                        {player.firstName} {player.lastName}
                      </p>
                      <div className={styles.playerInfoRow}>
                        <div className={styles.playerId}>{player.playerId}</div>
                        <div className={styles.playerInfoDash}>-</div>
                        <div className={styles.birthYear}>
                          {player.birthYear}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.colCheck}>
                    <button
                      className={`${styles.toggle} ${player.arrived ? styles.toggleOn : ""}`}
                      onClick={() =>
                        handleToggle(player.docId, "arrived", player.arrived)
                      }
                      aria-label="Toggle arrived"
                    >
                      {player.arrived && <FontAwesomeIcon icon={faCheck} />}
                    </button>
                  </div>
                  <div className={styles.colCheck}>
                    <button
                      className={`${styles.toggle} ${player.deckListReceived ? styles.toggleOn : ""}`}
                      onClick={() =>
                        handleToggle(
                          player.docId,
                          "deckListReceived",
                          player.deckListReceived,
                        )
                      }
                      aria-label="Toggle deck list"
                    >
                      {player.deckListReceived && (
                        <FontAwesomeIcon icon={faCheck} />
                      )}
                    </button>
                  </div>
                </li>
              ))
            ) : (
              <li className={styles.empty}>Ingen aktive spillere</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Attendance;

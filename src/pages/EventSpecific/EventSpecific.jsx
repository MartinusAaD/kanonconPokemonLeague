import React, { useEffect, useState } from "react";
import styles from "./EventSpecific.module.css";
import { database } from "../../firestoreConfig";
import {
  doc,
  onSnapshot,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  arrayRemove,
  arrayUnion,
} from "firebase/firestore";
import { useParams } from "react-router-dom";
import JoinEventForm from "../../components/JoinEventForm/JoinEventForm";
import Button from "../../components/Button/Button";
import DeleteButton from "../../components/DeleteButton/DeleteButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import EditButton from "../../components/EditButton/EditButton";
import { getAuthContext } from "../../context/authContext";

const EventSpecific = () => {
  const { id } = useParams();
  const [eventData, setEventData] = useState(null);
  const [activePlayers, setActivePlayers] = useState([]);
  const [waitListPlayers, setWaitListPlayers] = useState([]);
  const [fullEventMessage, setFullEventMessage] = useState(null);

  const { user } = getAuthContext();

  // Real-time fetch for this specific event
  useEffect(() => {
    if (!id) return;

    const docRef = doc(database, "events", id);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setEventData({ id: snapshot.id, ...snapshot.data() });
        } else {
          console.log("Event not found");
        }
      },
      (error) => console.error("Error fetching event:", error)
    );

    return () => unsubscribe();
  }, [id]);

  // Fetch full player data when eventData changes
  useEffect(() => {
    const fetchPlayersByIds = async (playerIds) => {
      if (!playerIds?.length) return [];

      const playersRef = collection(database, "players");
      const batches = [];

      // Firestore `in` query supports max 10 IDs per query
      for (let i = 0; i < playerIds.length; i += 10) {
        const batchIds = playerIds.slice(i, i + 10);
        const q = query(playersRef, where("playerId", "in", batchIds));
        const snapshot = await getDocs(q);
        batches.push(...snapshot.docs.map((doc) => doc.data()));
      }

      return batches;
    };

    const loadPlayers = async () => {
      if (!eventData) return;
      const activeIds = eventData.eventData.activePlayersList || [];
      const waitIds = eventData.eventData.waitListedPlayers || [];

      const [activeFull, waitFull] = await Promise.all([
        fetchPlayersByIds(activeIds),
        fetchPlayersByIds(waitIds),
      ]);

      setActivePlayers(activeFull);
      setWaitListPlayers(waitFull);
    };

    loadPlayers();
  }, [eventData]);

  const fixEventTypeName = (type) => {
    switch (type) {
      case "casual":
        return "Casual";
      case "casualTrade":
        return "Casual & Trade Day";
      case "preRelease":
        return "Pre-Release";
      case "leagueChallenge":
        return "League Challenge";
      case "leagueCup":
        return "League Cup";
      default:
        return type;
    }
  };

  const handleMoveToActive = async (playerId) => {
    const activeCount = activePlayers.length;
    const maxCount = Number(eventData.eventData.maxPlayerCount);

    if (activeCount >= maxCount) {
      setFullEventMessage(playerId);
      setTimeout(() => setFullEventMessage(null), 2500);
      return;
    }

    try {
      const eventRef = doc(database, "events", id);
      await updateDoc(eventRef, {
        "eventData.activePlayersList": arrayUnion(playerId),
        "eventData.waitListedPlayers": arrayRemove(playerId),
      });
    } catch (error) {
      console.error("Error moving player to active:", error);
    }
  };

  return (
    <div className={styles.eventWrapper}>
      <div className={styles.eventContainer}>
        <h1 className={styles.header}>Event Påmelding</h1>

        {eventData ? (
          <>
            <div className={styles.eventInfoContainer}>
              <h2 className={styles.eventTitle}>
                {eventData.eventData.eventTitle}
              </h2>
              <p>{fixEventTypeName(eventData.eventData.typeOfEvent)}</p>
              <p>{eventData.eventData.eventDate}</p>
            </div>

            <JoinEventForm id={id} eventData={eventData} />

            <div className={styles.playerRoosterWrapper}>
              {/* Active Players */}
              <div className={styles.playerRoosterContainer}>
                <h1 className={styles.playerRoosterHeading}>
                  Aktive Spillere ({activePlayers.length}/
                  {eventData.eventData.maxPlayerCount || 0})
                </h1>
                <ul className={styles.list}>
                  <li
                    className={`${styles.listElementTitles} ${styles.activeListTitles}`}
                  >
                    <h3>Spillere</h3>
                  </li>

                  {activePlayers.length > 0 ? (
                    activePlayers.map((player) => (
                      <li
                        key={player.playerId}
                        className={styles.playerRoosterListElementActive}
                      >
                        {user ? (
                          <div>
                            <p className={styles.playerName}>
                              {player.firstName} {player.lastName}
                            </p>
                            <div className={styles.playerInfoContainer}>
                              <p className={styles.playerInfo}>
                                {player.playerId}
                              </p>
                              <p className={styles.playerInfo}> - </p>
                              <p className={styles.playerInfo}>
                                {player.birthYear}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className={styles.playerName}>
                            {player.firstName.split(" ")[0]}{" "}
                            {`${player.lastName.charAt(0)}.`}
                          </p>
                        )}

                        {user && (
                          <div className={styles.buttonContainer}>
                            <EditButton
                              id={player.playerId}
                              documentType={"PLAYER"}
                            />
                            <DeleteButton
                              collectionName={"events"}
                              id={id}
                              playerData={player.playerId}
                              isDocument={false}
                            />
                          </div>
                        )}
                      </li>
                    ))
                  ) : (
                    <li className={styles.playerRoosterListElementActive}>
                      Ingen spillere er påmeldt enda
                    </li>
                  )}
                </ul>
              </div>

              {/* Waiting List */}
              <div className={styles.playerRoosterContainer}>
                <h1 className={styles.playerRoosterHeading}>Venteliste</h1>
                <ul className={styles.list}>
                  <li
                    className={`${styles.listElementTitles} ${styles.waitListTitles}`}
                  >
                    <h3>Spillere</h3>
                  </li>

                  {waitListPlayers.length > 0 ? (
                    waitListPlayers.map((player) => (
                      <li
                        key={player.playerId}
                        className={styles.playerRoosterListElementWaitList}
                      >
                        {user ? (
                          <div>
                            <p className={styles.playerName}>
                              {player.firstName} {player.lastName}
                            </p>
                            <div className={styles.playerInfoContainer}>
                              <p className={styles.playerInfo}>
                                {player.playerId}
                              </p>
                              <p className={styles.playerInfo}> - </p>
                              <p className={styles.playerInfo}>
                                {player.birthYear}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className={styles.playerName}>
                            {player.firstName.split(" ")[0]}{" "}
                            {`${player.lastName.charAt(0)}.`}
                          </p>
                        )}

                        {user && (
                          <div className={styles.buttonContainer}>
                            <Button
                              className={styles.featureButton}
                              onClick={() =>
                                handleMoveToActive(player.playerId)
                              }
                            >
                              <FontAwesomeIcon icon={faArrowUp} />
                            </Button>

                            {fullEventMessage === player.playerId && (
                              <div className={styles.notificationBubble}>
                                Eventet er fullt
                              </div>
                            )}

                            <EditButton
                              id={player.playerId}
                              documentType={"PLAYER"}
                            />
                            <DeleteButton
                              collectionName={"events"}
                              id={id}
                              playerData={player.playerId}
                              isDocument={false}
                            />
                          </div>
                        )}
                      </li>
                    ))
                  ) : (
                    <li className={styles.playerRoosterListElementWaitList}>
                      Ingen spillere i ventelisten
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </>
        ) : (
          <p>Laster event...</p>
        )}
      </div>
    </div>
  );
};

export default EventSpecific;

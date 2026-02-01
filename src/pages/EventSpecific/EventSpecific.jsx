import React, { useEffect, useState } from "react";
import styles from "./EventSpecific.module.css";
import { database } from "../../firestoreConfig";
import {
  doc,
  onSnapshot,
  getDocs,
  collection,
  query,
  where,
  addDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { useParams } from "react-router-dom";
import JoinEventForm from "../../components/JoinEventForm/JoinEventForm";
import Button from "../../components/Button/Button";
import DeleteButton from "../../components/DeleteButton/DeleteButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faArrowDown } from "@fortawesome/free-solid-svg-icons";
import EditButton from "../../components/EditButton/EditButton";
import { getAuthContext } from "../../context/authContext";
import PopUpMessage from "../../components/PopUpMessage/PopUpMessage";

// Helper for batching Firestore `in` queries (limit 10)
const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

const EventSpecific = () => {
  const { id } = useParams();
  const [eventData, setEventData] = useState(null);
  const [activePlayers, setActivePlayers] = useState([]);
  const [waitListPlayers, setWaitListPlayers] = useState([]);
  const [fullEventMessage, setFullEventMessage] = useState(null);
  const [isEventActive, setIsEventActive] = useState(true);
  const [showPopUpMessage, setShowPopUpMessage] = useState(false);
  const [popUpMessage, setPopUpMessage] = useState("");
  const [shortUrl, setShortUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [linkNotification, setLinkNotification] = useState(null);

  const { user } = getAuthContext();

  // Realtime listener for event metadata
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(database, "events", id), (snapshot) => {
      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() };
        setEventData(data);
        // Load existing short URL if available
        if (data.shortUrl) {
          setShortUrl(data.shortUrl);
        }
      } else {
        console.log("Event not found");
      }
    });
    return () => unsub();
  }, [id]);

  // Realtime listeners for player subcollections
  useEffect(() => {
    if (!id) return;

    const playersRef = collection(database, "players");

    const fetchFullPlayers = async (playerDocs) => {
      const playerIds = playerDocs.map((p) => p.playerId);
      if (playerIds.length === 0) return [];

      const fullPlayers = [];
      for (const chunk of chunkArray(playerIds, 10)) {
        const q = query(playersRef, where("playerId", "in", chunk));
        const snapshot = await getDocs(q);
        fullPlayers.push(...snapshot.docs.map((doc) => doc.data()));
      }

      // preserve order based on joinedAt
      return playerDocs
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => fullPlayers.find((fp) => fp.playerId === p.playerId))
        .filter(Boolean);
    };

    const listenToList = (subName, setList) => {
      const subRef = collection(database, "events", id, subName);
      return onSnapshot(subRef, async (snap) => {
        const playerDocs = snap.docs.map((d) => ({
          playerId: d.data().playerId,
          joinedAt: d.data().joinedAt?.seconds || 0,
        }));
        const players = await fetchFullPlayers(playerDocs);
        setList(players);
      });
    };

    const unsubActive = listenToList("activePlayersList", setActivePlayers);
    const unsubWait = listenToList("waitListedPlayers", setWaitListPlayers);

    return () => {
      unsubActive();
      unsubWait();
    };
  }, [id]);

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

  const fixDateInTitle = (date) => {
    const formattedDate = date.split("-").reverse().join(".");
    return formattedDate;
  };

  // Handle moving from waitlist to active
  const handleMoveToActive = async (playerId) => {
    if (!eventData) return;

    const maxCount = Number(eventData.eventData.maxPlayerCount);
    const activeCount = activePlayers.length;

    if (activeCount >= maxCount) {
      setFullEventMessage(playerId);
      setTimeout(() => setFullEventMessage(null), 2500);
      return;
    }

    try {
      const eventRef = doc(database, "events", id);
      const activeRef = collection(eventRef, "activePlayersList");
      const waitRef = collection(eventRef, "waitListedPlayers");

      // Query waitlist for this player
      const waitQuerySnapshot = await getDocs(
        query(waitRef, where("playerId", "==", playerId)),
      );

      if (waitQuerySnapshot.empty) return; // player not in waitlist

      // Delete the player from the waitlist
      for (const docSnap of waitQuerySnapshot.docs) {
        await deleteDoc(docSnap.ref);
      }

      // Add to active
      await addDoc(activeRef, {
        playerId,
        joinedAt: new Date(), // or serverTimestamp() if you want server time
      });
    } catch (error) {
      console.error("Error moving player from waitlist to active:", error);
    }
  };

  // Handle moving from active to waitlist
  const handleMoveToWaitlist = async (playerId) => {
    if (!eventData) return;

    try {
      const eventRef = doc(database, "events", id);
      const activeRef = collection(eventRef, "activePlayersList");
      const waitRef = collection(eventRef, "waitListedPlayers");

      // Query active list for this player
      const activeQuerySnapshot = await getDocs(
        query(activeRef, where("playerId", "==", playerId)),
      );

      if (activeQuerySnapshot.empty) return; // player not in active list

      // Delete the player from the active list
      for (const docSnap of activeQuerySnapshot.docs) {
        await deleteDoc(docSnap.ref);
      }

      // Add to waitlist
      await addDoc(waitRef, {
        playerId,
        joinedAt: new Date(),
      });
    } catch (error) {
      console.error("Error moving player from active to waitlist:", error);
    }
  };

  //Check if the event is outdated
  useEffect(() => {
    const isEventActive = () => {
      if (!eventData?.eventData?.eventDate) return false;

      const eventDate = new Date(eventData.eventData.eventDate);
      const today = new Date();

      // Optional: reset time to midnight for clean comparison
      eventDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      return eventDate >= today;
    };

    setIsEventActive(isEventActive());
  }, [eventData]);

  // Generate short URL using Bitly
  const handleGenerateShortUrl = async () => {
    if (shortUrl) {
      // If already exists, just copy it
      await navigator.clipboard.writeText(shortUrl);
      setLinkNotification("Lenke kopiert!");
      setTimeout(() => setLinkNotification(null), 2000);
      return;
    }

    const currentUrl = window.location.href;

    // Check if we're on localhost
    if (currentUrl.includes("localhost") || currentUrl.includes("127.0.0.1")) {
      setLinkNotification("Fungerer kun på live nettside!");
      setTimeout(() => setLinkNotification(null), 3000);
      console.log(
        "Bitly doesn't work with localhost URLs. Deploy to test this feature.",
      );
      return;
    }

    const bitlyToken = import.meta.env.VITE_BITLY_ACCESS_TOKEN;

    if (!bitlyToken || bitlyToken === "your_bitly_token_here") {
      console.error("Bitly token is missing or not configured");
      setLinkNotification("Bitly token mangler!");
      setTimeout(() => setLinkNotification(null), 2500);
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("https://api-ssl.bitly.com/v4/shorten", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bitlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          long_url: currentUrl,
          domain: "bit.ly",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const shortLink = data.link;

        // Save short URL to Firestore
        try {
          await updateDoc(doc(database, "events", id), {
            shortUrl: shortLink,
          });
          console.log("Short URL saved to Firestore successfully");
          setShortUrl(shortLink);
          await navigator.clipboard.writeText(shortLink);
          setLinkNotification("Kort lenke opprettet og kopiert!");
          setTimeout(() => setLinkNotification(null), 2500);
        } catch (saveError) {
          console.error("Error saving short URL to Firestore:", saveError);
          // Still set the URL locally and copy it
          setShortUrl(shortLink);
          await navigator.clipboard.writeText(shortLink);
          setLinkNotification("Lenke opprettet (ikke lagret i database)");
          setTimeout(() => setLinkNotification(null), 3000);
        }
      } else {
        const error = await response.json();
        console.error("Bitly API error response:", error);
        setLinkNotification(`Feil: ${error.message || "API feilet"}`);
        setTimeout(() => setLinkNotification(null), 3000);
      }
    } catch (error) {
      console.error("Error shortening URL:", error);
      setLinkNotification("Nettverksfeil");
      setTimeout(() => setLinkNotification(null), 2500);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={styles.eventWrapper}>
      <div className={styles.eventContainer}>
        <h1 className={styles.header}>
          {isEventActive ? "Event Påmelding" : "Påmelding er stengt"}
        </h1>

        {eventData ? (
          <>
            <div className={styles.eventInfoContainer}>
              <h2 className={styles.eventTitle}>
                {eventData.eventData?.eventTitle}
              </h2>
              <p>{fixEventTypeName(eventData.eventData?.typeOfEvent)}</p>
              <p>{fixDateInTitle(eventData.eventData?.eventDate)}</p>

              {user && (
                <div className={styles.adminActionsContainer}>
                  <p className={styles.shortUrlLabel}>Del lenke til eventet:</p>
                  {shortUrl ? (
                    <div className={styles.linkButtonWrapper}>
                      <div
                        className={styles.shortUrlDisplay}
                        onClick={handleGenerateShortUrl}
                        title="Klikk for å kopiere"
                      >
                        {shortUrl}
                      </div>
                      {linkNotification && (
                        <div className={styles.linkNotificationBubble}>
                          {linkNotification}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={styles.linkButtonWrapper}>
                      <Button
                        className={styles.shortenLinkButton}
                        onClick={handleGenerateShortUrl}
                        disabled={isGenerating}
                      >
                        {isGenerating
                          ? "Lager kort lenke..."
                          : "Lag kort lenke"}
                      </Button>
                      {linkNotification && (
                        <div className={styles.linkNotificationBubble}>
                          {linkNotification}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {isEventActive && (
              <JoinEventForm
                id={id}
                eventData={eventData}
                setShowPopUpMessage={setShowPopUpMessage}
                setPopUpMessage={setPopUpMessage}
              />
            )}

            <div className={styles.playerRoosterWrapper}>
              {/* Active Players */}
              <div className={styles.playerRoosterContainer}>
                <h1 className={styles.playerRoosterHeading}>
                  Aktive Spillere ({activePlayers.length}/
                  {eventData.eventData?.maxPlayerCount || 0})
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
                              <p className={styles.playerInfoId}>
                                {player.playerId}
                              </p>
                              <p className={styles.playerInfoDash}> - </p>
                              <p className={styles.playerInfoBirthYear}>
                                {player.birthYear}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className={styles.playerName}>
                            {player.firstName} {`${player.lastName.charAt(0)}.`}
                          </p>
                        )}

                        {user && (
                          <div className={styles.buttonContainer}>
                            <Button
                              className={styles.featureButton}
                              onClick={() =>
                                handleMoveToWaitlist(player.playerId)
                              }
                            >
                              <FontAwesomeIcon icon={faArrowDown} />
                            </Button>
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
                              <p className={styles.playerInfoId}>
                                {player.playerId}
                              </p>
                              <p className={styles.playerInfoDash}> - </p>
                              <p className={styles.playerInfoBirthYear}>
                                {player.birthYear}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className={styles.playerName}>
                            {player.firstName} {`${player.lastName.charAt(0)}.`}
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
      {showPopUpMessage && (
        <PopUpMessage
          message={popUpMessage}
          setShowPopUpMessage={setShowPopUpMessage}
        />
      )}
    </div>
  );
};

export default EventSpecific;

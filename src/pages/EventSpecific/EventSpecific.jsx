import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import styles from "./EventSpecific.module.css";
import { database } from "../../firestoreConfig";
import {
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  collection,
  query,
  where,
  addDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";
import JoinEventForm from "../../components/JoinEventForm/JoinEventForm";
import Button from "../../components/Button/Button";
import DeleteButton from "../../components/DeleteButton/DeleteButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUp,
  faArrowDown,
  faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";
import EditButton from "../../components/EditButton/EditButton";
import { getAuthContext } from "../../context/authContext";
import PopUpMessage from "../../components/PopUpMessage/PopUpMessage";
import AnnouncementBanner from "../../components/AnnouncementBanner/AnnouncementBanner";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";

// Helper for batching Firestore `in` queries (limit 10)
const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

const DeckListEntry = ({ eventId, eventDate, accountPlayers, activePlayers, waitListPlayers, isLoggedIn, navigate }) => {
  const [guestId, setGuestId] = useState("");
  const [notFoundModal, setNotFoundModal] = useState(false);

  const deadlinePassed = (() => {
    if (!eventDate) return false;
    const end = new Date(eventDate);
    end.setHours(23, 59, 59, 999);
    return new Date() > end;
  })();

  if (deadlinePassed) return null;

  // Logged-in — always show all account players with their event status
  if (isLoggedIn) {
    const playersWithStatus = accountPlayers.map((p) => {
      if (activePlayers.some((ap) => ap.playerId === p.playerId))
        return { ...p, status: "active" };
      if (waitListPlayers.some((wp) => wp.playerId === p.playerId))
        return { ...p, status: "waitlisted" };
      return { ...p, status: "none" };
    });

    return (
      <div className={styles.deckListBanner}>
        <span className={styles.deckListBannerLegend}>Gjelder påmeldte spillere</span>
        <p className={styles.deckListBannerText}>
          Dette eventet krever dekkliste, må sendes inn før event start.
        </p>
        {accountPlayers.length === 0 ? (
          <p className={styles.deckListNoPlayers}>
            Ingen spillere koblet til kontoen.{" "}
            <a href="/my-profile" className={styles.deckListProfileLink}>
              Legg til i Min Profil.
            </a>
          </p>
        ) : (
          <div className={styles.deckListButtonGroup}>
            {playersWithStatus.map((p) => {
              if (p.status === "active") {
                return (
                  <button
                    key={p.playerId}
                    className={styles.deckListBannerBtn}
                    onClick={() => navigate(`/event/${eventId}/deck-list-submit/${p.playerId}`)}
                  >
                    Lever for {p.firstName}
                  </button>
                );
              }
              if (p.status === "waitlisted") {
                return (
                  <span
                    key={p.playerId}
                    className={`${styles.deckListPlayerPill} ${styles.deckListPlayerPillWaitlisted}`}
                  >
                    {p.firstName} — venteliste
                  </span>
                );
              }
              return (
                <span
                  key={p.playerId}
                  className={`${styles.deckListPlayerPill} ${styles.deckListPlayerPillNone}`}
                >
                  {p.firstName} — ikke påmeldt
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Not logged in — show player ID input
  const handleGo = () => {
    const id = guestId.trim();
    if (!id) return;
    if (!activePlayers.some((p) => p.playerId === id)) {
      setNotFoundModal(true);
      return;
    }
    navigate(`/event/${eventId}/deck-list-submit/${id}`);
  };

  return (
    <>
      <div className={styles.deckListBanner}>
        <span className={styles.deckListBannerLegend}>Gjelder påmeldte spillere</span>
        <p className={styles.deckListBannerText}>
          Dette eventet krever dekkliste, må sendes inn før event start.
        </p>
        <div className={styles.deckListInputRow}>
          <input
            className={styles.deckListInput}
            type="text"
            placeholder="Player ID"
            maxLength={20}
            value={guestId}
            onChange={(e) => setGuestId(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleGo()}
          />
          <button
            className={styles.deckListBannerBtn}
            onClick={handleGo}
            disabled={!guestId.trim()}
          >
            Lever dekkliste
          </button>
        </div>
      </div>

      {notFoundModal && createPortal(
        <div
          className={styles.notFoundOverlay}
          onClick={() => setNotFoundModal(false)}
        >
          <div
            className={styles.notFoundDialog}
            onClick={(e) => e.stopPropagation()}
          >
            <p className={styles.notFoundText}>
              Denne Player ID-en er ikke registrert som aktiv deltaker i dette eventet.
            </p>
            <button
              className={styles.notFoundClose}
              onClick={() => setNotFoundModal(false)}
            >
              OK
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

const EventSpecific = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [eventData, setEventData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [activePlayers, setActivePlayers] = useState([]);
  const [waitListPlayers, setWaitListPlayers] = useState([]);
  const [removedPlayers, setRemovedPlayers] = useState([]);
  const [fullEventMessage, setFullEventMessage] = useState(null);
  const [isEventActive, setIsEventActive] = useState(true);
  const [showPopUpMessage, setShowPopUpMessage] = useState(false);
  const [popUpMessage, setPopUpMessage] = useState("");
  const [shortUrl, setShortUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [linkNotification, setLinkNotification] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    message: "",
    onConfirm: null,
  });

  const { user, isAdmin, loading } = getAuthContext();
  const [accountPlayers, setAccountPlayers] = useState([]); // main + family members

  const DECK_LIST_EVENT_TYPES = ["leagueChallenge", "leagueCup"];

  // Fetch main account + family member player IDs for the decklist submit button
  useEffect(() => {
    if (!user) { setAccountPlayers([]); return; }
    const fetchAll = async () => {
      const userSnap = await getDoc(doc(database, "users", user.uid));
      if (!userSnap.exists()) return;
      const userData = userSnap.data();
      const list = [];
      if (userData.playerId) {
        list.push({ playerId: userData.playerId, firstName: userData.firstName, lastName: userData.lastName });
      }
      const fmSnap = await getDocs(collection(database, "users", user.uid, "familyMembers"));
      fmSnap.docs.forEach((d) => {
        const fm = d.data();
        if (fm.playerId) list.push({ playerId: fm.playerId, firstName: fm.firstName, lastName: fm.lastName });
      });
      setAccountPlayers(list);
    };
    fetchAll();
  }, [user]);

  // Intersection Observer for scroll animations
  const observerRef = useRef(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.playerVisible);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px",
      },
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  const playerRef = useCallback((node) => {
    if (node && observerRef.current) {
      observerRef.current.observe(node);
      // Check if element is already in viewport and trigger animation
      const rect = node.getBoundingClientRect();
      const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
      if (isInViewport) {
        node.classList.add(styles.playerVisible);
      }
    }
  }, []);

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
      setDataLoading(false);
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
    const unsubRemoved = listenToList("removedPlayers", setRemovedPlayers);

    return () => {
      unsubActive();
      unsubWait();
      unsubRemoved();
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

  const closeConfirmDialog = () =>
    setConfirmDialog({ isOpen: false, message: "", onConfirm: null });

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
      if (!eventData?.eventData?.eventDate) return true; // Default to true while loading

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

  if (loading) return null;

  if (dataLoading) {
    return (
      <div className={styles.eventWrapper}>
        <div className={styles.eventContainer}>
          <div className={`${styles.skeletonLine} ${styles.skeletonHeader}`} />
          {/* Event info card skeleton */}
          <div className={styles.skeletonCard}>
            <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
            <div
              className={`${styles.skeletonLine} ${styles.skeletonSubtitle}`}
            />
            <div
              className={`${styles.skeletonLine} ${styles.skeletonSubtitle}`}
            />
          </div>
          {/* Player roster skeletons */}
          <div className={styles.playerRoosterWrapper}>
            {["active", "waitlist"].map((key) => (
              <div key={key} className={styles.skeletonCard}>
                <div
                  className={`${styles.skeletonLine} ${styles.skeletonRosterHeading}`}
                />
                <div className={styles.skeletonProgressBar} />
                {[1, 2, 3].map((i) => (
                  <div key={i} className={styles.skeletonPlayerRow}>
                    <div className={styles.skeletonBadge} />
                    <div className={styles.skeletonPlayerInfo}>
                      <div
                        className={`${styles.skeletonLine} ${styles.skeletonPlayerName}`}
                      />
                      <div
                        className={`${styles.skeletonLine} ${styles.skeletonPlayerMeta}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.eventWrapper}>
      <div className={styles.eventContainer}>
        <h1 className={`${styles.header} ${styles.fadeIn}`}>
          {isEventActive ? "Event Påmelding" : "Påmelding er stengt"}
        </h1>

        {eventData ? (
          <>
            <div
              className={`${styles.eventInfoContainer} ${styles.fadeInDelay1}`}
            >
              <h2 className={styles.eventTitle}>
                {eventData.eventData?.eventTitle}
              </h2>
              <p>{fixEventTypeName(eventData.eventData?.typeOfEvent)}</p>
              <p>{fixDateInTitle(eventData.eventData?.eventDate)}</p>

              {isAdmin && (
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
                  <div className={styles.attendanceDivider} />
                  <Button
                    className={styles.attendanceButton}
                    onClick={() => navigate(`/event/${id}/attendance`)}
                  >
                    Oppmøteregistrering
                  </Button>
                </div>
              )}
            </div>

            <div className={styles.fadeInDelay1}>
              {!user && <AnnouncementBanner />}

              {DECK_LIST_EVENT_TYPES.includes(eventData.eventData?.typeOfEvent) && (
                <DeckListEntry
                  eventId={id}
                  eventDate={eventData.eventData?.eventDate}
                  accountPlayers={accountPlayers}
                  activePlayers={activePlayers}
                  waitListPlayers={waitListPlayers}
                  isLoggedIn={!!user}
                  navigate={navigate}
                />
              )}

              {isEventActive && (
                <JoinEventForm
                  id={id}
                  eventData={eventData}
                  setShowPopUpMessage={setShowPopUpMessage}
                  setPopUpMessage={setPopUpMessage}
                />
              )}

              <section className={styles.errorInfoContainer}>
                <span className={styles.errorInfo}>
                  Om du har problemer med påmeldingen, venligst gi beskjed til
                  en av Kanoncons Professorer, eller send epost til "
                  <a
                    href="mailTo:kanonconpokemonleague@gmail.com"
                    className={styles.emailLink}
                  >
                    Kanonconpokemonleague@gmail.com
                  </a>
                  ", så skal vi ordne det!
                </span>
              </section>
            </div>

            <div
              className={`${styles.playerRoosterWrapper} ${styles.fadeInDelay2}`}
            >
              {/* Active Players */}
              <div className={styles.playerRoosterContainer}>
                <div className={styles.sectionHeader}>
                  <h1 className={styles.playerRoosterHeading}>
                    Aktive Spillere ({activePlayers.length}/
                    {eventData.eventData?.maxPlayerCount || 0})
                  </h1>
                  <div className={styles.progressBarContainer}>
                    <div
                      className={styles.progressBar}
                      style={{
                        width: `${(activePlayers.length / (eventData.eventData?.maxPlayerCount || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <ul className={styles.list}>
                  {activePlayers.length > 0 ? (
                    activePlayers.map((player, index) => (
                      <li
                        key={player.playerId}
                        ref={playerRef}
                        className={styles.playerRoosterListElementActive}
                      >
                        <div className={styles.playerCardContent}>
                          <div className={styles.positionBadge}>
                            {index + 1}
                          </div>
                          {user ? (
                            <div className={styles.playerInfo}>
                              <p className={styles.playerName}>
                                {player.firstName} {player.lastName}
                                {player.claimedByUid && (
                                  <FontAwesomeIcon
                                    icon={faCircleCheck}
                                    className={styles.verifiedBadge}
                                    title="Verifisert konto"
                                  />
                                )}
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
                            <div className={styles.playerInfo}>
                              <p className={styles.playerName}>
                                {player.firstName}{" "}
                                {`${player.lastName.charAt(0)}.`}
                                {player.claimedByUid && (
                                  <FontAwesomeIcon
                                    icon={faCircleCheck}
                                    className={styles.verifiedBadge}
                                    title="Verifisert konto"
                                  />
                                )}
                              </p>
                            </div>
                          )}
                        </div>

                        {isAdmin && (
                          <div className={styles.buttonContainer}>
                            <Button
                              className={styles.featureButton}
                              onClick={() =>
                                setConfirmDialog({
                                  isOpen: true,
                                  message: `Flytt ${player.firstName} ${player.lastName} til ventelisten?`,
                                  onConfirm: () => {
                                    closeConfirmDialog();
                                    handleMoveToWaitlist(player.playerId);
                                  },
                                })
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
                              playerName={`${player.firstName} ${player.lastName}`}
                              isDocument={false}
                              moveToRemoved={true}
                            />
                          </div>
                        )}
                      </li>
                    ))
                  ) : (
                    <li
                      ref={playerRef}
                      className={styles.playerRoosterListElementActive}
                    >
                      Ingen spillere er påmeldt enda
                    </li>
                  )}
                </ul>
              </div>

              {/* Waiting List */}
              <div className={styles.playerRoosterContainer}>
                <div className={styles.sectionHeader}>
                  <h1 className={styles.playerRoosterHeading}>Venteliste</h1>
                  {waitListPlayers.length > 0 && (
                    <p className={styles.waitlistCount}>
                      {waitListPlayers.length}{" "}
                      {waitListPlayers.length === 1 ? "spiller" : "spillere"}{" "}
                      venter
                    </p>
                  )}
                </div>
                <ul className={styles.list}>
                  {waitListPlayers.length > 0 ? (
                    waitListPlayers.map((player, index) => (
                      <li
                        key={player.playerId}
                        ref={playerRef}
                        className={styles.playerRoosterListElementWaitList}
                      >
                        <div className={styles.playerCardContent}>
                          <div className={styles.positionBadge}>
                            {activePlayers.length + index + 1}
                          </div>
                          {user ? (
                            <div className={styles.playerInfo}>
                              <p className={styles.playerName}>
                                {player.firstName} {player.lastName}
                                {player.claimedByUid && (
                                  <FontAwesomeIcon
                                    icon={faCircleCheck}
                                    className={styles.verifiedBadge}
                                    title="Verifisert konto"
                                  />
                                )}
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
                            <div className={styles.playerInfo}>
                              <p className={styles.playerName}>
                                {player.firstName}{" "}
                                {`${player.lastName.charAt(0)}.`}
                                {player.claimedByUid && (
                                  <FontAwesomeIcon
                                    icon={faCircleCheck}
                                    className={styles.verifiedBadge}
                                    title="Verifisert konto"
                                  />
                                )}
                              </p>
                            </div>
                          )}
                        </div>

                        {isAdmin && (
                          <div className={styles.buttonContainer}>
                            <Button
                              className={styles.featureButton}
                              onClick={() =>
                                setConfirmDialog({
                                  isOpen: true,
                                  message: `Flytt ${player.firstName} ${player.lastName} til den aktive listen?`,
                                  onConfirm: () => {
                                    closeConfirmDialog();
                                    handleMoveToActive(player.playerId);
                                  },
                                })
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
                              playerName={`${player.firstName} ${player.lastName}`}
                              isDocument={false}
                              moveToRemoved={true}
                            />
                          </div>
                        )}
                      </li>
                    ))
                  ) : (
                    <li
                      ref={playerRef}
                      className={styles.playerRoosterListElementWaitList}
                    >
                      Ingen spillere i ventelisten
                    </li>
                  )}
                </ul>
              </div>

              {/* Removed Players — admin only */}
              {isAdmin && (
                <div className={styles.playerRoosterContainer}>
                  <div className={styles.sectionHeader}>
                    <h1 className={styles.playerRoosterHeading}>
                      Avmeldte Spillere
                    </h1>
                    {removedPlayers.length > 0 && (
                      <p className={styles.removedCount}>
                        {removedPlayers.length}{" "}
                        {removedPlayers.length === 1 ? "spiller" : "spillere"}{" "}
                        avmeldt
                      </p>
                    )}
                  </div>
                  <ul className={styles.list}>
                    {removedPlayers.length > 0 ? (
                      removedPlayers.map((player, index) => (
                        <li
                          key={player.playerId}
                          ref={playerRef}
                          className={styles.playerRoosterListElementRemoved}
                        >
                          <div className={styles.playerCardContent}>
                            <div className={styles.positionBadge}>
                              {index + 1}
                            </div>
                            <div className={styles.playerInfo}>
                              <p className={styles.playerName}>
                                {player.firstName} {player.lastName}
                                {player.claimedByUid && (
                                  <FontAwesomeIcon
                                    icon={faCircleCheck}
                                    className={styles.verifiedBadge}
                                    title="Verifisert konto"
                                  />
                                )}
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
                          </div>
                          <div className={styles.buttonContainer}>
                            <EditButton
                              id={player.playerId}
                              documentType={"PLAYER"}
                            />
                            <DeleteButton
                              collectionName={"events"}
                              id={id}
                              playerData={player.playerId}
                              playerName={`${player.firstName} ${player.lastName}`}
                              isDocument={false}
                              moveToRemoved={false}
                            />
                          </div>
                        </li>
                      ))
                    ) : (
                      <li
                        ref={playerRef}
                        className={styles.playerRoosterListElementRemoved}
                      >
                        Ingen spillere er fjernet
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </>
        ) : (
          <p>Event ikke funnet.</p>
        )}
      </div>
      {showPopUpMessage && (
        <PopUpMessage
          message={popUpMessage}
          setShowPopUpMessage={setShowPopUpMessage}
        />
      )}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirmDialog}
      />
    </div>
  );
};

export default EventSpecific;

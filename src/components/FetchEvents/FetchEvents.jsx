import React, { useEffect, useState, memo, useRef } from "react";
import styles from "./FetchEvents.module.css";
import { collection, doc, getDocs, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { database } from "../../firestoreConfig";
import { Link, useNavigate } from "react-router-dom";
import DeleteButton from "../DeleteButton/DeleteButton";
import EditButton from "../EditButton/EditButton";
import Button from "../Button/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { getAuthContext } from "../../context/authContext";

// 🔧 Parse date in either YYYY-MM-DD or DD-MM-YYYY
const parseDate = (str) => {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length !== 3) return null;

  // Handle YYYY-MM-DD
  if (parts[0].length === 4) {
    const [year, month, day] = parts;
    return new Date(`${year}-${month}-${day}`);
  }

  // Handle DD-MM-YYYY
  const [day, month, year] = parts;
  return new Date(`${year}-${month}-${day}`);
};

// 🔧 Format date to DD-MM-YYYY for display
const formatDate = (dateString) => {
  const date = parseDate(dateString);
  if (!date || isNaN(date)) return dateString || "Ukjent dato";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
};



const DECK_LIST_EVENT_TYPES = ["leagueChallenge", "leagueCup"];

const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

const DeckListCardStatus = ({ eventId, navigate }) => {
  const { user } = getAuthContext();
  const [deckStatus, setDeckStatus] = useState({ submitted: 0, total: 0 });

  useEffect(() => {
    if (!user) return;
    const check = async () => {
      try {
        const userSnap = await getDoc(doc(database, "users", user.uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const playerIds = [];
        if (userData.playerId) playerIds.push(userData.playerId);
        const familySnap = await getDocs(collection(database, "users", user.uid, "familyMembers"));
        familySnap.forEach((d) => { if (d.data().playerId) playerIds.push(d.data().playerId); });
        if (playerIds.length === 0) return;
        let total = 0, submitted = 0;
        for (const chunk of chunkArray(playerIds, 10)) {
          const snap = await getDocs(query(
            collection(database, "events", eventId, "activePlayersList"),
            where("playerId", "in", chunk)
          ));
          snap.docs.forEach((d) => { total++; if (d.data().deckList) submitted++; });
        }
        setDeckStatus({ submitted, total });
      } catch { /* silent */ }
    };
    check();
  }, [user, eventId]);

  const allSubmitted = deckStatus.total > 0 && deckStatus.submitted === deckStatus.total;

  return (
    <button
      className={`${styles.deckListBtn}${allSubmitted ? ` ${styles.deckListBtnSubmitted}` : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(`/event/${eventId}/deck-list-submit`);
      }}
    >
      {allSubmitted ? (
        <><FontAwesomeIcon icon={faCircleCheck} /> {deckStatus.total > 1 ? "Decklister er innlevert" : "Deckliste er innlevert"}</>
      ) : (
        "Lever Deckliste"
      )}
    </button>
  );
};

// 🧠 Memoized subcomponent for performance

const EventList = memo(({ events, status, isAdmin }) => {
  const [visibilityNotification, setVisibilityNotification] = useState(null);
  const navigate = useNavigate();
  const notificationTimeoutRef = useRef(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filteredAndSorted = events
    .filter((item) => {
      const eventDateStr = item.eventData?.eventDate;
      const eventDate = parseDate(eventDateStr);
      if (!eventDate) return false;

      eventDate.setHours(0, 0, 0, 0);

      if (!isAdmin && item.eventData?.isEventHidden) {
        return false;
      }

      return status === "active" ? eventDate >= today : eventDate < today;
    })
    .sort((a, b) => {
      const dateA = parseDate(a.eventData?.eventDate);
      const dateB = parseDate(b.eventData?.eventDate);
      if (!dateA || !dateB) return 0;
      return status === "active" ? dateA - dateB : dateB - dateA;
    })
    .slice(0, status === "inactive" ? 10 : undefined);

  if (filteredAndSorted.length === 0) {
    return (
      <p className={styles.noEvents}>
        Ingen {status === "active" ? "aktive" : "tidligere"} eventer funnet.
      </p>
    );
  }

  const handleVisibility = async (e, id, currentValue) => {
    e.preventDefault();
    try {
      const eventRef = doc(database, "events", id);
      await updateDoc(eventRef, {
        "eventData.isEventHidden": !currentValue,
      });

      // Clear existing timeout if it exists
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }

      setVisibilityNotification(id);
      notificationTimeoutRef.current = setTimeout(() => {
        setVisibilityNotification(null);
        notificationTimeoutRef.current = null;
      }, 2500);
    } catch (error) {
      console.log(error.message);
    }
  };

  return (
    <ul className={styles.list}>
      {filteredAndSorted.map((item, index) => {
        const data = item.eventData || {};
        return (
          <Link
            to={`/event/${item.id}`}
            key={item.id}
            className={`${
              status === "active" ? styles.linkActive : styles.linkInactive
            } ${styles.fadeInItem}`}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <li
              className={
                status === "active"
                  ? styles.listElementActive
                  : styles.listElementInactive
              }
            >
              <div className={styles.eventInfoContainer}>
                <p className={styles.listElementTitle}>{data.eventTitle}</p>
                <div className={styles.eventInfoSubContainer}>
                  {/* <p className={styles.listElementType}>
                    {formatEventType(data.typeOfEvent)}
                  </p> */}
                  <p>{formatDate(data.eventDate)}</p>
                </div>
              </div>
              <div className={`${styles.listElementDate} `}>
                {status === "active" && DECK_LIST_EVENT_TYPES.includes(data.typeOfEvent) && (
                  <DeckListCardStatus eventId={item.id} navigate={navigate} />
                )}
                {/* Admin Buttons */}
                {isAdmin && (
                  <div className={styles.dateFeaturesContainer}>
                    <div className={styles.visibilityButtonWrapper}>
                      <Button
                        className={`${styles.visibilityButton} ${
                          data.isEventHidden ? styles.hiddenEvent : ""
                        }`}
                        onClick={(e) =>
                          handleVisibility(e, item.id, data.isEventHidden)
                        }
                      >
                        {data.isEventHidden ? (
                          <FontAwesomeIcon icon={faEyeSlash} />
                        ) : (
                          <FontAwesomeIcon icon={faEye} />
                        )}
                      </Button>
                      {visibilityNotification === item.id && (
                        <div className={styles.notificationBubble}>
                          {data.isEventHidden ? "Skjult" : "Synlig"}
                        </div>
                      )}
                    </div>
                    <EditButton id={item.id} documentType={"EVENT"} />
                    <DeleteButton
                      collectionName="events"
                      id={item.id}
                      isDocument={true}
                    />
                  </div>
                )}
              </div>
            </li>
          </Link>
        );
      })}
    </ul>
  );
});

// 💀 Skeleton placeholder while loading
const SkeletonList = ({ status }) => (
  <ul className={styles.list}>
    {[1, 2, 3].map((i) => (
      <li
        key={i}
        className={`${
          status === "active"
            ? styles.listElementActive
            : styles.listElementInactive
        } ${styles.skeletonItem}`}
      >
        <div className={styles.eventInfoContainer}>
          <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
          <div className={styles.eventInfoSubContainer}>
            <div className={`${styles.skeletonLine} ${styles.skeletonDate}`} />
          </div>
        </div>
      </li>
    ))}
  </ul>
);

// 🧩 Main component
const FetchEvents = ({ status = "active" }) => {
  const [eventsData, setEventsData] = useState([]);
  const [loading, setLoading] = useState(true);

  const { isAdmin } = getAuthContext();

  useEffect(() => {
    const eventsCollection = collection(database, "events");

    const unsubscribe = onSnapshot(
      eventsCollection,
      (snapshot) => {
        const events = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setEventsData(events);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching events:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  if (loading) return <SkeletonList status={status} />;

  return <EventList events={eventsData} status={status} isAdmin={isAdmin} />;
};

export default FetchEvents;

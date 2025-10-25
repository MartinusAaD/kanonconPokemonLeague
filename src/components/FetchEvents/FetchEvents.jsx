import React, { useEffect, useState, memo } from "react";
import styles from "./FetchEvents.module.css";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { database } from "../../firestoreConfig";
import { Link } from "react-router-dom";
import DeleteButton from "../DeleteButton/DeleteButton";
import EditButton from "../EditButton/EditButton";
import Button from "../Button/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
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

// 🔧 Map event type to readable string
const formatEventType = (type) => {
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
      return type || "Ukjent type";
  }
};

// 🧠 Memoized subcomponent for performance
const EventList = memo(({ events, status, user }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filteredAndSorted = events
    .filter((item) => {
      const eventDateStr = item.eventData?.eventDate;
      const eventDate = parseDate(eventDateStr);
      if (!eventDate) return false;

      eventDate.setHours(0, 0, 0, 0);

      if (!user && item.eventData?.isEventHidden) {
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
    } catch (error) {
      console.log(error.message);
    }
  };

  return (
    <ul className={styles.list}>
      {filteredAndSorted.map((item) => {
        const data = item.eventData || {};
        return (
          <Link
            to={`/event/${item.id}`}
            key={item.id}
            className={
              status === "active" ? styles.linkActive : styles.linkInactive
            }
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
                {/* Admin Buttons */}
                {user && (
                  <div className={styles.dateFeaturesContainer}>
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

// 🧩 Main component
const FetchEvents = ({ status = "active" }) => {
  const [eventsData, setEventsData] = useState([]);

  const { user } = getAuthContext();

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
      },
      (error) => console.error("Error fetching events:", error)
    );

    return () => unsubscribe();
  }, []);

  return <EventList events={eventsData} status={status} user={user} />;
};

export default FetchEvents;

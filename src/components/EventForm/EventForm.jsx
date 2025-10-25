import styles from "./EventForm.module.css";
import Button from "../../components/Button/Button";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { database } from "../../firestoreConfig";
import { useEventCreateValidation } from "../../hooks/useEventCreateValidation";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const defaultEventData = {
  eventTitle: "",
  typeOfEvent: "",
  eventDate: "",
  maxPlayerCount: "",
  maxPlayerCountReached: false,
  isEventHidden: false,
  activePlayersList: [],
  waitListedPlayers: [],
};

const EventForm = () => {
  const { id } = useParams(); // If editing, this will be set
  const [loading, setLoading] = useState(true);
  const [eventData, setEventData] = useState(defaultEventData);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const { validationErrors, setValidationErrors, validate } =
    useEventCreateValidation();

  // Fetch event if editing
  useEffect(() => {
    const fetchEvent = async () => {
      if (id) {
        try {
          const docRef = doc(database, "events", id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setEventData({ ...defaultEventData, ...docSnap.data().eventData });
          } else {
            console.error("Event not found");
          }
        } catch (error) {
          console.error("Error fetching event:", error);
        }
      }
      setLoading(false);
    };

    fetchEvent();
  }, [id]);

  // Reset feedback message after 5 seconds
  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = setTimeout(() => setFeedbackMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEventData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setValidationErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const resetForm = () => {
    setEventData(defaultEventData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (validate(eventData).length > 0) {
      console.log("Form is not valid!");
      return;
    }

    try {
      if (!id) {
        // Create new event
        await addDoc(collection(database, "events"), {
          eventData,
          createdAt: serverTimestamp(),
        });
        setFeedbackMessage("Nytt event er lagt til i registeret!");
        resetForm();
      } else {
        // Update existing event
        await updateDoc(doc(database, "events", id), { eventData });
        setFeedbackMessage("Eventet har blitt oppdatert!");
      }
    } catch (error) {
      console.error(id ? "Error editing event" : "Error creating event", error);
      setFeedbackMessage("Noe gikk galt, prøv igjen.");
    }
  };

  if (loading) return <div>Laster event...</div>;
  if (
    id &&
    !eventData.eventTitle &&
    !eventData.typeOfEvent &&
    !eventData.eventDate
  )
    return <div>Eventet finnes ikke.</div>;

  return (
    <div className={styles.createEventWrapper}>
      <div className={styles.formContainer}>
        <form className={styles.form} noValidate onSubmit={handleSubmit}>
          <fieldset className={styles.fieldset}>
            <div className={styles.groupContainer}>
              <h1 className={styles.header}>
                {id ? "Rediger Event" : "Nytt Event"}
              </h1>
            </div>

            {/* Event Title */}
            <div className={styles.groupContainer}>
              <label htmlFor="eventTitle" className={styles.label}>
                Event Tittel *
              </label>
              <input
                type="text"
                className={styles.input}
                name="eventTitle"
                id="eventTitle"
                placeholder="Pre-Release, Mega Evolution"
                onChange={handleChange}
                value={eventData.eventTitle}
              />
              <p className={styles.errorMessage}>
                {validationErrors.eventTitle}
              </p>
            </div>

            {/* Type of Event */}
            <div className={styles.groupContainer}>
              <label htmlFor="typeOfEvent" className={styles.label}>
                Event Type *
              </label>
              <select
                name="typeOfEvent"
                id="typeOfEvent"
                onChange={handleChange}
                value={eventData.typeOfEvent}
              >
                <option value="">Velg event</option>
                <option value="casual">Casual</option>
                <option value="casualTrade">Casual & Trade Day</option>
                <option value="preRelease">Pre-Release</option>
                <option value="leagueChallenge">League Challenge</option>
                <option value="leagueCup">League Cup</option>
              </select>
              <p className={styles.errorMessage}>
                {validationErrors.typeOfEvent}
              </p>
            </div>

            {/* Event Date */}
            <div className={styles.groupContainer}>
              <label htmlFor="eventDate" className={styles.label}>
                Event Dato *
              </label>
              <input
                type="date"
                className={styles.input}
                name="eventDate"
                id="eventDate"
                onChange={handleChange}
                value={eventData.eventDate}
              />
              <p className={styles.errorMessage}>
                {validationErrors.eventDate}
              </p>
            </div>

            {/* Max Player Count */}
            <div className={styles.groupContainer}>
              <label htmlFor="maxPlayerCount" className={styles.label}>
                Maksimum Antall Spillere *
              </label>
              <input
                type="number"
                className={styles.input}
                placeholder="00"
                name="maxPlayerCount"
                id="maxPlayerCount"
                onChange={handleChange}
                value={eventData.maxPlayerCount}
              />
              <p className={styles.errorMessage}>
                {validationErrors.maxPlayerCount}
              </p>
            </div>

            {/* Hidden Checkbox */}
            <div className={styles.checkboxContainer}>
              <input
                type="checkbox"
                name="isEventHidden"
                id="isEventHidden"
                checked={eventData.isEventHidden}
                onChange={handleChange}
              />
              <label htmlFor="isEventHidden">
                Huk av for å skjule eventet for spillere.
              </label>
            </div>

            <div className={styles.groupContainer}>
              <Button type="submit" className={styles.submitButton}>
                Fullfør
              </Button>
            </div>

            {feedbackMessage && (
              <div className={styles.groupContainer}>
                <h2 className={styles.feedbackMessage}>{feedbackMessage}</h2>
              </div>
            )}
          </fieldset>
        </form>
      </div>
    </div>
  );
};

export default EventForm;

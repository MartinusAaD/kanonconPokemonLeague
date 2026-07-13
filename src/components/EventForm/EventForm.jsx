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
  startTime: "",
  endTime: "",
  registrationTime: "",
  maxPlayerCount: "",
  maxPlayerCountReached: false,
  isEventHidden: false,
};

const NO_SIGNUP_EVENT_TYPES = ["casual", "casualTrade", "tradeDay"];
const REGULAR_TIME_EVENT_TYPES = ["casual", "casualTrade", "tradeDay"];
const REGISTRATION_TIME_EVENT_TYPES = [
  "preRelease",
  "leagueChallenge",
  "leagueCup",
  "casualTournament",
];

const EventForm = () => {
  const { id } = useParams(); // If editing, this will be set
  const [loading, setLoading] = useState(true);
  const [eventData, setEventData] = useState(defaultEventData);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const isNoSignupEvent = NO_SIGNUP_EVENT_TYPES.includes(eventData.typeOfEvent);
  const isRegularTimeEvent = REGULAR_TIME_EVENT_TYPES.includes(
    eventData.typeOfEvent,
  );
  const isRegistrationTimeEvent = REGISTRATION_TIME_EVENT_TYPES.includes(
    eventData.typeOfEvent,
  );

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

    if (validate(eventData, isNoSignupEvent).length > 0) {
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
                <option value="tradeDay">Trade Day</option>
                <option value="casualTrade">Casual & Trade Day</option>
                <option value="casualTournament">Casual Turnering</option>
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

            {/* Regular Start/End Time */}
            {isRegularTimeEvent && (
              <>
                <div className={styles.groupContainer}>
                  <label htmlFor="startTime" className={styles.label}>
                    Fra Klokkeslett *
                  </label>
                  <input
                    type="time"
                    className={styles.input}
                    name="startTime"
                    id="startTime"
                    onChange={handleChange}
                    value={eventData.startTime}
                  />
                  <p className={styles.errorMessage}>
                    {validationErrors.startTime}
                  </p>
                </div>

                <div className={styles.groupContainer}>
                  <label htmlFor="endTime" className={styles.label}>
                    Til Klokkeslett *
                  </label>
                  <input
                    type="time"
                    className={styles.input}
                    name="endTime"
                    id="endTime"
                    onChange={handleChange}
                    value={eventData.endTime}
                  />
                  <p className={styles.errorMessage}>
                    {validationErrors.endTime}
                  </p>
                </div>
              </>
            )}

            {/* Registration/Event Start Time */}
            {isRegistrationTimeEvent && (
              <>
                <div className={styles.groupContainer}>
                  <label htmlFor="registrationTime" className={styles.label}>
                    Registrering Åpner *
                  </label>
                  <input
                    type="time"
                    className={styles.input}
                    name="registrationTime"
                    id="registrationTime"
                    onChange={handleChange}
                    value={eventData.registrationTime}
                  />
                  <p className={styles.errorMessage}>
                    {validationErrors.registrationTime}
                  </p>
                </div>

                <div className={styles.groupContainer}>
                  <label htmlFor="startTime" className={styles.label}>
                    Event Starter *
                  </label>
                  <input
                    type="time"
                    className={styles.input}
                    name="startTime"
                    id="startTime"
                    onChange={handleChange}
                    value={eventData.startTime}
                  />
                  <p className={styles.errorMessage}>
                    {validationErrors.startTime}
                  </p>
                </div>
              </>
            )}

            {/* Max Player Count */}
            {!isNoSignupEvent && (
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
            )}

            {/* Hidden Checkbox */}
            {!isNoSignupEvent && (
              <div className={styles.checkboxContainer}>
                <input
                  type="checkbox"
                  name="maxPlayerCountReached"
                  id="maxPlayerCountReached"
                  checked={eventData.maxPlayerCountReached}
                  onChange={handleChange}
                />
                <label htmlFor="maxPlayerCountReached">
                  Aktiv liste er full – Nye spillere plasseres på ventelisten
                </label>
              </div>
            )}

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

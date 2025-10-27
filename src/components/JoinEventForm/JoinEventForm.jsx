import React, { useEffect, useState } from "react";
import styles from "./JoinEventForm.module.css";
import Button from "../Button/Button";
import { database } from "../../firestoreConfig";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useJoinEventFormValidation } from "../../hooks/useJoinEventFormValidation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

const JoinEventForm = ({ id, eventData }) => {
  const [formData, setFormData] = useState({
    playerId: "",
    firstName: "",
    lastName: "",
    birthYear: "",
    emailPhoneNumber: "",
  });

  const [feedbackMessage, setFeedbackMessage] = useState("");
  const { validationErrors, setValidationErrors, validate } =
    useJoinEventFormValidation();

  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = setTimeout(() => setFeedbackMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  const resetForm = () => {
    setFormData({
      playerId: "",
      firstName: "",
      lastName: "",
      birthYear: "",
      emailPhoneNumber: "",
    });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setValidationErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handlePlayerSearch = async () => {
    try {
      const playersRef = collection(database, "players");
      const q = query(playersRef, where("playerId", "==", formData.playerId));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        console.log("No player with said ID found");
        return;
      }

      const player = snapshot.docs[0].data();
      setFormData({
        playerId: player.playerId ?? "",
        firstName: player.firstName ?? "",
        lastName: player.lastName ?? "",
        birthYear: player.birthYear ?? "",
        emailPhoneNumber: player.emailPhoneNumber ?? "",
      });
      setValidationErrors({});
    } catch (error) {
      console.error(error.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (validate(formData).length > 0) return;

    try {
      const eventRef = doc(database, "events", id);
      const eventSnap = await getDoc(eventRef);

      if (!eventSnap.exists()) {
        setFeedbackMessage("Eventet finnes ikke.");
        return;
      }

      const eventDataFromDB = eventSnap.data().eventData;
      const maxPlayers = Number(eventDataFromDB.maxPlayerCount);

      // 1️⃣ Create or update player in 'players' collection
      const playersRef = collection(database, "players");
      const playerQuery = query(
        playersRef,
        where("playerId", "==", formData.playerId)
      );
      const playerSnap = await getDocs(playerQuery);

      let playerDocRef;
      if (playerSnap.empty) {
        playerDocRef = await addDoc(playersRef, {
          playerId: formData.playerId,
          firstName: formData.firstName,
          lastName: formData.lastName,
          birthYear: formData.birthYear,
          emailPhoneNumber: formData.emailPhoneNumber,
          joinedAt: serverTimestamp(),
        });
      } else {
        playerDocRef = playerSnap.docs[0].ref;
        await updateDoc(playerDocRef, {
          firstName: formData.firstName,
          lastName: formData.lastName,
          birthYear: formData.birthYear,
          emailPhoneNumber: formData.emailPhoneNumber,
        });
      }

      // 2️⃣ References to subcollections
      const activeRef = collection(eventRef, "activePlayersList");
      const waitlistRef = collection(eventRef, "waitListedPlayers");

      // Check if player already registered
      const [activeSnap, waitSnap] = await Promise.all([
        getDocs(query(activeRef, where("playerId", "==", formData.playerId))),
        getDocs(query(waitlistRef, where("playerId", "==", formData.playerId))),
      ]);

      if (!activeSnap.empty || !waitSnap.empty) {
        setFeedbackMessage("Du er allerede påmeldt dette eventet!");
        return;
      }

      // 3️⃣ Count active players
      const activeCountSnap = await getDocs(activeRef);
      const activeCount = activeCountSnap.size;

      // 4️⃣ Decide whether to add to active or waitlist
      if (activeCount < maxPlayers && !eventDataFromDB.maxPlayerCountReached) {
        // Add to active
        await addDoc(activeRef, {
          playerId: formData.playerId,
          joinedAt: serverTimestamp(),
        });

        // Lock event if full
        if (activeCount + 1 >= maxPlayers) {
          await updateDoc(eventRef, {
            "eventData.maxPlayerCountReached": true,
          });
        }

        setFeedbackMessage("Du er nå påmeldt som aktiv spiller!");
      } else {
        // Add to waitlist
        await addDoc(waitlistRef, {
          playerId: formData.playerId,
          joinedAt: serverTimestamp(),
        });
        setFeedbackMessage("Eventet er fullt. Du er lagt til i ventelisten.");
      }

      resetForm();
    } catch (error) {
      console.error("Error joining event:", error);
      setFeedbackMessage("Noe gikk galt, prøv igjen.");
    }
  };

  return (
    <div className={styles.createEventWrapper}>
      <div className={styles.formContainer}>
        <form className={styles.form} noValidate onSubmit={handleSubmit}>
          <fieldset className={styles.fieldset}>
            {/* Player ID */}
            <div className={styles.groupContainer}>
              <label
                htmlFor="playerId"
                className={styles.label}
                title="Player ID er tildelt via Pokèmon Play!"
              >
                Player ID *
              </label>
              <div className={styles.searchBarContainer}>
                <input
                  type="text"
                  name="playerId"
                  id="playerId"
                  className={styles.input}
                  placeholder="Kan søke om du har spilt hoss oss før"
                  maxLength={20}
                  value={formData.playerId}
                  onChange={handleChange}
                  title="Kan kun inneholde tall"
                />
                <Button
                  className={styles.searchButton}
                  type="button"
                  onClick={handlePlayerSearch}
                >
                  <FontAwesomeIcon icon={faMagnifyingGlass} />
                </Button>
              </div>
              <p className={styles.errorMessage}>{validationErrors.playerId}</p>
            </div>

            {/* First Name */}
            <div className={styles.groupContainer}>
              <label htmlFor="firstName" className={styles.label}>
                Fornavn *
              </label>
              <input
                type="text"
                name="firstName"
                id="firstName"
                className={styles.input}
                placeholder="Skriv inn fornavnet ditt"
                maxLength={50}
                value={formData.firstName}
                onChange={handleChange}
              />
              <p className={styles.errorMessage}>
                {validationErrors.firstName}
              </p>
            </div>

            {/* Last Name */}
            <div className={styles.groupContainer}>
              <label htmlFor="lastName" className={styles.label}>
                Etternavn *
              </label>
              <input
                type="text"
                name="lastName"
                id="lastName"
                className={styles.input}
                placeholder="Skriv inn etternavnet ditt"
                maxLength={50}
                value={formData.lastName}
                onChange={handleChange}
              />
              <p className={styles.errorMessage}>{validationErrors.lastName}</p>
            </div>

            {/* Birth Year */}
            <div className={styles.groupContainer}>
              <label htmlFor="birthYear" className={styles.label}>
                Fødselsår *
              </label>
              <input
                type="text"
                name="birthYear"
                id="birthYear"
                className={styles.input}
                placeholder="Skriv inn fødselsåret ditt"
                maxLength={4}
                value={formData.birthYear}
                onChange={handleChange}
              />
              <p className={styles.errorMessage}>
                {validationErrors.birthYear}
              </p>
            </div>

            {/* Email / Phone */}
            <div className={styles.groupContainer}>
              <label htmlFor="emailPhoneNumber" className={styles.label}>
                Epost og/eller Mobil *
              </label>
              <input
                type="text"
                name="emailPhoneNumber"
                id="emailPhoneNumber"
                className={styles.input}
                placeholder="Skriv inn ønsket kontakt metode"
                maxLength={50}
                value={formData.emailPhoneNumber}
                onChange={handleChange}
              />
              <p className={styles.errorMessage}>
                {validationErrors.emailPhoneNumber}
              </p>
            </div>

            {/* Submit */}
            <div className={styles.groupContainer}>
              <Button className={styles.submitButton} type="submit">
                Send Inn
              </Button>
            </div>

            {/* Feedback */}
            {feedbackMessage && (
              <div className={styles.feedbackContainer}>
                <h2 className={styles.feedbackMessage}>{feedbackMessage}</h2>
              </div>
            )}
          </fieldset>
        </form>
      </div>
    </div>
  );
};

export default JoinEventForm;

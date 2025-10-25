import React, { useEffect, useState } from "react";
import styles from "./JoinEventForm.module.css";
import Button from "../Button/Button";
import { database } from "../../firestoreConfig";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
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

  const checkIfPlayerExistsInEvent = async (eventId, playerId) => {
    try {
      const docRef = doc(database, "events", eventId);
      const snapshot = await getDocs(docRef);
      const data = snapshot.data()?.eventData;

      const active = data?.activePlayersList || [];
      const waitList = data?.waitListedPlayers || [];

      return active.includes(playerId) || waitList.includes(playerId);
    } catch (error) {
      console.error("Error checking event list:", error);
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (validate(formData).length > 0) return;

    const activeCount = eventData?.eventData?.activePlayersList?.length || 0;
    const maxCount = Number(eventData?.eventData?.maxPlayerCount) || 0;
    const docRef = doc(database, "events", id);

    try {
      // Check if player already in event
      const alreadyJoined = await checkIfPlayerExistsInEvent(
        id,
        formData.playerId
      );
      if (alreadyJoined) {
        setFeedbackMessage("Du er allerede påmeldt dette eventet!");
        return;
      }

      // Add playerId only to event
      if (activeCount < maxCount) {
        await updateDoc(docRef, {
          "eventData.activePlayersList": arrayUnion(formData.playerId),
          ...(activeCount + 1 === maxCount && {
            "eventData.maxPlayerCountReached": true,
          }),
        });
        setFeedbackMessage("Du er nå påmeldt som aktiv spiller!");
      } else {
        await updateDoc(docRef, {
          "eventData.waitListedPlayers": arrayUnion(formData.playerId),
        });
        setFeedbackMessage(
          "Eventet er fullt, men du er lagt til i ventelisten."
        );
      }

      // Update or create player in players collection
      const playersRef = collection(database, "players");
      const q = query(playersRef, where("playerId", "==", formData.playerId));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        // New player
        await addDoc(playersRef, {
          playerId: formData.playerId,
          firstName: formData.firstName,
          lastName: formData.lastName,
          birthYear: formData.birthYear,
          emailPhoneNumber: formData.emailPhoneNumber,
          joinedAt: new Date().toISOString(),
        });
      } else {
        // Existing player → update info
        const playerDocRef = doc(database, "players", snapshot.docs[0].id);
        await updateDoc(playerDocRef, {
          firstName: formData.firstName,
          lastName: formData.lastName,
          birthYear: formData.birthYear,
          emailPhoneNumber: formData.emailPhoneNumber,
        });
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
                  type={"button"}
                  onClick={handlePlayerSearch}
                >
                  <FontAwesomeIcon icon={faMagnifyingGlass} />
                </Button>
              </div>
              <p className={styles.errorMessage}>{validationErrors.playerId}</p>
            </div>

            {/* First Name */}
            <div className={styles.groupContainer}>
              <label
                htmlFor="firstName"
                className={styles.label}
                title="Fornavnet som tilhører Player IDen"
              >
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
                title="Fornavnet som tilhører Player IDen"
              />
              <p className={styles.errorMessage}>
                {validationErrors.firstName}
              </p>
            </div>

            {/* Last Name */}
            <div className={styles.groupContainer}>
              <label
                htmlFor="lastName"
                className={styles.label}
                title="Etternavnet som tilhører Player IDen"
              >
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
                title="Etternavnet som tilhører Player IDen"
              />
              <p className={styles.errorMessage}>{validationErrors.lastName}</p>
            </div>

            {/* Birth Year */}
            <div className={styles.groupContainer}>
              <label
                htmlFor="birthYear"
                className={styles.label}
                title="Fødselsåret som tilhører Player IDen"
              >
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
                title="Fødselsåret som tilhører Player IDen"
              />
              <p className={styles.errorMessage}>
                {validationErrors.birthYear}
              </p>
            </div>

            {/* Email / Phone */}
            <div className={styles.groupContainer}>
              <label
                htmlFor="emailPhoneNumber"
                className={styles.label}
                title="Brukes ved venteliste."
              >
                Epost og/eller Mobil *
              </label>
              <input
                type="text"
                name="emailPhoneNumber"
                id="emailPhoneNumber"
                className={styles.input}
                placeholder="Skrv inn ønska kontakt metode"
                maxLength={50}
                value={formData.emailPhoneNumber}
                onChange={handleChange}
                title="Brukes ved venteliste."
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

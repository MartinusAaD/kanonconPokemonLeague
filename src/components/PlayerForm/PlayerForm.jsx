import React, { useEffect, useState } from "react";
import styles from "./PlayerForm.module.css";
import { useJoinEventFormValidation } from "../../hooks/useJoinEventFormValidation";
import Button from "../Button/Button";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { database } from "../../firestoreConfig";
import { useLocation, useParams } from "react-router-dom";

const PlayerForm = () => {
  const [formData, setFormData] = useState({
    playerId: "",
    firstName: "",
    lastName: "",
    birthYear: "",
    emailPhoneNumber: "",
  });
  const [isInEditMode, setIsInEditMode] = useState(false);
  const [docId, setDocId] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const { id } = useParams();
  const location = useLocation().pathname;

  const { validationErrors, setValidationErrors, validate } =
    useJoinEventFormValidation();

  //Check ifInEditMode or not
  useEffect(() => {
    const checkFormFunction = () => {
      if (location !== "/add-player") {
        setIsInEditMode(true);
      }
    };
    checkFormFunction();
  }, [location]);

  // For editing players
  useEffect(() => {
    const fetchPlayer = async () => {
      if (!id) return;

      try {
        const playersRef = collection(database, "players");
        const q = query(playersRef, where("playerId", "==", id)); // use correct field name
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          console.log("No player with this ID was found");
          return;
        }

        const docData = snapshot.docs[0].data(); // <- use this
        setDocId(snapshot.docs[0].id);
        setFormData({
          playerId: docData.playerId ?? "",
          firstName: docData.firstName ?? "",
          lastName: docData.lastName ?? "",
          birthYear: docData.birthYear ?? "",
          emailPhoneNumber: docData.emailPhoneNumber ?? "",
        });
      } catch (error) {
        console.log(error.message);
      }
    };

    fetchPlayer();
  }, [id]);

  useEffect(() => {
    if (!feedbackMessage) return;

    const timer = setTimeout(() => setFeedbackMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  const resetForm = () => {
    if (isInEditMode) {
      setFormData({
        playerId: formData.playerId ?? "",
        firstName: formData.firstName ?? "",
        lastName: formData.lastName ?? "",
        birthYear: formData.birthYear ?? "",
        emailPhoneNumber: formData.emailPhoneNumber ?? "",
      });
    } else {
      setFormData({
        playerId: "",
        firstName: "",
        lastName: "",
        birthYear: "",
      });
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setValidationErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validate(formData);

    if (location !== "/add-player") {
      if (Object.keys(errors).length > 1) {
        return;
      } else if (Object.keys(errors).length > 0) {
        return;
      }
    }

    if (isInEditMode) {
      try {
        const playersRef = doc(database, "players", docId);
        await updateDoc(playersRef, {
          ...formData,
        });
      } catch (error) {
        console.log(error.message);
      }
      setFeedbackMessage("Spiller er oppdatert!");
    } else {
      await addDoc(collection(database, "players"), {
        playerId: formData.playerId ?? "",
        firstName: formData.firstName ?? "",
        lastName: formData.lastName ?? "",
        birthYear: formData.birthYear ?? "",
        emailPhoneNumber: formData.emailPhoneNumber ?? "",
        joinedAt: serverTimestamp(),
      });
      setFeedbackMessage("Spiller er lagt til!");
    }
    resetForm();
  };

  return (
    <div className={styles.playerFormContainer}>
      <div className={styles.formContainer}>
        <h1 className={styles.header}>
          {isInEditMode ? "Rediger Spiller" : "Legg til Spiller"}
        </h1>
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
                  disabled={isInEditMode ? true : ""}
                />
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
            {isInEditMode && (
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
            )}

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

export default PlayerForm;

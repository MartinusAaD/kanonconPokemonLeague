import React, { useState } from "react";
import styles from "./Register.module.css";
import Button from "../../components/Button/Button";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, database } from "../../firestoreConfig";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useRegisterValidation } from "../../hooks/useRegisterValidation";

const Register = () => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    playerId: "",
    birthYear: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
  });
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { validationErrors, setValidationErrors, validate } =
    useRegisterValidation();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setValidationErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validate(formData);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    setFeedbackMessage("");

    try {
      // 1. Check if player ID is already claimed
      const playersRef = collection(database, "players");
      const claimSnap = await getDocs(
        query(playersRef, where("playerId", "==", formData.playerId.trim())),
      );

      const alreadyClaimed = claimSnap.docs.some((d) => {
        const uid = d.data().claimedByUid;
        return uid !== null && uid !== undefined;
      });

      if (alreadyClaimed) {
        setValidationErrors((prev) => ({
          ...prev,
          playerId: "Denne Player ID-en er allerede tatt",
        }));
        setIsSubmitting(false);
        return;
      }

      // 2. Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email.trim(),
        formData.password,
      );
      const uid = userCredential.user.uid;

      // 3. Create user document in Firestore
      await setDoc(doc(database, "users", uid), {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        playerId: formData.playerId.trim(),
        birthYear: formData.birthYear.trim(),
        email: formData.email.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        role: "player",
        createdAt: serverTimestamp(),
      });

      // 4. Upsert player document and claim the player ID
      const playerQuery = query(
        playersRef,
        where("playerId", "==", formData.playerId.trim()),
      );
      const playerSnap = await getDocs(playerQuery);

      if (playerSnap.empty) {
        // Player doesn't exist yet — create it
        await addDoc(playersRef, {
          playerId: formData.playerId.trim(),
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          birthYear: formData.birthYear.trim(),
          emailPhoneNumber: formData.phoneNumber.trim(),
          claimedByUid: uid,
          joinedAt: serverTimestamp(),
        });
      } else {
        // Player exists — update and claim
        await updateDoc(playerSnap.docs[0].ref, {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          birthYear: formData.birthYear.trim(),
          emailPhoneNumber: formData.phoneNumber.trim(),
          claimedByUid: uid,
        });
      }

      navigate("/my-profile");
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        setFeedbackMessage("E-postadressen er allerede i bruk.");
      } else if (error.code === "auth/weak-password") {
        setFeedbackMessage("Passordet er for svakt.");
      } else {
        setFeedbackMessage("Noe gikk galt. Prøv igjen.");
        console.error(error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.registerWrapper}>
      <form className={styles.registerForm} noValidate onSubmit={handleSubmit}>
        <h1 className={styles.formHeader}>Opprett Konto</h1>

        {/* First Name */}
        <div className={styles.groupContainer}>
          <label htmlFor="firstName" className={styles.formLabel}>
            Fornavn *
          </label>
          <input
            type="text"
            name="firstName"
            id="firstName"
            className={styles.formInput}
            placeholder="Skriv inn fornavnet ditt"
            maxLength={50}
            value={formData.firstName}
            onChange={handleChange}
          />
          {validationErrors.firstName && (
            <p className={styles.errorMessage}>{validationErrors.firstName}</p>
          )}
        </div>

        {/* Last Name */}
        <div className={styles.groupContainer}>
          <label htmlFor="lastName" className={styles.formLabel}>
            Etternavn *
          </label>
          <input
            type="text"
            name="lastName"
            id="lastName"
            className={styles.formInput}
            placeholder="Skriv inn etternavnet ditt"
            maxLength={50}
            value={formData.lastName}
            onChange={handleChange}
          />
          {validationErrors.lastName && (
            <p className={styles.errorMessage}>{validationErrors.lastName}</p>
          )}
        </div>

        {/* Player ID */}
        <div className={styles.groupContainer}>
          <label
            htmlFor="playerId"
            className={styles.formLabel}
            title="Player ID er tildelt via Pokèmon Play!"
          >
            Player ID *
          </label>
          <input
            type="text"
            name="playerId"
            id="playerId"
            className={styles.formInput}
            placeholder="Kun tall — tildelt via Pokémon Play"
            maxLength={20}
            value={formData.playerId}
            onChange={handleChange}
          />
          {validationErrors.playerId && (
            <p className={styles.errorMessage}>{validationErrors.playerId}</p>
          )}
        </div>

        {/* Birth Year */}
        <div className={styles.groupContainer}>
          <label htmlFor="birthYear" className={styles.formLabel}>
            Fødselsår *
          </label>
          <input
            type="text"
            name="birthYear"
            id="birthYear"
            className={styles.formInput}
            placeholder="f.eks. 1995"
            maxLength={4}
            value={formData.birthYear}
            onChange={handleChange}
          />
          {validationErrors.birthYear && (
            <p className={styles.errorMessage}>{validationErrors.birthYear}</p>
          )}
        </div>

        {/* Email */}
        <div className={styles.groupContainer}>
          <label htmlFor="email" className={styles.formLabel}>
            E-post *
          </label>
          <input
            type="email"
            name="email"
            id="email"
            className={styles.formInput}
            placeholder="Skriv inn e-posten din"
            maxLength={100}
            value={formData.email}
            onChange={handleChange}
          />
          {validationErrors.email && (
            <p className={styles.errorMessage}>{validationErrors.email}</p>
          )}
        </div>

        {/* Phone Number */}
        <div className={styles.groupContainer}>
          <label htmlFor="phoneNumber" className={styles.formLabel}>
            Telefonnummer *
          </label>
          <input
            type="tel"
            name="phoneNumber"
            id="phoneNumber"
            className={styles.formInput}
            placeholder="Skriv inn telefonnummeret ditt"
            maxLength={20}
            value={formData.phoneNumber}
            onChange={handleChange}
          />
          {validationErrors.phoneNumber && (
            <p className={styles.errorMessage}>
              {validationErrors.phoneNumber}
            </p>
          )}
        </div>

        {/* Password */}
        <div className={styles.groupContainer}>
          <label htmlFor="password" className={styles.formLabel}>
            Passord *
          </label>
          <input
            type="password"
            name="password"
            id="password"
            className={styles.formInput}
            placeholder="Minst 6 tegn"
            value={formData.password}
            onChange={handleChange}
          />
          {validationErrors.password && (
            <p className={styles.errorMessage}>{validationErrors.password}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div className={styles.groupContainer}>
          <label htmlFor="confirmPassword" className={styles.formLabel}>
            Bekreft Passord *
          </label>
          <input
            type="password"
            name="confirmPassword"
            id="confirmPassword"
            className={styles.formInput}
            placeholder="Skriv inn passordet på nytt"
            value={formData.confirmPassword}
            onChange={handleChange}
          />
          {validationErrors.confirmPassword && (
            <p className={styles.errorMessage}>
              {validationErrors.confirmPassword}
            </p>
          )}
        </div>

        {feedbackMessage && (
          <div className={styles.groupContainer}>
            <p className={styles.errorMessage}>{feedbackMessage}</p>
          </div>
        )}

        <div className={styles.groupContainer}>
          <Button
            className={styles.submitButton}
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Oppretter konto..." : "Opprett Konto"}
          </Button>
        </div>

        <div className={styles.groupContainer}>
          <p className={styles.loginLink}>
            Har du allerede en konto?{" "}
            <button
              type="button"
              className={styles.loginLinkButton}
              onClick={() => navigate("/login")}
            >
              Logg inn her
            </button>
          </p>
        </div>
      </form>
    </div>
  );
};

export default Register;

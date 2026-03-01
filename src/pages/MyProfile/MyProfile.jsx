import React, { useEffect, useState } from "react";
import styles from "./MyProfile.module.css";
import Button from "../../components/Button/Button";
import { signOut } from "firebase/auth";
import { auth, database } from "../../firestoreConfig";
import { getAuthContext } from "../../context/authContext";
import { doc, getDoc, updateDoc } from "firebase/firestore";

const MyProfile = () => {
  const [userData, setUserData] = useState({
    firstName: "",
    lastName: "",
    playerId: "",
    phoneNumber: "",
    email: "",
    birthYear: "",
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const { user } = getAuthContext();

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.uid) return; // Stops if user hasn't loaded in

      try {
        const docRef = doc(database, "users", user.uid);
        const docSnap = await getDoc(docRef);
        const docData = docSnap.data();

        setUserData({
          firstName: docData.firstName || "",
          lastName: docData.lastName || "",
          playerId: docData.playerId || "",
          phoneNumber: docData.phoneNumber || "",
          email: docData.email || user.email || "",
          birthYear: docData.birthYear || "",
        });
      } catch (error) {
        console.log(error.message);
      }
    };

    fetchUserData();
  }, [user?.uid, user?.email]);

  useEffect(() => {
    if (!feedbackMessage) return;

    const timer = setTimeout(() => setFeedbackMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setValidationErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const errors = {};

    if (!userData.firstName.trim()) {
      errors.firstName = "Fornavn er påkrevd";
    }

    if (!userData.lastName.trim()) {
      errors.lastName = "Etternavn er påkrevd";
    }

    if (userData.playerId && !/^\d+$/.test(userData.playerId)) {
      errors.playerId = "Player ID må kun inneholde tall";
    }

    if (userData.birthYear && !/^\d{4}$/.test(userData.birthYear)) {
      errors.birthYear = "Fødselsår må være et 4-sifret år";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    try {
      const docRef = doc(database, "users", user.uid);
      await updateDoc(docRef, {
        firstName: userData.firstName,
        lastName: userData.lastName,
        playerId: userData.playerId,
        phoneNumber: userData.phoneNumber,
        email: userData.email,
        birthYear: userData.birthYear,
      });

      setFeedbackMessage("Profil oppdatert!");
      setIsEditMode(false);
    } catch (error) {
      console.log(error.message);
      setFeedbackMessage("Kunne ikke oppdatere profilen. Prøv igjen.");
    }
  };

  const handleCancel = () => {
    setIsEditMode(false);
    setValidationErrors({});
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <div className={styles.outerWrapper}>
      <div className={styles.profileContainer}>
        {!isEditMode ? (
          <>
            <h1>
              Velkommen Professor {userData.firstName} {userData.lastName}!
            </h1>
            <Button
              className={styles.logoutCornerButton}
              onClick={handleSignOut}
            >
              Logg Ut
            </Button>

            <div className={styles.infoSection}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Player ID:</span>
                <span className={styles.infoValue}>
                  {userData.playerId || "Ikke angitt"}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Email:</span>
                <span className={styles.infoValue}>
                  {userData.email || "Ikke angitt"}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Telefon:</span>
                <span className={styles.infoValue}>
                  {userData.phoneNumber || "Ikke angitt"}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Fødselsår:</span>
                <span className={styles.infoValue}>
                  {userData.birthYear || "Ikke angitt"}
                </span>
              </div>
            </div>

            <Button
              className={styles.editButton}
              onClick={() => setIsEditMode(true)}
            >
              Rediger Profil
            </Button>
          </>
        ) : (
          <form className={styles.editForm} noValidate onSubmit={handleSubmit}>
            <h2 className={styles.formHeader}>Rediger Profil</h2>

            <div className={styles.formGroup}>
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
                value={userData.firstName}
                onChange={handleChange}
              />
              {validationErrors.firstName && (
                <p className={styles.errorMessage}>
                  {validationErrors.firstName}
                </p>
              )}
            </div>

            <div className={styles.formGroup}>
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
                value={userData.lastName}
                onChange={handleChange}
              />
              {validationErrors.lastName && (
                <p className={styles.errorMessage}>
                  {validationErrors.lastName}
                </p>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="playerId" className={styles.label}>
                Player ID
              </label>
              <input
                type="text"
                name="playerId"
                id="playerId"
                className={styles.input}
                placeholder="Skriv inn Player ID"
                maxLength={20}
                value={userData.playerId}
                onChange={handleChange}
              />
              {validationErrors.playerId && (
                <p className={styles.errorMessage}>
                  {validationErrors.playerId}
                </p>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.label}>
                Email
              </label>
              <input
                type="email"
                name="email"
                id="email"
                className={styles.input}
                placeholder="Skriv inn email"
                maxLength={100}
                value={userData.email}
                onChange={handleChange}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="phoneNumber" className={styles.label}>
                Telefonnummer
              </label>
              <input
                type="tel"
                name="phoneNumber"
                id="phoneNumber"
                className={styles.input}
                placeholder="Skriv inn telefonnummer"
                maxLength={20}
                value={userData.phoneNumber}
                onChange={handleChange}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="birthYear" className={styles.label}>
                Fødselsår
              </label>
              <input
                type="text"
                name="birthYear"
                id="birthYear"
                className={styles.input}
                placeholder="Skriv inn fødselsår"
                maxLength={4}
                value={userData.birthYear}
                onChange={handleChange}
              />
              {validationErrors.birthYear && (
                <p className={styles.errorMessage}>
                  {validationErrors.birthYear}
                </p>
              )}
            </div>

            {feedbackMessage && (
              <div className={styles.feedbackContainer}>
                <p className={styles.feedbackMessage}>{feedbackMessage}</p>
              </div>
            )}

            <div className={styles.formButtonGroup}>
              <Button className={styles.submitButton} type="submit">
                Lagre
              </Button>
              <Button
                className={styles.cancelButton}
                type="button"
                onClick={handleCancel}
              >
                Avbryt
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default MyProfile;

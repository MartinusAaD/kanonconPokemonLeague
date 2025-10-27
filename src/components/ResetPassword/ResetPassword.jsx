import React, { useState } from "react";
import styles from "./ResetPassword.module.css";
import Button from "../Button/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firestoreConfig";

const ResetPassword = ({ setShowPasswordModal, setFeedbackMessage }) => {
  const [userData, setUserData] = useState({ email: "" });

  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData((prev) => ({ ...prev, [name]: value }));
  };

  const handleExit = () => {
    setShowPasswordModal(false);
    navigate("/login");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await sendPasswordResetEmail(auth, userData.email);
      setFeedbackMessage("Epost sendt! Husk å sjekk søppelpost...");
    } catch (error) {
      console.log("Error sending password reset", error.message);
      setFeedbackMessage(`Error: ${error.message}`);
    }

    navigate("/login");
  };
  return (
    <div className={styles.outerWrapper}>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <h1 className={styles.header}>Nullstill Passord</h1>
        <div className={styles.groupContainer}>
          <label htmlFor="email" className={styles.formLabel}>
            Email
          </label>
          <input
            type="email"
            name="email"
            id="email"
            className={styles.input}
            placeholder="Skriv inn eposten din"
            onChange={handleChange}
            value={userData.email}
          />
        </div>

        <div className={styles.groupContainer}>
          <p className={styles.paragraph}>
            Om eposten er gyldig, så får du tilsendt en epost med videre info.
          </p>
        </div>

        <div className={styles.groupContainer}>
          <Button className={styles.submitButton} type={"submit"}>
            Logg Inn
          </Button>
        </div>

        <Button className={styles.exitButton} onClick={handleExit}>
          <FontAwesomeIcon icon={faXmark} />
        </Button>
      </form>
    </div>
  );
};

export default ResetPassword;

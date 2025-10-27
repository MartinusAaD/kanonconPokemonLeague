import React, { useEffect, useState } from "react";
import styles from "./Login.module.css";
import Button from "../../components/Button/Button";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../../firestoreConfig";
import ResetPassword from "../../components/ResetPassword/ResetPassword";

const Login = () => {
  const [userData, setUserData] = useState({ email: "", password: "" });
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation().pathname;

  useEffect(() => {
    // Allows for previous/next page shortcut to default to the correct modal
    if (location === "/login") {
      setShowPasswordModal(false);
    } else {
      setShowPasswordModal(true);
    }
  }, [location]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        userData.email,
        userData.password
      );
      const user = userCredential.user;
      console.log("User successfully logged in!", user);

      navigate("/");
    } catch (error) {
      console.log(error.message);
      setFeedbackMessage("Fant ikke brukeren, prøv igjen!");
    }
  };

  const toggleResetPassword = () => {
    setShowPasswordModal(true);
    navigate("/reset-password");
  };

  return (
    <div className={styles.loginWrapper}>
      {!showPasswordModal && (
        <form className={styles.loginForm} noValidate onSubmit={handleSubmit}>
          <h1 className={styles.formHeader}>Logg Inn</h1>
          <div className={styles.groupContainer}>
            <label htmlFor="email" className={styles.formLabel}>
              Email
            </label>
            <input
              type="email"
              name="email"
              id="email"
              className={styles.formInput}
              placeholder="Skriv inn eposten din"
              onChange={handleChange}
              value={userData.email}
            />
          </div>
          <div className={styles.groupContainer}>
            <label htmlFor="password" className={styles.formLabel}>
              Passord
            </label>
            <input
              type="password"
              name="password"
              id="password"
              className={styles.formInput}
              placeholder="Skriv inn passordet ditt"
              onChange={handleChange}
              value={userData.password}
            />
          </div>
          {feedbackMessage && (
            <div className={styles.groupContainer}>
              <p className={styles.errorMessage}>{feedbackMessage}</p>
            </div>
          )}

          <div className={styles.groupContainer}>
            <Button className={styles.submitButton} type={"submit"}>
              Logg Inn
            </Button>
          </div>
          <div className={styles.groupContainer}>
            * Kun for Kanoncon Professorer.
          </div>
          <div className={styles.groupContainer}>
            <p>
              Glømt passord? Nullstill{" "}
              <Button
                className={styles.passwordResetButton}
                type={"button"}
                onClick={toggleResetPassword}
              >
                her!
              </Button>
            </p>
          </div>
        </form>
      )}

      {showPasswordModal && (
        <>
          <ResetPassword
            setShowPasswordModal={setShowPasswordModal}
            setFeedbackMessage={setFeedbackMessage}
          />
        </>
      )}
    </div>
  );
};

export default Login;

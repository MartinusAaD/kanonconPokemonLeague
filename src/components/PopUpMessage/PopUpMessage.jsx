import React from "react";
import styles from "./PopUpMessage.module.css";
import Button from "../Button/Button";

const PopUpMessage = ({ message, setShowPopUpMessage }) => {
  return (
    <div className={styles.outerWrapper}>
      <div className={styles.popUpMessageContainer}>
        <p className={styles.messageParagraph}>{message}</p>
        <Button
          className={styles.button}
          onClick={() => setShowPopUpMessage(false)}
        >
          Forstått
        </Button>
      </div>
    </div>
  );
};

export default PopUpMessage;

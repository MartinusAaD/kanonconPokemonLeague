import React from "react";
import styles from "./AddPlayer.module.css";
import PlayerForm from "../../components/PlayerForm/PlayerForm";

const AddPlayer = () => {
  return (
    <div className={styles.outerWrapper}>
      <PlayerForm />
    </div>
  );
};

export default AddPlayer;

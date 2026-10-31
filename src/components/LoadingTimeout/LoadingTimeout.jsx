import React from "react";
import styles from "./LoadingTimeout.module.css";
import Button from "../Button/Button";

// Shown when data hasn't arrived after a while (stalled mobile connection etc.)
const LoadingTimeout = () => (
  <div className={styles.container}>
    <p className={styles.message}>
      Det tar lengre tid enn vanlig å laste inn. Sjekk internettforbindelsen og prøv igjen.
    </p>
    <Button className={styles.retryButton} onClick={() => window.location.reload()}>
      Prøv igjen
    </Button>
  </div>
);

export default LoadingTimeout;

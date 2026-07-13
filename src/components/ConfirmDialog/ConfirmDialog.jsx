import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import styles from "./ConfirmDialog.module.css";

const ConfirmDialog = ({
  isOpen,
  message,
  onConfirm,
  onCancel,
  countdownSeconds = 0,
  danger = false,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);

  useEffect(() => {
    if (!isOpen) return;
    setSecondsLeft(countdownSeconds);
    if (countdownSeconds <= 0) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, countdownSeconds]);

  if (!isOpen) return null;

  const isCounting = secondsLeft > 0;

  return ReactDOM.createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.content}>
          <p className={styles.message}>{message}</p>
          <div className={styles.buttonContainer}>
            <button className={styles.cancelButton} onClick={onCancel}>
              Avbryt
            </button>
            <button
              className={`${styles.confirmButton} ${danger ? styles.confirmButtonDanger : ""}`}
              onClick={onConfirm}
              disabled={isCounting}
            >
              {isCounting ? `Bekreft (${secondsLeft})` : "Bekreft"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfirmDialog;

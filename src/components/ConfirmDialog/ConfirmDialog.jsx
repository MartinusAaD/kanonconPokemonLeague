import React from "react";
import ReactDOM from "react-dom";
import styles from "./ConfirmDialog.module.css";

const ConfirmDialog = ({ isOpen, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.content}>
          <p className={styles.message}>{message}</p>
          <div className={styles.buttonContainer}>
            <button className={styles.cancelButton} onClick={onCancel}>
              Avbryt
            </button>
            <button className={styles.confirmButton} onClick={onConfirm}>
              Bekreft
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfirmDialog;

import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import styles from "./Toast.module.css";

const Toast = ({ message, onClose, duration = 3000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return ReactDOM.createPortal(
    <div className={styles.toast}>{message}</div>,
    document.body
  );
};

export default Toast;

import React from "react";
import styles from "./Button.module.css";

const Button = ({
  children = "Click",
  onClick,
  className,
  disabled = false,
  ariaLabel,
  type,
}) => {
  return (
    <button
      className={`${styles.button} ${className}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      type={type}
    >
      <p>{children}</p>
    </button>
  );
};

export default Button;

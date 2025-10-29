import React from "react";
import styles from "./PageNotFound.module.css";

const PageNotFound = () => {
  return (
    <div className={styles.outerWrapper}>
      <div className={styles.container}>
        <h1 className={styles.header}>Denne siden finnes ikke ...</h1>
      </div>
    </div>
  );
};

export default PageNotFound;

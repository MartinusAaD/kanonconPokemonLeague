import { Link } from "react-router-dom";
import styles from "./AnnouncementBanner.module.css";

const AnnouncementBanner = () => {
  return (
    <div className={styles.bannerWrapper}>
      <div className={styles.bannerItem}>
        <span className={styles.label}>Nyhet</span>
        <p className={styles.message}>
          Nå kan du lage egen bruker for enklere påmelding til eventer,
          spesielt om du har ansvar for fleire!
        </p>

        <p className={styles.messageLink}>
          Registrer deg{"  "}
          <Link to={"/register"} className={styles.link}>
            her!
          </Link>
        </p>
      </div>
    </div>
  );
};

export default AnnouncementBanner;

import { useState } from "react";
import styles from "./SocialMedia.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons";
import {
  faFacebookF,
  faDiscord,
  faLinkedinIn,
} from "@fortawesome/free-brands-svg-icons";

const EMAIL = "kanonconpokemonleague@gmail.com";

const SocialMedia = ({ showLinkedIn, size = "default" }) => {
  const [copied, setCopied] = useState(false);

  const handleEmailClick = (e) => {
    e.preventDefault();
    navigator.clipboard.writeText(EMAIL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const containerClass = `${styles.socialMediaContainer} ${
    size === "large" ? styles.large : ""
  }`;

  return (
    <div className={containerClass}>
      <a
        href="https://www.facebook.com/groups/kanonconpokemonleague/"
        target="_blank"
        rel="noopener noreferrer"
        title="Facebook"
        className={`${styles.iconButton} ${styles.facebook}`}
      >
        <FontAwesomeIcon icon={faFacebookF} className={styles.icon}/>
      </a>

      <a
        href="https://discord.gg/XJbAatfbDn"
        target="_blank"
        rel="noopener noreferrer"
        title="Discord"
        className={`${styles.iconButton} ${styles.discord}`}
      >
        <FontAwesomeIcon icon={faDiscord} className={styles.icon}/>
      </a>

      <div className={styles.emailWrapper}>
        <a
          href={`mailto:${EMAIL}`}
          className={`${styles.iconButton} ${styles.email}`}
          aria-label="Kopier e-post"
          title="Kopier e-post"
          onClick={handleEmailClick}
        >
          <FontAwesomeIcon icon={faEnvelope} className={styles.icon}/>
        </a>
        {copied && <div className={styles.copiedBubble}>Kopiert!</div>}
      </div>

      {showLinkedIn && (
        <a
          href="https://www.linkedin.com/in/martinus-aamot-dahl/"
          target="_blank"
          rel="noopener noreferrer"
          title="LinkedIn"
          className={`${styles.iconButton} ${styles.linkedin}`}
        >
          <FontAwesomeIcon icon={faLinkedinIn} className={styles.icon}/>
        </a>
      )}
    </div>
  );
};

export default SocialMedia;

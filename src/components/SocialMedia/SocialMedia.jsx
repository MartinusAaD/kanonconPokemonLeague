import { useState } from "react";
import styles from "./SocialMedia.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons";

const EMAIL = "kanonconpokemonleague@gmail.com";

const SocialMedia = ({ showLinkedIn, variant = "light" }) => {
  const [copied, setCopied] = useState(false);
  const emailClass =
    variant === "dark" ? styles.emailLinkDark : styles.emailLinkLight;

  const handleEmailClick = (e) => {
    e.preventDefault();
    navigator.clipboard.writeText(EMAIL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className={styles.socialMediaContainer}>
      <a
        href="https://www.facebook.com/groups/kanonconpokemonleague/"
        target="_blank"
        title="Facebook"
      >
        <img src="/icons/facebook_logo.png" alt="Facebook Link Image" />
      </a>

      <a href="https://discord.gg/XJbAatfbDn" target="_blank" title="Discord">
        <img src="/icons/discord_logo.png" alt="Discord Link Image" />
      </a>

      <div className={styles.emailWrapper}>
        <a
          href={`mailto:${EMAIL}`}
          className={emailClass}
          aria-label="Kopier e-post"
          title="Kopier e-post"
          onClick={handleEmailClick}
        >
          <FontAwesomeIcon icon={faEnvelope} />
        </a>
        {copied && <div className={styles.copiedBubble}>Kopiert!</div>}
      </div>

      {showLinkedIn && (
        <a
          href="https://www.linkedin.com/in/martinus-aamot-dahl/"
          target="_blank"
          title="LinkedIn"
        >
          <img src="/icons/linkedIn_logo.png" alt="LinkedIn Link Image" />
        </a>
      )}
    </div>
  );
};

export default SocialMedia;

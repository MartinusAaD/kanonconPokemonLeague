import styles from "./SocialMedia.module.css";

const SocialMedia = ({ showLinkedIn }) => {
  return (
    <div className={styles.socialMediaContainer}>
      <a
        href="https://www.facebook.com/groups/kanonconpokemonleague/"
        target="_blank"
      >
        <img src="/icons/facebook_logo.png" alt="Facebook Link Image" />
      </a>

      <a href="https://discord.gg/XJbAatfbDn" target="_blank">
        <img src="/icons/discord_logo.png" alt="Discord Link Image" />
      </a>

      {showLinkedIn && (
        <a
          href="https://www.linkedin.com/in/martinus-aamot-dahl/"
          target="_blank"
        >
          <img src="/icons/linkedIn_logo.png" alt="LinkedIn Link Image" />
        </a>
      )}
    </div>
  );
};

export default SocialMedia;

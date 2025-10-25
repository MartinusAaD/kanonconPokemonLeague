import styles from "./SocialMedia.module.css";

const SocialMedia = () => {
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
    </div>
  );
};

export default SocialMedia;

import SocialMedia from "../SocialMedia/SocialMedia";
import styles from "./Footer.module.css";

const Footer = () => {
  return (
    <div className={styles.outerWrapper}>
      <div className={styles.container}>
        <p className={styles.paragraph}>
          © {new Date().getFullYear()} Martinus Aamot Dahl. All rights reserved.
        </p>
        <SocialMedia showLinkedIn={"true"} />
      </div>
    </div>
  );
};

export default Footer;

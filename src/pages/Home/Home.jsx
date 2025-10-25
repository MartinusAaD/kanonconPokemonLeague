import { useNavigate } from "react-router-dom";
import Button from "../../components/Button/Button";
import styles from "./Home.module.css";
import SocialMedia from "../../components/SocialMedia/SocialMedia";

const Home = () => {
  const navigate = useNavigate();
  return (
    <div className={styles.homeWrapper}>
      <div className={styles.homeContainer}>
        <h1 className={styles.header}>Velkommen!</h1>
        <img
          src="/public/images/Pokemon_League_Banner_Small.png"
          alt="Picture of Kanoncon Pokemon League Banner"
          className={styles.homeImage}
        />
        <Button
          className={styles.homeButton}
          onClick={() => navigate("/events")}
        >
          Sjekk ut Eventer!
        </Button>
        <SocialMedia />
      </div>
    </div>
  );
};

export default Home;

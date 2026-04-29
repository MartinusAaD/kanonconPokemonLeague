import { useNavigate } from "react-router-dom";
import Button from "../../components/Button/Button";
import FetchEvents from "../../components/FetchEvents/FetchEvents";
import styles from "./Home.module.css";
import SocialMedia from "../../components/SocialMedia/SocialMedia";
import { getAuthContext } from "../../context/authContext";

const Home = () => {
  const navigate = useNavigate();
  const { user } = getAuthContext();
  return (
    <div className={styles.homeWrapper}>
      <section className={styles.hero}>
        <img
          src="/images/Pokemon_League_Banner_Small.png"
          alt="Kanoncon Pokemon League"
          className={styles.heroBanner}
        />
        <SocialMedia variant="dark" />
      </section>

      <section className={styles.featuresGrid}>
        <div className={styles.featureCard}>
          <h2 className={styles.cardTitle}>Kommende Eventer</h2>
          <div className={styles.eventsContainer}>
            <FetchEvents status="active" limit={3} hideAdminControls />
          </div>
          <Button
            className={styles.cardButton}
            onClick={() => navigate("/events")}
          >
            Se alle eventer →
          </Button>
        </div>

        <div className={`${styles.featureCard} ${styles.deckCard}`}>
          <h2 className={styles.cardTitle}>Deck Builder</h2>
          <div className={styles.deckContent}>
            <p className={styles.deckDescription}>
              Bygg og lagre dine egne Pokemon-deck. Søk på kort, filtrer på sett
              og lovleghet — alt på ett sted.
            </p>
            
          </div>
          <Button
            className={`${styles.cardButton} ${styles.deckButton}`}
            onClick={() => navigate(user ? "/my-decklists" : "/deck-builder/new")}
          >
            Bygg deck →
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Home;

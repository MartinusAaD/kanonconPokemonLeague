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
      </section>

      <section className={styles.eventsSection}>
        <div className={`${styles.featureCard} ${styles.eventsCard}`}>
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
      </section>

      <section className={styles.featuresGrid}>
        <div className={`${styles.featureCard} ${styles.deckCard}`}>
          <h2 className={styles.cardTitle}>Deck Builder</h2>
          <div className={styles.deckContent}>
            <p className={styles.deckDescription}>
              Bygg og lagre dine egne Pokemon-deck. Søk på kort, filtrer på sett
              og importer rett inn i eventer! — alt på ett sted.
            </p>
          </div>
          <Button
            className={`${styles.cardButton} ${styles.deckButton}`}
            onClick={() => navigate(user ? "/my-decklists" : "/deck-builder/new")}
          >
            Bygg deck →
          </Button>
        </div>

        <div className={`${styles.featureCard} ${styles.socialCard}`}>
          <h2 className={styles.cardTitle}>Bli med i fellesskapet!</h2>
          <div className={styles.socialContent}>
            <p className={styles.socialDescription}>
              Følg oss for nyheter og oppdateringer, eller hopp inn på Discord
              for å prate med andre spillere.
            </p>
            <SocialMedia size="large" />
          </div>
        </div>
      </section>

      <section className={styles.professorsSection}>
        <div className={`${styles.featureCard} ${styles.professorsCard}`}>
          <h2 className={styles.cardTitle}>KanonCon Professorer</h2>
          <div className={styles.professorsGrid}>
            <div className={styles.professor}>
              <img
                src="/avatars/martinus-avatar.png"
                alt="Martinus"
                className={styles.professorAvatar}
              />
              <p className={styles.professorName}>Martinus</p>
            </div>
            <div className={styles.professor}>
              <img
                src="/avatars/tommy-avatar.png"
                alt="Tommy"
                className={styles.professorAvatar}
              />
              <p className={styles.professorName}>Tommy</p>
            </div>
            <div className={styles.professor}>
              <img
                src="/avatars/cathrine-avatar.png"
                alt="Cathrine"
                className={styles.professorAvatar}
              />
              <p className={styles.professorName}>Cathrine</p>
            </div>
            <div className={styles.professor}>
              <img
                src="/avatars/inger-avatar.png"
                alt="Inger"
                className={styles.professorAvatar}
              />
              <p className={styles.professorName}>Inger</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;

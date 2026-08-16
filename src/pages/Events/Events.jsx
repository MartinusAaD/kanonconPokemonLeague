import React from "react";
import styles from "./Events.module.css";
import Button from "../../components/Button/Button";
import { useNavigate } from "react-router-dom";
import FetchEvents from "../../components/FetchEvents/FetchEvents";
import { getAuthContext } from "../../context/authContext";
import SocialMedia from "../../components/SocialMedia/SocialMedia";

const Events = () => {
  const navigate = useNavigate();
  const { isAdmin } = getAuthContext();

  return (
    <div className={styles.eventsWrapper}>
      <div className={styles.eventsContainer}>
        {isAdmin && (
          <Button
            className={styles.createEventButton}
            onClick={() => navigate("create-event")}
          >
            Lag Nytt Event
          </Button>
        )}
        <SocialMedia />
        {/* Active Events */}
        <div className={styles.activeEventsContainer}>
          <h1>Aktive Eventer </h1>
          <FetchEvents status="active" />
        </div>

        {/* Expired / Inactive Events */}
        <div className={styles.expiredEventsContainer}>
          <h1>Utgåtte Eventer</h1>
          <FetchEvents status="inactive" />
        </div>
      </div>
    </div>
  );
};

export default Events;

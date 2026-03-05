import React, { useEffect, useState } from "react";
import styles from "./JoinEventForm.module.css";
import Button from "../Button/Button";
import { database } from "../../firestoreConfig";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useJoinEventFormValidation } from "../../hooks/useJoinEventFormValidation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { faExclamationCircle } from "@fortawesome/free-solid-svg-icons/faExclamationCircle";
import { getAuthContext } from "../../context/authContext";

// ─── Shared registration logic ───────────────────────────────────────────────

/**
 * Attempt to register a single player for an event.
 * Returns { success: boolean, message: string, alreadyRegistered?: boolean }
 */
const registerSinglePlayer = async (
  eventRef,
  playerData,
  maxPlayers,
  isMaxReached,
) => {
  const { playerId, firstName, lastName, birthYear, emailPhoneNumber } =
    playerData;

  // Upsert player document
  const playersRef = collection(database, "players");
  const playerQuery = query(playersRef, where("playerId", "==", playerId));
  const playerSnap = await getDocs(playerQuery);

  if (playerSnap.empty) {
    await addDoc(playersRef, {
      playerId,
      firstName,
      lastName,
      birthYear,
      emailPhoneNumber: emailPhoneNumber ?? "",
      joinedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(playerSnap.docs[0].ref, {
      firstName,
      lastName,
      birthYear,
      emailPhoneNumber: emailPhoneNumber ?? "",
    });
  }

  // Check if already registered
  const activeRef = collection(eventRef, "activePlayersList");
  const waitlistRef = collection(eventRef, "waitListedPlayers");
  const [activeSnap, waitSnap] = await Promise.all([
    getDocs(query(activeRef, where("playerId", "==", playerId))),
    getDocs(query(waitlistRef, where("playerId", "==", playerId))),
  ]);

  if (!activeSnap.empty || !waitSnap.empty) {
    return {
      success: false,
      alreadyRegistered: true,
      message: `${firstName} ${lastName} er allerede påmeldt dette eventet.`,
    };
  }

  const activeCountSnap = await getDocs(activeRef);
  const activeCount = activeCountSnap.size;

  if (activeCount < maxPlayers && !isMaxReached) {
    await addDoc(activeRef, { playerId, joinedAt: serverTimestamp() });

    if (activeCount + 1 >= maxPlayers) {
      await updateDoc(eventRef, { "eventData.maxPlayerCountReached": true });
      isMaxReached = true; // update local flag for subsequent players in same batch
    }

    return {
      success: true,
      active: true,
      message: `${firstName} ${lastName} er påmeldt som aktiv spiller!`,
      isMaxReachedNow: activeCount + 1 >= maxPlayers,
    };
  } else {
    await addDoc(waitlistRef, { playerId, joinedAt: serverTimestamp() });
    return {
      success: true,
      active: false,
      message: `${firstName} ${lastName} ble lagt til i ventelisten.`,
    };
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

const JoinEventForm = ({
  id,
  eventData,
  setShowPopUpMessage,
  setPopUpMessage,
}) => {
  const { user, isPlayer } = getAuthContext();
  const isLoggedIn = !!user;

  // ── Manual form state (guests / admins) ──
  const [formData, setFormData] = useState({
    playerId: "",
    firstName: "",
    lastName: "",
    birthYear: "",
    emailPhoneNumber: "",
  });
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const { validationErrors, setValidationErrors, validate } =
    useJoinEventFormValidation();

  // ── Player selector state (logged-in players) ──
  const [accountPlayers, setAccountPlayers] = useState([]); // [{...userData}, ...familyMembers]
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [selectedPlayers, setSelectedPlayers] = useState([]); // ordered selection
  const [isSubmittingSelector, setIsSubmittingSelector] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = setTimeout(() => setFeedbackMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  // Fetch account players when logged in as player
  useEffect(() => {
    if (!isLoggedIn || !user?.uid) return;

    const fetchAccountPlayers = async () => {
      try {
        // Fetch user profile
        const userDocSnap = await getDoc(doc(database, "users", user.uid));
        const userData = userDocSnap.exists() ? userDocSnap.data() : {};

        const list = [
          {
            id: "self",
            firstName: userData.firstName ?? "",
            lastName: userData.lastName ?? "",
            playerId: userData.playerId ?? "",
            birthYear: userData.birthYear ?? "",
            emailPhoneNumber: userData.phoneNumber ?? "",
            isSelf: true,
          },
        ];

        // Fetch family members
        const fmSnap = await getDocs(
          collection(database, "users", user.uid, "familyMembers"),
        );
        fmSnap.docs.forEach((d) => {
          const fm = d.data();
          list.push({
            id: d.id,
            firstName: fm.firstName ?? "",
            lastName: fm.lastName ?? "",
            playerId: fm.playerId ?? "",
            birthYear: fm.birthYear ?? "",
            emailPhoneNumber: "",
            isSelf: false,
          });
        });

        setAccountPlayers(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPlayers(false);
      }
    };

    fetchAccountPlayers();
  }, [isLoggedIn, user?.uid]);

  // ─── Manual form handlers ─────────────────────────────────────────────────

  const resetForm = () => {
    setFormData({
      playerId: "",
      firstName: "",
      lastName: "",
      birthYear: "",
      emailPhoneNumber: "",
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setValidationErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handlePlayerSearch = async () => {
    try {
      const playersRef = collection(database, "players");
      const q = query(playersRef, where("playerId", "==", formData.playerId));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        console.log("No player with said ID found");
        return;
      }

      const player = snapshot.docs[0].data();
      setFormData({
        playerId: player.playerId ?? "",
        firstName: player.firstName ?? "",
        lastName: player.lastName ?? "",
        birthYear: player.birthYear ?? "",
        emailPhoneNumber: player.emailPhoneNumber ?? "",
      });
      setValidationErrors({});
    } catch (error) {
      console.error(error.message);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (validate(formData).length > 0) return;

    try {
      const eventRef = doc(database, "events", id);
      const eventSnap = await getDoc(eventRef);

      if (!eventSnap.exists()) {
        setFeedbackMessage("Eventet finnes ikke.");
        return;
      }

      const eventDataFromDB = eventSnap.data().eventData;
      const maxPlayers = Number(eventDataFromDB.maxPlayerCount);
      const isMaxReached = eventDataFromDB.maxPlayerCountReached;

      const result = await registerSinglePlayer(
        eventRef,
        { ...formData, emailPhoneNumber: formData.emailPhoneNumber },
        maxPlayers,
        isMaxReached,
      );

      if (result.alreadyRegistered) {
        setPopUpMessage(result.message);
        setShowPopUpMessage(true);
        return;
      }

      setPopUpMessage(result.message);
      setShowPopUpMessage(true);
      resetForm();
    } catch (error) {
      console.error("Error joining event:", error);
      setFeedbackMessage("Noe gikk galt, prøv igjen.");
    }
  };

  // ─── Selector handlers ────────────────────────────────────────────────────

  const togglePlayerSelection = (player) => {
    setSelectedPlayers((prev) => {
      const alreadySelected = prev.some((p) => p.id === player.id);
      if (alreadySelected) {
        return prev.filter((p) => p.id !== player.id);
      }
      return [...prev, player];
    });
  };

  const getSelectionOrder = (playerId) => {
    const idx = selectedPlayers.findIndex((p) => p.id === playerId);
    return idx === -1 ? null : idx + 1;
  };

  const handleSelectorSubmit = async (e) => {
    e.preventDefault();
    if (selectedPlayers.length === 0) return;

    setIsSubmittingSelector(true);
    const messages = [];

    try {
      const eventRef = doc(database, "events", id);
      const eventSnap = await getDoc(eventRef);

      if (!eventSnap.exists()) {
        setPopUpMessage("Eventet finnes ikke.");
        setShowPopUpMessage(true);
        return;
      }

      let eventDataFromDB = eventSnap.data().eventData;
      let maxPlayers = Number(eventDataFromDB.maxPlayerCount);
      let isMaxReached = eventDataFromDB.maxPlayerCountReached;

      for (const player of selectedPlayers) {
        const result = await registerSinglePlayer(
          eventRef,
          player,
          maxPlayers,
          isMaxReached,
        );

        messages.push(result.message);

        // Re-fetch maxReached flag after each registration to stay in sync
        if (result.isMaxReachedNow) {
          isMaxReached = true;
        }
      }

      setPopUpMessage(messages.join("\n"));
      setShowPopUpMessage(true);
      setSelectedPlayers([]);
    } catch (error) {
      console.error("Error joining event:", error);
      setFeedbackMessage("Noe gikk galt, prøv igjen.");
    } finally {
      setIsSubmittingSelector(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  // Logged-in player: show selector UI
  if (isLoggedIn) {
    return (
      <div className={styles.createEventWrapper}>
        <div className={styles.formContainer}>
          {/* ── Card selector ── */}
          <form
            className={styles.form}
            noValidate
            onSubmit={handleSelectorSubmit}
          >
            <fieldset className={styles.fieldset}>
              <legend className={styles.selectorLegend}>
                Velg hvem som skal melde seg på
              </legend>
              <p className={styles.selectorHint}>
                Trykk på et kort for å velge. Nummeret viser
                påmeldingsrekkefølgen.
              </p>

              {loadingPlayers ? (
                <div className={styles.playerCardGrid}>
                  {[1].map((i) => (
                    <div key={i} className={styles.skeletonPlayerCard}>
                      <div className={styles.skeletonBadge} />
                      <div className={styles.skeletonCardInfo}>
                        <div
                          className={`${styles.skeletonLine} ${styles.skeletonName}`}
                        />
                        <div
                          className={`${styles.skeletonLine} ${styles.skeletonMeta}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`${styles.playerCardGrid} ${styles.fadeIn}`}>
                  {accountPlayers.map((player) => {
                    const order = getSelectionOrder(player.id);
                    const isSelected = order !== null;
                    return (
                      <div
                        key={player.id}
                        className={`${styles.playerCard} ${isSelected ? styles.playerCardSelected : ""}`}
                        onClick={() => togglePlayerSelection(player)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ")
                            togglePlayerSelection(player);
                        }}
                      >
                        <div className={styles.playerCardBadge}>
                          {isSelected ? order : ""}
                        </div>
                        <div className={styles.playerCardInfo}>
                          <p className={styles.playerCardName}>
                            {player.firstName} {player.lastName}
                          </p>
                          <div className={styles.playerCardMeta}>
                            <span>ID: {player.playerId || "Ikke satt"}</span>
                            <span className={styles.playerCardMetaDash}>·</span>
                            <span>Født: {player.birthYear}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {feedbackMessage && (
                <div className={styles.feedbackContainer}>
                  <h2 className={styles.feedbackMessage}>{feedbackMessage}</h2>
                </div>
              )}

              <div className={styles.groupContainer}>
                <Button
                  className={styles.submitButton}
                  type="submit"
                  disabled={
                    selectedPlayers.length === 0 || isSubmittingSelector
                  }
                >
                  {isSubmittingSelector
                    ? "Melder på..."
                    : `Meld på (${selectedPlayers.length} valgt)`}
                </Button>
              </div>
            </fieldset>
          </form>

          {/* ── Legg til andre ── */}
          <div className={styles.addOtherSection}>
            <button
              type="button"
              className={styles.addOtherButton}
              onClick={() => setShowManualForm((prev) => !prev)}
            >
              {showManualForm ? "Lukk" : "+ Legg til andre"}
            </button>
          </div>

          {showManualForm && (
            <form
              className={styles.form}
              noValidate
              onSubmit={handleManualSubmit}
            >
              <fieldset className={styles.fieldset}>
                {/* Player ID */}
                <div className={styles.groupContainer}>
                  <label
                    htmlFor="playerId"
                    className={styles.label}
                    title="Player ID er tildelt via Pokèmon Play!"
                  >
                    Player ID *
                  </label>
                  <div className={styles.searchBarContainer}>
                    <input
                      type="text"
                      name="playerId"
                      id="playerId"
                      className={styles.input}
                      placeholder="Kan søke om du har spilt hoss oss før"
                      maxLength={20}
                      value={formData.playerId}
                      onChange={handleChange}
                    />
                    <Button
                      className={styles.searchButton}
                      type="button"
                      onClick={handlePlayerSearch}
                    >
                      <FontAwesomeIcon icon={faMagnifyingGlass} />
                    </Button>
                  </div>
                  <p className={styles.errorMessage}>
                    {validationErrors.playerId && (
                      <>
                        <FontAwesomeIcon
                          icon={faExclamationCircle}
                          className={styles.errorIcon}
                        />{" "}
                        {validationErrors.playerId}
                      </>
                    )}
                  </p>
                </div>

                {/* First Name */}
                <div className={styles.groupContainer}>
                  <label htmlFor="firstName" className={styles.label}>
                    Fornavn *
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    id="firstName"
                    className={styles.input}
                    placeholder="John"
                    maxLength={50}
                    value={formData.firstName}
                    onChange={handleChange}
                  />
                  <p className={styles.errorMessage}>
                    {validationErrors.firstName && (
                      <>
                        <FontAwesomeIcon
                          icon={faExclamationCircle}
                          className={styles.errorIcon}
                        />{" "}
                        {validationErrors.firstName}
                      </>
                    )}
                  </p>
                </div>

                {/* Last Name */}
                <div className={styles.groupContainer}>
                  <label htmlFor="lastName" className={styles.label}>
                    Etternavn *
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    id="lastName"
                    className={styles.input}
                    placeholder="Doe"
                    maxLength={50}
                    value={formData.lastName}
                    onChange={handleChange}
                  />
                  <p className={styles.errorMessage}>
                    {validationErrors.lastName && (
                      <>
                        <FontAwesomeIcon
                          icon={faExclamationCircle}
                          className={styles.errorIcon}
                        />{" "}
                        {validationErrors.lastName}
                      </>
                    )}
                  </p>
                </div>

                {/* Birth Year */}
                <div className={styles.groupContainer}>
                  <label htmlFor="birthYear" className={styles.label}>
                    Fødselsår *
                  </label>
                  <input
                    type="text"
                    name="birthYear"
                    id="birthYear"
                    className={styles.input}
                    placeholder="YYYY"
                    maxLength={4}
                    value={formData.birthYear}
                    onChange={handleChange}
                  />
                  <p className={styles.errorMessage}>
                    {validationErrors.birthYear && (
                      <>
                        <FontAwesomeIcon
                          icon={faExclamationCircle}
                          className={styles.errorIcon}
                        />{" "}
                        {validationErrors.birthYear}
                      </>
                    )}
                  </p>
                </div>

                {/* Email / Phone */}
                <div className={styles.groupContainer}>
                  <label htmlFor="emailPhoneNumber" className={styles.label}>
                    Epost og/eller Mobil *
                  </label>
                  <input
                    type="text"
                    name="emailPhoneNumber"
                    id="emailPhoneNumber"
                    className={styles.input}
                    placeholder="Skriv inn ønsket kontakt metode"
                    maxLength={50}
                    value={formData.emailPhoneNumber}
                    onChange={handleChange}
                  />
                  <p className={styles.errorMessage}>
                    {validationErrors.emailPhoneNumber && (
                      <>
                        <FontAwesomeIcon
                          icon={faExclamationCircle}
                          className={styles.errorIcon}
                        />{" "}
                        {validationErrors.emailPhoneNumber}
                      </>
                    )}
                  </p>
                </div>

                {/* Submit */}
                <div className={styles.groupContainer}>
                  <Button className={styles.submitButton} type="submit">
                    Send Inn
                  </Button>
                </div>

                {feedbackMessage && (
                  <div className={styles.feedbackContainer}>
                    <h2 className={styles.feedbackMessage}>
                      {feedbackMessage}
                    </h2>
                  </div>
                )}
              </fieldset>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Guest / admin: show manual form
  return (
    <div className={styles.createEventWrapper}>
      <div className={styles.formContainer}>
        <form className={styles.form} noValidate onSubmit={handleManualSubmit}>
          <fieldset className={styles.fieldset}>
            {/* Player ID */}
            <div className={styles.groupContainer}>
              <label
                htmlFor="playerId"
                className={styles.label}
                title="Player ID er tildelt via Pokèmon Play!"
              >
                Player ID *
              </label>
              <div className={styles.searchBarContainer}>
                <input
                  type="text"
                  name="playerId"
                  id="playerId"
                  className={styles.input}
                  placeholder="Kan søke om du har spilt hoss oss før"
                  maxLength={20}
                  value={formData.playerId}
                  onChange={handleChange}
                  title="Kan kun inneholde tall"
                />
                <Button
                  className={styles.searchButton}
                  type="button"
                  onClick={handlePlayerSearch}
                >
                  <FontAwesomeIcon icon={faMagnifyingGlass} />
                </Button>
              </div>
              <p className={styles.errorMessage}>
                {validationErrors.playerId && (
                  <>
                    <FontAwesomeIcon
                      icon={faExclamationCircle}
                      className={styles.errorIcon}
                    />{" "}
                    {validationErrors.playerId}
                  </>
                )}
              </p>
            </div>

            {/* First Name */}
            <div className={styles.groupContainer}>
              <label htmlFor="firstName" className={styles.label}>
                Fornavn *
              </label>
              <input
                type="text"
                name="firstName"
                id="firstName"
                className={styles.input}
                placeholder="John"
                maxLength={50}
                value={formData.firstName}
                onChange={handleChange}
              />
              <p className={styles.errorMessage}>
                {validationErrors.firstName && (
                  <>
                    <FontAwesomeIcon
                      icon={faExclamationCircle}
                      className={styles.errorIcon}
                    />{" "}
                    {validationErrors.firstName}
                  </>
                )}
              </p>
            </div>

            {/* Last Name */}
            <div className={styles.groupContainer}>
              <label htmlFor="lastName" className={styles.label}>
                Etternavn *
              </label>
              <input
                type="text"
                name="lastName"
                id="lastName"
                className={styles.input}
                placeholder="Doe"
                maxLength={50}
                value={formData.lastName}
                onChange={handleChange}
              />
              <p className={styles.errorMessage}>
                {validationErrors.lastName && (
                  <>
                    <FontAwesomeIcon
                      icon={faExclamationCircle}
                      className={styles.errorIcon}
                    />{" "}
                    {validationErrors.lastName}
                  </>
                )}
              </p>
            </div>

            {/* Birth Year */}
            <div className={styles.groupContainer}>
              <label htmlFor="birthYear" className={styles.label}>
                Fødselsår *
              </label>
              <input
                type="text"
                name="birthYear"
                id="birthYear"
                className={styles.input}
                placeholder="YYYY"
                maxLength={4}
                value={formData.birthYear}
                onChange={handleChange}
              />
              <p className={styles.errorMessage}>
                {validationErrors.birthYear && (
                  <>
                    <FontAwesomeIcon
                      icon={faExclamationCircle}
                      className={styles.errorIcon}
                    />{" "}
                    {validationErrors.birthYear}
                  </>
                )}
              </p>
            </div>

            {/* Email / Phone */}
            <div className={styles.groupContainer}>
              <label htmlFor="emailPhoneNumber" className={styles.label}>
                Epost og/eller Mobil *
              </label>
              <input
                type="text"
                name="emailPhoneNumber"
                id="emailPhoneNumber"
                className={styles.input}
                placeholder="Skriv inn ønsket kontakt metode"
                maxLength={50}
                value={formData.emailPhoneNumber}
                onChange={handleChange}
              />
              <p className={styles.errorMessage}>
                {validationErrors.emailPhoneNumber && (
                  <>
                    <FontAwesomeIcon
                      icon={faExclamationCircle}
                      className={styles.errorIcon}
                    />{" "}
                    {validationErrors.emailPhoneNumber}
                  </>
                )}
              </p>
            </div>

            {/* Submit */}
            <div className={styles.groupContainer}>
              <Button className={styles.submitButton} type="submit">
                Send Inn
              </Button>
            </div>

            {/* Feedback */}
            {feedbackMessage && (
              <div className={styles.feedbackContainer}>
                <h2 className={styles.feedbackMessage}>{feedbackMessage}</h2>
              </div>
            )}
          </fieldset>
        </form>
      </div>
    </div>
  );
};

export default JoinEventForm;

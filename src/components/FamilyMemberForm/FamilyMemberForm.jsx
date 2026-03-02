import React, { useState } from "react";
import styles from "./FamilyMemberForm.module.css";
import Button from "../Button/Button";
import { collection, getDocs, query, where } from "firebase/firestore";
import { database } from "../../firestoreConfig";

const FamilyMemberForm = ({
  initialData = null,
  currentUid,
  onSave,
  onCancel,
  isSaving,
}) => {
  const [formData, setFormData] = useState({
    firstName: initialData?.firstName ?? "",
    lastName: initialData?.lastName ?? "",
    playerId: initialData?.playerId ?? "",
    birthYear: initialData?.birthYear ?? "",
  });
  const [errors, setErrors] = useState({});

  const isEditMode = initialData !== null;

  const validate = () => {
    const e = {};
    if (!formData.firstName.trim()) e.firstName = "Fornavn er påkrevd";
    if (!formData.lastName.trim()) e.lastName = "Etternavn er påkrevd";
    if (!formData.playerId.trim()) {
      e.playerId = "Player ID er påkrevd";
    } else if (!/^\d+$/.test(formData.playerId.trim())) {
      e.playerId = "Player ID må kun inneholde tall";
    }
    if (!formData.birthYear.trim()) {
      e.birthYear = "Fødselsår er påkrevd";
    } else if (!/^\d{4}$/.test(formData.birthYear.trim())) {
      e.birthYear = "Fødselsår må være et 4-sifret årstall";
    }
    setErrors(e);
    return e;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) return;

    const newPlayerId = formData.playerId.trim();
    const oldPlayerId = initialData?.playerId ?? null;

    // Only check claim if player ID is being changed (or it's a new entry)
    if (newPlayerId !== oldPlayerId) {
      try {
        const playersRef = collection(database, "players");
        const claimSnap = await getDocs(
          query(playersRef, where("playerId", "==", newPlayerId)),
        );

        const claimedByOther = claimSnap.docs.some((d) => {
          const data = d.data();
          const uid = data.claimedByUid;
          if (!uid) return false;
          if (uid !== currentUid) return true; // claimed by a different user
          // Same user — block if it's claimed as any family member
          return data.claimedByFamilyMemberId != null;
        });

        if (claimedByOther) {
          setErrors((prev) => ({
            ...prev,
            playerId: "Denne Player ID-en er allerede tatt",
          }));
          return;
        }
      } catch (err) {
        console.error(err);
        return;
      }
    }

    onSave({
      ...formData,
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      playerId: newPlayerId,
      birthYear: formData.birthYear.trim(),
      oldPlayerId,
    });
  };

  return (
    <form className={styles.form} noValidate onSubmit={handleSubmit}>
      <h3 className={styles.formHeader}>
        {isEditMode ? "Rediger Familiemedlem" : "Legg til Familiemedlem"}
      </h3>

      <div className={styles.formGroup}>
        <label htmlFor="fm-firstName" className={styles.label}>
          Fornavn *
        </label>
        <input
          type="text"
          name="firstName"
          id="fm-firstName"
          className={styles.input}
          placeholder="Skriv inn fornavn"
          maxLength={50}
          value={formData.firstName}
          onChange={handleChange}
        />
        {errors.firstName && (
          <p className={styles.errorMessage}>{errors.firstName}</p>
        )}
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="fm-lastName" className={styles.label}>
          Etternavn *
        </label>
        <input
          type="text"
          name="lastName"
          id="fm-lastName"
          className={styles.input}
          placeholder="Skriv inn etternavn"
          maxLength={50}
          value={formData.lastName}
          onChange={handleChange}
        />
        {errors.lastName && (
          <p className={styles.errorMessage}>{errors.lastName}</p>
        )}
      </div>

      <div className={styles.formGroup}>
        <label
          htmlFor="fm-playerId"
          className={styles.label}
          title="Player ID er tildelt via Pokèmon Play!"
        >
          Player ID *
        </label>
        <input
          type="text"
          name="playerId"
          id="fm-playerId"
          className={styles.input}
          placeholder="Kun tall — tildelt via Pokémon Play"
          maxLength={20}
          value={formData.playerId}
          onChange={handleChange}
        />
        {errors.playerId && (
          <p className={styles.errorMessage}>{errors.playerId}</p>
        )}
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="fm-birthYear" className={styles.label}>
          Fødselsår *
        </label>
        <input
          type="text"
          name="birthYear"
          id="fm-birthYear"
          className={styles.input}
          placeholder="f.eks. 2015"
          maxLength={4}
          value={formData.birthYear}
          onChange={handleChange}
        />
        {errors.birthYear && (
          <p className={styles.errorMessage}>{errors.birthYear}</p>
        )}
      </div>

      <div className={styles.buttonGroup}>
        <Button className={styles.saveButton} type="submit" disabled={isSaving}>
          {isSaving ? "Lagrer..." : "Lagre"}
        </Button>
        <Button
          className={styles.cancelButton}
          type="button"
          onClick={onCancel}
          disabled={isSaving}
        >
          Avbryt
        </Button>
      </div>
    </form>
  );
};

export default FamilyMemberForm;

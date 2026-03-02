import { useState } from "react";

export const useRegisterValidation = () => {
  const [validationErrors, setValidationErrors] = useState({});

  const validate = (formData) => {
    const errors = {};

    if (!formData.firstName.trim()) {
      errors.firstName = "Fornavn er påkrevd";
    }

    if (!formData.lastName.trim()) {
      errors.lastName = "Etternavn er påkrevd";
    }

    if (!formData.playerId.trim()) {
      errors.playerId = "Player ID er påkrevd";
    } else if (!/^\d+$/.test(formData.playerId.trim())) {
      errors.playerId = "Player ID må kun inneholde tall";
    }

    if (!formData.birthYear.trim()) {
      errors.birthYear = "Fødselsår er påkrevd";
    } else if (!/^\d{4}$/.test(formData.birthYear.trim())) {
      errors.birthYear = "Fødselsår må være et 4-sifret årstall";
    }

    if (!formData.email.trim()) {
      errors.email = "E-post er påkrevd";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = "Ugyldig e-postadresse";
    }

    if (!formData.phoneNumber.trim()) {
      errors.phoneNumber = "Telefonnummer er påkrevd";
    }

    if (!formData.password) {
      errors.password = "Passord er påkrevd";
    } else if (formData.password.length < 6) {
      errors.password = "Passordet må være minst 6 tegn";
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = "Bekreft passordet";
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Passordene stemmer ikke overens";
    }

    setValidationErrors(errors);
    return errors;
  };

  return { validationErrors, setValidationErrors, validate };
};

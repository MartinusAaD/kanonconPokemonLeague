import { useState } from "react";

export const useJoinEventFormValidation = () => {
  const [validationErrors, setValidationErrors] = useState({});

  const validate = (values) => {
    let newErrors = {};

    // Player ID
    if (!values.playerId?.trim()) {
      newErrors.playerId = "Player ID mangler.";
    }

    // First Name
    if (!values.firstName?.trim()) {
      newErrors.firstName = "Fornavnet ditt mangler.";
    }

    // Last Name
    if (!values.lastName?.trim()) {
      newErrors.lastName = "Etternavnet ditt mangler.";
    }

    // Birth Year
    if (!values.birthYear?.trim()) {
      newErrors.birthYear = "Fødselsåret ditt mangler.";
    } else if (values.birthYear?.length !== 4) {
      newErrors.birthYear = "Fødselsåret ditt skal bestå av 4 tall!";
    }

    // Email / Phone Number
    if (!values.emailPhoneNumber?.trim()) {
      newErrors.emailPhoneNumber =
        "Email og/eller Telefon nummer er nødvendig.";
    }

    setValidationErrors(newErrors);
    return Object.keys(newErrors);
  };

  return { validationErrors, setValidationErrors, validate };
};

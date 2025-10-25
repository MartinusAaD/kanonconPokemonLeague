import { useState } from "react";

export const useEventCreateValidation = () => {
  const [validationErrors, setValidationErrors] = useState({});

  const validate = (values) => {
    let newErrors = {};

    // Event Title
    if (!values.eventTitle?.trim()) {
      newErrors.eventTitle = "Eventets Tittel mangler.";
    }

    // Event Type
    if (!values.typeOfEvent?.trim()) {
      newErrors.typeOfEvent = "Eventets Type mangler.";
    }

    // Event Date
    if (!values.eventDate?.trim()) {
      newErrors.eventDate = "Eventets Dato mangler.";
    }

    // maxPlayerCount
    if (!values.maxPlayerCount?.trim()) {
      newErrors.maxPlayerCount = "Maks antall spillere er ikke satt.";
    } else if (isNaN(values.maxPlayerCount)) {
      newErrors.maxPlayerCount = "Maks antall spillere må være eit tall.";
    } else if (Number(values.maxPlayerCount) <= 0) {
      newErrors.maxPlayerCount = "Maks antall spillere må være større enn 0.";
    }

    setValidationErrors(newErrors);
    return Object.keys(newErrors);
  };

  return { validationErrors, setValidationErrors, validate };
};

import { useState } from "react";

const REGULAR_TIME_EVENT_TYPES = ["casual", "casualTrade", "tradeDay"];
const REGISTRATION_TIME_EVENT_TYPES = [
  "preRelease",
  "leagueChallenge",
  "leagueCup",
];

export const useEventCreateValidation = () => {
  const [validationErrors, setValidationErrors] = useState({});

  const validate = (values, skipMaxPlayerCount = false) => {
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

    // Event Times
    if (REGULAR_TIME_EVENT_TYPES.includes(values.typeOfEvent)) {
      if (!values.startTime?.trim()) {
        newErrors.startTime = "Fra klokkeslett mangler.";
      }
      if (!values.endTime?.trim()) {
        newErrors.endTime = "Til klokkeslett mangler.";
      }
    } else if (REGISTRATION_TIME_EVENT_TYPES.includes(values.typeOfEvent)) {
      if (!values.registrationTime?.trim()) {
        newErrors.registrationTime = "Registreringstidspunkt mangler.";
      }
      if (!values.startTime?.trim()) {
        newErrors.startTime = "Event-start mangler.";
      }
    }

    // maxPlayerCount
    if (!skipMaxPlayerCount) {
      if (!values.maxPlayerCount?.trim()) {
        newErrors.maxPlayerCount = "Maks antall spillere er ikke satt.";
      } else if (isNaN(values.maxPlayerCount)) {
        newErrors.maxPlayerCount = "Maks antall spillere må være eit tall.";
      } else if (Number(values.maxPlayerCount) <= 0) {
        newErrors.maxPlayerCount = "Maks antall spillere må være større enn 0.";
      }
    }

    setValidationErrors(newErrors);
    return Object.keys(newErrors);
  };

  return { validationErrors, setValidationErrors, validate };
};

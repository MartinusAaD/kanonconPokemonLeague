import React from "react";
import styles from "./EditButton.module.css";
import Button from "../Button/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";

const EditButton = ({ id, documentType }) => {
  const navigate = useNavigate();

  const handleEdit = (e) => {
    e.preventDefault();
    switch (documentType) {
      case "EVENT":
        navigate(`/events/edit-event/${id}`);
        break;

      case "PLAYER":
        navigate(`/event/edit-player/${id}`);
        break;

      default:
        break;
    }
  };

  return (
    <Button className={styles.editButton} onClick={handleEdit}>
      <FontAwesomeIcon icon={faPenToSquare} />
    </Button>
  );
};

export default EditButton;

import React from "react";
import styles from "./DeleteButton.module.css";
import Button from "../Button/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { arrayRemove, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { database } from "../../firestoreConfig";

const DeleteButton = ({ collectionName, id, isDocument, playerData }) => {
  const handleDelete = async (e) => {
    e.preventDefault();

    const confirmDelete = window.confirm(
      "Er du sikker på at du vil slette denne?"
    );
    if (!confirmDelete) return;

    if (isDocument) {
      try {
        await deleteDoc(doc(database, collectionName, id));
      } catch (error) {
        console.error("Error deleting document", error.message);
      }
    } else {
      try {
        const eventRef = doc(database, collectionName, id);
        await updateDoc(eventRef, {
          "eventData.activePlayersList": arrayRemove(playerData),
          "eventData.waitListedPlayers": arrayRemove(playerData),
        });
      } catch (error) {
        console.error("Error deleting player", error.message);
      }
    }
  };
  return (
    <Button className={`${styles.deleteButton}`} onClick={handleDelete}>
      <FontAwesomeIcon icon={faTrash} />
    </Button>
  );
};

export default DeleteButton;

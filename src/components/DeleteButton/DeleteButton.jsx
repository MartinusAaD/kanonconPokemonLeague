import React from "react";
import styles from "./DeleteButton.module.css";
import Button from "../Button/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { database } from "../../firestoreConfig";

const DeleteButton = ({
  collectionName,
  id,
  isDocument,
  playerData,
  onDelete,
}) => {
  const handleDelete = async (e) => {
    e.preventDefault();

    const confirmDelete = window.confirm(
      "Er du sikker på at du vil slette denne?"
    );
    if (!confirmDelete) return;

    if (isDocument) {
      try {
        await deleteDoc(doc(database, collectionName, id));
        if (onDelete) onDelete(); // 👈 tell parent to update state
      } catch (error) {
        console.error("Error deleting document", error.message);
      }
    } else {
      try {
        const eventRef = doc(database, collectionName, id);

        // Check both subcollections
        const subCollections = ["activePlayersList", "waitListedPlayers"];
        for (const sub of subCollections) {
          const subColRef = collection(eventRef, sub);
          const q = query(subColRef, where("playerId", "==", playerData));
          const snapshot = await getDocs(q);

          snapshot.forEach(async (playerDoc) => {
            await deleteDoc(doc(subColRef, playerDoc.id));
          });
        }
      } catch (error) {
        console.error(
          "Error deleting player from subcollection",
          error.message
        );
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

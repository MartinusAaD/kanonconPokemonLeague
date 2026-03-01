import React, { useState } from "react";
import styles from "./DeleteButton.module.css";
import Button from "../Button/Button";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
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
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDeleteClick = (e) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);

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

  const handleCancel = () => {
    setShowConfirm(false);
  };

  return (
    <>
      <Button className={`${styles.deleteButton}`} onClick={handleDeleteClick}>
        <FontAwesomeIcon icon={faTrash} />
      </Button>
      <ConfirmDialog
        isOpen={showConfirm}
        message="Er du sikker på at du vil slette denne?"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
};

export default DeleteButton;

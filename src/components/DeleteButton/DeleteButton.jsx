import React, { useState } from "react";
import styles from "./DeleteButton.module.css";
import Button from "../Button/Button";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { database, storage } from "../../firestoreConfig";
import { ref, listAll, deleteObject } from "firebase/storage";

const DeleteButton = ({
  collectionName,
  id,
  isDocument,
  playerData,
  onDelete,
  moveToRemoved = false,
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

        if (collectionName === "events") {
          try {
            const folderRef = ref(storage, `deckLists/${id}`);
            const { prefixes } = await listAll(folderRef);
            for (const playerFolder of prefixes) {
              const { items } = await listAll(playerFolder);
              await Promise.all(items.map((item) => deleteObject(item)));
            }
          } catch {
            // No storage files for this event — safe to ignore
          }
        }

        if (onDelete) onDelete();
      } catch (error) {
        console.error("Error deleting document", error.message);
      }
    } else {
      try {
        const eventRef = doc(database, collectionName, id);

        // Check all subcollections and remove the player from each
        const subCollections = [
          "activePlayersList",
          "waitListedPlayers",
          "removedPlayers",
        ];
        for (const sub of subCollections) {
          const subColRef = collection(eventRef, sub);
          const q = query(subColRef, where("playerId", "==", playerData));
          const snapshot = await getDocs(q);

          snapshot.forEach(async (playerDoc) => {
            await deleteDoc(doc(subColRef, playerDoc.id));
          });
        }

        // If moveToRemoved, add to the removedPlayers subcollection
        if (moveToRemoved) {
          const removedRef = collection(eventRef, "removedPlayers");
          await addDoc(removedRef, {
            playerId: playerData,
            joinedAt: new Date(),
          });
        }
      } catch (error) {
        console.error(
          "Error deleting player from subcollection",
          error.message,
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

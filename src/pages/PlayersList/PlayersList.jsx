import React, { useEffect, useState } from "react";
import styles from "./PlayersList.module.css";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { database } from "../../firestoreConfig";
import Button from "../../components/Button/Button";
import { useNavigate } from "react-router-dom";
import DeleteButton from "../../components/DeleteButton/DeleteButton";
import EditButton from "../../components/EditButton/EditButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";

const PlayersList = () => {
  const [players, setPlayers] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const snapshot = await getDocs(collection(database, "players"));
        const playersList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPlayers(playersList);
      } catch (error) {
        console.error("Error fetching players:", error);
      }
    };

    fetchPlayers();
  }, []);

  const handleChange = (e) => {
    setSearchInput(e.target.value);
  };

  const handlePlayerDelete = async (player) => {
    // 1. Clean up user/family member profile
    if (player.claimedByUid) {
      try {
        if (player.claimedByFamilyMemberId) {
          await deleteDoc(
            doc(
              database,
              "users",
              player.claimedByUid,
              "familyMembers",
              player.claimedByFamilyMemberId,
            ),
          );
        } else {
          await updateDoc(doc(database, "users", player.claimedByUid), {
            playerId: "",
          });
        }
      } catch (err) {
        console.error("Failed to clean up after player deletion:", err);
      }
    }

    // 2. Remove from all event subcollections
    if (player.playerId) {
      try {
        for (const subName of ["activePlayersList", "waitListedPlayers"]) {
          const group = collectionGroup(database, subName);
          const snap = await getDocs(
            query(group, where("playerId", "==", player.playerId)),
          );
          for (const d of snap.docs) {
            await deleteDoc(d.ref);
          }
        }
      } catch (err) {
        console.error("Failed to remove player from events:", err);
      }
    }

    setPlayers((prev) => prev.filter((p) => p.id !== player.id));
  };

  const filteredPlayers = players
    .filter((player) => {
      const query = searchInput.toLowerCase();
      const fullName =
        `${player.firstName || ""} ${player.lastName || ""}`.toLowerCase();
      return (
        player.playerId?.toLowerCase().includes(query) ||
        player.firstName?.toLowerCase().includes(query) ||
        player.lastName?.toLowerCase().includes(query) ||
        fullName.includes(query) ||
        player.birthYear?.toString().includes(query)
      );
    })
    .slice(0, 10); // Limit to 10 search Results

  return (
    <div className={styles.playerListWrapper}>
      <div className={styles.playerListContainer}>
        <h1>Spiller Liste</h1>

        <div className={styles.addPlayerButtonContainer}>
          <Button
            className={styles.addPlayerButton}
            onClick={() => navigate("/add-player")}
          >
            Legg til Spiller
          </Button>
        </div>

        <div className={styles.searchBarContainer}>
          <label htmlFor="playerSearchbar" className={styles.searchBarLabel}>
            Søk etter spillere
          </label>
          <input
            type="text"
            name="playerSearchBar"
            id="playerSearchBar"
            className={styles.searchBarInput}
            placeholder="Søk etter Navn, Player Id eller Fødselsår"
            value={searchInput}
            onChange={handleChange}
          />
        </div>

        <div className={styles.listContainer}>
          <ul className={styles.list}>
            <li className={`${styles.listElement} ${styles.listElementTitle}`}>
              <p className={styles.listHeader}>Spiller Info</p>
            </li>

            {filteredPlayers.length > 0 ? (
              filteredPlayers.map((player) => (
                <li
                  key={player.id}
                  className={`${styles.listElement} ${styles.listElementSub}`}
                >
                  <div className={styles.playerInfoContainer}>
                    <p className={styles.listElementName}>
                      {player.firstName} {player.lastName}
                      {player.claimedByUid && (
                        <FontAwesomeIcon
                          icon={faCircleCheck}
                          className={styles.verifiedBadge}
                          title="Verifisert konto"
                        />
                      )}
                    </p>
                    <div className={styles.playerInfo}>
                      <p>{player.playerId}</p>
                      <p>-</p>
                      <p>{player.birthYear}</p>
                    </div>
                  </div>
                  <div className={styles.adminControlsContainer}>
                    <EditButton documentType={"PLAYER"} id={player.playerId} />
                    <DeleteButton
                      collectionName={"players"}
                      id={player.id}
                      isDocument={"true"}
                      onDelete={() => handlePlayerDelete(player)}
                    />
                  </div>
                </li>
              ))
            ) : (
              <li className={styles.listElement}>
                <p>Ingen spillere funnet</p>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PlayersList;

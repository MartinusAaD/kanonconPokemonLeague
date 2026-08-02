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
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
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
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  const handleChange = (e) => {
    setSearchInput(e.target.value);
  };

  // Backfill: stamp claimedByUid on player docs whose playerId is linked to a
  // user account or family member but was created before the claim system.
  const handleSyncClaims = async () => {
    setIsSyncing(true);
    setSyncMessage("");
    try {
      const usersSnap = await getDocs(collection(database, "users"));
      const claims = new Map();

      for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        if (userData.playerId?.trim()) {
          claims.set(userData.playerId.trim(), {
            claimedByUid: userDoc.id,
            claimedByFamilyMemberId: null,
          });
        }
        const fmSnap = await getDocs(
          collection(database, "users", userDoc.id, "familyMembers"),
        );
        fmSnap.forEach((fm) => {
          const fmData = fm.data();
          if (fmData.playerId?.trim()) {
            claims.set(fmData.playerId.trim(), {
              claimedByUid: userDoc.id,
              claimedByFamilyMemberId: fm.id,
            });
          }
        });
      }

      let updatedCount = 0;
      for (const player of players) {
        if (player.claimedByUid) continue;
        const claim = claims.get(player.playerId?.trim());
        if (!claim) continue;
        await updateDoc(doc(database, "players", player.id), claim);
        updatedCount++;
      }

      if (updatedCount > 0) {
        setPlayers((prev) =>
          prev.map((p) => {
            if (p.claimedByUid) return p;
            const claim = claims.get(p.playerId?.trim());
            return claim ? { ...p, ...claim } : p;
          }),
        );
      }

      setSyncMessage(
        updatedCount > 0
          ? `${updatedCount} spiller${updatedCount === 1 ? "" : "e"} ble koblet til brukerkonto.`
          : "Alle spillere med brukerkonto er allerede verifisert.",
      );
    } catch (error) {
      console.error("Claim sync failed:", error);
      setSyncMessage("Noe gikk galt under synkroniseringen.");
    } finally {
      setIsSyncing(false);
    }
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
          <Button
            className={styles.syncButton}
            onClick={handleSyncClaims}
            disabled={isSyncing}
          >
            {isSyncing
              ? "Synkroniserer..."
              : "Synkroniser verifiserte kontoer"}
          </Button>
          {syncMessage && <p className={styles.syncMessage}>{syncMessage}</p>}
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

            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <li
                  key={i}
                  className={`${styles.listElement} ${styles.listElementSub}`}
                >
                  <div className={styles.playerInfoContainer}>
                    <div
                      className={`${styles.skeletonLine} ${styles.skeletonName}`}
                    />
                    <div className={styles.playerInfo}>
                      <div
                        className={`${styles.skeletonLine} ${styles.skeletonMeta}`}
                      />
                    </div>
                  </div>
                  <div
                    className={`${styles.skeletonLine} ${styles.skeletonActions}`}
                  />
                </li>
              ))
            ) : filteredPlayers.length > 0 ? (
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

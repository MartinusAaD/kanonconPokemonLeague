import { useState, useEffect } from "react";
import { database } from "../firestoreConfig";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";

// Fetches the user's own player + all family member players.
// Exported as a standalone async function so callers that manage their own
// loading state (e.g. DeckListSubmit) can await it directly.
export const fetchAccountPlayers = async (uid) => {
  const userSnap = await getDoc(doc(database, "users", uid));
  const userData = userSnap.exists() ? userSnap.data() : {};
  const list = [];
  if (userData.playerId) {
    list.push({
      playerId: userData.playerId,
      firstName: userData.firstName || "",
      lastName: userData.lastName || "",
      familyMemberId: null,
    });
  }
  const fmSnap = await getDocs(collection(database, "users", uid, "familyMembers"));
  fmSnap.forEach((d) => {
    const fm = d.data();
    if (fm.playerId) {
      list.push({
        playerId: fm.playerId,
        firstName: fm.firstName || "",
        lastName: fm.lastName || "",
        familyMemberId: d.id,
      });
    }
  });
  return list;
};

// React hook wrapper around fetchAccountPlayers.
const useAccountPlayers = (user) => {
  const [accountPlayers, setAccountPlayers] = useState([]);

  useEffect(() => {
    if (!user) { setAccountPlayers([]); return; }
    fetchAccountPlayers(user.uid)
      .then(setAccountPlayers)
      .catch(console.error);
  }, [user]);

  return accountPlayers;
};

export default useAccountPlayers;

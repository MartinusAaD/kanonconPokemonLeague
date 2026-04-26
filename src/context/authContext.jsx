import { onAuthStateChanged } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, database } from "../firestoreConfig";
import { doc, getDoc } from "firebase/firestore";

const authContext = createContext();

// Listen for auth state changes and update the user accordingly. Log-in/Log-out
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // "admin" | "player" | null
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In-app browsers (Facebook, Discord, Instagram) often block localStorage/IndexedDB,
    // causing onAuthStateChanged to never fire. After 3s, give up and treat as guest.
    const timeout = setTimeout(() => setLoading(false), 3000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(timeout);
      if (currentUser) {
        try {
          const docSnap = await getDoc(doc(database, "users", currentUser.uid));
          setRole(
            docSnap.exists() ? (docSnap.data().role ?? "player") : "player",
          );
        } catch {
          setRole("player"); // fallback – least privileged role on error
        }
      } else {
        setRole(null);
      }
      setUser(currentUser);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const isAdmin = role === "admin";
  const isPlayer = role === "player";

  return (
    <authContext.Provider value={{ user, role, isAdmin, isPlayer, loading }}>
      {children}
    </authContext.Provider>
  );
};

export const getAuthContext = () => useContext(authContext);

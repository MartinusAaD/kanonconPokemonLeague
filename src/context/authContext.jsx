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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
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
    return () => unsubscribe();
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

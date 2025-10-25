import React, { useEffect, useState } from "react";
import styles from "./MyProfile.module.css";
import Button from "../../components/Button/Button";
import { signOut } from "firebase/auth";
import { auth, database } from "../../firestoreConfig";
import { getAuthContext } from "../../context/authContext";
import { doc, getDoc } from "firebase/firestore";

const MyProfile = () => {
  const [userData, setUserData] = useState({ firstName: "", lastName: "" });
  const { user } = getAuthContext();

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.uid) return; // Stops if user hasn't loaded in

      try {
        const docRef = doc(database, "users", user.uid);
        const docSnap = await getDoc(docRef);
        const docData = docSnap.data();

        setUserData({
          firstName: docData.firstName,
          lastName: docData.lastName,
        });
      } catch (error) {
        console.log(error.message);
      }
    };

    fetchUserData();
  }, [user?.uid]);

  const handleSignOut = async () => {
    await signOut(auth);
  };
  return (
    <div className={styles.outerWrapper}>
      <div className={styles.profileContainer}>
        <h1>
          Velkommen Professor {userData.firstName} {userData.lastName}!
        </h1>
        <Button className={styles.signOutButton} onClick={handleSignOut}>
          Logg Ut
        </Button>
      </div>
    </div>
  );
};

export default MyProfile;

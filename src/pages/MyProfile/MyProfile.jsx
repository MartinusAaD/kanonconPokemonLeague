import React, { useEffect, useState } from "react";
import styles from "./MyProfile.module.css";
import Button from "../../components/Button/Button";
import FamilyMemberForm from "../../components/FamilyMemberForm/FamilyMemberForm";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { signOut } from "firebase/auth";
import { auth, database } from "../../firestoreConfig";
import { getAuthContext } from "../../context/authContext";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Upsert a player doc and mark it as claimed */
const claimPlayerId = async (playerId, uid, familyMemberId = null) => {
  const playersRef = collection(database, "players");
  const snap = await getDocs(
    query(playersRef, where("playerId", "==", playerId)),
  );
  if (snap.empty) {
    await addDoc(playersRef, {
      playerId,
      claimedByUid: uid,
      claimedByFamilyMemberId: familyMemberId,
      joinedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(snap.docs[0].ref, {
      claimedByUid: uid,
      claimedByFamilyMemberId: familyMemberId,
    });
  }
};

/** Release a player ID claim */
const unclaimPlayerId = async (playerId) => {
  const playersRef = collection(database, "players");
  const snap = await getDocs(
    query(playersRef, where("playerId", "==", playerId)),
  );
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, {
      claimedByUid: null,
      claimedByFamilyMemberId: null,
    });
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

const MyProfile = () => {
  const { user, isAdmin } = getAuthContext();

  // ── Profile state ──
  const [userData, setUserData] = useState({
    firstName: "",
    lastName: "",
    playerId: "",
    phoneNumber: "",
    email: "",
    birthYear: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState("success"); // "success" | "error"
  const [validationErrors, setValidationErrors] = useState({});
  const [originalPlayerId, setOriginalPlayerId] = useState("");
  const [savedUserData, setSavedUserData] = useState(null); // snapshot taken when entering edit mode

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState("profile"); // "profile" | "family"

  // ── Family members state ──
  const [familyMembers, setFamilyMembers] = useState([]);
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [isSavingMember, setIsSavingMember] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);

  // ── Fetch profile ──
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.uid) return;
      try {
        const docSnap = await getDoc(doc(database, "users", user.uid));
        if (!docSnap.exists()) return;
        const d = docSnap.data();
        setUserData({
          firstName: d.firstName || "",
          lastName: d.lastName || "",
          playerId: d.playerId || "",
          phoneNumber: d.phoneNumber || "",
          email: d.email || user.email || "",
          birthYear: d.birthYear || "",
        });
        setOriginalPlayerId(d.playerId || "");
      } catch (error) {
        console.error(error.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
  }, [user?.uid, user?.email]);

  // ── Fetch family members (players only) ──
  useEffect(() => {
    const fetchFamilyMembers = async () => {
      if (!user?.uid) return;
      try {
        const snap = await getDocs(
          collection(database, "users", user.uid, "familyMembers"),
        );
        setFamilyMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error(error.message);
      }
    };
    fetchFamilyMembers();
  }, [user?.uid, isAdmin]);

  // ── Auto-clear feedback ──
  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = setTimeout(() => setFeedbackMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  // ─── Profile edit handlers ────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData((prev) => ({ ...prev, [name]: value }));
    setValidationErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const errors = {};
    if (!userData.firstName.trim()) errors.firstName = "Fornavn er påkrevd";
    if (!userData.lastName.trim()) errors.lastName = "Etternavn er påkrevd";
    if (userData.playerId && !/^\d+$/.test(userData.playerId.trim()))
      errors.playerId = "Player ID må kun inneholde tall";
    if (userData.birthYear && !/^\d{4}$/.test(userData.birthYear))
      errors.birthYear = "Fødselsår må være et 4-sifret år";
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const newPlayerId = userData.playerId.trim();
      const oldPlayerId = originalPlayerId.trim();
      const playerIdChanged = newPlayerId !== oldPlayerId;

      // If player ID is being changed, validate it's not claimed by someone else
      if (playerIdChanged && newPlayerId) {
        const playersRef = collection(database, "players");
        const claimSnap = await getDocs(
          query(playersRef, where("playerId", "==", newPlayerId)),
        );
        const claimedByOther = claimSnap.docs.some((d) => {
          const data = d.data();
          const uid = data.claimedByUid;
          if (!uid) return false;
          if (uid !== user.uid) return true; // claimed by a different user
          // Same user — block if it belongs to a family member (not the main profile)
          return data.claimedByFamilyMemberId != null;
        });
        if (claimedByOther) {
          setValidationErrors((prev) => ({
            ...prev,
            playerId: "Denne Player ID-en er allerede tatt",
          }));
          return;
        }
      }

      // Save user doc
      await updateDoc(doc(database, "users", user.uid), {
        firstName: userData.firstName,
        lastName: userData.lastName,
        playerId: newPlayerId,
        phoneNumber: userData.phoneNumber,
        email: userData.email,
        birthYear: userData.birthYear,
      });

      if (newPlayerId) {
        const playersRef = collection(database, "players");

        if (playerIdChanged && oldPlayerId) {
          // ── Cascade: handle old ID → new ID in players collection ──
          const newSnap = await getDocs(
            query(playersRef, where("playerId", "==", newPlayerId)),
          );

          if (!newSnap.empty) {
            // A doc for the new ID already exists — claim it and unclaim the old one
            await updateDoc(newSnap.docs[0].ref, {
              claimedByUid: user.uid,
              claimedByFamilyMemberId: null,
              firstName: userData.firstName,
              lastName: userData.lastName,
              birthYear: userData.birthYear,
            });
            await unclaimPlayerId(oldPlayerId);
          } else {
            // No existing doc for new ID — rename the old doc
            const oldSnap = await getDocs(
              query(playersRef, where("playerId", "==", oldPlayerId)),
            );
            if (!oldSnap.empty) {
              await updateDoc(oldSnap.docs[0].ref, {
                playerId: newPlayerId,
                claimedByUid: user.uid,
                claimedByFamilyMemberId: null,
                firstName: userData.firstName,
                lastName: userData.lastName,
                birthYear: userData.birthYear,
              });
            } else {
              // No existing doc at all — create a new claimed one
              await addDoc(playersRef, {
                playerId: newPlayerId,
                claimedByUid: user.uid,
                claimedByFamilyMemberId: null,
                firstName: userData.firstName,
                lastName: userData.lastName,
                birthYear: userData.birthYear,
                joinedAt: serverTimestamp(),
              });
            }
          }

          // ── Cascade: update playerId in all event subcollections ──
          try {
            const eventsSnap = await getDocs(collection(database, "events"));
            for (const eventDoc of eventsSnap.docs) {
              for (const subName of [
                "activePlayersList",
                "waitListedPlayers",
                "removedPlayers",
              ]) {
                const subRef = collection(
                  database,
                  "events",
                  eventDoc.id,
                  subName,
                );
                const snap = await getDocs(
                  query(subRef, where("playerId", "==", oldPlayerId)),
                );
                for (const d of snap.docs) {
                  await updateDoc(d.ref, { playerId: newPlayerId });
                }
              }
            }
          } catch (cascadeError) {
            // Profile is already saved — log the error but don't fail the whole operation.
            console.warn("Event cascade failed:", cascadeError.message);
          }
        } else {
          // ── Same ID (or first time setting): upsert claim + sync name ──
          const snap = await getDocs(
            query(playersRef, where("playerId", "==", newPlayerId)),
          );
          if (snap.empty) {
            await addDoc(playersRef, {
              playerId: newPlayerId,
              claimedByUid: user.uid,
              claimedByFamilyMemberId: null,
              firstName: userData.firstName,
              lastName: userData.lastName,
              birthYear: userData.birthYear,
              joinedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(snap.docs[0].ref, {
              claimedByUid: user.uid,
              claimedByFamilyMemberId: null,
              firstName: userData.firstName,
              lastName: userData.lastName,
              birthYear: userData.birthYear,
            });
          }
        }
      } else if (playerIdChanged && oldPlayerId) {
        // Player ID was cleared — unclaim old one
        await unclaimPlayerId(oldPlayerId);
      }

      setOriginalPlayerId(newPlayerId);
      setFeedbackType("success");
      setFeedbackMessage("Profil oppdatert!");
      setIsEditMode(false);
    } catch (error) {
      console.error(error.message);
      setFeedbackType("error");
      setFeedbackMessage("Kunne ikke oppdatere profilen. Prøv igjen.");
    }
  };

  const handleCancel = () => {
    if (savedUserData) setUserData(savedUserData);
    setIsEditMode(false);
    setValidationErrors({});
    setSavedUserData(null);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Reset edit mode and family form when switching tabs
    setIsEditMode(false);
    setValidationErrors({});
    setShowFamilyForm(false);
    setEditingMember(null);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // ─── Family member handlers ───────────────────────────────────────────────

  const openAddMember = () => {
    setEditingMember(null);
    setShowFamilyForm(true);
  };

  const openEditMember = (member) => {
    setEditingMember(member);
    setShowFamilyForm(true);
  };

  const closeFamilyForm = () => {
    setShowFamilyForm(false);
    setEditingMember(null);
  };

  const handleSaveMember = async (data) => {
    setIsSavingMember(true);
    try {
      const membersRef = collection(
        database,
        "users",
        user.uid,
        "familyMembers",
      );

      if (editingMember) {
        // ── Edit ──
        const memberDocRef = doc(membersRef, editingMember.id);
        const oldPlayerId = editingMember.playerId;
        const newPlayerId = data.playerId;
        const playerIdChanged = newPlayerId !== oldPlayerId;

        const updatePayload = {
          firstName: data.firstName,
          lastName: data.lastName,
          birthYear: data.birthYear,
        };
        if (playerIdChanged) updatePayload.playerId = newPlayerId;
        await updateDoc(memberDocRef, updatePayload);

        const playersRef = collection(database, "players");

        if (playerIdChanged) {
          // Unclaim old ID, claim new ID
          await unclaimPlayerId(oldPlayerId);
          await claimPlayerId(newPlayerId, user.uid, editingMember.id);

          // Sync name/year to new player doc
          const snap = await getDocs(
            query(playersRef, where("playerId", "==", newPlayerId)),
          );
          if (!snap.empty) {
            await updateDoc(snap.docs[0].ref, {
              firstName: data.firstName,
              lastName: data.lastName,
              birthYear: data.birthYear,
            });
          }

          // Cascade: update playerId in all event subcollections
          try {
            const eventsSnap2 = await getDocs(collection(database, "events"));
            for (const eventDoc of eventsSnap2.docs) {
              for (const subName of [
                "activePlayersList",
                "waitListedPlayers",
                "removedPlayers",
              ]) {
                const subRef = collection(
                  database,
                  "events",
                  eventDoc.id,
                  subName,
                );
                const cascadeSnap = await getDocs(
                  query(subRef, where("playerId", "==", oldPlayerId)),
                );
                for (const d of cascadeSnap.docs) {
                  await updateDoc(d.ref, { playerId: newPlayerId });
                }
              }
            }
          } catch (cascadeError) {
            console.warn("Event cascade failed:", cascadeError.message);
          }
        } else {
          // Same ID — just sync name/year
          const snap = await getDocs(
            query(playersRef, where("playerId", "==", newPlayerId)),
          );
          if (!snap.empty) {
            await updateDoc(snap.docs[0].ref, {
              firstName: data.firstName,
              lastName: data.lastName,
              birthYear: data.birthYear,
            });
          }
        }

        setFamilyMembers((prev) =>
          prev.map((m) => (m.id === editingMember.id ? { ...m, ...data } : m)),
        );
      } else {
        // ── Add ──
        const newDocRef = await addDoc(membersRef, {
          firstName: data.firstName,
          lastName: data.lastName,
          playerId: data.playerId,
          birthYear: data.birthYear,
          createdAt: serverTimestamp(),
        });

        // Claim the player ID and sync details
        await claimPlayerId(data.playerId, user.uid, newDocRef.id);
        const playersRef = collection(database, "players");
        const snap = await getDocs(
          query(playersRef, where("playerId", "==", data.playerId)),
        );
        if (!snap.empty) {
          await updateDoc(snap.docs[0].ref, {
            firstName: data.firstName,
            lastName: data.lastName,
            birthYear: data.birthYear,
          });
        }

        setFamilyMembers((prev) => [...prev, { id: newDocRef.id, ...data }]);
      }

      closeFamilyForm();
    } catch (error) {
      console.error(error.message);
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleDeleteMember = (member) => {
    setMemberToDelete(member);
  };

  const handleConfirmDeleteMember = async () => {
    if (!memberToDelete) return;
    const member = memberToDelete;
    setMemberToDelete(null);
    setIsDeletingMember(true);
    try {
      await deleteDoc(
        doc(database, "users", user.uid, "familyMembers", member.id),
      );
      await unclaimPlayerId(member.playerId);
      setFamilyMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (error) {
      console.error(error.message);
    } finally {
      setIsDeletingMember(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className={styles.outerWrapper}>
        <div className={`${styles.profileContainer} ${styles.fadeIn}`}>
          <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
          <div className={styles.skeletonTabBar}>
            <div className={`${styles.skeletonLine} ${styles.skeletonTab}`} />
            <div className={`${styles.skeletonLine} ${styles.skeletonTab}`} />
          </div>
          <div className={styles.infoSection}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={styles.infoRow}>
                <div
                  className={`${styles.skeletonLine} ${styles.skeletonLabel}`}
                />
                <div
                  className={`${styles.skeletonLine} ${styles.skeletonValue}`}
                />
              </div>
            ))}
          </div>
          <div className={`${styles.skeletonLine} ${styles.skeletonButton}`} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.outerWrapper}>
      <div className={`${styles.profileContainer} ${styles.fadeIn}`}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <h1 className={styles.welcomeTitle}>
          {isAdmin
            ? `Velkommen Professor ${userData.firstName} ${userData.lastName}!`
            : `Velkommen ${userData.firstName} ${userData.lastName}!`}
        </h1>

        {/* ── Tab Bar ────────────────────────────────────────────── */}
        <nav className={styles.tabBar}>
          <button
            className={`${styles.tabButton} ${activeTab === "profile" ? styles.tabButtonActive : ""}`}
            onClick={() => handleTabChange("profile")}
          >
            Min Profil
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === "family" ? styles.tabButtonActive : ""}`}
            onClick={() => handleTabChange("family")}
          >
            Familie
            {familyMembers.length > 0 && (
              <span className={styles.tabBadge}>{familyMembers.length}</span>
            )}
          </button>
          <button
            className={styles.logoutTabButton}
            onClick={handleSignOut}
            title="Logg ut"
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
          </button>
        </nav>

        {/* ── Profile Tab ────────────────────────────────────────── */}
        {activeTab === "profile" &&
          (!isEditMode ? (
            <div className={styles.tabContent}>
              <div className={styles.infoSection}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Player ID:</span>
                  <span className={styles.infoValue}>
                    {userData.playerId || "Ikke angitt"}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Email:</span>
                  <span className={styles.infoValue}>
                    {userData.email || "Ikke angitt"}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Telefon:</span>
                  <span className={styles.infoValue}>
                    {userData.phoneNumber || "Ikke angitt"}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Fødselsår:</span>
                  <span className={styles.infoValue}>
                    {userData.birthYear || "Ikke angitt"}
                  </span>
                </div>
              </div>

              <Button
                className={styles.editButton}
                onClick={() => {
                  setSavedUserData({ ...userData });
                  setIsEditMode(true);
                }}
              >
                Rediger Profil
              </Button>
            </div>
          ) : (
            <div className={styles.tabContent}>
              <form
                className={styles.editForm}
                noValidate
                onSubmit={handleSubmit}
              >
                <h2 className={styles.formHeader}>Rediger Profil</h2>

                <div className={styles.formGroup}>
                  <label htmlFor="firstName" className={styles.label}>
                    Fornavn *
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    id="firstName"
                    className={styles.input}
                    placeholder="Skriv inn fornavnet ditt"
                    maxLength={50}
                    value={userData.firstName}
                    onChange={handleChange}
                  />
                  {validationErrors.firstName && (
                    <p className={styles.errorMessage}>
                      {validationErrors.firstName}
                    </p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="lastName" className={styles.label}>
                    Etternavn *
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    id="lastName"
                    className={styles.input}
                    placeholder="Skriv inn etternavnet ditt"
                    maxLength={50}
                    value={userData.lastName}
                    onChange={handleChange}
                  />
                  {validationErrors.lastName && (
                    <p className={styles.errorMessage}>
                      {validationErrors.lastName}
                    </p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="playerId" className={styles.label}>
                    Player ID
                  </label>
                  <input
                    type="text"
                    name="playerId"
                    id="playerId"
                    className={styles.input}
                    placeholder="Skriv inn Player ID"
                    maxLength={20}
                    value={userData.playerId}
                    onChange={handleChange}
                  />

                  {validationErrors.playerId && (
                    <p className={styles.errorMessage}>
                      {validationErrors.playerId}
                    </p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="email" className={styles.label}>
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    className={styles.input}
                    placeholder="Skriv inn email"
                    maxLength={100}
                    value={userData.email}
                    onChange={handleChange}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="phoneNumber" className={styles.label}>
                    Telefonnummer
                  </label>
                  <input
                    type="tel"
                    name="phoneNumber"
                    id="phoneNumber"
                    className={styles.input}
                    placeholder="Skriv inn telefonnummer"
                    maxLength={20}
                    value={userData.phoneNumber}
                    onChange={handleChange}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="birthYear" className={styles.label}>
                    Fødselsår
                  </label>
                  <input
                    type="text"
                    name="birthYear"
                    id="birthYear"
                    className={styles.input}
                    placeholder="Skriv inn fødselsår"
                    maxLength={4}
                    value={userData.birthYear}
                    onChange={handleChange}
                  />
                  {validationErrors.birthYear && (
                    <p className={styles.errorMessage}>
                      {validationErrors.birthYear}
                    </p>
                  )}
                </div>

                {feedbackMessage && (
                  <div
                    className={`${styles.feedbackContainer} ${
                      feedbackType === "error"
                        ? styles.feedbackContainerError
                        : ""
                    }`}
                  >
                    <p
                      className={`${styles.feedbackMessage} ${
                        feedbackType === "error"
                          ? styles.feedbackMessageError
                          : ""
                      }`}
                    >
                      {feedbackMessage}
                    </p>
                  </div>
                )}

                <div className={styles.formButtonGroup}>
                  <Button className={styles.submitButton} type="submit">
                    Lagre
                  </Button>
                  <Button
                    className={styles.cancelButton}
                    type="button"
                    onClick={handleCancel}
                  >
                    Avbryt
                  </Button>
                </div>
              </form>
            </div>
          ))}

        {/* ── Family Tab ────────────────────────────────────────── */}
        {activeTab === "family" && (
          <div className={styles.tabContent}>
            {!showFamilyForm && (
              <div className={styles.familySectionHeader}>
                <Button
                  className={styles.addFamilyButton}
                  onClick={openAddMember}
                >
                  + Legg til familiemedlem
                </Button>
              </div>
            )}

            {familyMembers.length === 0 && !showFamilyForm && (
              <p className={styles.emptyFamilyText}>
                Ingen familiemedlemmer lagt til enda.
              </p>
            )}

            {familyMembers.length > 0 && !showFamilyForm && (
              <ul className={styles.familyList}>
                {familyMembers.map((member) => (
                  <li key={member.id} className={styles.familyListItem}>
                    <div className={styles.familyMemberInfo}>
                      <p className={styles.familyMemberName}>
                        {member.firstName} {member.lastName}
                      </p>
                      <p className={styles.familyMemberDetails}>
                        ID: {member.playerId} · Født: {member.birthYear}
                      </p>
                    </div>
                    <div className={styles.familyMemberActions}>
                      <button
                        className={styles.familyEditBtn}
                        onClick={() => openEditMember(member)}
                      >
                        Rediger
                      </button>
                      <button
                        className={styles.familyDeleteBtn}
                        onClick={() => handleDeleteMember(member)}
                        disabled={isDeletingMember}
                      >
                        {isDeletingMember ? "Sletter..." : "Slett"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {showFamilyForm && (
              <FamilyMemberForm
                initialData={editingMember}
                currentUid={user.uid}
                onSave={handleSaveMember}
                onCancel={closeFamilyForm}
                isSaving={isSavingMember}
              />
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={memberToDelete !== null}
        message={`Vil du slette ${memberToDelete?.firstName} ${memberToDelete?.lastName} fra familien din?`}
        onConfirm={handleConfirmDeleteMember}
        onCancel={() => setMemberToDelete(null)}
      />
    </div>
  );
};

export default MyProfile;

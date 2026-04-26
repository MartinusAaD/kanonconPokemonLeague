import React from "react";
import styles from "./Navbar.module.css";
import { NavLink } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendar,
  faHome,
  faList,
  faUser,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { getAuthContext } from "../../context/authContext";

const Navbar = () => {
  const setActiveClass = ({ isActive }) => (isActive ? styles.active : "");
  const { user, isAdmin } = getAuthContext();

  return (
    <div className={styles.navbarWrapper}>
      <nav className={styles.navbar}>
        <div className={styles.logoContainer}>
          <NavLink to="/">
            <img
              src="/icons/android-chrome-192x192.png"
              alt="Image of brand logo"
              className={styles.navbarImage}
            />
          </NavLink>
        </div>

        <ul className={`${styles.navbarList} ${styles.navbarListBig}`}>
          <li className={styles.navbarListElement}>
            <NavLink to="/" className={setActiveClass}>
              Heim
            </NavLink>
          </li>
          <li className={styles.navbarListElement}>
            <NavLink to="/events" className={setActiveClass}>
              Eventer
            </NavLink>
          </li>

          {user && (
            <li className={styles.navbarListElement}>
              <NavLink to="/my-decklists" className={setActiveClass}>
                Mine Dekklister
              </NavLink>
            </li>
          )}

          {user && isAdmin && (
            <li className={styles.navbarListElement}>
              <NavLink to="/player-list" className={setActiveClass}>
                Spillere
              </NavLink>
            </li>
          )}
        </ul>

        <ul className={`${styles.navbarList} ${styles.navbarListSmaller}`}>
          <li className={styles.navbarListElement}>
            <NavLink to="/" className={setActiveClass}>
              <FontAwesomeIcon icon={faHome} />
            </NavLink>
          </li>
          <li className={styles.navbarListElement}>
            <NavLink to="/events" className={setActiveClass}>
              <FontAwesomeIcon icon={faCalendar} />
            </NavLink>
          </li>

          {user && (
            <li className={styles.navbarListElement}>
              <NavLink to="/my-decklists" className={setActiveClass}>
                <FontAwesomeIcon icon={faLayerGroup} />
              </NavLink>
            </li>
          )}

          {user && isAdmin && (
            <li className={styles.navbarListElement}>
              <NavLink to="/player-list" className={setActiveClass}>
                <FontAwesomeIcon icon={faList} />
              </NavLink>
            </li>
          )}
        </ul>

        <div className={styles.profileContainer}>
          <NavLink
            to={user ? "/my-profile" : "/login"}
            className={setActiveClass}
          >
            <FontAwesomeIcon icon={faUser} />
          </NavLink>
        </div>
      </nav>
    </div>
  );
};

export default Navbar;

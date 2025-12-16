# 🏆 Kanoncon Pokémon League Event Registration

A modern web application for managing **Pokémon League events**, where players can **register, view, and manage events** — all in one place.

Built with **React** and **Firebase**, this project is designed to streamline the event experience for both **organizers and players**.

---

## ✨ Features

### 🔹 Player & Event Management

- Players can **register** for events with their name, birth year, and contact info.
- Organizers can **add, edit, or delete** events directly from the dashboard.
- Automatic handling of **active** and **expired** events based on date.

### 🔹 Event Overview

- Clean, responsive layout for event listings:
  - 🟩 **Active Events** show upcoming or ongoing tournaments.
  - 🟥 **Expired Events** show past tournaments for record keeping.

### 🔹 Firebase Integration

- Securely stores players and events in **Cloud Firestore**.
- Real-time updates using **onSnapshot**.
- Includes **Firebase Authentication** for organizer access.

### 🔹 Validation & UX

- Reusable **form validation hooks** for robust input checking.
- Smart date handling with `serverTimestamp()`.
- Toast notifications and visual feedback for all user actions.

---

## 🧠 Tech Stack

| Category               | Technology                            |
| ---------------------- | ------------------------------------- |
| **Frontend**           | React, CSS Modules                    |
| **Backend / Database** | Firebase (Firestore, Auth)            |
| **Deployment**         | Netlify                               |
| **Icons**              | FontAwesome                           |
| **State Management**   | React Hooks (`useState`, `useEffect`) |

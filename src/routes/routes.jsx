import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
} from "react-router-dom";
import App from "../App";
import Home from "../pages/Home/Home";
import Events from "../pages/Events/Events";
import EventSpecific from "../pages/EventSpecific/EventSpecific";
import Login from "../pages/Login/Login";
import Register from "../pages/Register/Register";
import PlayersList from "../pages/PlayersList/PlayersList";
import MyProfile from "../pages/MyProfile/MyProfile";
import PageNotFound from "../pages/PageNotFound/PageNotFound";
import CreateEvent from "../pages/CreateEvent/CreateEvent";
import EditEvent from "../pages/EditEvent/EditEvent";
import EditPlayer from "../pages/EditPlayer/EditPlayer";
import { getAuthContext } from "../context/authContext";
import AddPlayer from "../pages/AddPlayer/AddPlayer";

// Any logged-in user
const PrivateRoutesGuard = ({ children }) => {
  const { user, loading } = getAuthContext();
  if (loading) return null;
  if (!user) return <Navigate to="/" />;
  return children;
};

// Only admins
const AdminRoutesGuard = ({ children }) => {
  const { user, isAdmin, loading } = getAuthContext();
  if (loading) return null;
  if (!user) return <Navigate to="/" />;
  if (!isAdmin) return <Navigate to="/my-profile" />;
  return children;
};

// Redirect away if already logged in
const PublicRoutesGuard = ({ children }) => {
  const { user, loading } = getAuthContext();
  if (loading) return null;
  if (user) return <Navigate to="/my-profile" />;
  return children;
};

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<App />}>
        {/* Public Routes */}
        <Route index element={<Home />} />
        <Route path="/events" element={<Events />} />

        <Route path="/event" element={<EventSpecific />}>
          <Route path=":id" element={<EventSpecific />} />
        </Route>

        <Route
          path="/login"
          element={
            <PublicRoutesGuard>
              <Login />
            </PublicRoutesGuard>
          }
        />

        <Route
          path="/reset-password"
          element={
            <PublicRoutesGuard>
              <Login />
            </PublicRoutesGuard>
          }
        />

        <Route
          path="/register"
          element={
            <PublicRoutesGuard>
              <Register />
            </PublicRoutesGuard>
          }
        />

        <Route path="*" element={<PageNotFound />} />

        {/* Event Creation/edit — Admin only */}
        <Route
          path="/events/create-event"
          element={
            <AdminRoutesGuard>
              <CreateEvent />
            </AdminRoutesGuard>
          }
        />
        <Route
          path="/events/edit-event/:id"
          element={
            <AdminRoutesGuard>
              <EditEvent />
            </AdminRoutesGuard>
          }
        />

        {/* Edit Player (in event context) — Admin only */}
        <Route
          path="/event/edit-player/:id"
          element={
            <AdminRoutesGuard>
              <EditPlayer />
            </AdminRoutesGuard>
          }
        />

        {/* Profile — any logged-in user */}
        <Route
          path="/my-profile"
          element={
            <PrivateRoutesGuard>
              <MyProfile />
            </PrivateRoutesGuard>
          }
        >
          <Route path=":playerId" element={<MyProfile />} />
        </Route>

        {/* Player List — Admin only */}
        <Route
          path="/player-list"
          element={
            <AdminRoutesGuard>
              <PlayersList />
            </AdminRoutesGuard>
          }
        />

        {/* Add Player — Admin only */}
        <Route
          path="/add-player"
          element={
            <AdminRoutesGuard>
              <AddPlayer />
            </AdminRoutesGuard>
          }
        />

        {/* Edit Player — Admin only */}
        <Route
          path="/edit-player/:id"
          element={
            <AdminRoutesGuard>
              <EditPlayer />
            </AdminRoutesGuard>
          }
        />
      </Route>
    </>,
  ),
);

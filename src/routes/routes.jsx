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
import PlayersList from "../pages/PlayersList/PlayersList";
import MyProfile from "../pages/MyProfile/MyProfile";
import PageNotFound from "../pages/PageNotFound/PageNotFound";
import CreateEvent from "../pages/CreateEvent/CreateEvent";
import EditEvent from "../pages/EditEvent/EditEvent";
import EditPlayer from "../pages/EditPlayer/EditPlayer";
import { getAuthContext } from "../context/authContext";

const PrivateRoutesGuard = ({ children }) => {
  const { user, loading } = getAuthContext();

  if (loading) {
    return;
  }

  if (!user) {
    return <Navigate to="/" />;
  }

  return children;
};

const PublicRoutesGuard = ({ children }) => {
  const { user, loading } = getAuthContext();

  if (loading) {
    return;
  }

  if (user) {
    return <Navigate to="/my-profile" />;
  }

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

        <Route path="*" element={<PageNotFound />} />

        {/* Event Creation/edit, private Route */}
        <Route
          path="/events/create-event"
          element={
            <PrivateRoutesGuard>
              <CreateEvent />
            </PrivateRoutesGuard>
          }
        />
        <Route
          path="/events/edit-event/:id"
          element={
            <PrivateRoutesGuard>
              <EditEvent />
            </PrivateRoutesGuard>
          }
        />

        {/* Private Route, Edit Player */}
        <Route
          path="/event/edit-player/:id"
          element={
            <PrivateRoutesGuard>
              <EditPlayer />
            </PrivateRoutesGuard>
          }
        />

        {/* Profile, Private Route */}
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

        {/* Player List, Private Route */}
        <Route
          path="/player-list"
          element={
            <PrivateRoutesGuard>
              <PlayersList />
            </PrivateRoutesGuard>
          }
        />
      </Route>
    </>
  )
);

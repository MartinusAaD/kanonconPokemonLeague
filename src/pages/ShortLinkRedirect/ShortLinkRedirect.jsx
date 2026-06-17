import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { database } from "../../firestoreConfig";
import PageNotFound from "../PageNotFound/PageNotFound";

export default function ShortLinkRedirect() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const resolve = async () => {
      const snap = await getDoc(doc(database, "shortLinks", slug));
      if (snap.exists()) {
        navigate(`/event/${snap.data().eventId}`, { replace: true });
      } else {
        setNotFound(true);
      }
    };
    resolve();
  }, [slug, navigate]);

  if (notFound) return <PageNotFound />;
  return null;
}

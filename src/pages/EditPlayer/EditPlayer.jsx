import PlayerForm from "../../components/PlayerForm/PlayerForm";
import styles from "./EditPlayer.module.css";

const EditPlayer = () => {
  return (
    <div className={styles.editPlayerWrapper}>
      <PlayerForm />
    </div>
  );
};

export default EditPlayer;

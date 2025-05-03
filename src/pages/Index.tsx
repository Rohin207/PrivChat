
import { RoomProvider } from "../contexts/RoomContext";
import HomePage from "../components/HomePage";

const Index = () => {
  return (
    <RoomProvider>
      <HomePage />
    </RoomProvider>
  );
};

export default Index;

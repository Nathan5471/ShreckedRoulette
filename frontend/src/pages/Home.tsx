import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  const handleNavigate = () => {
    navigate("/game");
  };

  return (
    <div className="h-screen w-screen bg-gray-800">
      <h1 className="text-white font-bold text-4xl text-center pt-20">
        Welcome to Shrecked Roulette!
      </h1>
      <div className="flex justify-center mt-10">
        <button
          className="items-center bg-gray-600 text-white font-bold p-2 rounded hover:bg-gray-700"
          onClick={handleNavigate}
        >
          Start Game
        </button>
      </div>
    </div>
  );
}

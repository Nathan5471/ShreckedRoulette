import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

export default function Home() {
  const navigate = useNavigate();
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => (prev + 1) % 360);
    }, 50);

    return () => clearInterval(interval);
  }, []);

  const handleNavigate = () => {
    navigate("/game");
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-b from-green-900 to-green-700 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtMS4zNiAwLTIuNTkuNTUtMy40OCAxLjQ0LS45LjktMS40NCAyLjEyLTEuNDQgMy40OCAwIC4xNyAwIC4zNC4wMS41MS0uMTctLjAxLS4zNC0uMDEtLjUxLS4wMS0xLjM2IDAtMi41OS41NS0zLjQ4IDEuNDQtLjkuOS0xLjQ0IDIuMTItMS40NCAzLjQ4IDAgMS4zNi41NSAyLjU5IDEuNDQgMy40OC45LjkgMi4xMiAxLjQ0IDMuNDggMS40NC4xNyAwIC4zNCAwIC41MS0uMDEtLjAxLjE3LS4wMS4zNC0uMDEuNTEgMCAxLjM2LjU1IDIuNTkgMS40NCAzLjQ4LjkuOSAyLjEyIDEuNDQgMy40OCAxLjQ0IDEuMzYgMCAyLjU5LS41NSAzLjQ4LTEuNDQuOS0uOSAxLjQ0LTIuMTIgMS40NC0zLjQ4IDAtLjE3IDAtLjM0LS4wMS0uNTEuMTcuMDEuMzQuMDEuNTEuMDEgMS4zNiAwIDIuNTktLjU1IDMuNDgtMS40NC45LS45IDEuNDQtMi4xMiAxLjQ0LTMuNDggMC0xLjM2LS41NS0yLjU5LTEuNDQtMy40OC0uOS0uOS0yLjEyLTEuNDQtMy40OC0xLjQ0LS4xNyAwLS4zNCAwLS41MS4wMS4wMS0uMTcuMDEtLjM0LjAxLS41MSAwLTEuMzYtLjU1LTIuNTktMS40NC0zLjQ4LS45LS45LTIuMTItMS40NC0zLjQ4LTEuNDR6IiBzdHJva2U9IiMwMDMwMDEiIHN0cm9rZS1vcGFjaXR5PSIuMTUiLz48L2c+PC9zdmc+')] opacity-10"></div>
      <div className="relative z-10 pt-10 px-4">
        <h1 className="text-white font-extrabold text-4xl sm:text-5xl text-center drop-shadow-xl mb-2">
          Shrecked Roulette
        </h1>
        <p className="text-green-200 text-center text-pretty sm:text-lg max-w-xl mx-auto">
          Join the most thrilling multiplayer game of roulette
        </p>
      </div>
      <div className="w-48 h-48 sm:w-65 sm:h-65 mx-auto mt-10 relative">
        <div
          className="w-full h-full rounded-full border-8 border-green-200 bg-gradient-to-br from-green-800 to-green-600 shadow-xl flex items-center justify-center"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: "transform 0.1s linear",
          }}
        >
          <div className="absolute w-full h-full rounded-full">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute w-full h-0.5 top-1/2 left-0"
                style={{ transform: `rotate(${i * 30}deg)` }}
              >
                <div className="w-4 h-4 rounded-full bg-green-300 -ml-1 -mt-2"></div>
              </div>
            ))}
          </div>
          <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-inner">
            <div className="w-6 h-6 rounded-full bg-white"></div>
          </div>
        </div>
        <div className="absolute top-0 left-1/2 w-5 h-10 bg-red-600 -ml-2.5 -mt-2 rounded-b-lg z-20"></div>
      </div>
      <div className="flex flex-col items-center mt-10 relative z-10">
        <button
          className="bg-green-500 hover:bg-green-400 text-white text-xl font-bold py-2 px-10 rounded-full transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
          onClick={handleNavigate}
        >
          Start Game
        </button>
        <p className="text-green-200 mt-4 text-sm max-w-md text-center mx-auto opacity-75">
          Enter at your own risk: one unlucky player will have their IP revealed
          to all!
        </p>
      </div>
    </div>
  );
}

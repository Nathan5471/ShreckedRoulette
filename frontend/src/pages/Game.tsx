import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

// Define interfaces for type safety
interface User {
  id: string;
  username: string;
}

interface Event {
  message: string;
  isError: boolean;
  className: string;
  timestamp: string;
}

interface WebSocketMessage {
  event: string;
  data: {
    id?: string;
    users?: User[];
    username?: string;
    gameInProgress?: boolean;
    currentPlayer?: string;
    playerUsername?: string;
    playerIP?: string;
    reason?: string;
    message?: string;
  };
}

interface GameStatus {
  currentPlayer?: string;
  gameInProgress?: boolean;
  users?: User[];
}

export default function Game() {
  const navigate = useNavigate();
  const socketRef = useRef<WebSocket | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [gameInProgress, setGameInProgress] = useState(false);
  const [joinedGame, setJoinedGame] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null);
  const eventsLogRef = useRef<HTMLDivElement>(null);

  // New state variables for the wheel
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [revealedIP, setRevealedIP] = useState<string | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);

  useEffect(() => {
    // Scroll to bottom of events log whenever events change
    if (eventsLogRef.current) {
      eventsLogRef.current.scrollTop = eventsLogRef.current.scrollHeight;
    }
  }, [events]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
  };

  const connectWebSocket = () => {
    // Get the current protocol (ws: or wss:)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/join`;

    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onopen = () => {
      logEvent("Connected to the game server");
      // Send join event with username
      socketRef.current?.send(
        JSON.stringify({
          event: "join",
          data: { username },
        })
      );
    };

    socketRef.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };

    socketRef.current.onerror = (error) => {
      logEvent("WebSocket error: " + error.toString(), true);
    };

    socketRef.current.onclose = () => {
      logEvent("Disconnected from the game server", true);
    };
  };

  const handleWebSocketMessage = (message: WebSocketMessage) => {
    const { event, data } = message;

    switch (event) {
      case "joined":
        if (data.id) setMyId(data.id);
        if (data.users) setUsers(data.users);
        setJoinedGame(true);
        logEvent(`You joined as ${username}`);
        break;

      case "gameState":
        if (data.users) setUsers(data.users);
        if (data.gameInProgress !== undefined)
          setGameInProgress(data.gameInProgress);
        updateGameStatus(data);
        break;

      case "userJoined":
        if (data.id && data.username) {
          setUsers((prev) => [
            ...prev,
            { id: data.id!, username: data.username! },
          ]);
          logEvent(`${data.username} joined the game`);
        }
        break;

      case "userLeft":
        setUsers((prev) => prev.filter((user) => user.id !== data.id));
        logEvent(`${data.username} left the game`);
        break;

      case "gameStarted":
        setGameInProgress(true);
        logEvent("Game started!", false, "current-player");
        updateGameStatus({ currentPlayer: data.currentPlayer });
        break;

      case "playerTurn":
        logEvent(`It's ${data.playerUsername}'s turn...`);
        updateGameStatus({ currentPlayer: data.playerUsername });
        break;

      case "ipRevealed":
        logEvent(
          `${data.playerUsername}'s IP address was revealed: ${data.playerIP}`,
          false,
          "revealed"
        );
        if (data.playerIP) setRevealedIP(data.playerIP);
        if (data.playerUsername) setSelectedUsername(data.playerUsername);
        break;

      case "ipSafe":
        logEvent(
          `${data.playerUsername}'s IP address remains hidden`,
          false,
          "safe"
        );
        break;

      case "gameStopped":
        setGameInProgress(false);
        logEvent(`Game stopped: ${data.reason}`, true);
        updateGameStatus({});
        break;

      case "gameReset":
        setUsers([]);
        setGameInProgress(false);
        updateGameStatus({});
        logEvent(`Game reset: ${data.message}`, true);
        navigate("/");
        break;

      default:
        logEvent(`Unknown event: ${event}`);
    }
  };

  const updateGameStatus = (data: GameStatus) => {
    if (data && data.currentPlayer) {
      setCurrentPlayer(data.currentPlayer);
    } else {
      setCurrentPlayer(null);
    }
  };

  const logEvent = (message: string, isError = false, className = "") => {
    const timestamp = new Date().toLocaleTimeString();
    setEvents((prev) => [...prev, { message, isError, className, timestamp }]);
  };

  const handleJoinGame = () => {
    if (!username.trim()) {
      alert("Please enter a username");
      return;
    }
    connectWebSocket();
  };

  const handleGoBack = () => {
    // Close socket if open
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
    navigate("/");
  };

  const handleSpinWheel = () => {
    if (users.length < 4) {
      alert("Need at least 4 players to start the game");
      return;
    }

    if (isSpinning) return;

    setIsSpinning(true);
    setRevealedIP(null);
    setSelectedUsername(null);

    // Generate random number of full rotations (between 5 and 8) plus a random angle
    // More rotations for a more dramatic effect
    const rotations = 5 + Math.floor(Math.random() * 3);

    // Select a random user
    const selectedIndex = Math.floor(Math.random() * users.length);
    const selected = users[selectedIndex];

    console.log("Selected user for IP reveal:", selected); // Debug log

    // Calculate the exact angle needed to land on the selected user's segment
    const segmentAngle = 360 / users.length;
    const segmentCenter = selectedIndex * segmentAngle + segmentAngle / 2;

    // We want the wheel to stop with the pointer at the center of the selected segment
    // The pointer is at 0 degrees (top), so we need to rotate to 360 - segmentCenter
    const targetAngle = 360 - segmentCenter;

    // Total rotation includes full rotations plus the precise angle to land on target
    const totalRotation = rotations * 360 + targetAngle;

    // Animation for spinning the wheel - initially fast, then slowing down
    const animateSpin = () => {
      // Set the target rotation directly - CSS transition will animate it
      setWheelRotation(totalRotation);

      // After the animation completes
      setTimeout(() => {
        setIsSpinning(false);

        // Debug info
        console.log("Sending ipReveal event for user:", selected.id);

        // Send a message to the server to reveal the IP of the selected user
        socketRef.current?.send(
          JSON.stringify({
            event: "ipReveal",
            data: { userId: selected.id },
          })
        );

        // Pre-set the selected username for immediate feedback
        setSelectedUsername(selected.username);

        // If we don't receive server response within 2 seconds, simulate it for testing
        // This is just for demo/debugging purposes
        setTimeout(() => {
          if (!revealedIP) {
            console.log("Server didn't respond with IP, generating mock IP");
            // Generate a mock IP address for testing purposes
            const mockIP = `${Math.floor(Math.random() * 256)}.${Math.floor(
              Math.random() * 256
            )}.${Math.floor(Math.random() * 256)}.${Math.floor(
              Math.random() * 256
            )}`;
            setRevealedIP(mockIP);
          }
        }, 2000);
      }, 5000); // Match this with the CSS transition duration (5s)
    };

    // Small delay before spinning for dramatic effect
    setTimeout(animateSpin, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-700 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-800">
              Shrecked Roulette
            </h1>
            <button
              onClick={handleGoBack}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
            >
              Back to Home
            </button>
          </div>
          <p className="text-gray-600 mb-6">
            Join the game and see who gets their IP address revealed!
          </p>

          {!joinedGame ? (
            <div className="join-form mb-6 p-6 bg-green-50 rounded-lg">
              <h3 className="text-xl font-semibold mb-4 text-gray-700">
                Enter your username to join:
              </h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder="Username"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <button
                  onClick={handleJoinGame}
                  className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-md transition-colors"
                >
                  Join Game
                </button>
              </div>
            </div>
          ) : (
            <div className="game-area">
              <div className="mb-6">
                <h3 className="text-xl font-semibold mb-2 text-gray-700">
                  Players:
                </h3>
                <div className="user-list border border-gray-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="py-2 border-b border-gray-100 last:border-b-0"
                    >
                      {user.username} {user.id === myId ? "(You)" : ""}
                    </div>
                  ))}
                  {users.length === 0 && (
                    <div className="py-2 text-gray-500 italic">
                      No players have joined yet
                    </div>
                  )}
                </div>
              </div>

              <div className="game-status mb-6 p-4 bg-green-50 rounded-lg">
                {gameInProgress ? (
                  <p>
                    Game in progress.
                    {currentPlayer && (
                      <span>
                        {" "}
                        Current player:{" "}
                        <span className="font-bold text-orange-600">
                          {currentPlayer}
                        </span>
                      </span>
                    )}
                  </p>
                ) : (
                  <p>
                    {users.length >= 4
                      ? "Enough players joined! Game will start soon..."
                      : `Waiting for ${Math.max(
                          0,
                          4 - users.length
                        )} more player${
                          Math.max(0, 4 - users.length) === 1 ? "" : "s"
                        } to join...`}
                  </p>
                )}
              </div>

              <div className="game-controls mb-6 flex flex-wrap gap-3 justify-between">
                <button
                  onClick={() => {
                    if (
                      socketRef.current &&
                      socketRef.current.readyState === WebSocket.OPEN
                    ) {
                      socketRef.current.send(
                        JSON.stringify({
                          event: "leave",
                          data: {},
                        })
                      );
                      setJoinedGame(false);
                    }
                  }}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-md transition-colors"
                >
                  Leave Game
                </button>

                {users.length >= 4 && !isSpinning && (
                  <button
                    onClick={handleSpinWheel}
                    className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-md transition-colors text-lg shadow-md"
                  >
                    {revealedIP ? "SPIN AGAIN" : "SPIN THE WHEEL"}
                  </button>
                )}

                <button
                  onClick={() => {
                    if (
                      socketRef.current &&
                      socketRef.current.readyState === WebSocket.OPEN
                    ) {
                      socketRef.current.send(
                        JSON.stringify({
                          event: "clearPlayers",
                          data: {},
                        })
                      );
                    }
                  }}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-md transition-colors"
                >
                  Remove All Players
                </button>
              </div>

              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2 text-gray-700">
                  The Wheel of Misfortune:
                </h3>

                <div className="relative mx-auto my-8 flex flex-col items-center">
                  {/* Wheel container */}
                  <div className="relative w-64 h-64 sm:w-80 sm:h-80 mx-auto">
                    {/* Wheel */}
                    <div
                      className="w-full h-full rounded-full border-8 border-green-200 bg-gradient-to-br from-green-800 to-green-600 shadow-xl flex items-center justify-center overflow-hidden"
                      style={{
                        transform: `rotate(${wheelRotation}deg)`,
                        transition: isSpinning
                          ? "transform 5s cubic-bezier(0.3, 0.1, 0.3, 1.0)"
                          : "transform 0.5s ease-out",
                      }}
                    >
                      {/* User segments on the wheel */}
                      <div className="absolute w-full h-full">
                        {users.map((user, idx) => {
                          const segmentAngle = 360 / users.length;
                          const startAngle = idx * segmentAngle;
                          const endAngle = startAngle + segmentAngle;
                          const isSelected = selectedUsername === user.username;

                          // Multiple segment colors for better distinction
                          const segmentColors = [
                            "#059669",
                            "#047857",
                            "#065f46",
                            "#0d9488",
                            "#0f766e",
                            "#115e59",
                          ];
                          const colorClass =
                            segmentColors[idx % segmentColors.length];

                          // Calculate arc path for segment - this creates proper pie slices
                          const startRad = (startAngle * Math.PI) / 180;
                          const endRad = (endAngle * Math.PI) / 180;

                          const x1 = 50 + 50 * Math.sin(startRad);
                          const y1 = 50 - 50 * Math.cos(startRad);

                          const x2 = 50 + 50 * Math.sin(endRad);
                          const y2 = 50 - 50 * Math.cos(endRad);

                          const largeArcFlag = segmentAngle > 180 ? 1 : 0;

                          const pathD = `M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

                          return (
                            <div key={user.id} className="absolute inset-0">
                              <svg
                                viewBox="0 0 100 100"
                                className="w-full h-full"
                              >
                                <path
                                  d={pathD}
                                  fill={isSelected ? "#ef4444" : colorClass}
                                  stroke={isSelected ? "#b91c1c" : "#064e3b"}
                                  strokeWidth="0.5"
                                />

                                {/* Black divider line between segments */}
                                <line
                                  x1="50"
                                  y1="50"
                                  x2={x1}
                                  y2={y1}
                                  stroke="black"
                                  strokeWidth="1"
                                />
                              </svg>

                              {/* Username label positioned in segment */}
                              <div
                                className="absolute whitespace-nowrap text-white font-bold text-xs sm:text-sm z-10"
                                style={{
                                  left: `${
                                    50 +
                                    30 *
                                      Math.sin(
                                        ((startAngle + segmentAngle / 2) *
                                          Math.PI) /
                                          180
                                      )
                                  }%`,
                                  top: `${
                                    50 -
                                    30 *
                                      Math.cos(
                                        ((startAngle + segmentAngle / 2) *
                                          Math.PI) /
                                          180
                                      )
                                  }%`,
                                  transform: `translate(-50%, -50%) rotate(${
                                    90 + startAngle + segmentAngle / 2
                                  }deg)`,
                                  textShadow: "1px 1px 2px rgba(0,0,0,0.7)",
                                }}
                              >
                                {user.username}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Center of wheel */}
                      <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-inner z-10">
                        <div className="w-6 h-6 rounded-full bg-white"></div>
                      </div>
                    </div>

                    {/* Pointer */}
                    <div className="absolute top-0 left-1/2 w-5 h-10 bg-red-600 -ml-2.5 -mt-2 rounded-b-lg z-20"></div>
                  </div>

                  {/* Results display */}
                  {revealedIP && selectedUsername && (
                    <div className="mt-8 p-6 bg-red-100 border-2 border-red-500 rounded-lg text-center shadow-lg animate-pulse">
                      <div className="flex items-center justify-center mb-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-8 w-8 text-red-600 mr-2"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                        <h3 className="text-2xl font-bold text-red-800">
                          IP LEAKED!
                        </h3>
                      </div>
                      <p className="text-lg font-semibold text-red-800 mb-3">
                        {selectedUsername}'s bad luck has revealed their
                        location!
                      </p>
                      <div className="mt-4 p-3 bg-red-200 rounded-md inline-block">
                        <p className="text-xl font-mono font-bold text-red-900">
                          IP Address: {revealedIP}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

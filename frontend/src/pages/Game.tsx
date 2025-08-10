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

  const handleClearPlayers = () => {
    if (window.confirm("Are you sure you want to clear all players?")) {
      socketRef.current?.send(
        JSON.stringify({
          event: "clearPlayers",
          data: {},
        })
      );
    }
  };

  const handleGoBack = () => {
    // Close socket if open
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
    navigate("/");
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

              <div className="game-controls mb-6">
                <button
                  onClick={handleClearPlayers}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-md transition-colors"
                >
                  Clear All Players
                </button>
              </div>

              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2 text-gray-700">
                  Game Events:
                </h3>
                <div
                  ref={eventsLogRef}
                  className="events-log border border-gray-200 rounded-lg p-4 h-64 overflow-y-auto font-mono bg-gray-50"
                >
                  {events.map((event, idx) => (
                    <div
                      key={idx}
                      className={`
                        ${event.isError ? "text-red-600" : ""} 
                        ${
                          event.className === "current-player"
                            ? "font-bold text-orange-600"
                            : ""
                        }
                        ${
                          event.className === "revealed"
                            ? "font-bold text-red-700"
                            : ""
                        }
                        ${
                          event.className === "safe"
                            ? "font-bold text-green-700"
                            : ""
                        }
                      `}
                    >
                      [{event.timestamp}] {event.message}
                    </div>
                  ))}
                  {events.length === 0 && (
                    <div className="py-2 text-gray-500 italic">
                      No events yet
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

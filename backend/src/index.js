import { DurableObject } from 'cloudflare:workers';

export class IPRouletteGame extends DurableObject {
	constructor(state, env) {
		super(state, env);
		this.env = env;
		this.state = state;
		this.storage = state.storage;
		this.state.blockConcurrencyWhile(async () => {
			this.users = (await this.storage.get('users')) || [];
			this.currentPlayerIndex = (await this.storage.get('currentPlayerIndex')) || null;
			this.gameInProgress = (await this.storage.get('gameInProgress')) || false;
			this.revealedUsers = (await this.storage.get('revealedUsers')) || [];
		});
		this.sessions = new Map();
		this.state.getWebSockets().forEach((webSocket) => {
			let meta = webSocket.deserializeAttachment();
			this.sessions.set(webSocket, { ...meta });
		});
	}

	async saveState() {
		await this.storage.put('users', this.users);
		await this.storage.put('currentPlayerIndex', this.currentPlayerIndex);
		await this.storage.put('gameInProgress', this.gameInProgress);
		await this.storage.put('revealedUsers', this.revealedUsers);
	}

	async fetch(request) {
		let pair = new WebSocketPair();

		await this.handleSession(pair[1], request);

		return new Response(null, {
			status: 101,
			webSocket: pair[0],
			headers: {
				Upgrade: 'websocket',
				Connection: 'Upgrade',
			},
		});
	}

	async handleSession(ws, request) {
		// Get the client's IP address from the request
		const clientIP = request.headers.get('CF-Connecting-IP') || '0.0.0.0';

		// Accept the WebSocket connection and store initial data
		this.state.acceptWebSocket(ws);
		this.sessions.set(ws, { ip: clientIP });

		// Send current game state to new connection
		ws.send(
			JSON.stringify({
				event: 'gameState',
				data: {
					users: this.users.map((user) => ({ id: user.id, username: user.username })),
					gameInProgress: this.gameInProgress,
					currentPlayerIndex: this.currentPlayerIndex,
					currentPlayer: this.currentPlayerIndex !== null ? this.users[this.currentPlayerIndex]?.username : null,
				},
			})
		);
	}

	async webSocketClose(ws) {
		const session = this.sessions.get(ws);
		if (session && session.id) {
			// Remove user from the game
			this.users = this.users.filter((user) => user.id !== session.id);

			// Broadcast user left
			this.broadcastMessage('userLeft', {
				id: session.id,
				username: session.username,
			});

			// Game logic for handling player leaving
			this.handlePlayerLeaving(session);

			await this.saveState();
		}

		// Always delete the WebSocket from sessions
		this.sessions.delete(ws);
	}

	async handlePlayerLeaving(session) {
		// If game in progress and current player left, move to next player
		if (this.gameInProgress && this.currentPlayerIndex !== null && this.users.length > 0) {
			// Check if we need to adjust currentPlayerIndex
			if (this.currentPlayerIndex >= this.users.length) {
				this.currentPlayerIndex = 0;
			}

			// If current player left and we were processing them, move to next
			const currentUserId = this.users[this.currentPlayerIndex]?.id;
			if (session.id === currentUserId) {
				this.moveToNextPlayer();
			}
		} else if (this.users.length < 4 && this.gameInProgress) {
			// Stop the game if fewer than 4 players
			this.gameInProgress = false;
			this.currentPlayerIndex = null;
			this.broadcastMessage('gameStopped', {
				reason: 'Not enough players',
			});
		}
	}

	async webSocketError(ws, error) {
		console.log(error);
		// Treat errors the same as closes - just remove the WebSocket
		this.webSocketClose(ws);
	}

	async webSocketMessage(ws, message) {
		try {
			const { event, data } = JSON.parse(message);

			switch (event) {
				case 'join': {
					const { username } = data;
					if (!username) return;

					const session = this.sessions.get(ws) || {};
					const userId = crypto.randomUUID();

					session.id = userId;
					session.username = username;

					// Save to session
					this.sessions.set(ws, session);
					ws.serializeAttachment(session);

					// Add to users list - don't store WebSocket in users array
					const user = {
						id: userId,
						username,
						ip: session.ip,
					};

					this.users.push(user);
					await this.saveState();

					// Send user list to the newly joined user
					ws.send(
						JSON.stringify({
							event: 'joined',
							data: {
								id: userId,
								users: this.users.map((u) => ({ id: u.id, username: u.username })),
							},
						})
					);

					// Broadcast new user to everyone else
					this.broadcastMessage(
						'userJoined',
						{
							id: userId,
							username,
						},
						ws
					);

					// Check if we should start the game (4+ players)
					if (this.users.length >= 4 && !this.gameInProgress) {
						this.startGame();
					}

					break;
				}

				case 'clearPlayers': {
					// Clear all players and reset the game
					this.users = [];
					this.gameInProgress = false;
					this.currentPlayerIndex = null;
					this.revealedUsers = [];

					await this.saveState();

					// Broadcast the game state has been reset
					this.broadcastMessage('gameReset', {
						message: 'All players have been cleared from the game',
					});

					break;
				}

				case 'spinWheel': {
					// Check if we have enough users
					if (this.users.length < 4) {
						return;
					}

					// Randomly select a user on the server side
					const selectedIndex = Math.floor(Math.random() * this.users.length);
					const selectedUser = this.users[selectedIndex];

					if (selectedUser) {
						// Calculate rotation values on the server to ensure all clients see the same animation
						const rotations = 10 + Math.floor(Math.random() * 5); // Between 10-14 full rotations for more suspense
						const segmentAngle = 360 / this.users.length;
						const segmentCenter = selectedIndex * segmentAngle + segmentAngle / 2;

						// For clockwise rotation:
						// To make the selected user land directly under the pointer (at top/0 degrees),
						// we need to rotate the wheel so that the segment center aligns with 0 degrees (top)
						// This means we need to rotate by 360 - segmentCenter degrees
						const targetAngle = 360 - segmentCenter;

						// Total rotation - always clockwise (positive numbers)
						// The wheel will always spin in a clockwise direction with many rotations
						const totalRotation = rotations * 360 + targetAngle;

						// Broadcast the wheel spin to all clients, including rotation details
						this.broadcastMessage('wheelSpin', {
							selectedUserId: selectedUser.id,
							selectedUsername: selectedUser.username,
							totalRotation: totalRotation,
						});

						// Add this user to revealed users list
						this.revealedUsers.push(selectedUser.id);
						await this.saveState();

						// Give time for the animation to complete before revealing the IP
						setTimeout(() => {
							this.broadcastMessage('ipRevealed', {
								playerId: selectedUser.id,
								playerUsername: selectedUser.username,
								playerIP: selectedUser.ip,
							});
						}, 9000); // Wait for wheel animation plus a small buffer (matching the 8s animation + buffer)
					}

					break;
				}

				// Add more event handlers here as needed

				default:
					break;
			}
		} catch (error) {
			console.error('Error processing WebSocket message:', error);
		}
	}

	async startGame() {
		this.gameInProgress = true;
		this.currentPlayerIndex = null; // We don't need this for the new approach
		this.revealedUsers = [];
		await this.saveState();

		// Broadcast game start
		this.broadcastMessage('gameStarted', {
			gameInProgress: true,
		});
	}

	// These functions are no longer needed with the new approach
	// since we're now selecting a random user directly when spinning the wheel
	async processCurrentPlayer() {
		// Kept for backwards compatibility but not used
	}

	async moveToNextPlayer() {
		// Kept for backwards compatibility but not used
	}

	async broadcastMessage(event, data, excludeWs = null) {
		// Using the same pattern as the examples - try to send and remove dead connections
		this.sessions.forEach((session, ws) => {
			if (excludeWs && ws === excludeWs) return;

			try {
				ws.send(JSON.stringify({ event, data }));
			} catch (error) {
				// If sending fails, remove the WebSocket
				this.sessions.delete(ws);
			}
		});
	}
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const path = url.pathname.split('/');

		switch (path[1]) {
			case 'join': {
				const id = env.ROULETTE_GAME.idFromName('default-room');
				const stub = env.ROULETTE_GAME.get(id);
				return stub.fetch(request);
			}
			default:
				return new Response('Welcome to IP Roulette! Connect to /join with a WebSocket to play.', {
					headers: { 'Content-Type': 'text/plain' },
				});
		}
	},
};

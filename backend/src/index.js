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
		this.currentPlayerIndex = 0;
		this.revealedUsers = [];
		await this.saveState();

		// Broadcast game start
		this.broadcastMessage('gameStarted', {
			currentPlayer: this.users[this.currentPlayerIndex].username,
		});

		// Start the first round
		this.processCurrentPlayer();
	}

	async processCurrentPlayer() {
		if (!this.gameInProgress || this.currentPlayerIndex === null || this.users.length === 0) return;

		const currentUser = this.users[this.currentPlayerIndex];
		if (!currentUser) return;

		// Broadcast whose turn it is
		this.broadcastMessage('playerTurn', {
			playerId: currentUser.id,
			playerUsername: currentUser.username,
		});

		// Wait a few seconds before the "roulette" happens
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Check if the game is still in progress (users might have left)
		if (!this.gameInProgress) return;

		// Determine if IP gets revealed (1 in X chance, where X is number of players)
		const revealIP = Math.floor(Math.random() * this.users.length) === 0;

		if (revealIP) {
			// Reveal the IP address
			this.revealedUsers.push(currentUser.id);

			this.broadcastMessage('ipRevealed', {
				playerId: currentUser.id,
				playerUsername: currentUser.username,
				playerIP: currentUser.ip,
			});
		} else {
			// IP not revealed this time
			this.broadcastMessage('ipSafe', {
				playerId: currentUser.id,
				playerUsername: currentUser.username,
			});
		}

		await this.saveState();

		// Move to next player after a short delay
		setTimeout(() => this.moveToNextPlayer(), 2000);
	}

	async moveToNextPlayer() {
		if (!this.gameInProgress || this.users.length === 0) return;

		// Move to next player
		this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.users.length;
		await this.saveState();

		// Process the next player
		this.processCurrentPlayer();
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

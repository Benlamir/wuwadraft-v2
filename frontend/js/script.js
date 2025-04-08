// --- WebSocket Connection ---

// Placeholder for the WebSocket endpoint URL - we will replace this later!
const WEBSOCKET_URL =
  "wss://bs8e4l0vld.execute-api.us-east-1.amazonaws.com/dev"; // Replace with your actual API Gateway WebSocket URL

console.log("Attempting to connect WebSocket to:", WEBSOCKET_URL);

// Global variables for lobby state
let currentLobbyId = null;
let currentUserName = null;
let isCurrentUserHost = false;
let screens = null;
let lobbyIdDisplay = null;
let hostNameDisplay = null;
let player1NameDisplay = null;
let player2NameDisplay = null;
let lobbyStatusDisplay = null;
let player1StatusElement = null;
let player2StatusElement = null;

// Global variables for DOM elements
let hostControls = null;
let playerControls = null;

// Create WebSocket connection.
const socket = new WebSocket(WEBSOCKET_URL);

// Connection opened
socket.addEventListener("open", (event) => {
  console.log("WebSocket connection established successfully!", event);
  // You could send an initial message here if needed, e.g., register user
  // socket.send(JSON.stringify({ action: 'register', username: 'Player1' }));
});

// Listen for messages
socket.addEventListener("message", (event) => {
  console.log("Message from server: ", event.data);
  try {
    const message = JSON.parse(event.data);
    console.log("Received message:", message);

    switch (message.type) {
      case "lobbyCreated":
        console.log("Processing lobbyCreated message:", message);

        // Store lobby info globally FIRST
        currentLobbyId = message.lobbyId;
        isCurrentUserHost = message.isHost;

        // Get element references INSIDE the handler when needed
        const lobbyIdDisplayElement =
          document.getElementById("lobby-id-display");
        const toggleLobbyIdDisplayBtnElement = document.getElementById(
          "toggle-lobby-id-display"
        );
        const hostNameDisplayElement = document.getElementById("host-name");

        // Now use these local references
        if (lobbyIdDisplayElement) {
          lobbyIdDisplayElement.textContent = "••••••••"; // Show dots initially
          const icon = toggleLobbyIdDisplayBtnElement?.querySelector("i");
          if (icon) {
            icon.classList.remove("bi-eye-slash-fill");
            icon.classList.add("bi-eye-fill");
          }
        } else {
          console.error("lobby-id-display element not found!");
        }

        // Update Host Name display with logging
        console.log(
          "Updating host display. isHost:",
          isCurrentUserHost,
          "userName:",
          currentUserName
        );
        if (hostNameDisplayElement && isCurrentUserHost && currentUserName) {
          hostNameDisplayElement.textContent = currentUserName; // Removed "(Host)" suffix
        } else if (hostNameDisplayElement) {
          hostNameDisplayElement.textContent = "[Host Name Error]";
          console.error(
            "Could not display host name. Check isHost and currentUserName values in log above."
          );
        }

        // Call the global showScreen function
        showScreen("lobby-wait-screen");
        break;

      case "lobbyJoined":
        console.log("Processing lobbyJoined message:", message);
        currentLobbyId = message.lobbyId;
        isCurrentUserHost = message.isHost; // Will be false for joining player

        // --- Get references to lobby elements ---
        const joinedLobbyIdDisplay =
          document.getElementById("lobby-id-display");
        const joinedToggleBtn = document.getElementById(
          "toggle-lobby-id-display"
        );
        const joinedHostNameDisplay = document.getElementById("host-name");
        const joinedPlayer1Name = document.getElementById("player1-name");
        const joinedPlayer2Name = document.getElementById("player2-name");
        const joinedHostControls = document.getElementById("host-controls");
        const joinedPlayerControls = document.getElementById("player-controls");

        // Set Lobby ID display (hidden initially)
        if (joinedLobbyIdDisplay) {
          joinedLobbyIdDisplay.textContent = "••••••••";
          const icon = joinedToggleBtn?.querySelector("i");
          if (icon) {
            // Reset icon
            icon.classList.remove("bi-eye-slash-fill");
            icon.classList.add("bi-eye-fill");
          }
        }

        // Update player list with the joining player's name
        // (currentUserName should be set when they clicked Join)
        if (message.assignedSlot === "P1" && joinedPlayer1Name) {
          joinedPlayer1Name.textContent = currentUserName + " (You)";
        } else if (message.assignedSlot === "P2" && joinedPlayer2Name) {
          joinedPlayer2Name.textContent = currentUserName + " (You)";
        }
        // TODO: We need a way to get the *other* player's name and host name here.
        // This likely requires the backend to send the full current lobby state
        // in the lobbyJoined message, or send separate updateState messages.
        // For now, host/other player names might remain blank or "Waiting...".
        if (joinedHostNameDisplay)
          joinedHostNameDisplay.textContent = "[Host Name]"; // Placeholder

        // Show/Hide Controls
        if (joinedHostControls) joinedHostControls.style.display = "none"; // Joining player is not host
        if (joinedPlayerControls) joinedPlayerControls.style.display = "block"; // Show player controls (e.g., Leave button)

        // Switch view
        showScreen("lobby-wait-screen");
        break;

      case "playerJoined":
        updatePlayerList(message.players);
        break;
      case "lobbyStateUpdate":
        console.log("Received lobby state update:", message);
        updateLobbyState(message);

        // Check if draft has started
        if (message.lobbyState === "DRAFT_STARTED") {
          console.log("Draft has started, transitioning to draft screen");
          showScreen("draft-screen");
        }
        break;
      case "error":
        console.error("Server error:", message.error);
        break;
      case "echo":
        console.log("Echo:", message.content);
        break;
      default:
        console.log("Unknown message type:", message.type);
    }
  } catch (error) {
    console.error("Error parsing message:", error);
  }
});

// Listen for errors
socket.addEventListener("error", (event) => {
  console.error("WebSocket error observed:", event);
});

// Connection closed
socket.addEventListener("close", (event) => {
  if (event.wasClean) {
    console.log(
      `WebSocket connection closed cleanly, code=${event.code} reason=${event.reason}`
    );
  } else {
    // e.g. server process killed or network down
    // event.code is usually 1006 in this case
    console.error("WebSocket connection died (event code 1006?)");
  }
  // Optionally, you might want to implement reconnection logic here
});

// --- UI Interaction (Placeholder Functions) ---
// We will add functions here later to update the HTML based on messages

// Example function to send data (we'll call this later from UI elements)
function sendMessageToServer(message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    console.log("Sent message:", message);
  } else {
    console.error("WebSocket is not open. ReadyState: " + socket.readyState);
  }
}

function showScreen(screenIdToShow) {
  console.log(`Navigating to screen: ${screenIdToShow}`);
  // Hide all screens first by removing 'active' class
  screens.forEach((screen) => {
    if (screen) {
      // Check if element exists
      screen.classList.remove("active");
    }
  });
  // Show the requested screen by adding 'active' class
  const screenToShow = document.getElementById(screenIdToShow);
  if (screenToShow) {
    // Make sure it has the 'screen' class before adding 'active'
    if (screenToShow.classList.contains("screen")) {
      screenToShow.classList.add("active");
    } else {
      console.error(`Element ${screenIdToShow} is missing the 'screen' class.`);
      // Fallback or error handling needed? Maybe show welcome screen?
      // document.getElementById('welcome-screen')?.classList.add('active');
    }
  } else {
    console.error(`Screen with ID ${screenIdToShow} not found!`);
    // Fallback to welcome screen if target not found
    document.getElementById("welcome-screen")?.classList.add("active");
  }
}

function updateLobbyWaitScreen() {
  if (lobbyIdDisplay) {
    lobbyIdDisplay.textContent = currentLobbyId || "[ID Loading...]";
  }
  if (hostNameDisplay && currentUserName) {
    hostNameDisplay.textContent = currentUserName;
  }
  if (hostControls) {
    hostControls.style.display = isCurrentUserHost ? "block" : "none";
  }
  if (playerControls) {
    playerControls.style.display = isCurrentUserHost ? "none" : "block";
  }
}

function updatePlayerList(players) {
  if (player1NameDisplay) {
    player1NameDisplay.textContent = players.player1Name || "Waiting...";
  }
  if (player2NameDisplay) {
    player2NameDisplay.textContent = players.player2Name || "Waiting...";
  }
}

function updateLobbyState(state) {
  console.log("Updating lobby state:", state);

  // Update lobby status
  if (lobbyStatusDisplay) {
    lobbyStatusDisplay.textContent =
      state.lobbyState || "Waiting for players to join...";
  }

  // Update host name
  if (hostNameDisplay) {
    hostNameDisplay.textContent = state.hostName || "[Host Name]";
  }

  // Update player names and status
  if (player1NameDisplay) {
    player1NameDisplay.textContent = state.player1Name || "Waiting...";
  }
  if (player2NameDisplay) {
    player2NameDisplay.textContent = state.player2Name || "Waiting...";
  }

  // Update player readiness status
  if (player1StatusElement) {
    player1StatusElement.textContent = state.player1Ready
      ? "(Ready)"
      : "(Not Ready)";
    player1StatusElement.classList.toggle(
      "text-success",
      state.player1Ready === true
    );
    player1StatusElement.classList.toggle(
      "text-muted",
      state.player1Ready !== true
    );
  }
  if (player2StatusElement) {
    player2StatusElement.textContent = state.player2Ready
      ? "(Ready)"
      : "(Not Ready)";
    player2StatusElement.classList.toggle(
      "text-success",
      state.player2Ready === true
    );
    player2StatusElement.classList.toggle(
      "text-muted",
      state.player2Ready !== true
    );
  }

  // Update player list
  updatePlayerList({
    player1Name: state.player1Name,
    player2Name: state.player2Name,
  });
}

console.log("WebSocket script loaded.");

// --- UI Navigation and Interaction ---
document.addEventListener("DOMContentLoaded", () => {
  // --- Screen Elements ---
  const welcomeScreen = document.getElementById("welcome-screen");
  const createLobbyScreen = document.getElementById("create-lobby-screen");
  const joinLobbyScreen = document.getElementById("join-lobby-screen");
  const lobbyWaitScreen = document.getElementById("lobby-wait-screen");
  // Add other screen elements later (e.g., randomize-pick-screen, lobby-wait-screen)
  screens = document.querySelectorAll(".screen"); // Get all screen divs via common class

  // --- Lobby Wait Screen Elements ---
  lobbyIdDisplay = document.getElementById("lobby-id-display");
  const copyLobbyIdBtn = document.getElementById("copy-lobby-id-btn");
  hostControls = document.getElementById("host-controls");
  playerControls = document.getElementById("player-controls");
  const lobbyBackBtn = document.getElementById("lobby-back-btn");
  hostNameDisplay = document.getElementById("host-name");
  player1NameDisplay = document.getElementById("player1-name");
  player2NameDisplay = document.getElementById("player2-name");
  lobbyStatusDisplay = document.getElementById("lobby-status");
  const toggleLobbyIdDisplayBtn = document.getElementById(
    "toggle-lobby-id-display"
  );
  player1StatusElement = document.getElementById("player1-status");
  player2StatusElement = document.getElementById("player2-status");

  // --- Button Elements (Using Correct IDs) ---
  const actionCreateBtn = document.getElementById("action-create-btn");
  const actionJoinBtn = document.getElementById("action-join-btn");
  const actionRandomizeBtn = document.getElementById("action-randomize-btn");
  const createStartBtn = document.getElementById("create-start-btn");
  const joinStartBtn = document.getElementById("join-start-btn");
  const createBackBtn = document.getElementById("create-back-btn");
  const joinBackBtn = document.getElementById("join-back-btn");

  // --- Input Elements (Using Correct IDs) ---
  const createNameInput = document.getElementById("create-name-input");
  const joinNameInput = document.getElementById("join-name-input");
  const joinLobbyIdInput = document.getElementById("join-lobby-id-input");
  const toggleLobbyIdVisibilityBtn = document.getElementById(
    "toggle-lobby-id-visibility"
  );

  // --- Helper Function to Switch Screens (Using 'active' class) ---

  // --- Button Event Listeners ---

  // Welcome Screen Actions
  if (actionCreateBtn) {
    actionCreateBtn.addEventListener("click", () => {
      showScreen("create-lobby-screen");
    });
  }
  if (actionJoinBtn) {
    actionJoinBtn.addEventListener("click", () => {
      showScreen("join-lobby-screen");
    });
  }
  if (actionRandomizeBtn) {
    actionRandomizeBtn.addEventListener("click", () => {
      console.log("Randomize Pick clicked - feature not implemented yet.");
      // Potentially showScreen('randomize-pick-screen') later
    });
  }

  // Create Lobby Screen Action
  if (createStartBtn) {
    createStartBtn.addEventListener("click", () => {
      const name = createNameInput.value.trim();
      if (name) {
        currentUserName = name;
        sendMessageToServer({
          action: "createLobby",
          name: name,
        });
      }
    });
  }

  // Join Lobby Screen Action
  if (joinStartBtn) {
    joinStartBtn.addEventListener("click", () => {
      const name = joinNameInput.value.trim();
      const lobbyId = joinLobbyIdInput.value.trim();
      if (name && lobbyId) {
        currentUserName = name;
        sendMessageToServer({
          action: "joinLobby",
          name: name,
          lobbyId: lobbyId,
        });
      }
    });
  }

  // Back Buttons (Navigating back to welcome-screen)
  if (createBackBtn) {
    createBackBtn.addEventListener("click", () => showScreen("welcome-screen"));
  }
  if (joinBackBtn) {
    joinBackBtn.addEventListener("click", () => showScreen("welcome-screen"));
  }

  // --- Password Toggle Functionality ---
  if (toggleLobbyIdVisibilityBtn && joinLobbyIdInput) {
    toggleLobbyIdVisibilityBtn.addEventListener("click", () => {
      const icon = toggleLobbyIdVisibilityBtn.querySelector("i");
      const currentType = joinLobbyIdInput.getAttribute("type");
      if (currentType === "password") {
        joinLobbyIdInput.setAttribute("type", "text");
        if (icon) {
          icon.classList.remove("bi-eye-fill");
          icon.classList.add("bi-eye-slash-fill");
        }
      } else {
        joinLobbyIdInput.setAttribute("type", "password");
        if (icon) {
          icon.classList.remove("bi-eye-slash-fill");
          icon.classList.add("bi-eye-fill");
        }
      }
    });
  }

  // --- Lobby ID Display Toggle Functionality ---
  if (toggleLobbyIdDisplayBtn && lobbyIdDisplay) {
    toggleLobbyIdDisplayBtn.addEventListener("click", () => {
      const icon = toggleLobbyIdDisplayBtn.querySelector("i");
      const currentText = lobbyIdDisplay.textContent;

      if (currentText === "••••••••") {
        // Show the ID
        lobbyIdDisplay.textContent = currentLobbyId || "Error";
        if (icon) {
          icon.classList.remove("bi-eye-fill");
          icon.classList.add("bi-eye-slash-fill");
        }
      } else {
        // Hide the ID
        lobbyIdDisplay.textContent = "••••••••";
        if (icon) {
          icon.classList.remove("bi-eye-slash-fill");
          icon.classList.add("bi-eye-fill");
        }
      }
    });
  }

  // --- Event Listeners ---
  if (copyLobbyIdBtn) {
    copyLobbyIdBtn.addEventListener("click", async () => {
      if (currentLobbyId && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(currentLobbyId);
          const icon = copyLobbyIdBtn.querySelector("i");
          if (icon) {
            icon.classList.remove("bi-clipboard");
            icon.classList.add("bi-clipboard-check");
            setTimeout(() => {
              icon.classList.remove("bi-clipboard-check");
              icon.classList.add("bi-clipboard");
            }, 2000);
          }
        } catch (error) {
          console.error("Failed to copy lobby ID:", error);
        }
      }
    });
  }

  if (lobbyBackBtn) {
    lobbyBackBtn.addEventListener("click", () => {
      showScreen("welcome-screen");
    });
  }

  // --- Initial Screen ---
  // We rely on the HTML having the 'active' class on welcome-screen initially.
  // This ensures CSS handles the initial view correctly.
  // If needed, we could force it here, but CSS+HTML should be sufficient:
  // showScreen('welcome-screen');
}); // End of DOMContentLoaded listener

// --- WebSocket Connection ---

// Placeholder for the WebSocket endpoint URL - we will replace this later!
const WEBSOCKET_URL =
  "wss://bs8e4l0vld.execute-api.us-east-1.amazonaws.com/dev"; // Replace with your actual API Gateway WebSocket URL

console.log("Attempting to connect WebSocket to:", WEBSOCKET_URL);

// Global variables for lobby state
let currentLobbyId = null;
let isCurrentUserHost = false;
let currentUserName = null;
let screens = null;

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
      case "playerJoined":
        updatePlayerList(message.players);
        break;
      case "updateState":
        updateLobbyState(message.state);
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
  const lobbyIdDisplay = document.getElementById("lobby-id-display");
  const copyLobbyIdBtn = document.getElementById("copy-lobby-id-btn");
  const hostControls = document.getElementById("host-controls");
  const playerControls = document.getElementById("player-controls");
  const lobbyBackBtn = document.getElementById("lobby-back-btn");
  const hostNameDisplay = document.getElementById("host-name");
  const player1NameDisplay = document.getElementById("player1-name");
  const player2NameDisplay = document.getElementById("player2-name");
  const lobbyStatusDisplay = document.getElementById("lobby-status");
  const toggleLobbyIdDisplayBtn = document.getElementById(
    "toggle-lobby-id-display"
  );
  console.log(
    "Attempting to find toggle button. Element found:",
    toggleLobbyIdDisplayBtn
  );

  // --- Button Elements (Using Correct IDs) ---
  const actionCreateBtn = document.getElementById("action-create-btn");
  const actionJoinBtn = document.getElementById("action-join-btn");
  const actionRandomizeBtn = document.getElementById("action-randomize-btn");
  const createStartBtn = document.getElementById("create-start-btn");
  const joinStartBtn = document.getElementById("join-start-btn");
  // --- Back Buttons (Assuming IDs like create-back-btn, join-back-btn) ---
  // If your back buttons have different IDs, adjust these lines
  const createBackBtn = document.getElementById("create-back-btn"); // Example ID
  const joinBackBtn = document.getElementById("join-back-btn"); // Example ID

  // --- Input Elements (Using Correct IDs) ---
  const createNameInput = document.getElementById("create-name-input");
  const joinNameInput = document.getElementById("join-name-input");
  const joinLobbyIdInput = document.getElementById("join-lobby-id-input");
  const toggleLobbyIdBtn = document.getElementById(
    "toggle-lobby-id-visibility"
  );

  // --- Helper Function to Switch Screens (Using 'active' class) ---

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
      player1NameDisplay.textContent = players.player1 || "Waiting...";
    }
    if (player2NameDisplay) {
      player2NameDisplay.textContent = players.player2 || "Waiting...";
    }
  }

  function updateLobbyState(state) {
    if (lobbyStatusDisplay) {
      lobbyStatusDisplay.textContent =
        state.status || "Waiting for players to join...";
    }
    updatePlayerList(state.players || {});
  }

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
  console.log("Attempting to attach toggle listener...");
  if (toggleLobbyIdBtn && joinLobbyIdInput) {
    toggleLobbyIdBtn.addEventListener("click", () => {
      // --- Add logs below ---
      console.log("PASSWORD TOGGLE CLICKED!");
      const icon = toggleLobbyIdBtn.querySelector("i");
      const currentType = joinLobbyIdInput.getAttribute("type");
      console.log("Current input type:", currentType);
      console.log("Icon element:", icon);
      // --- End of logs to add for now ---

      if (currentType === "password") {
        console.log("Condition matched: Changing to text"); // Keep this log too
        joinLobbyIdInput.setAttribute("type", "text");
        if (icon) {
          // Check if icon exists before changing class
          icon.classList.remove("bi-eye-fill");
          icon.classList.add("bi-eye-slash-fill");
        }
      } else {
        console.log("Condition matched: Changing to password"); // Keep this log too
        joinLobbyIdInput.setAttribute("type", "password");
        if (icon) {
          // Check if icon exists before changing class
          icon.classList.remove("bi-eye-slash-fill");
          icon.classList.add("bi-eye-fill");
        }
      }
    });
    // Add this log after attaching the listener:
    console.log("Password toggle listener attached successfully.");
  } else {
    // Add this log if elements weren't found:
    console.error(
      "Could not find password input or toggle button to attach listener."
    );
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

// --- WebSocket Connection ---

// Placeholder for the WebSocket endpoint URL - we will replace this later!
const WEBSOCKET_URL =
  "wss://bs8e4l0vld.execute-api.us-east-1.amazonaws.com/dev"; // Replace with your actual API Gateway WebSocket URL

console.log("Attempting to connect WebSocket to:", WEBSOCKET_URL);

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
  // Here we will later parse event.data (likely JSON) and update the UI
  // const message = JSON.parse(event.data);
  // handleIncomingMessage(message);
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
function sendMessageToServer(messageObject) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(messageObject));
    console.log("Sent message:", messageObject);
  } else {
    console.error("WebSocket is not open. ReadyState: " + socket.readyState);
  }
}

console.log("WebSocket script loaded.");

// Custom JavaScript Logic

// --- UI Navigation and Interaction ---

document.addEventListener("DOMContentLoaded", () => {
  // Make sure the DOM is fully loaded before trying to find elements

  // Screen Elements
  const welcomeScreen = document.getElementById("welcome-screen");
  const actionSelectScreen = document.getElementById("action-select-screen");
  const createLobbyScreen = document.getElementById("create-lobby-screen");
  const joinLobbyScreen = document.getElementById("join-lobby-screen");
  const lobbyScreen = document.getElementById("lobby-screen"); // Placeholder for later
  const screens = [
    welcomeScreen,
    actionSelectScreen,
    createLobbyScreen,
    joinLobbyScreen,
    lobbyScreen,
  ];

  // Button Elements
  const startAppBtn = document.getElementById("btn-start-app");
  const showCreateBtn = document.getElementById("btn-show-create");
  const showJoinBtn = document.getElementById("btn-show-join");
  const showRandomizeBtn = document.getElementById("btn-show-randomize"); // Future feature
  const createLobbyStartBtn = document.getElementById("btn-create-lobby-start");
  const createBackBtn = document.getElementById("btn-create-back");
  const joinLobbyStartBtn = document.getElementById("btn-join-lobby-start");
  const joinBackBtn = document.getElementById("btn-join-back");

  // Input Elements
  const createNameInput = document.getElementById("input-create-name");
  const joinNameInput = document.getElementById("input-join-name");
  const joinLobbyIdInput = document.getElementById("input-join-lobby-id");

  // --- Navigation Function ---
  function showScreen(screenIdToShow) {
    console.log(`Navigating to screen: ${screenIdToShow}`);
    // Hide all screens first
    screens.forEach((screen) => {
      if (screen) {
        // Check if element exists before trying to style
        screen.style.display = "none";
      }
    });

    // Show the requested screen
    const screenToShow = document.getElementById(screenIdToShow);
    if (screenToShow) {
      screenToShow.style.display = "block"; // Or 'flex' if using flexbox layout inside
    } else {
      console.error(`Screen with ID ${screenIdToShow} not found!`);
    }
  }

  // --- Button Event Listeners ---

  if (startAppBtn) {
    startAppBtn.addEventListener("click", () => {
      showScreen("action-select-screen");
    });
  }

  if (showCreateBtn) {
    showCreateBtn.addEventListener("click", () => {
      showScreen("create-lobby-screen");
    });
  }

  if (showJoinBtn) {
    showJoinBtn.addEventListener("click", () => {
      showScreen("join-lobby-screen");
    });
  }

  // Back buttons
  if (createBackBtn) {
    createBackBtn.addEventListener("click", () =>
      showScreen("action-select-screen")
    );
  }
  if (joinBackBtn) {
    joinBackBtn.addEventListener("click", () =>
      showScreen("action-select-screen")
    );
  }

  // TODO: Add listener for showRandomizeBtn when implemented

  // --- Action Buttons ---

  if (createLobbyStartBtn) {
    createLobbyStartBtn.addEventListener("click", () => {
      const playerName = createNameInput.value.trim();
      if (!playerName) {
        alert("Please enter your name."); // Simple validation
        return;
      }
      console.log(`Sending createLobby action with name: ${playerName}`);
      // Action to send to backend WebSocket
      sendMessageToServer({ action: "createLobby", name: playerName });
      // TODO: Optionally show a loading state here
      // showScreen('loading-screen'); // Example
      // We will transition to lobby-screen later based on server response
    });
  }

  if (joinLobbyStartBtn) {
    joinLobbyStartBtn.addEventListener("click", () => {
      const playerName = joinNameInput.value.trim();
      const lobbyId = joinLobbyIdInput.value.trim();
      if (!playerName || !lobbyId) {
        alert("Please enter your name and the Lobby ID."); // Simple validation
        return;
      }
      console.log(
        `Sending joinLobby action with name: ${playerName}, lobbyId: ${lobbyId}`
      );
      // Action to send to backend WebSocket
      sendMessageToServer({
        action: "joinLobby",
        name: playerName,
        lobbyId: lobbyId,
      });
      // TODO: Optionally show a loading state here
      // showScreen('loading-screen'); // Example
      // We will transition to lobby-screen later based on server response
    });
  }

  // --- Initial Screen ---
  // Show the welcome screen when the page loads and JS is ready
  showScreen("welcome-screen");
}); // End of DOMContentLoaded listener

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

// --- UI Navigation and Interaction ---
document.addEventListener("DOMContentLoaded", () => {
  // --- Screen Elements ---
  const welcomeScreen = document.getElementById("welcome-screen");
  const createLobbyScreen = document.getElementById("create-lobby-screen");
  const joinLobbyScreen = document.getElementById("join-lobby-screen");
  // Add other screen elements later (e.g., randomize-pick-screen, lobby-wait-screen)
  const screens = document.querySelectorAll(".screen"); // Get all screen divs via common class

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

  // --- Password Toggle Functionality ---
  if (toggleLobbyIdBtn && joinLobbyIdInput) {
    toggleLobbyIdBtn.addEventListener("click", () => {
      // Get the icon element inside the button
      const icon = toggleLobbyIdBtn.querySelector("i");

      // Toggle the input type between password and text
      const currentType = joinLobbyIdInput.getAttribute("type");
      if (currentType === "password") {
        joinLobbyIdInput.setAttribute("type", "text");
        // Change icon to eye-slash
        icon.classList.remove("bi-eye-fill");
        icon.classList.add("bi-eye-slash-fill");
      } else {
        joinLobbyIdInput.setAttribute("type", "password");
        // Change icon back to eye
        icon.classList.remove("bi-eye-slash-fill");
        icon.classList.add("bi-eye-fill");
      }
    });
  }

  // --- Helper Function to Switch Screens (Using 'active' class) ---
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
        console.error(
          `Element ${screenIdToShow} is missing the 'screen' class.`
        );
        // Fallback or error handling needed? Maybe show welcome screen?
        // document.getElementById('welcome-screen')?.classList.add('active');
      }
    } else {
      console.error(`Screen with ID ${screenIdToShow} not found!`);
      // Fallback to welcome screen if target not found
      document.getElementById("welcome-screen")?.classList.add("active");
    }
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
      const enteredName = createNameInput.value.trim();
      if (!enteredName) {
        alert("Please enter your name."); // Simple validation
        return;
      }
      console.log(`Sending createLobby action with name: ${enteredName}`);
      sendMessageToServer({ action: "createLobby", name: enteredName });
      // Later: Show loading state, transition based on server response
    });
  }

  // Join Lobby Screen Action
  if (joinStartBtn) {
    joinStartBtn.addEventListener("click", () => {
      const enteredName = joinNameInput.value.trim();
      const enteredLobbyId = joinLobbyIdInput.value.trim();
      if (!enteredName || !enteredLobbyId) {
        alert("Please enter both your name and the Lobby ID."); // Simple validation
        return;
      }
      console.log(
        `Sending joinLobby action with name: ${enteredName}, lobbyId: ${enteredLobbyId}`
      );
      sendMessageToServer({
        action: "joinLobby",
        name: enteredName,
        lobbyId: enteredLobbyId,
      });
      // Later: Show loading state, transition based on server response
    });
  }

  // Back Buttons (Navigating back to welcome-screen)
  if (createBackBtn) {
    createBackBtn.addEventListener("click", () => showScreen("welcome-screen"));
  }
  if (joinBackBtn) {
    joinBackBtn.addEventListener("click", () => showScreen("welcome-screen"));
  }

  // --- Initial Screen ---
  // We rely on the HTML having the 'active' class on welcome-screen initially.
  // This ensures CSS handles the initial view correctly.
  // If needed, we could force it here, but CSS+HTML should be sufficient:
  // showScreen('welcome-screen');
}); // End of DOMContentLoaded listener

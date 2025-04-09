// frontend/js/uiElements.js

// Object to hold references after initialization
export const elements = {};

// Function to populate the elements object
export function initializeElements() {
  console.log("UI: Initializing elements...");
  // Screens
  elements.welcomeScreen = document.getElementById("welcome-screen");
  elements.createLobbyScreen = document.getElementById("create-lobby-screen");
  elements.joinLobbyScreen = document.getElementById("join-lobby-screen");
  elements.lobbyWaitScreen = document.getElementById("lobby-wait-screen");
  elements.draftScreen = document.getElementById("draft-screen"); // Assuming this exists now
  elements.screensNodeList = document.querySelectorAll(".screen"); // Get NodeList

  // Welcome Screen Buttons
  elements.actionCreateBtn = document.getElementById("action-create-btn");
  elements.actionJoinBtn = document.getElementById("action-join-btn");
  elements.actionRandomizeBtn = document.getElementById("action-randomize-btn");

  // Create/Join Inputs & Buttons
  elements.createNameInput = document.getElementById("create-name-input");
  elements.createStartBtn = document.getElementById("create-start-btn");
  elements.createBackBtn = document.getElementById("create-back-btn");
  elements.joinNameInput = document.getElementById("join-name-input");
  elements.joinLobbyIdInput = document.getElementById("join-lobby-id-input");
  elements.toggleLobbyIdVisibilityBtn = document.getElementById(
    "toggle-lobby-id-visibility"
  );
  elements.joinStartBtn = document.getElementById("join-start-btn");
  elements.joinBackBtn = document.getElementById("join-back-btn");

  // Lobby Wait Screen Elements
  elements.lobbyIdDisplay = document.getElementById("lobby-id-display");
  elements.toggleLobbyIdDisplayBtn = document.getElementById(
    "toggle-lobby-id-display"
  );
  elements.copyLobbyIdBtn = document.getElementById("copy-lobby-id-btn");
  elements.hostNameDisplay = document.getElementById("host-name");
  elements.player1NameDisplay = document.getElementById("player1-name");
  elements.player2NameDisplay = document.getElementById("player2-name");
  elements.player1StatusElement = document.getElementById("player1-status");
  elements.player2StatusElement = document.getElementById("player2-status");
  elements.lobbyStatusDisplay = document.getElementById("lobby-status");
  elements.hostControls = document.getElementById("host-controls");
  elements.playerControls = document.getElementById("player-controls");
  elements.player1ReadyBtn = document.getElementById("player1-ready-btn");
  elements.player2ReadyBtn = document.getElementById("player2-ready-btn");
  elements.lobbyBackBtn = document.getElementById("lobby-back-btn");

  // Draft Screen Elements (Add more as needed)
  elements.draftBackBtn = document.getElementById("draft-back-btn");
  elements.draftPhaseStatus = document.getElementById("draft-phase-status");
  elements.draftP1Name = document.getElementById("draft-p1-name");
  elements.draftP2Name = document.getElementById("draft-p2-name");
  elements.draftP1PicksList = document.getElementById("draft-p1-picks-list");
  elements.draftP2PicksList = document.getElementById("draft-p2-picks-list");
  elements.draftBansList = document.getElementById("draft-bans-list");
  elements.characterGridContainer = document.getElementById(
    "character-grid-container"
  );

  // Optional: Add logs to verify
  console.log("Check element - draftP1Name:", elements.draftP1Name);
  console.log("Check element - draftP2Name:", elements.draftP2Name);

  console.log("UI: Elements initialized.", elements);

  // Check for missing elements (optional but helpful)
  for (const key in elements) {
    if (
      elements[key] === null &&
      key !== "screensNodeList" &&
      !key.endsWith("Controls")
    ) {
      // Allow controls to be missing initially
      console.warn(`UI Element ID not found for: ${key}`);
    } else if (key === "screensNodeList" && elements[key]?.length === 0) {
      console.warn(`UI: No elements found with class="screen"`);
    }
  }
}

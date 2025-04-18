// frontend/js/uiElements.js

// Object to hold references after initialization
export const elements = {
  header: null,
  welcomeScreen: null,
  createLobbyScreen: null,
  joinLobbyScreen: null,
  lobbyWaitScreen: null,
  draftScreen: null,
  screensNodeList: null,
  actionCreateBtn: null,
  actionJoinBtn: null,
  actionRandomizeBtn: null,
  createNameInput: null,
  createStartBtn: null,
  createBackBtn: null,
  joinNameInput: null,
  joinLobbyIdInput: null,
  toggleLobbyIdVisibilityBtn: null,
  joinStartBtn: null,
  joinBackBtn: null,
  lobbyIdDisplay: null,
  toggleLobbyIdDisplayBtn: null,
  copyLobbyIdBtn: null,
  hostNameDisplay: null,
  player1NameDisplay: null,
  player2NameDisplay: null,
  player1StatusElement: null,
  player2StatusElement: null,
  lobbyStatusDisplay: null,
  player1ReadyBtn: null,
  player2ReadyBtn: null,
  lobbyBackBtn: null,
  hostDeleteLobbyBtn: null,
  hostJoinSlotBtn: null,
  hostKickP1Btn: null,
  hostKickP2Btn: null,
  draftBackBtn: null,
  draftPhaseStatus: null,
  draftTimer: null,
  draftP1Name: null,
  draftP2Name: null,
  characterGridContainer: null,
  draftBansSlotsContainer: null,
  draftP1PicksList: null,
  p1Pick1: null,
  p1Pick2: null,
  p1Pick3: null,
  draftP2PicksList: null,
  p2Pick1: null,
  p2Pick2: null,
  p2Pick3: null,
  banSlots: null,
  banSlot1: null,
  banSlot2: null,
  banSlot3: null,
  banSlot4: null,
  draftHostControls: null,
  hostDeleteDraftLobbyBtn: null,
  draftPlayerControls: null,
};

// Function to populate the elements object
export function initializeElements() {
  console.log("UI: Initializing elements...");
  // Get the header element
  elements.header = document.querySelector("header");

  // Screens
  elements.welcomeScreen = document.getElementById("welcome-screen");
  elements.createLobbyScreen = document.getElementById("create-lobby-screen");
  elements.joinLobbyScreen = document.getElementById("join-lobby-screen");
  elements.lobbyWaitScreen = document.getElementById("lobby-wait-screen");
  elements.draftScreen = document.getElementById("draft-screen");
  elements.screensNodeList = document.querySelectorAll(".screen"); // Get NodeList

  // Welcome Screen Buttons
  elements.actionCreateBtn = document.getElementById("action-create-btn");
  elements.actionJoinBtn = document.getElementById("action-join-btn");
  elements.actionRandomizeBtn = document.getElementById("action-randomize-btn"); // Randomize Pick button

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
    "toggle-lobby-id-display" // Ensure ID matches HTML if this is separate from join screen toggle
  );
  elements.copyLobbyIdBtn = document.getElementById("copy-lobby-id-btn");
  elements.hostNameDisplay = document.getElementById("host-name");
  elements.player1NameDisplay = document.getElementById("player1-name");
  elements.player2NameDisplay = document.getElementById("player2-name");
  elements.player1StatusElement = document.getElementById("player1-status");
  elements.player2StatusElement = document.getElementById("player2-status");
  elements.lobbyStatusDisplay = document.getElementById("lobby-status");
  // elements.hostControls = document.getElementById("host-controls"); // Consider removing if buttons are integrated directly
  // elements.playerControls = document.getElementById("player-controls"); // Consider removing if buttons are integrated directly
  elements.player1ReadyBtn = document.getElementById("player1-ready-btn");
  elements.player2ReadyBtn = document.getElementById("player2-ready-btn");
  elements.lobbyBackBtn = document.getElementById("lobby-back-btn"); // Player's back button

  // --- ADD HOST CONTROL BUTTONS (Wait Screen) ---
  elements.hostDeleteLobbyBtn = document.getElementById(
    "host-delete-lobby-btn"
  );
  elements.hostJoinSlotBtn = document.getElementById("host-join-slot-btn");
  elements.hostKickP1Btn = document.getElementById("host-kick-p1-btn");
  elements.hostKickP2Btn = document.getElementById("host-kick-p2-btn");
  // --- END ADD ---

  // Draft Screen Elements
  elements.draftBackBtn = document.getElementById("draft-back-btn"); // Player's back button on draft screen
  elements.draftPhaseStatus = document.getElementById("draft-phase-status");
  elements.draftTimer = document.getElementById("draft-timer");
  elements.draftP1Name = document.getElementById("draft-p1-name");
  elements.draftP2Name = document.getElementById("draft-p2-name");
  elements.characterGridContainer = document.getElementById(
    "character-grid-container"
  );
  elements.draftBansSlotsContainer =
    document.getElementById("draft-bans-slots");

  // Player 1 Pick Slots
  elements.draftP1PicksList = document.getElementById("draft-p1-picks-list");
  elements.p1Pick1 = document.getElementById("p1-pick-1");
  elements.p1Pick2 = document.getElementById("p1-pick-2");
  elements.p1Pick3 = document.getElementById("p1-pick-3");

  // Player 2 Pick Slots
  elements.draftP2PicksList = document.getElementById("draft-p2-picks-list");
  elements.p2Pick1 = document.getElementById("p2-pick-1");
  elements.p2Pick2 = document.getElementById("p2-pick-2");
  elements.p2Pick3 = document.getElementById("p2-pick-3");

  // Ban Slots
  elements.banSlots =
    elements.draftBansSlotsContainer?.querySelectorAll(".ban-slot");
  elements.banSlot1 = document.getElementById("ban-slot-1");
  elements.banSlot2 = document.getElementById("ban-slot-2");
  elements.banSlot3 = document.getElementById("ban-slot-3");
  elements.banSlot4 = document.getElementById("ban-slot-4");

  // --- ADD HOST CONTROL BUTTONS (Draft Screen - Add later if needed) ---
  // elements.hostResetDraftBtn = document.getElementById("host-reset-draft-btn");
  // --- END ADD ---

  // Optional: Add logs to verify
  console.log("Check element - draftP1Name:", elements.draftP1Name);
  console.log("Check element - draftP2Name:", elements.draftP2Name);

  console.log("UI: Elements initialized.", elements);

  // Check for missing elements (optional but helpful)
  for (const key in elements) {
    // Adjusted check to allow null for specific elements initially
    if (
      elements[key] === null &&
      ![
        "screensNodeList",
        // Add IDs of buttons that might not exist yet if you add them dynamically later
        "hostDeleteLobbyBtn",
        "hostJoinSlotBtn",
        "hostKickP1Btn",
        "hostKickP2Btn",
        // Add other elements if needed
      ].includes(key)
    ) {
      console.warn(`UI Element ID not found for: ${key}`);
    } else if (key === "screensNodeList" && elements[key]?.length === 0) {
      console.warn(`UI: No elements found with class="screen"`);
    }
  }

  elements.draftHostControls = document.getElementById("draft-host-controls");
  elements.hostDeleteDraftLobbyBtn = document.getElementById(
    "host-delete-draft-lobby-btn"
  );
  elements.draftPlayerControls = document.getElementById(
    "draft-player-controls"
  );
}

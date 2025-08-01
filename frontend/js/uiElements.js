// frontend/js/uiElements.js

// Object to hold references after initialization
export const elements = {
  header: null,
  welcomeScreen: null,
  createLobbyScreen: null,
  // Box Score Feature Elements
  enableEquilibrationToggle: null,
  boxScoreScreen: null,
  limitedResonatorsList: null,
  totalBoxScoreDisplay: null,
  submitBoxScoreBtn: null,
  boxScoreLeaveSlotBtn: null,
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
  player1ScoreDisplay: null,
  player2ScoreDisplay: null,
  lobbyStatusDisplay: null,
  player1ReadyBtn: null,
  player2ReadyBtn: null,
  lobbyBackBtn: null,
  hostDeleteLobbyBtn: null,
  hostJoinSlotBtn: null,
  hostLeaveSlotBtn: null,
  hostKickP1Btn: null,
  hostKickP2Btn: null,
  draftBackBtn: null,
  characterGridContainer: null,
  draftP1PicksList: null,
  p1Pick1: null,
  p1Pick2: null,
  p1Pick3: null,
  draftP2PicksList: null,
  p2Pick1: null,
  p2Pick2: null,
  p2Pick3: null,
  draftHostControls: null,
  hostDeleteDraftLobbyBtn: null,
  hostResetDraftBtn: null,
  hostStartDraftBtn: null,
  draftPlayerControls: null,
  resetLocalSequencesBtn: null,
  // Top Bar Player Areas for Ban Display
  topBarP1Bans: null,
  topBarP2Bans: null,
  topBarP1Name: null,
  topBarP2Name: null,
  // Top Bar Draft Info Elements
  draftTimerTop: null,
  draftPhaseStatusTop: null,
};

// Function to populate the elements object
export function initializeElements() {
  //console.log("UI: Initializing elements...");
  // Get the header element
  elements.header = document.querySelector("header");

  // Screens
  elements.welcomeScreen = document.getElementById("welcome-screen");
  elements.createLobbyScreen = document.getElementById("create-lobby-screen");
  elements.joinLobbyScreen = document.getElementById("join-lobby-screen");
  elements.lobbyWaitScreen = document.getElementById("lobby-wait-screen");
  elements.boxScoreScreen = document.getElementById("box-score-screen");
  elements.draftScreen = document.getElementById("draft-screen");
  elements.screensNodeList = document.querySelectorAll(".screen"); // Get NodeList

  // Welcome Screen Buttons
  elements.actionCreateBtn = document.getElementById("action-create-btn");
  elements.actionJoinBtn = document.getElementById("action-join-btn");
  elements.actionRandomizeBtn = document.getElementById("action-randomize-btn"); // Randomize Pick button

  // Create/Join Inputs & Buttons
  elements.createNameInput = document.getElementById("create-name-input");
  elements.enableEquilibrationToggle = document.getElementById(
    "enable-equilibration-toggle"
  );
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
  elements.player1ScoreDisplay = document.getElementById(
    "player1-score-display"
  );
  elements.player2ScoreDisplay = document.getElementById(
    "player2-score-display"
  );
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
  elements.hostLeaveSlotBtn = document.getElementById("host-leave-slot-btn");
  elements.hostKickP1Btn = document.getElementById("host-kick-p1-btn");
  elements.hostKickP2Btn = document.getElementById("host-kick-p2-btn");
  // --- END ADD ---

  // Draft Screen Elements
  elements.draftBackBtn = document.getElementById("draft-back-btn"); // Player's back button on draft screen
  elements.draftTimerTop = document.getElementById("draft-timer-top");
  elements.draftPhaseStatusTop = document.getElementById(
    "draft-phase-status-top"
  );
  elements.characterGridContainer = document.getElementById(
    "character-grid-container"
  );

  // Draft Control Elements
  elements.draftHostControls = document.getElementById("draft-host-controls");
  elements.hostDeleteDraftLobbyBtn = document.getElementById(
    "host-delete-draft-lobby-btn"
  );
  elements.hostResetDraftBtn = document.getElementById("host-reset-draft-btn");
  elements.hostStartDraftBtn = document.getElementById("host-start-draft-btn");
  elements.draftPlayerControls = document.getElementById(
    "draft-player-controls"
  );

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

  // Box Score Screen Elements
  elements.limitedResonatorsList = document.getElementById(
    "limited-resonators-list"
  );
  elements.totalBoxScoreDisplay = document.getElementById(
    "total-box-score-display"
  );
  elements.submitBoxScoreBtn = document.getElementById("submit-box-score-btn");
  elements.boxScoreLeaveSlotBtn = document.getElementById(
    "box-score-leave-slot-btn"
  );
  elements.resetLocalSequencesBtn = document.getElementById(
    "reset-local-sequences-btn"
  );

  // Top Bar Player Areas for Ban Display
  elements.topBarP1Bans = document.getElementById("top-bar-p1-bans");
  elements.topBarP2Bans = document.getElementById("top-bar-p2-bans");
  elements.topBarP1Name = document.getElementById("top-bar-p1-name");
  elements.topBarP2Name = document.getElementById("top-bar-p2-name");

  // Top Bar Draft Info Elements
  elements.draftTimerTop = document.getElementById("draft-timer-top");
  elements.draftPhaseStatusTop = document.getElementById(
    "draft-phase-status-top"
  );

  // Debug logs for new elements
  //console.log("Check element - boxScoreScreen:", elements.boxScoreScreen);
  //console.log(
  //  "Check element - enableEquilibrationToggle:",
  //  elements.enableEquilibrationToggle
  //);

  //console.log("UI: Elements initialized.", elements);

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

  // Add error logging for draft elements
  if (!elements.draftPlayerControls)
    console.error("[Init Check] draftPlayerControls element not found!");
  if (!elements.draftBackBtn)
    console.error("[Init Check] draftBackBtn element not found!");
  if (!elements.draftTimerTop)
    console.error("[Init Check] draftTimer element not found!");
  if (!elements.characterGridContainer)
    console.error("[Init Check] characterGridContainer element not found!");
  if (!elements.draftPhaseStatusTop)
    console.error("[Init Check] draftPhaseStatus element not found!");
}

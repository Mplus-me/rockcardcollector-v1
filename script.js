/*
================================================================================
GAME SCRIPT (script.js)
Phase 2: The Core Loop
================================================================================
*/

// --- 1. GLOBAL VARIABLES ---
// These variables will hold our game's data. We define them here so
// all functions can access them.

/**
 * @typedef {Object} GameState
 * @property {Object} player - Player's progress.
 * @property {number} player.packsOpened
 * @property {number} player.uniquesOwned
 * @property {Object<string, number>} player.packsInventory
 * @property {Object} inventory - Player's collected cards.
 * @property {Array<Object>} inventory.cards
 */

// This is our single source of truth for rarities.
// Ordered from RAREST to MOST COMMON.
const RARITY_ORDER = [
    "special",
    "legendary",
    "mythic",
    "rare",
    "uncommon",
    "common"
];

// Conversion point values for each rarity
const CONVERSION_POINTS = {
    common: 1,
    uncommon: 3,
    rare: 10,
    mythic: 30,
    legendary: 100,
    special: 0 // "Special" cards are worth 0 points
};

// Point thresholds for each pack
// We list them from best to worst
const PACK_THRESHOLDS = [
    { name: "collector", points: 1000 },
    { name: "deluxe", points: 250 },
    { name: "advanced", points: 100 },
    { name: "explorer", points: 30 },
    { name: "basic", points: 10 }
];

// Database for our 3 unique expedition slots
const EXPEDITION_DATA = [
    // Slot 0
    {
        name: "Short Expedition",
        durationMs: 5 * 60 * 1000, // 5 minutes
        durationText: "5m",
        basePack: "basic",
        bonusPack: "explorer",
        bonusChance: 5, // 5%
        image: "images/expeditions/exp-short.png"
    },
    // Slot 1
    {
        name: "Medium Expedition",
        durationMs: 60 * 60 * 1000, // 60 minutes
        durationText: "1h",
        basePack: "explorer",
        bonusPack: "advanced",
        bonusChance: 5,
        image: "images/expeditions/exp-medium.png"
    },
    // Slot 2
    {
        name: "Long Expedition",
        durationMs: 8 * 60 * 60 * 1000, // 8 hours
        durationText: "8h",
        basePack: "advanced",
        bonusPack: "deluxe",
        bonusChance: 5,
        image: "images/expeditions/exp-long.png"
    }
]

// Loot table for the fishing minigame.
// Must be ordered from RAREST to MOST COMMON reward.
const FISHING_REWARDS = [
    { type: "pack", packType: "advanced", chance: 1 },  // 1%
    { type: "pack", packType: "explorer", chance: 4 },  // 4% (Cumulative: 5%)
    { type: "pack", packType: "basic", chance: 35 }, // 35% (Cumulative: 40%)
    { type: "card", region: "riverbed", chance: 30 }, // 30% (Cumulative: 70%)
    { type: "none", message: "An old boot...", chance: 30 }  // 30% (Cumulative: 100%)
];

// Rarity chances for finding a "wild" card (e.g., from fishing)
// Must be ordered from RAREST to MOST COMMON.
const WILD_RARITY_CHANCE = [
    { rarity: "legendary", chance: 0.2 }, // 1 in 500
    { rarity: "mythic", chance: 0.5 },    // 1 in 200 (Cumulative: 0.7%)
    { rarity: "rare", chance: 9.3 },      // (Cumulative: 10%)
    { rarity: "uncommon", chance: 20 },   // (Cumulative: 30%)
    { rarity: "common", chance: 70 }      // (Cumulative: 100%)
];

// NEW: Progression goals for variants
const UNLOCK_GOALS = {
    FOIL: { type: "packs", value: 50 },
    ALT_ART_1: { type: "unique", value: 100 },
    ALT_ART_2: { type: "unique", value: 200 }
};

// NEW: Pull rates for variants
const VARIANT_RATES = {
    FOIL_CHANCE: 1, // 1%
    ART_CHANCES: { // Percentages for [base, alt1, alt2]
        LOCKED: [100, 0, 0],
        ALT_1_UNLOCKED: [99, 1, 0], // 99% base, 1% alt1
        ALT_2_UNLOCKED: [98, 1, 1]  // 98% base, 1% alt1, 1% alt2
    }
};

// The subset of rocks used in minigames
const MINIGAME_ROCK_LIST = [
    'rock-001', // River Pebble FIXIT
    'rock-002', // Sharp Flint FIXIT
    'rock-021', // Small Geode
    'rock-022', // Obsidian
    'rock-009', // Rose Quartz FIXIT
    'rock-010', // Pyrite FIXIT
    'rock-041', // Amethyst
    'rock-026', // Turquoise FIXIT
    'rock-020', // Garnet FIXIT
    'rock-161', // Sulphur
    'rock-179', // Snowflake Obsidian
    'rock-025'  // Petrified Wood
];

// Loot table for the rock sifting minigame
// Uses the "desert" region for card rewards
const SIFTING_REWARDS = [
    { type: "pack", packType: "advanced", chance: 1 },  // 1%
    { type: "pack", packType: "explorer", chance: 4 },  // 4%
    { type: "pack", packType: "basic", chance: 35 }, // 35%
    { type: "card", region: "desert", chance: 30 }, // 30%
    { type: "none", message: "Just sand...", chance: 30 }  // 30%
];

/** @type {GameState} */
let gameState = {}; // Holds the player's save data (packs, cards, etc.)

// Temporary state for the converter.
// Holds an array of objects: [{cardId, variant, count}]
let conversionSelection = [];
// Stores the player's sorting choice for the archive
let currentArchiveSort = 'name-asc'; // Default to A-Z

let allCardsData = {}; // Holds all card definitions from cards.json
let allPacksData = {}; // Holds all pack drop rates from packs.json
let allRegionsData = {}; // Holds all region unlock data from regions.json

let isCardDragActive = false; // Flag to check if we're dragging a card
let gameTickInterval = null; // Holds the timer that runs every second

let fishingState = "idle"; // Can be: idle, waiting, bite, reeling
let fishingTimeout = null; // Holds the timer for the fishing game


// --- 2. CORE GAME FUNCTIONS ---

/**
 * This is the main function that starts the game.
 * It runs as soon as the page is loaded.
 */
async function initGame() {
    console.log("Initializing game...");

    // Step 1: Load the master data from our JSON files.
    // We use 'await' to make sure these files load *before* we do anything else.
    try {
        await loadMasterData();
    } catch (error) {
        console.error("CRITICAL: Failed to load game data. Game cannot start.", error);
        return; // Stop the game from loading
    }

    // Step 2: Load the player's save data (or create a new save).
    loadState();

    // Check for offline expedition progress *before* drawing anything
    checkAllExpeditions();

    // Step 3: Set up our navigation buttons.
    setupNavButtons();

    initMuseum(); // Initialize museum
    initExpeditions(); // Initialize expeditions
    // initFishingMinigame(); // Initialize fishing minigame
    initMinigameHub(); // Initialize minigame hub
    initConverter(); // Initialize duplicate converter
    initArchiveSorter(); // Initialize Archive Sorter
    initPackModal(); // Initialize Pack Modal
    initDeleteButton(); // Intialize Delete Button
    initDevTools(); // Initialize DevTools
    
    updateUI(); // Draw the UI (like the archive) with the loaded data

    // Start the 1-second game timer
    gameTickInterval = setInterval(onGameTick, 1000);
    
    console.log("Game initialized successfully.");
    console.log("Current Game State:", gameState);
    console.log("Loaded Card Data:", allCardsData);
}

/**
 * Fetches cards.json, packs.json, and regions.json
 * and stores them in our global variables.
 */
async function loadMasterData() {
    // 'Promise.all' lets us load all files at the same time.
    const [cardsResponse, packsResponse, regionsResponse] = await Promise.all([
        fetch('cards.json'),
        fetch('packs.json'),
        fetch('regions.json') // Added the new file
    ]);

    // Check if the files were actually found.
    if (!cardsResponse.ok || !packsResponse.ok || !regionsResponse.ok) {
        throw new Error("Network response was not ok.");
    }

    // '.json()' reads the file contents and converts them
    allCardsData = await cardsResponse.json();
    allPacksData = await packsResponse.json();
    allRegionsData = await regionsResponse.json(); // Added the new file
}

/**
 * Saves the current 'gameState' object to the browser's localStorage.
 */
function saveState() {
    // 'JSON.stringify' converts our JavaScript object into a string,
    // which is the only format localStorage can store.
    localStorage.setItem('rockGameState', JSON.stringify(gameState));
    console.log("Game state saved.");
}

/**
 * Loads the player's save data from localStorage.
 * If no save exists, it creates a new, default game state.
 */
function loadState() {
    const savedState = localStorage.getItem('rockGameState');

    // Default structure for expedition slots
    const defaultExpeditions = [
        { status: "empty" },
        { status: "empty" },
        { status: "empty" }
    ];

    if (savedState) {
        gameState = JSON.parse(savedState);
        console.log("Loaded saved state:", gameState);

        // --- PATCHING ---
        // (We are *not* migrating old card data, per user request)
        // But we will still patch for core systems just in case.
        let needsSave = false; 

        if (!gameState.museum) {
            console.warn("Patching with 'museum' data.");
            gameState.museum = {
                background: 'bg-forest',
                frame: 'frame-1',
                slots: [null, null, null, null, null, null] 
            };
            needsSave = true;
        }

        if (!gameState.expeditions || !Array.isArray(gameState.expeditions)) {
            console.warn("Patching with 'expeditions' data.");
            gameState.expeditions = defaultExpeditions;
            needsSave = true;
        }
        
        // This is a good time to ensure all new packs are in the inventory
        const defaultPackKeys = ["basic", "explorer", "advanced", "deluxe", "collector"];
        if (!gameState.player.packsInventory) {
             gameState.player.packsInventory = {};
             needsSave = true;
        }
        defaultPackKeys.forEach(key => {
            if (!gameState.player.packsInventory.hasOwnProperty(key)) {
                console.warn(`Patching packsInventory with '${key}'`);
                gameState.player.packsInventory[key] = 0;
                needsSave = true;
            }
        });


        if (needsSave) {
            saveState();
        }

    } else {
        // If no save, create the default 'new game' object.
        gameState = {
            player: {
                packsOpened: 0,
                uniquesOwned: 0,
                packsInventory: { 
                    basic: 5, 
                    explorer: 0,
                    advanced: 0,
                    deluxe: 0,
                    collector: 0
                }
            },
            inventory: {
                cards: [] // NEW: Will be populated with {cardId, art, foil, count}
            },
            expeditions: defaultExpeditions,
            museum: {
                background: 'bg-forest',
                frame: 'frame-1',
                slots: [null, null, null, null, null, null] 
            }
        };
        console.log("No save found. Created new game state.");
        saveState();
    }
}

/**
 * Sets up the "Delete Save" button.
 */
function initDeleteButton() {
    const deleteBtn = document.getElementById('delete-save-button');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            // Show a confirmation popup first
            const didConfirm = window.confirm(
                "Are you sure you want to delete everything?\n\nThis cannot be undone and will restart your game."
            );
            
            if (didConfirm) {
                // User clicked "OK"
                console.log("Deleting save data...");
                localStorage.removeItem('rockGameState');
                // Reload the page to force a fresh start
                window.location.reload();
            }
        });
    }
}

/**
 * Calculates how many unique card IDs the player owns.
 * Ignores variants (foil/alt) and duplicates.
 * @returns {number}
 */
function getUniqueCardCount() {
    const inventory = gameState.inventory.cards;
    const uniqueIds = new Set(); // A Set automatically removes duplicates
    
    inventory.forEach(card => {
        uniqueIds.add(card.cardId);
    });
    
    return uniqueIds.size;
}

/**
 * Gets a list of all region IDs that the player has unlocked.
 * @returns {Array<string>} - e.g., ['riverbed', 'grassland', 'coast']
 */
function getUnlockedRegions() {
    const unlocked = [];
    const packs = gameState.player.packsOpened;
    const uniques = getUniqueCardCount(); // Use our existing helper!

    // Loop through all regions in our loaded data
    for (const regionId in allRegionsData) {
        const region = allRegionsData[regionId];
        const unlock = region.unlock;

        // Check if the unlock condition is met
        if (unlock.type === 'packs' && packs >= unlock.value) {
            unlocked.push(regionId);
        } else if (unlock.type === 'unique' && uniques >= unlock.value) {
            unlocked.push(regionId);
        }
    }
    
    return unlocked;
}

/**
 * Checks if a cardId is in the player's inventory *at all*.
 * Ignores art/foil variants.
 * @param {string} cardId - The ID to check
 * @returns {boolean} - true if the ID is not in the inventory, false if it is.
 */
function isCardIdNew(cardId) {
    // .some() is a fast way to check if *any* item in an array matches a condition
    const cardExists = gameState.inventory.cards.some(card => card.cardId === cardId);
    return !cardExists;
}

// --- 3. NAVIGATION & UI FUNCTIONS ---

/**
 * Finds all navigation buttons and makes them clickable.
 * Also adds listeners to switch panels during a card drag.
 */
function setupNavButtons() {
    // Get all elements with the class 'nav-button'
    const buttons = document.querySelectorAll('.nav-button');

    // Loop over each button and add event listeners
    buttons.forEach(button => {
        
        // 1. The original click listener
        button.addEventListener('click', () => {
            // 'dataset.panel' gets the 'data-panel' attribute from the HTML
            const panelId = button.dataset.panel;
            showPanel(panelId);
        });

        // 2. NEW: The 'dragover' listener
        // This fires when you drag something *over* the button
        button.addEventListener('dragover', (event) => {
            // Check our flag: only proceed if we're dragging a card
            if (isCardDragActive) {
                // This is required to allow 'drop' events
                event.preventDefault(); 
                
                // Get the panel ID and switch to it
                const panelId = button.dataset.panel;
                showPanel(panelId);
            }
        });
    });
}

/**
 * Shows a specific panel and hides all others.
 * @param {string} panelId - The ID of the panel to show (e.g., "archive-panel")
 */
function showPanel(panelId) {
    // Get all panels
    const panels = document.querySelectorAll('.panel');

    // Loop over them
    panels.forEach(panel => {

        if (panel.id === 'packs-panel' && panel.classList.contains('active-panel')) {
            leavingPacksPanel = true;
        }
        
        if (panel.id === panelId) {
            // If it's the one we want, add 'active-panel' to show it
            panel.classList.add('active-panel');
        } else {
            // Otherwise, remove 'active-panel' to hide it
            panel.classList.remove('active-panel');
        }
    });

    if (leavingPacksPanel && panelId !== 'packs-panel') {
        clearConverterSelection();
    }
}

/**
 * This function is our main "refresh" function. It updates all parts
 * of the UI to reflect the current gameState.
 */
function updateUI() {
    console.log("Updating UI...");
    
    updateArchiveUI();
    updateMuseumUI();
    updateExpeditionsUI();
    updatePackInventoryUI();
    updateConverterUI();
    updateProgressionUI();
    
    // Later, this will also call:
    // - updatePackCountUI()
    // - updateProgressBars()
}

/**
 * Draws all the player's cards into the Archive panel grid.
 * This function now safely handles all variants and new sorting options.
 */
function updateArchiveUI() {
    const grid = document.getElementById('archive-grid');
    if (!grid) return; 

    grid.innerHTML = ''; 

    // --- 1. Get and Sort the Cards ---
    let sortedCards = [...gameState.inventory.cards];

    sortedCards.sort((a, b) => {
        // Get master data
        const cardDataA = allCardsData[a.cardId];
        const cardDataB = allCardsData[b.cardId];
        
        // Failsafe: If data is missing (e.g., old/broken card), don't sort
        if (!cardDataA || !cardDataB) return 0;

        // NEW: Provide default values for old save files
        const aFoil = a.foil || "normal";
        const bFoil = b.foil || "normal";
        const aArt = a.art || 0;
        const bArt = b.art || 0;

        switch (currentArchiveSort) {
            case 'name-asc':
                return cardDataA.name.localeCompare(cardDataB.name);
            
            case 'name-desc':
                return cardDataB.name.localeCompare(cardDataA.name);

            case 'rarity-asc': // Common first
                const rarityA_asc = RARITY_ORDER.indexOf(cardDataA.rarity);
                const rarityB_asc = RARITY_ORDER.indexOf(cardDataB.rarity);
                if (rarityA_asc !== rarityB_asc) return rarityB_asc - rarityA_asc;
                return cardDataA.name.localeCompare(cardDataB.name);

            case 'rarity-desc': // Rarest first
                const rarityA_desc = RARITY_ORDER.indexOf(cardDataA.rarity);
                const rarityB_desc = RARITY_ORDER.indexOf(cardDataB.rarity);
                if (rarityA_desc !== rarityB_desc) return rarityA_desc - rarityB_desc;
                return cardDataA.name.localeCompare(cardDataB.name);
            
            case 'foil-first':
                // Uses the new "safe" variables
                if (aFoil !== bFoil) return bFoil.localeCompare(aFoil);
                if (aArt !== bArt) return bArt - aArt;
                return cardDataA.name.localeCompare(cardDataB.name);

            case 'art-first':
                // Uses the new "safe" variables
                if (aArt !== bArt) return bArt - aArt;
                if (aFoil !== bFoil) return bFoil.localeCompare(aFoil);
                return cardDataA.name.localeCompare(cardDataB.name);

            default:
                return 0;
        }
    });

    // --- 2. Draw the Sorted Cards ---
    sortedCards.forEach(card => {
        const cardData = allCardsData[card.cardId];
        if (!cardData) return;

        // Provide defaults for drawing, just in case
        const art = card.art || 0;
        const foil = card.foil || "normal";

        const cardElement = document.createElement('div');
        cardElement.classList.add('card-in-grid');
        cardElement.classList.add(`rarity-${cardData.rarity}`);
        
        cardElement.draggable = true;
        cardElement.dataset.cardId = card.cardId;
        cardElement.dataset.art = art;
        cardElement.dataset.foil = foil;

        const imgPath = getCardImagePath(card.cardId, art);

        // --- Handle Variants ---
        let foilOverlayHTML = '';
        if (foil === 'foil') {
            foilOverlayHTML = '<div class="foil-overlay"></div>';
        }

        let variantText = '';
        if (foil === 'foil') variantText += "Foil";
        if (art > 0) variantText += ` (Alt ${art})`;

        cardElement.innerHTML = `
            <div class="card-image-placeholder">
                <img src="${imgPath}" alt="${cardData.name}">
                ${foilOverlayHTML}
            </div>
            <div class.card-info">
                <span class="card-name">${cardData.name}</span>
                <span class="card-count">x${card.count}</span>
            </div>
            <div class="card-variant-label">${variantText}</div>
        `;
        
        cardElement.addEventListener('dragstart', handleCardDragStart);
        grid.appendChild(cardElement);
    });
}

/**
 * Handles the 'dragstart' event for a card in the archive.
 * @param {DragEvent} event
 */
function handleCardDragStart(event) {
    // 'this' refers to the cardElement we're dragging
    const cardId = this.dataset.cardId;
    const art = parseInt(this.dataset.art, 10); // NEW
    const foil = this.dataset.foil;           // NEW

    // Store all data for the 'drop' event
    event.dataTransfer.setData('text/plain', JSON.stringify({ cardId, art, foil }));
    event.dataTransfer.effectAllowed = 'copy';
    isCardDragActive = true;
    this.classList.add('dragging');

    this.addEventListener('dragend', () => {
        this.classList.remove('dragging');
        isCardDragActive = false;
    }, { once: true });
}

/**
 * Sets up the event listener for the archive sort dropdown.
 */
function initArchiveSorter() {
    const sortSelect = document.getElementById('archive-sort');
    if (sortSelect) {
        sortSelect.addEventListener('change', (event) => {
            // When the dropdown changes, update our global variable
            currentArchiveSort = event.target.value;
            // Force the archive to redraw with the new sort
            updateArchiveUI();
        });
    }
}

/**
 * Creates the museum slots and adds their event listeners.
 * Runs once at game initialization.
 */
function initMuseum() {
    const grid = document.getElementById('museum-grid');
    if (!grid) return;

    grid.innerHTML = ''; // Clear it first

    // Create the 6 slots
    for (let i = 0; i < 6; i++) {
        const slot = document.createElement('div');
        slot.classList.add('museum-slot');
        slot.dataset.slotIndex = i; // Store the slot's index (0-5)
        slot.innerHTML = `Slot ${i + 1}`; // Placeholder text

        // Add drop zone event listeners
        slot.addEventListener('dragover', handleMuseumDragOver);
        slot.addEventListener('dragleave', handleMuseumDragLeave);
        slot.addEventListener('drop', handleMuseumDrop);

        grid.appendChild(slot);
    }
}

/**
 * Handles 'dragover' on a museum slot.
 * @param {DragEvent} event
 */
function handleMuseumDragOver(event) {
    event.preventDefault(); // This is *required* to allow a drop
    event.dataTransfer.dropEffect = 'copy';
    this.classList.add('drag-over'); // Add visual feedback
}

/**
 * Handles 'dragleave' on a museum slot.
 * @param {DragEvent} event
 */
function handleMuseumDragLeave(event) {
    this.classList.remove('drag-over'); // Remove visual feedback
}

/**
 * Handles the 'drop' event on a museum slot.
 * @param {DragEvent} event
 */
function handleMuseumDrop(event) {
    event.preventDefault();
    this.classList.remove('drag-over');

    // Get the full card data we stored in 'dragstart'
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    const { cardId, art, foil } = data; // NEW

    // Get the slot index
    const slotIndex = parseInt(this.dataset.slotIndex);

    // Update the game state with the full card object
    gameState.museum.slots[slotIndex] = { cardId, art, foil };

    // Save and refresh the UI
    saveState();
    updateMuseumUI();
}

/**
 * Draws the cards into the Museum panel based on gameState.
 */
function updateMuseumUI() {
    // First, update the background (we'll make this work later)
    const backgroundEl = document.getElementById('museum-background');
    if (backgroundEl) {
        // This won't work yet as we don't have the image, but it's ready
        // backgroundEl.style.backgroundImage = `url('images/museum/${gameState.museum.background}.png')`;
    }

    // Loop over all the slot elements
    const slots = document.querySelectorAll('.museum-slot');
    slots.forEach(slot => {
        const slotIndex = parseInt(slot.dataset.slotIndex);
        const cardInSlot = gameState.museum.slots[slotIndex];

        if (cardInSlot) {
            // --- This slot is FILLED ---
            const { cardId, art, foil } = cardInSlot; // NEW
            const cardData = allCardsData[cardId];
            
            slot.innerHTML = ''; 
            slot.classList.add('filled');
            
            const imgPath = getCardImagePath(cardId, art);
            
            let foilOverlayHTML = '';
            if (foil === 'foil') {
                foilOverlayHTML = '<div class="foil-overlay"></div>';
            }
            
            let variantText = '';
            if (foil === 'foil') variantText += "Foil";
            if (art > 0) variantText += ` (Alt ${art})`;
            
            slot.innerHTML = `
                <div class="card-in-grid rarity-${cardData.rarity}">
                    <div class="card-image-placeholder">
                        <img src="${imgPath}" alt="${cardData.name}">
                        ${foilOverlayHTML}
                    </div>
                    <div class="card-info">
                        <span class="card-name">${cardData.name}</span>
                    </div>
                    <div class="card-variant-label">${variantText}</div>
                </div>
            `;
            
            slot.onclick = () => {
                gameState.museum.slots[slotIndex] = null;
                saveState();
                updateMuseumUI();
            };

        } else {
            // --- This slot is EMPTY ---
            slot.innerHTML = `Slot ${slotIndex + 1}`;
            slot.classList.remove('filled');
            slot.onclick = null; // Remove the click listener
        }
    });
}

/**
 * Updates the pack inventory display in the header and on the Packs panel.
 */
function updatePackInventoryUI() {
    const headerArea = document.getElementById('header-pack-inventory');
    const panelArea = document.getElementById('pack-opening-area');
    
    if (!headerArea || !panelArea) return; // Safety check

    // Clear both areas
    headerArea.innerHTML = '';
    panelArea.innerHTML = '';

    // Get the player's pack inventory
    const inventory = gameState.player.packsInventory;

    // Loop through each pack type we own
    for (const packType in inventory) {
        if (!inventory.hasOwnProperty(packType)) continue; // Safety check
        
        const count = inventory[packType];
        
        // 'basic' -> 'Basic'
        const displayName = packType.charAt(0).toUpperCase() + packType.slice(1);

        // Create the HTML for the display
        // THIS IS THE MODIFIED PART: Added the <img> tag
        const packHTML = `
            <div class="pack-display ${count === 0 ? 'disabled' : ''}" 
                 data-pack-type="${packType}">
                
                <img src="images/ui/pack-${packType}.png" alt="${displayName} Pack" class="pack-icon">
                
                <div class="pack-count">${count}</div>
                <div class="pack-name">${displayName}</div>
            </div>
        `;
        
        // Add to both the header and the panel
        headerArea.innerHTML += packHTML;
        panelArea.innerHTML += packHTML;
    }
    
    // Add click listeners to the buttons in the *panel*
    panelArea.querySelectorAll('.pack-display').forEach(button => {
        button.addEventListener('click', () => {
            const packType = button.dataset.packType;
            openPack(packType); // This will automatically check if count > 0
        });
    });
}

/**
 * Updates the text stats on the Archive and Packs panels.
 */
function updateProgressionUI() {
    // 1. Update Archive Stat
    const uniqueCountEl = document.getElementById('unique-count-display');
    if (uniqueCountEl) {
        const count = getUniqueCardCount();
        uniqueCountEl.textContent = `Unique Rocks Found: ${count}`;
    }

    // 2. Update Packs Stat
    const packsOpenedEl = document.getElementById('packs-opened-display');
    if (packsOpenedEl) {
        // Default to 0 if undefined
        const count = gameState.player.packsOpened || 0; 
        packsOpenedEl.textContent = `Total Packs Opened: ${count}`;
    }
}

/* --- Pack Opening Modal Functions --- */

/**
 * Sets up click listeners for the pack reveal modal.
 */
function initPackModal() {
    const modal = document.getElementById('pack-reveal-modal');
    const closeBtn = document.getElementById('modal-close-btn');

    if (modal && closeBtn) {
        // Click the "Awesome!" button to close
        closeBtn.addEventListener('click', hidePackModal);
        
        // Click the background overlay to close
        modal.addEventListener('click', (event) => {
            // We check if the click was on the overlay itself,
            // not on the window bubble inside it.
            if (event.target === modal) {
                hidePackModal();
            }
        });
    }
}

/**
 * Populates and shows the pack reveal modal.
 * Now handles "NEW!" labels and "Foil" overlays.
 * @param {Array<Object>} newCards - Array of the 3 cards (with 'isNew' flag)
 */
function showPackModal(newCards) {
    const modal = document.getElementById('pack-reveal-modal');
    const grid = document.getElementById('pack-reveal-grid');
    if (!modal || !grid) return;

    grid.innerHTML = '';

    newCards.forEach(card => {
        const cardData = allCardsData[card.cardId];
        
        const cardElement = document.createElement('div');
        cardElement.classList.add('card-in-grid');
        cardElement.classList.add(`rarity-${cardData.rarity}`);
        
        const imgPath = getCardImagePath(card.cardId, card.art);

        // --- Handle Variants ---
        let newLabelHTML = '';
        if (card.isNew) {
            newLabelHTML = '<div class="new-label">NEW!</div>';
        }
        
        let foilOverlayHTML = '';
        if (card.foil === 'foil') {
            foilOverlayHTML = '<div class="foil-overlay"></div>';
        }

        let variantText = '';
        if (card.art > 0) variantText = `(Alt ${card.art})`;
        // Foil text is redundant due to overlay

        cardElement.innerHTML = `
            ${newLabelHTML} <div class="card-image-placeholder">
                <img src="${imgPath}" alt="${cardData.name}">
                ${foilOverlayHTML} </div>
            <div class="card-info">
                <span class="card-name">${cardData.name}</span>
                <span class="card-variant-label">${variantText}</span>
            </div>
        `;
        
        grid.appendChild(cardElement);
    });

    modal.style.display = 'flex';
}

/**
 * Hides the pack reveal modal.
 */
function hidePackModal() {
    const modal = document.getElementById('pack-reveal-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// --- 4. PACK OPENING LOGIC ---

/**
 * Opens a pack, generates cards with variants, and shows the reveal modal.
 * @param {string} packType - The key for the pack (e.g., "basic")
 */
function openPack(packType) {
    if (gameState.player.packsInventory[packType] <= 0) return;

    gameState.player.packsInventory[packType] -= 1;
    console.log(`Opening pack: ${packType}`);

    const packRules = allPacksData[packType];
    if (!packRules) return;

    const newCards = []; // An array to hold the 3 new cards
    const cardsPerPack = 3;
    
    // Get current progression stats
    const packs = gameState.player.packsOpened;
    const uniques = gameState.player.uniquesOwned; // Use the stored value

    // --- Check Unlock Status ---
    const foilUnlocked = packs >= UNLOCK_GOALS.FOIL.value;
    const alt1Unlocked = uniques >= UNLOCK_GOALS.ALT_ART_1.value;
    const alt2Unlocked = uniques >= UNLOCK_GOALS.ALT_ART_2.value;

    let artChances = VARIANT_RATES.ART_CHANCES.LOCKED;
    if (alt2Unlocked) {
        artChances = VARIANT_RATES.ART_CHANCES.ALT_2_UNLOCKED;
    } else if (alt1Unlocked) {
        artChances = VARIANT_RATES.ART_CHANCES.ALT_1_UNLOCKED;
    }
    
    // --- Generate 3 Cards ---
    for (let i = 0; i < cardsPerPack; i++) {
        // 1. Get Base Card (uses our new region-locked function)
        const rarity = getRandomRarity(packRules);
        const cardId = getRandomCardOfRarity(rarity);

        // 2. Check if it's "NEW!" (must be done *before* adding)
        const isNew = isCardIdNew(cardId);

        // 3. Roll for Foil
        let foilType = "normal";
        if (foilUnlocked && (Math.random() * 100) < VARIANT_RATES.FOIL_CHANCE) {
            foilType = "foil";
        }

        // 4. Roll for Art
        let artType = 0; // Default to base
        const artRoll = Math.random() * 100;
        if (artRoll < artChances[2]) { // Alt 2
            artType = 2;
        } else if (artRoll < (artChances[1] + artChances[2])) { // Alt 1
            artType = 1;
        }
        
        // 5. Add to our list
        newCards.push({ cardId, art: artType, foil: foilType, isNew });
    }

    // --- Add to Inventory & Save ---
    // We pass just the card data, not the 'isNew' flag
    const cardsToAdd = newCards.map(c => ({ cardId: c.cardId, art: c.art, foil: c.foil }));
    addCardsToInventory(cardsToAdd);

    gameState.player.packsOpened += 1; // Increment *after* adding
    
    saveState();
    updateUI(); // Refresh background UI (pack counts, archive)
    
    console.log("Opened pack and received:", newCards);
    
    // Show the modal with all info (including 'isNew')
    showPackModal(newCards);
}

/**
 * Helper function: Chooses a rarity based on pack drop rates.
 * This is now data-driven and uses the RARITY_ORDER constant.
 * @param {Object} packRules - The drop rate object (e.g., { common: 80, rare: 5, ... })
 * @returns {string} - The chosen rarity ("common", "uncommon", "mythic", etc.)
 */
function getRandomRarity(packRules) {
    const roll = Math.random() * 100; // Get a random number 0-99.99...
    let cumulativeChance = 0;

    // We loop from RAREST to COMMON
    for (const rarity of RARITY_ORDER) {
        // Get the chance for this rarity, defaulting to 0 if not in the pack
        const chance = packRules[rarity] || 0;
        
        // Add it to our cumulative total
        cumulativeChance += chance;

        // If our roll is less than the cumulative total, we hit this rarity
        if (roll < cumulativeChance) {
            return rarity;
        }
    }

    // Failsafe: if something goes wrong (e.g., chances don't add to 100),
    // default to the most common rarity (the last item in our array).
    return RARITY_ORDER[RARITY_ORDER.length - 1]; // "common"
}

/**
 * Helper function: Gets a random card ID that matches a specific rarity.
 * @param {string} rarity - The rarity to filter by
 * @returns {string} - The chosen card ID (e.g., "rock-011")
 */
function getRandomCardOfRarity(rarity) {
    // Get all card IDs from our loaded data
    const allCardIds = Object.keys(allCardsData);

    // Filter that list to only include cards of the chosen rarity
    const validCardIds = allCardIds.filter(id => {
        return allCardsData[id].rarity === rarity;
    });

    // Pick a random card from the filtered list
    const randomIndex = Math.floor(Math.random() * validCardIds.length);
    return validCardIds[randomIndex];
}/**
 * Helper function: Gets a random card ID that matches a specific rarity
 * AND is from a region the player has unlocked.
 * @param {string} rarity - The rarity to filter by
 * @returns {string} - The chosen card ID (e.g., "rock-011")
 */
function getRandomCardOfRarity(rarity) {
    // 1. Get the list of regions the player has access to
    const unlockedRegions = getUnlockedRegions();
    
    // 2. Get all card IDs from our loaded data
    const allCardIds = Object.keys(allCardsData);

    // 3. Filter that list
    const validCardIds = allCardIds.filter(id => {
        const card = allCardsData[id];
        return card.rarity === rarity && // A) Card has the right rarity
               unlockedRegions.includes(card.region); // B) Card is in an unlocked region
    });
    
    if (validCardIds.length === 0) {
        // --- Failsafe ---
        // This can happen if a player gets (e.g.) a "Rare" from a basic
        // pack, but has not unlocked any regions that *have* rare cards.
        // We'll fall back to *any* unlocked common card.
        console.warn(`No cards found for rarity ${rarity} in unlocked regions. Giving a common card.`);
        
        const commonCards = allCardIds.filter(id => {
            const card = allCardsData[id];
            return card.rarity === 'common' && unlockedRegions.includes(card.region);
        });
        
        // This should always find a card, as 'riverbed' (full of commons) is
        // unlocked at 0 packs.
        const randomIndex = Math.floor(Math.random() * commonCards.length);
        return commonCards[randomIndex];
    }

    // 4. Pick a random card from the filtered list
    const randomIndex = Math.floor(Math.random() * validCardIds.length);
    return validCardIds[randomIndex];
}

/**
 * Helper function: Gets a random card ID matching a region AND a rarity.
 * This is used for "wild" card finds, like from fishing.
 * This function now ALSO respects region unlocks.
 * @param {string} region - The region to filter by (e.g., "riverbed")
 * @returns {string | null} - The chosen card ID (e.g., "rock-001"), or null
 */
function getRandomCardOfRegion(region) {
    // --- Step 1: Check if the player has even unlocked this region ---
    const unlockedRegions = getUnlockedRegions();
    if (!unlockedRegions.includes(region)) {
        console.warn(`Attempted to get card from locked region: ${region}.`);
        // Failsafe: return a card from their *first* unlocked region instead
        region = unlockedRegions[0] || 'riverbed';
    }

    // --- Step 2: Determine the Rarity (using our existing table) ---
    const roll = Math.random() * 100;
    let cumulativeChance = 0;
    let chosenRarity = "common"; // Default

    for (const rarityInfo of WILD_RARITY_CHANCE) {
        cumulativeChance += rarityInfo.chance;
        if (roll < cumulativeChance) {
            chosenRarity = rarityInfo.rarity;
            break;
        }
    }

    // --- Step 3: Find a card that matches region, rarity, AND is unlocked ---
    const allCardIds = Object.keys(allCardsData);
    const validCardIds = allCardIds.filter(id => {
        const card = allCardsData[id];
        return card.region === region &&
               card.rarity === chosenRarity;
        // We don't need to check unlock status *again* because we
        // already filtered the region in Step 1.
    });

    if (validCardIds.length > 0) {
        // We found a match! (e.g., a "common" "riverbed" card)
        const randomIndex = Math.floor(Math.random() * validCardIds.length);
        return validCardIds[randomIndex];
    } else {
        // --- Step 4: Failsafe ---
        // What if no "common" "riverbed" card exists?
        // Fall back to *any* card from that region.
        console.warn(`No card found for ${chosenRarity} in ${region}. Falling back to any.`);
        
        const anyRegionCardIds = allCardIds.filter(id => {
            return allCardsData[id].region === region;
        });
        
        if (anyRegionCardIds.length > 0) {
            const randomIndex = Math.floor(Math.random() * anyRegionCardIds.length);
            return anyRegionCardIds[randomIndex];
        } else {
            console.error(`No cards found for region: ${region}`);
            return null;
        }
    }
}

/**
 * Helper function: Adds an array of new cards to the player's inventory.
 * This function now correctly stacks duplicates based on cardId, art, AND foil.
 * @param {Array<Object>} newCards - e.g., [{cardId: "rock-001", art: 0, foil: "normal"}]
 */
function addCardsToInventory(newCards) {
    const inventory = gameState.inventory.cards;

    newCards.forEach(newCard => {
        // Check if this exact card (id, art, AND foil) is already in our inventory
        const existingCard = inventory.find(card => 
            card.cardId === newCard.cardId && 
            card.art === newCard.art &&
            card.foil === newCard.foil
        );

        if (existingCard) {
            // If it exists, just increment the count
            existingCard.count += 1;
            console.log(`Stacked duplicate: ${newCard.cardId} (Art: ${newCard.art}, Foil: ${newCard.foil})`);
        } else {
            // If it's new, add it to the inventory with a count of 1
            inventory.push({
                cardId: newCard.cardId,
                art: newCard.art,
                foil: newCard.foil,
                count: 1
            });
            console.log(`Added new card: ${newCard.cardId} (Art: ${newCard.art}, Foil: ${newCard.foil})`);
        }
    });
    
    // Recalculate uniques owned (this is fast enough)
    gameState.player.uniquesOwned = getUniqueCardCount();
}

/**
 * Gets the correct image path for a card based on its ID and art variant.
 * @param {string} cardId - The ID of the card (e.g., "rock-001")
 * @param {number|string} artVariant - The art variant (0, 1, 2, or "normal")
 * @returns {string} - The relative path to the image
 */
function getCardImagePath(cardId, artVariant) {
    // Safety check: Treat 0, "0", undefined, or "normal" as the Base Art
    if (!artVariant || artVariant === 0 || artVariant === '0' || artVariant === 'normal') {
        // Base Art -> rock-037.png
        return `images/cards/${cardId}.png`;
    } else {
        // Alt Art -> rock-037-alt1.png
        return `images/cards/${cardId}-alt${artVariant}.png`;
    }
}

/**
 * Adds a specified number of packs to the player's inventory.
 * @param {string} packType - The key for the pack (e.g., "basic")
 * @param {number} count - How many packs to add
 */
function addPackToInventory(packType, count) {
    if (gameState.player.packsInventory.hasOwnProperty(packType)) {
        gameState.player.packsInventory[packType] += count;
        console.log(`Added ${count} "${packType}" pack(s) to inventory.`);
    } else {
        console.warn(`Unknown pack type: ${packType}`);
    }
    
    // Save and update the UI to show the new pack count
    saveState();
    updateUI();
}

/*
================================================================================
SECTION 5: EXPEDITIONS & TIMERS
================================================================================
*/

/**
 * Runs once per second. Checks for completed expeditions and updates timers.
 */
function onGameTick() {
    const now = Date.now();
    let expeditionsNeedRedraw = false; // Flag to see if we need to call updateUI

    gameState.expeditions.forEach((exp, index) => {
        if (exp.status === "out") {
            const timeLeft = exp.endTs - now;

            if (timeLeft <= 0) {
                // Expedition is done!
                console.log(`Expedition ${index} finished.`);
                exp.status = "complete";
                exp.rewards = generateExpeditionRewards(exp.region);
                expeditionsNeedRedraw = true; // We need to redraw the slot
                saveState();
            } else {
                // Expedition is still running, update its timer display
                const timerEl = document.getElementById(`exp-timer-${index}`);
                if (timerEl) {
                    timerEl.textContent = formatTime(timeLeft);
                }
            }
        }
    });

    if (expeditionsNeedRedraw) {
        updateExpeditionsUI(); // Redraw all slots
    }
}

/**
 * Checks all expeditions on game load to handle offline progress.
 */
function checkAllExpeditions() {
    const now = Date.now();
    gameState.expeditions.forEach((exp, index) => {
        if (exp.status === "out" && now >= exp.endTs) {
            // This expedition finished while the player was away
            console.log(`Found completed offline expedition: ${index}`);
            exp.status = "complete";
            // We pass the index (0, 1, or 2) to generate the correct rewards
            exp.rewards = generateExpeditionRewards(index); 
        }
    });
    // Save any changes we made
    saveState();
}

/**
 * Creates the static HTML for the 3 expedition slots.
 * Runs once on game load.
 */
function initExpeditions() {
    const grid = document.getElementById('expedition-slots');
    if (!grid) return;
    
    grid.innerHTML = ''; // Clear it

    // Loop through our new data constant
    for (let i = 0; i < EXPEDITION_DATA.length; i++) {
        const slotData = EXPEDITION_DATA[i];
        
        const slot = document.createElement('div');
        slot.classList.add('expedition-slot');
        slot.id = `exp-slot-${i}`; // Give each slot a unique ID
        
        // Add placeholder content. updateExpeditionsUI will fill it.
        // We add the image here, as it's static.
        slot.innerHTML = `
            <img src="${slotData.image}" alt="${slotData.name}" class="expedition-image">
            <h4>${slotData.name}</h4>
        `; 
        
        grid.appendChild(slot);
    }
}
/**
 * Redraws the content of all expedition slots based on gameState.
 */
function updateExpeditionsUI() {
    gameState.expeditions.forEach((exp, index) => {
        const slot = document.getElementById(`exp-slot-${index}`);
        if (!slot) return;
        
        // Get the "master data" for this slot
        const slotData = EXPEDITION_DATA[index];
        let content = '';

        // The image and title are now permanent, so we just build the
        // content for the bottom (status, timer, button)
        switch (exp.status) {
            case "empty":
                content = `
                    <p class="status">Ready to explore.</p>
                    <button class="game-button" onclick="startExpedition(${index})">Start (${slotData.durationText})</button>
                `;
                break;
            
            case "out":
                content = `
                    <p class="status">Exploring...</p>
                    <div class="timer" id="exp-timer-${index}">${formatTime(exp.endTs - Date.now())}</div>
                    <button class="game-button" disabled>In Progress</button>
                `;
                break;
                
            case "complete":
                let rewardText = "Reward ready!"; // Default
                if (exp.rewards) {
                    if (exp.rewards.type === "pack") {
                        rewardText = `Found 1 ${exp.rewards.packType} pack!`;
                    }
                }
                
                content = `
                    <p class="status">Expedition complete! ${rewardText}</p>
                    <button class="game-button claim-button" onclick="claimExpedition(${index})">Claim Reward</button>
                `;
                break;
        }
        
        // We can't just set innerHTML, as it would delete our image/title.
        // So, we find/create a "dynamic" area to put the content in.
        let dynamicArea = slot.querySelector('.exp-dynamic-area');
        if (!dynamicArea) {
            dynamicArea = document.createElement('div');
            dynamicArea.className = 'exp-dynamic-area';
            // Make it fill the space
            dynamicArea.style.display = 'flex';
            dynamicArea.style.flexDirection = 'column';
            dynamicArea.style.justifyContent = 'space-between';
            dynamicArea.style.flexGrow = '1';
            slot.appendChild(dynamicArea);
        }
        
        dynamicArea.innerHTML = content;
    });
}
/**
 * Starts a new expedition.
 * @param {number} slotIndex - The slot to start (0, 1, or 2)
 */
function startExpedition(slotIndex) {
    const now = Date.now();
    // Get the duration from our new constant!
    const duration = EXPEDITION_DATA[slotIndex].durationMs; 
    
    gameState.expeditions[slotIndex] = {
        status: "out",
        slotIndex: slotIndex, // Store which slot this is
        endTs: now + duration
    };
    
    saveState();
    updateExpeditionsUI(); // Redraw the UI
}
/**
 * Claims the rewards from a finished expedition.
 * @param {number} slotIndex - The slot to claim (0, 1, or 2)
 */
function claimExpedition(slotIndex) {
    const exp = gameState.expeditions[slotIndex];
    if (exp.status !== "complete" || !exp.rewards) return; // Safety check

    const reward = exp.rewards;
    let alertMessage = "";

    // Check the reward type and process it
    if (reward.type === "pack") {
        addPackToInventory(reward.packType, reward.count);
        alertMessage = `You found 1 ${reward.packType} Pack!`;

    } else if (reward.type === "card") {
        addCardsToInventory(reward.items);
        alertMessage = `You found: ${reward.items.map(r => allCardsData[r.cardId].name).join(', ')}`;
    
    } else {
        console.warn("Unknown reward type in expedition slot.");
    }

    if (alertMessage) {
        alert(alertMessage);
    }

    // Reset the slot
    gameState.expeditions[slotIndex] = { status: "empty" };
    
    saveState();
    updateUI(); // Do a full UI update to refresh archive/pack counts
}

/**
 * Generates rewards for an expedition.
 * @param {number} slotIndex - The slot that finished (0, 1, or 2)
 * @returns {Object} - A reward object
 */
function generateExpeditionRewards(slotIndex) {
    // Get the master data for this slot
    const slotData = EXPEDITION_DATA[slotIndex];
    
    // Roll for the bonus!
    const roll = Math.random() * 100; // 0 - 99.99...
    let chosenPack = slotData.basePack; // Default to base pack

    if (roll < slotData.bonusChance) {
        console.log(`Expedition ${slotIndex} hit the bonus!`);
        chosenPack = slotData.bonusPack;
    }

    return {
        type: "pack",
        packType: chosenPack,
        count: 1
    };
}

/**
 * Helper function: Converts milliseconds into a 00:00:00 string.
 * @param {number} ms - Milliseconds remaining
 * @returns {string} - Formatted time string
 */
function formatTime(ms) {
    if (ms < 0) ms = 0;
    
    let totalSeconds = Math.floor(ms / 1000);
    let totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    
    const seconds = totalSeconds % 60;
    const minutes = totalMinutes % 60;
    
    // 'padStart' adds a leading '0'
    const s = String(seconds).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    
    if (hours > 0) {
        return `${hours}:${m}:${s}`; // e.g., "7:59:59"
    } else {
        return `${m}:${s}`; // e.g., "59:59"
    }
}

/*
================================================================================
SECTION 6: MINIGAMES
================================================================================
*/

/**
 * Sets up the main minigame selection hub and all individual games.
 */
function initMinigameHub() {
    const buttons = document.querySelectorAll('.minigame-button');
    const backBtn = document.getElementById('minigame-back-btn');

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const gameId = button.dataset.game;
            showMinigameStage(gameId);
        });
    });

    backBtn.addEventListener('click', () => {
        showMinigameStage('menu'); // 'menu' is our keyword
    });
    
    // We still need to init the internal logic of each game
    initFishingMinigame();
    initSiftingMinigame();
}

/**
 * Shows/hides the minigame selection menu and game stages.
 * @param {string} gameId - The ID of the game to show (e.g., "fishing") or "menu"
 */
function showMinigameStage(gameId) {
    const selectionDiv = document.getElementById('minigame-selection');
    const stagesDiv = document.getElementById('minigame-stages');
    const allGameDivs = stagesDiv.querySelectorAll('.minigame-container');
    
    if (gameId === 'menu') {
        // Show menu, hide stages
        selectionDiv.style.display = 'block';
        stagesDiv.style.display = 'none';
        
        // Also reset any active game state (like fishing)
        resetFishingGame(); 
    } else {
        // Hide menu, show stages
        selectionDiv.style.display = 'none';
        stagesDiv.style.display = 'block';
        
        // Hide all games...
        allGameDivs.forEach(div => div.classList.remove('active-minigame'));
        
        // ...then show the one we clicked
        const targetGame = document.getElementById(`${gameId}-minigame`);
        if (targetGame) {
            targetGame.classList.add('active-minigame');
        }
    }
}

/**
 * Sets up the click listener for the fishing button.
 */
function initFishingMinigame() {
    const button = document.getElementById('fishing-button');
    if (button) {
        button.addEventListener('click', handleFishingClick);
    }
}

/**
 * Handles all clicks on the main fishing button.
 * It's a "state machine" that behaves differently based on 'fishingState'.
 */
function handleFishingClick() {
    switch (fishingState) {
        case "idle":
            startFishing();
            break;
        case "waiting":
            // Player clicked too early!
            failFishing();
            break;
        case "bite":
            reelInFish();
            break;
    }
}

/**
 * Starts the fishing "waiting" game.
 */
function startFishing() {
    fishingState = "waiting";
    
    // Update UI
    const button = document.getElementById('fishing-button');
    const status = document.getElementById('fishing-status');
    
    // We no longer disable the button
    button.textContent = "Waiting...";
    status.textContent = "Shh... waiting for a bite.";

    // Clear any old timer
    if (fishingTimeout) clearTimeout(fishingTimeout);
    
    // Set a timer for the "bite"
    const waitTime = Math.random() * 5000 + 3000; // 3-8 seconds
    fishingTimeout = setTimeout(showFishBite, waitTime);
}

/**
 * Player clicked while "waiting" and scared the fish.
 */
function failFishing() {
    fishingState = "idle"; // Reset
    
    // Clear the "bite" timer
    if (fishingTimeout) clearTimeout(fishingTimeout);
    
    // Update UI
    const button = document.getElementById('fishing-button');
    const status = document.getElementById('fishing-status');

    button.disabled = false;
    button.textContent = "Oops!";
    status.textContent = "You clicked too early and scared it away!";
    
    // Reset the game after a short delay
    setTimeout(resetFishingGame, 2000); // 2-second delay
}

/**
 * The "bite" appears!
 */
function showFishBite() {
    fishingState = "bite";
    
    // Update UI
    const button = document.getElementById('fishing-button');
    const status = document.getElementById('fishing-status');
    
    button.disabled = false;
    button.textContent = "Reel In!";
    button.classList.add('claim-button'); // Make it green
    status.textContent = "BITE!";

    // Clear any old timer
    if (fishingTimeout) clearTimeout(fishingTimeout);
    
    // Set a "get away" timer. Player has 2 seconds to click.
    fishingTimeout = setTimeout(fishGotAway, 2000); 
}

/**
 * Player clicked the "Reel In" button in time!
 */
function reelInFish() {
    fishingState = "reeling"; // Temporary state
    
    // Clear the "get away" timer
    if (fishingTimeout) clearTimeout(fishingTimeout);

    // Update UI
    const button = document.getElementById('fishing-button');
    const status = document.getElementById('fishing-status');

    button.disabled = true;
    button.textContent = "Caught!";
    
    // --- Generate the Reward ---
    const reward = generateFishingReward();
    let statusMessage = "";

    switch (reward.type) {
        case "pack":
            addPackToInventory(reward.packType, 1);
            statusMessage = `You caught... a ${reward.packType} Pack!`;
            break;
        
        case "card":
            // This now uses our new, rarity-controlled function!
            const cardId = getRandomCardOfRegion(reward.region); 
            if (cardId) {
                const cardData = allCardsData[cardId];
                addCardsToInventory([{ cardId: cardId, variant: "normal" }]);
                statusMessage = `You found a ${cardData.name}!`;
            } else {
                statusMessage = "You found... nothing this time.";
            }
            break;
            
        case "none":
        default:
            statusMessage = `You reeled in... ${reward.message}`;
            break;
    }

    status.textContent = statusMessage;
    
    // Save the game (if a pack or card was added)
    if (reward.type !== "none") {
        saveState();
        updateUI(); // This is needed to refresh pack counts / archive
    }

    // Reset the game after a short delay
    setTimeout(resetFishingGame, 2500); // Longer delay to read reward
}

/**
 * Player was too slow and the fish got away.
 */
function fishGotAway() {
    fishingState = "idle"; // Reset
    
    // Update UI
    const button = document.getElementById('fishing-button');
    const status = document.getElementById('fishing-status');

    button.disabled = false;
    button.textContent = "Cast";
    button.classList.remove('claim-button');
    status.textContent = "Oh... it got away. Try again!";
}

/**
 * Rolls on the FISHING_REWARDS table to get a random reward.
 * @returns {Object} - A reward object from the loot table
 */
function generateFishingReward() {
    const roll = Math.random() * 100; // Get a random number 0-99.99...
    let cumulativeChance = 0;

    for (const reward of FISHING_REWARDS) {
        cumulativeChance += reward.chance;
        if (roll < cumulativeChance) {
            return reward;
        }
    }
    
    // Failsafe in case table doesn't add to 100
    return FISHING_REWARDS[FISHING_REWARDS.length - 1]; 
}

/**
 * Resets the fishing game to its idle state.
 */
function resetFishingGame() {
    fishingState = "idle";
    
    const button = document.getElementById('fishing-button');
    const status = document.getElementById('fishing-status');
    
    button.disabled = false;
    button.textContent = "Cast";
    button.classList.remove('claim-button');
    status.textContent = ""; // Clear status
}

/*
================================================================================
SECTION 6.2: MINIGAMES (ROCK SIFTING)
================================================================================
*/

// --- Sifting Game State ---
let siftingTimer;           // Holds the setInterval for the game timer
let siftingSecondsLeft;     // Countdown timer
let siftingFindList;        // Array of rock IDs we need to find
let siftingRocksInSieve;    // Array of all rocks placed in the sieve

/**
 * Sets up the "Start" button for the sifting game.
 */
function initSiftingMinigame() {
    // This is just a placeholder to show the game is active
    // The real "Start" button will be added to the HTML
}

/**
 * Resets and starts a new Rock Sifting game.
 */
function startSiftingGame() {
    // 1. Generate the "Find List"
    siftingFindList = generateSiftingFindList(3); // Find 3 unique rocks
    
    // 2. Generate the rocks to place in the sieve
    // We'll place 10 total: our 3 targets + 7 "decoys"
    let decoys = generateSiftingFindList(7, siftingFindList); // 7 decoys, excluding targets
    siftingRocksInSieve = [...siftingFindList, ...decoys];
    
    // 3. Shuffle the rocks
    siftingRocksInSieve.sort(() => Math.random() - 0.5);

    // 4. Reset Timer
    siftingSecondsLeft = 20; // 20 seconds to find them
    
    // 5. Draw the UI
    drawSiftingFindList();
    drawSiftingSieve();
    updateSiftingTimerDisplay();

    // 6. Start the game timer
    if (siftingTimer) clearInterval(siftingTimer);
    siftingTimer = setInterval(onSiftingTick, 1000);
    
    // Make sure the "Start" button is hidden and the game is visible
    document.getElementById('sifting-start-area').style.display = 'none';
    document.getElementById('sifting-game-area').style.display = 'block';
}

/**
 * Runs every second during the sifting game.
 */
function onSiftingTick() {
    siftingSecondsLeft--;
    updateSiftingTimerDisplay();

    if (siftingSecondsLeft <= 0) {
        // Time's up!
        endSiftingGame(false); // 'false' = loss
    }
}

/**
 * Creates the "Find List" UI.
 */
function drawSiftingFindList() {
    const listEl = document.getElementById('sifting-find-list');
    listEl.innerHTML = '';
    
    siftingFindList.forEach(rockId => {
        const cardData = allCardsData[rockId];
        const itemEl = document.createElement('li');
        itemEl.id = `find-${rockId}`;
        itemEl.textContent = cardData.name;
        listEl.appendChild(itemEl);
    });
}

/**
 * Draws all the rocks randomly inside the sieve area.
 */
function drawSiftingSieve() {
    const sieveEl = document.getElementById('sifting-sieve');
    sieveEl.innerHTML = ''; // Clear old rocks

    siftingRocksInSieve.forEach((rockId, index) => {
        const cardData = allCardsData[rockId];
        const rockEl = document.createElement('img');
        
        rockEl.src = getCardImagePath(rockId, 0);
        rockEl.alt = cardData.name;
        rockEl.classList.add('sieve-rock');
        rockEl.dataset.rockId = rockId; // Store the ID
        
        // Randomly position the rock within the sieve
        // We use percentages to keep it responsive
        rockEl.style.left = `${Math.random() * 90}%`; // 0-90% to keep it inside
        rockEl.style.top = `${Math.random() * 90}%`;
        
        // Random rotation and size for variety
        rockEl.style.transform = `rotate(${Math.random() * 360}deg) scale(${0.8 + Math.random() * 0.4})`; // 0.8x to 1.2x scale
        
        // Add click listener
        rockEl.addEventListener('click', onSieveRockClick);
        
        sieveEl.appendChild(rockEl);
    });
}

/**
 * Handles clicking on a rock in the sieve.
 */
function onSieveRockClick(event) {
    const clickedRock = event.target;
    const clickedId = clickedRock.dataset.rockId;

    // Check if this rock is in our "Find List"
    const findIndex = siftingFindList.indexOf(clickedId);

    if (findIndex > -1) {
        // --- Correct Click! ---
        
        // 1. Remove it from the list
        siftingFindList.splice(findIndex, 1);
        
        // 2. Strike it out on the UI
        const listItem = document.getElementById(`find-${clickedId}`);
        if (listItem) listItem.classList.add('found');
        
        // 3. Make the rock "fade out"
        clickedRock.classList.add('found-rock');
        clickedRock.removeEventListener('click', onSieveRockClick); // Disable click

        // 4. Check for win
        if (siftingFindList.length === 0) {
            endSiftingGame(true); // 'true' = win
        }
    } else {
        // --- Wrong Click! ---
        // Add a "shake" effect
        clickedRock.classList.add('shake');
        // Remove the class after the animation finishes
        setTimeout(() => clickedRock.classList.remove('shake'), 300);
    }
}

/**
 * Ends the game, calculates rewards, and resets the UI.
 * @param {boolean} didWin - Whether the player won or lost
 */
function endSiftingGame(didWin) {
    clearInterval(siftingTimer); // Stop the clock
    const statusEl = document.getElementById('sifting-status');
    
    if (didWin) {
        // --- Player Won! ---
        const reward = generateSiftingReward();
        let statusMessage = "";

        switch (reward.type) {
            case "pack":
                addPackToInventory(reward.packType, 1);
                statusMessage = `You found them all and got a ${reward.packType} Pack!`;
                break;
            case "card":
                const cardId = getRandomCardOfRegion(reward.region);
                if (cardId) {
                    addCardsToInventory([{ cardId: cardId, variant: "normal" }]);
                    statusMessage = `You found them all and uncovered a ${allCardsData[cardId].name}!`;
                }
                break;
            default:
                statusMessage = `You found them all! You also found... ${reward.message}`;
                break;
        }
        statusEl.textContent = statusMessage;
        
        if (reward.type !== "none") {
            saveState();
            updateUI(); // Refresh pack/archive
        }
        
    } else {
        // --- Player Lost (Time Up) ---
        statusEl.textContent = "Time's up! The sand shifted. Try again!";
    }

    // After 3 seconds, reset to the "Start" screen
    setTimeout(() => {
        document.getElementById('sifting-start-area').style.display = 'block';
        document.getElementById('sifting-game-area').style.display = 'none';
        statusEl.textContent = ''; // Clear status
    }, 3000);
}

/**
 * Generates the reward for winning the sifting game.
 * @returns {Object} - A reward object from the loot table
 */
function generateSiftingReward() {
    const roll = Math.random() * 100;
    let cumulativeChance = 0;

    for (const reward of SIFTING_REWARDS) {
        cumulativeChance += reward.chance;
        if (roll < cumulativeChance) {
            return reward;
        }
    }
    return SIFTING_REWARDS[SIFTING_REWARDS.length - 1]; // Failsafe
}

/**
 * Helper: Gets a list of unique rock IDs from the minigame list.
 * @param {number} count - How many rocks to get
 * @param {Array<string>} exclude - An array of IDs to exclude
 * @returns {Array<string>}
 */
function generateSiftingFindList(count, exclude = []) {
    let availableRocks = MINIGAME_ROCK_LIST.filter(id => !exclude.includes(id));
    availableRocks.sort(() => Math.random() - 0.5); // Shuffle
    return availableRocks.slice(0, count);
}

/**
 * Updates the timer text.
 */
function updateSiftingTimerDisplay() {
    const timerEl = document.getElementById('sifting-timer');
    timerEl.textContent = `Time: ${siftingSecondsLeft}s`;
    if (siftingSecondsLeft <= 5 && siftingSecondsLeft > 0) {
        timerEl.classList.add('danger');
    } else {
        timerEl.classList.remove('danger');
    }
}

/*
================================================================================
SECTION 7: DUPLICATE CONVERTER
================================================================================
*/

/**
 * Sets up the click listener for the main "Convert" button.
 */
function initConverter() {
    const button = document.getElementById('converter-confirm-btn');
    if (button) {
        button.addEventListener('click', confirmConversion);
    }
}

/**
 * Clears the current converter selection and resets the UI.
 */
function clearConverterSelection() {
    conversionSelection = [];
    updateConverterUI(); // This will redraw the grid and summary
}

/**
 * Redraws the grid of duplicate cards.
 * Now handles art/foil variants as separate items.
 */
function updateConverterUI() {
    const grid = document.getElementById('converter-grid');
    if (!grid) return; 

    grid.innerHTML = '';
    const duplicates = gameState.inventory.cards.filter(card => card.count > 1);

    duplicates.forEach(card => {
        const cardData = allCardsData[card.cardId];
        if (!cardData) return;

        const selectedEntry = conversionSelection.find(c => 
            c.cardId === card.cardId && c.art === card.art && c.foil === card.foil
        );
        
        const cardElement = document.createElement('div');
        cardElement.classList.add('card-in-grid');
        cardElement.classList.add(`rarity-${cardData.rarity}`);
        
        if (selectedEntry) cardElement.classList.add('selected');

        const imgPath = getCardImagePath(card.cardId, card.art);
        const availableCount = card.count - 1;
        const selectedCount = selectedEntry ? selectedEntry.count : 0;

        // --- Handle Variants ---
        let foilOverlayHTML = '';
        if (card.foil === 'foil') {
            foilOverlayHTML = '<div class="foil-overlay"></div>';
        }
        
        let variantText = '';
        if (card.foil === 'foil') variantText += "Foil";
        if (card.art > 0) variantText += ` (Alt ${card.art})`;

        cardElement.innerHTML = `
            <div class="card-image-placeholder">
                <img src="${imgPath}" alt="${cardData.name}">
                ${foilOverlayHTML}
            </div>
            <div class="card-info">
                <span class="card-name">${cardData.name}</span>
                <span class="card-count">x(${selectedCount}/${availableCount})</span>
            </div>
            <div class="card-variant-label">${variantText}</div>
        `;
        
        cardElement.addEventListener('click', () => {
            toggleCardForConversion(card.cardId, card.art, card.foil);
        });
        
        grid.appendChild(cardElement);
    });
    
    updateConversionSummary();
}

/**
 * Called when a card in the converter grid is clicked.
 * Adds/removes one copy of the card to the selection.
 * @param {string} cardId
 * @param {number} art
 * @param {string} foil
 */
function toggleCardForConversion(cardId, art, foil) {
    const playerCard = gameState.inventory.cards.find(c => 
        c.cardId === cardId && 
        c.art === art &&
        c.foil === foil
    );
    if (!playerCard) return;

    const availableCount = playerCard.count - 1;
    if (availableCount <= 0) return;

    let selectionEntry = conversionSelection.find(c => 
        c.cardId === cardId && 
        c.art === art &&
        c.foil === foil
    );

    if (!selectionEntry) {
        // Not in selection yet, add 1
        conversionSelection.push({ cardId, art, foil, count: 1 });
    } else {
        if (selectionEntry.count < availableCount) {
            selectionEntry.count += 1;
        } else {
            // We've selected all available copies, so clicking again removes it
            selectionEntry.count = 0;
            conversionSelection = conversionSelection.filter(c => c.count > 0);
        }
    }
    
    updateConverterUI();
}

/**
 * Calculates points and updates the summary text and button.
 */
function updateConversionSummary() {
    let totalPoints = 0;

    conversionSelection.forEach(card => {
        const cardData = allCardsData[card.cardId];
        const pointsPerCard = CONVERSION_POINTS[cardData.rarity] || 0;
        totalPoints += pointsPerCard * card.count;
    });

    // Find the best pack the player has earned
    let reward = "(None)";
    for (const pack of PACK_THRESHOLDS) {
        if (totalPoints >= pack.points) {
            reward = `${pack.name.charAt(0).toUpperCase() + pack.name.slice(1)} Pack`;
            break; // Stop at the first (best) pack we qualify for
        }
    }

    // Update the UI
    document.getElementById('converter-points').textContent = `Total Points: ${totalPoints}`;
    document.getElementById('converter-reward').textContent = `Reward: ${reward}`;
    
    // Enable/disable the confirm button
    const confirmButton = document.getElementById('converter-confirm-btn');
    confirmButton.disabled = (reward === "(None)");
}

/**
 * Finalizes the conversion: removes cards, adds the pack.
 */
function confirmConversion() {
    let totalPoints = 0;
    let finalReward = null;

    // 1. Calculate points
    conversionSelection.forEach(card => {
        const cardData = allCardsData[card.cardId];
        const pointsPerCard = CONVERSION_POINTS[cardData.rarity] || 0;
        totalPoints += pointsPerCard * card.count;
    });

    for (const pack of PACK_THRESHOLDS) {
        if (totalPoints >= pack.points) {
            finalReward = pack.name;
            break;
        }
    }

    // 2. Safety check
    if (!finalReward) {
        console.warn("Conversion confirmed with no reward. Aborting.");
        return;
    }

    // 3. Remove the selected cards from inventory
    conversionSelection.forEach(selectedCard => {
        const playerCard = gameState.inventory.cards.find(c =>
            c.cardId === selectedCard.cardId && 
            c.art === selectedCard.art &&
            c.foil === selectedCard.foil
        );
        if (playerCard) {
            playerCard.count -= selectedCard.count;
        }
    });

    // 4. Add the new pack
    addPackToInventory(finalReward, 1);
    
    // 5. Alert the player
    alert(`Cards converted! You received 1 ${finalReward} Pack!`);
    
    // 6. Reset the converter
    clearConverterSelection();
    
    // 7. Save and refresh everything
    saveState();
    updateUI(); 
}

/*
================================================================================
SECTION 8: DEV TOOLS
================================================================================
*/

/**
 * Initializes the DevTools panel (populates dropdowns).
 */
function initDevTools() {
    const packSelect = document.getElementById('dev-pack-select');
    if (!packSelect) return;

    // Clear existing
    packSelect.innerHTML = '';

    // Automatically find all pack types from our data
    // This is great because if you add "seasonal" to packs.json, it shows up here automatically!
    const packTypes = Object.keys(allPacksData);
    
    packTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        packSelect.appendChild(option);
    });
}

/**
 * Cheat: Adds packs.
 * @param {number} amount 
 */
function devAddPacks(amount) {
    const select = document.getElementById('dev-pack-select');
    const type = select.value;
    
    addPackToInventory(type, amount);
    // Don't alert() because that gets annoying when clicking +100
    console.log(`Dev: Added ${amount} ${type} packs.`);
}

/**
 * Cheat: Spawns a specific card.
 */
function devAddCard() {
    const input = document.getElementById('dev-card-input');
    const status = document.getElementById('dev-card-status');
    const cardId = input.value.trim();

    if (!allCardsData[cardId]) {
        status.textContent = `Error: Card ID "${cardId}" not found.`;
        status.style.color = "red";
        return;
    }

    // Add 1 Normal Base version
    addCardsToInventory([{ cardId: cardId, art: 0, foil: "normal" }]);
    
    status.textContent = `Success: Added ${allCardsData[cardId].name}`;
    status.style.color = "green";
    
    saveState();
    updateUI();
}

/**
 * Cheat: Resets stats to 0 (for testing unlocks).
 */
function devResetProgress() {
    gameState.player.packsOpened = 0;
    gameState.player.uniquesOwned = 0; // Will recalc on next add
    saveState();
    updateUI();
    alert("Progress stats reset to 0.");
}

/**
 * Cheat: Sets stats high (to unlock everything).
 */
function devMaxProgress() {
    gameState.player.packsOpened = 999;
    gameState.player.uniquesOwned = 999;
    saveState();
    updateUI();
    alert("Progress stats maxed out. Foils and Alts unlocked!");
}

// --- 5. START THE GAME ---
// This is the last line. It tells the browser to run our 'initGame'
// function once the page and this script have finished loading.
document.addEventListener('DOMContentLoaded', initGame);

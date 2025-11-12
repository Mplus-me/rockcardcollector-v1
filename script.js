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

// NEW: This is our single source of truth for rarities.
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
    { name: "curated", points: 250 },
    { name: "premium", points: 100 },
    { name: "standard", points: 30 },
    { name: "basic", points: 10 }
];

/** @type {GameState} */
let gameState = {}; // Holds the player's save data (packs, cards, etc.)

// Temporary state for the converter.
// Holds an array of objects: [{cardId, variant, count}]
let conversionSelection = [];

let allCardsData = {}; // Holds all card definitions from cards.json
let allPacksData = {}; // Holds all pack drop rates from packs.json

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
    initFishingMinigame(); // Initialize fishing minigame
    initConverter(); // Initialize duplicate converter
    
    updateUI(); // Draw the UI (like the archive) with the loaded data

    // Start the 1-second game timer
    gameTickInterval = setInterval(onGameTick, 1000);
    
    console.log("Game initialized successfully.");
    console.log("Current Game State:", gameState);
    console.log("Loaded Card Data:", allCardsData);
}

/**
 * Fetches cards.json and packs.json and stores them in our global variables.
 * Uses the 'fetch' API, which is a modern JavaScript way to get files.
 */
async function loadMasterData() {
    // 'Promise.all' lets us load both files at the same time.
    const [cardsResponse, packsResponse] = await Promise.all([
        fetch('cards.json'),
        fetch('packs.json')
    ]);

    // Check if the files were actually found.
    if (!cardsResponse.ok || !packsResponse.ok) {
        throw new Error("Network response was not ok.");
    }

    // '.json()' reads the file contents and converts them into a JavaScript object.
    allCardsData = await cardsResponse.json();
    allPacksData = await packsResponse.json();
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
 * It also "patches" old saves with new properties if they are missing.
 */
function loadState() {
    const savedState = localStorage.getItem('rockGameState');

    // This is the default structure for expedition slots
    const defaultExpeditions = [
        { status: "empty" },
        { status: "empty" },
        { status: "empty" }
    ];

    if (savedState) {
        // If we found a save, convert the string back into an object.
        gameState = JSON.parse(savedState);
        console.log("Loaded saved state:", gameState);

        // --- PATCH FOR OLD SAVES ---
        let needsSave = false; 

        if (!gameState.museum) {
            console.warn("Old save detected. Patching with 'museum' data.");
            gameState.museum = {
                background: 'bg-forest',
                frame: 'frame-1',
                slots: [null, null, null, null, null, null] 
            };
            needsSave = true;
        }

        if (!gameState.expeditions || !Array.isArray(gameState.expeditions)) {
            console.warn("Old save detected. Patching with 'expeditions' data.");
            gameState.expeditions = defaultExpeditions;
            needsSave = true;
        }

        if (needsSave) {
            saveState();
        }

    } else {
        // If no save, create the default 'new game' object.
        gameState = {
            player: {
                packsOpened: 0,
                uniquesOwned: 0,
                packsInventory: { basic: 5, standard: 1, premium: 0, curated: 0 }
            },
            inventory: {
                cards: []
            },
            expeditions: defaultExpeditions, // Use the new default
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
    
    // Later, this will also call:
    // - updatePackCountUI()
    // - updateProgressBars()
}

/**
 * Draws all the player's cards into the Archive panel grid.
 */
function updateArchiveUI() {
    const grid = document.getElementById('archive-grid');
    if (!grid) return; // Safety check

    // Clear the grid before redrawing all cards
    grid.innerHTML = ''; 

    // Loop through the player's inventory
    gameState.inventory.cards.forEach(card => {
        // Get the card's master data (name, rarity, etc.) from allCardsData
        const cardData = allCardsData[card.cardId];
        if (!cardData) {
            console.warn(`Missing card data for ID: ${card.cardId}`);
            return; // Skip this card if data is missing
        }

        // Create the card element
        const cardElement = document.createElement('div');
        cardElement.classList.add('card-in-grid');
        // Add rarity as a class for styling (e.g., "rarity-common")
        cardElement.classList.add(`rarity-${cardData.rarity}`);

        // Make the card draggable
        cardElement.draggable = true;
        
        // Store the card's data on the element
        cardElement.dataset.cardId = card.cardId;
        cardElement.dataset.variant = card.variant;

        // Get the image path
        const imgPath = getCardImagePath(card.cardId, card.variant);

        // Create the HTML for the card
        cardElement.innerHTML = `
            <div class="card-image-placeholder">
                <img src="${imgPath}" alt="${cardData.name}">
            </div>
            <div class="card-info">
                <span class="card-name">${cardData.name}</span>
                <span class="card-count">x${card.count}</span>
            </div>
        `;

        // Add the 'dragstart' event listener
        cardElement.addEventListener('dragstart', handleCardDragStart);
        
        // Add the new card element to the grid
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
    const variant = this.dataset.variant;

    // Store the card's data for the 'drop' event
    event.dataTransfer.setData('text/plain', JSON.stringify({ cardId, variant }));
    event.dataTransfer.effectAllowed = 'copy';

    // ADD THIS: Set the global flag to true
    isCardDragActive = true;

    // Add a class for styling
    this.classList.add('dragging');

    // Remove the class when the drag ends (whether it was dropped or not)
    this.addEventListener('dragend', () => {
        this.classList.remove('dragging');
        
        // ADD THIS: Reset the flag when the drag is over
        isCardDragActive = false;
        
    }, { once: true }); // 'once: true' automatically removes this listener
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

    // Get the card data we stored in 'dragstart'
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    const { cardId, variant } = data;

    // Get the slot index we stored on the slot element
    const slotIndex = parseInt(this.dataset.slotIndex);

    // Update the game state
    gameState.museum.slots[slotIndex] = { cardId, variant };

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
            const { cardId, variant } = cardInSlot;
            const cardData = allCardsData[cardId];
            
            // Make it look like a card
            slot.innerHTML = ''; // Clear "Slot 1" text
            slot.classList.add('filled');
            
            // Build the card HTML (a simplified version of the archive card)
            const imgPath = getCardImagePath(cardId, variant);
            slot.innerHTML = `
                <div class="card-in-grid rarity-${cardData.rarity}">
                    <div class="card-image-placeholder">
                        <img src="${imgPath}" alt="${cardData.name}">
                    </div>
                    <div class="card-info">
                        <span class="card-name">${cardData.name}</span>
                    </div>
                </div>
            `;
            
            // Add a click listener to REMOVE the card
            slot.onclick = () => {
                gameState.museum.slots[slotIndex] = null; // Empty the slot
                saveState();
                updateMuseumUI(); // Refresh the museum
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
        const count = inventory[packType];
        
        // 'basic' -> 'Basic'
        const displayName = packType.charAt(0).toUpperCase() + packType.slice(1);

        // Create the HTML for the display
        const packHTML = `
            <div class="pack-display ${count === 0 ? 'disabled' : ''}" 
                 data-pack-type="${packType}">
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

// --- 4. PACK OPENING LOGIC ---

/**
 * Opens a pack, generates cards, and adds them to the player's inventory.
 * @param {string} packType - The key for the pack (e.g., "basic", "standard")
 */
function openPack(packType) {
    // Step 1: Check if player has this pack
    if (gameState.player.packsInventory[packType] <= 0) {
        console.warn(`Attempted to open pack "${packType}" with 0 in inventory.`);
        return; // Stop the function
    }

    // Step 2: Subtract the pack from inventory
    gameState.player.packsInventory[packType] -= 1;
    
    console.log(`Opening pack: ${packType}`);

    // Get the rules for this pack type from our loaded data
    const packRules = allPacksData[packType];
    if (!packRules) {
        console.error(`No rules found for pack type: ${packType}`);
        return;
    }

    const newCards = []; // An array to hold the cards we get
    const cardsPerPack = 3; 

    for (let i = 0; i < cardsPerPack; i++) {
        const rarity = getRandomRarity(packRules);
        const cardId = getRandomCardOfRarity(rarity);
        const variant = "normal";
        newCards.push({ cardId: cardId, variant: variant });
    }

    // Add cards to inventory
    addCardsToInventory(newCards);

    // Update player progress
    gameState.player.packsOpened += 1;
    
    // Save the game
    saveState();

    // Update the UI (this will refresh the pack counts and the archive)
    updateUI();

    // Log the results for testing
    console.log("Opened pack and received:", newCards);
    alert(`You opened a ${packType} pack and got 3 new cards! (Check the Archive)`);
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
}

/**
 * Helper function: Adds an array of new cards to the player's inventory.
 * This function now correctly stacks duplicates.
 * @param {Array<Object>} newCards - e.g., [{cardId: "rock-001", variant: "normal"}]
 */
function addCardsToInventory(newCards) {
    const inventory = gameState.inventory.cards;

    newCards.forEach(newCard => {
        // Check if this exact card (id AND variant) is already in our inventory
        const existingCard = inventory.find(card => 
            card.cardId === newCard.cardId && card.variant === newCard.variant
        );

        if (existingCard) {
            // If it exists, just increment the count
            existingCard.count += 1;
            console.log(`Stacked duplicate: ${newCard.cardId} (${newCard.variant})`);
        } else {
            // If it's new, add it to the inventory with a count of 1
            inventory.push({
                cardId: newCard.cardId,
                variant: newCard.variant,
                count: 1
            });
            console.log(`Added new card: ${newCard.cardId} (${newCard.variant})`);
        }
    });
    
    // We will update uniquesOwned count here later
}

/**
 * Gets the correct image path for a card based on its ID and variant.
 * @param {string} cardId - The ID of the card (e.g., "rock-001")
 * @param {string} variant - The variant ("normal", "foil", "alt")
 * @returns {string} - The relative path to the image
 */
function getCardImagePath(cardId, variant) {
    // For now, this is simple.
    // In the future, we'll add logic here to handle "alt" variants
    // (e.g., if variant === 'alt', return `images/cards/${cardId}-alt.png`)
    
    // All cards, regardless of variant, use the base image path for now.
    // The "foil" effect will be a CSS overlay we add later.
    return `images/cards/${cardId}.png`;
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
            exp.rewards = generateExpeditionRewards(exp.region);
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

    for (let i = 0; i < 3; i++) {
        const slot = document.createElement('div');
        slot.classList.add('expedition-slot');
        slot.id = `exp-slot-${i}`; // Give each slot a unique ID
        
        // Add placeholder content. updateExpeditionsUI will fill it.
        slot.innerHTML = `<h4>Slot ${i + 1}</h4>`; 
        
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

        let content = '';
        const regionName = "Riverbed"; // Placeholder
        
        switch (exp.status) {
            case "empty":
                content = `
                    <h4>Slot ${index + 1} (Short)</h4>
                    <p class="status">Ready to explore the ${regionName}.</p>
                    <button class="game-button" onclick="startExpedition(${index})">Start (5m)</button>
                `;
                break;
            
            case "out":
                content = `
                    <h4>Slot ${index + 1} (Short)</h4>
                    <p class="status">Exploring the ${regionName}...</p>
                    <div class="timer" id="exp-timer-${index}">${formatTime(exp.endTs - Date.now())}</div>
                    <button class="game-button" disabled>In Progress</button>
                `;
                break;
                
            case "complete":
                const rewardCount = exp.rewards.length;
                content = `
                    <h4>Slot ${index + 1} (Short)</h4>
                    <p class="status">Expedition complete! Found ${rewardCount} new card(s).</p>
                    <button class="game-button claim-button" onclick="claimExpedition(${index})">Claim Reward</button>
                `;
                break;
        }
        slot.innerHTML = content;
    });
}

/**
 * Starts a new expedition.
 * @param {number} slotIndex - The slot to start (0, 1, or 2)
 */
function startExpedition(slotIndex) {
    const now = Date.now();
    const duration = 5 * 60 * 1000; // 5 minutes
    
    gameState.expeditions[slotIndex] = {
        status: "out",
        region: "riverbed", // Hard-coded for now
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
    if (exp.status !== "complete") return; // Safety check

    // Add cards to inventory
    addCardsToInventory(exp.rewards);
    alert(`You found: ${exp.rewards.map(r => allCardsData[r.cardId].name).join(', ')}`);

    // Reset the slot
    gameState.expeditions[slotIndex] = { status: "empty" };
    
    saveState();
    updateUI(); // Do a full UI update to refresh archive
}

/**
 * Generates rewards for an expedition.
 * @param {string} region - The region explored (e.g., "riverbed")
 * @returns {Array<Object>} An array of card objects (e.g., [{cardId, variant}])
 */
function generateExpeditionRewards(region) {
    // For now, just returns 1 random card from that region
    
    // Get all card IDs from that region
    const validCardIds = Object.keys(allCardsData).filter(id => {
        return allCardsData[id].region === region;
    });

    if (validCardIds.length === 0) {
        console.warn(`No cards found for region: ${region}`);
        return []; // Return empty if no cards match
    }

    // Pick a random card from the filtered list
    const randomIndex = Math.floor(Math.random() * validCardIds.length);
    const cardId = validCardIds[randomIndex];
    
    return [{ cardId: cardId, variant: "normal" }];
}

/**
 * Helper function: Converts milliseconds into a 00:00 string.
 * @param {number} ms - Milliseconds remaining
 * @returns {string} - Formatted time string
 */
function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    // 'padStart' adds a leading '0' if the number is less than 10
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/*
================================================================================
SECTION 6: MINIGAMES (FISHING)
================================================================================
*/

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
            // Player clicked too early, do nothing, maybe a "splash"
            console.log("Clicked too early!");
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
    
    button.disabled = true;
    button.textContent = "Waiting...";
    status.textContent = "Shh... waiting for a bite.";

    // Clear any old timer
    if (fishingTimeout) clearTimeout(fishingTimeout);
    
    // Set a timer for the "bite"
    // Random time between 3 and 8 seconds
    const waitTime = Math.random() * 5000 + 3000; 
    fishingTimeout = setTimeout(showFishBite, waitTime);
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
    
    // Update UI
    const button = document.getElementById('fishing-button');
    const status = document.getElementById('fishing-status');

    button.disabled = true;
    button.textContent = "Caught!";
    status.textContent = "You caught... a Basic Pack!";

    // Clear the "get away" timer
    if (fishingTimeout) clearTimeout(fishingTimeout);
    
    // Give the reward
    // For now, it's always one basic pack.
    addPackToInventory('basic', 1);

    // Reset the game after a short delay
    setTimeout(resetFishingGame, 2000); // 2-second delay to read "Caught!"
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
 */
function updateConverterUI() {
    const grid = document.getElementById('converter-grid');
    if (!grid) return; // Not on the right panel

    grid.innerHTML = ''; // Clear the grid

    // Find all cards in inventory with more than 1 copy
    const duplicates = gameState.inventory.cards.filter(card => card.count > 1);

    duplicates.forEach(card => {
        const cardData = allCardsData[card.cardId];
        if (!cardData) return; // Skip if data is missing

        // Check if this card is in our current selection
        const selectedEntry = conversionSelection.find(c => 
            c.cardId === card.cardId && c.variant === card.variant
        );
        
        // This is the card element in the grid
        const cardElement = document.createElement('div');
        cardElement.classList.add('card-in-grid');
        cardElement.classList.add(`rarity-${cardData.rarity}`);
        
        if (selectedEntry) {
            cardElement.classList.add('selected'); // Highlight if selected
        }

        // Get the image path
        const imgPath = getCardImagePath(card.cardId, card.variant);

        // How many are available to convert (total count - 1)
        const availableCount = card.count - 1;
        // How many are *currently* selected
        const selectedCount = selectedEntry ? selectedEntry.count : 0;

        cardElement.innerHTML = `
            <div class="card-image-placeholder">
                <img src="${imgPath}" alt="${cardData.name}">
            </div>
            <div class="card-info">
                <span class="card-name">${cardData.name}</span>
                <span class="card-count">x(${selectedCount}/${availableCount})</span>
            </div>
        `;
        
        // Add click listener to select/deselect this card
        cardElement.addEventListener('click', () => {
            toggleCardForConversion(card.cardId, card.variant);
        });
        
        grid.appendChild(cardElement);
    });

    // After drawing the grid, update the summary (points, reward)
    updateConversionSummary();
}

/**
 * Called when a card in the converter grid is clicked.
 * Adds/removes one copy of the card to the selection.
 * @param {string} cardId
 * @param {string} variant
 */
function toggleCardForConversion(cardId, variant) {
    const playerCard = gameState.inventory.cards.find(c => 
        c.cardId === cardId && c.variant === variant
    );
    if (!playerCard) return; // Should never happen

    const availableCount = playerCard.count - 1;
    if (availableCount <= 0) return; // No duplicates to select

    let selectionEntry = conversionSelection.find(c => 
        c.cardId === cardId && c.variant === variant
    );

    if (!selectionEntry) {
        // Not in selection yet, add 1
        conversionSelection.push({ cardId, variant, count: 1 });
    } else {
        // Already in selection, increment count
        if (selectionEntry.count < availableCount) {
            // We can add more
            selectionEntry.count += 1;
        } else {
            // We've selected all available copies, so clicking again removes it
            selectionEntry.count = 0;
            // Remove from array if count is 0
            conversionSelection = conversionSelection.filter(c => c.count > 0);
        }
    }
    
    // Redraw the entire converter UI to show new counts
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

    // 1. Calculate points and reward (again, as a safety check)
    conversionSelection.forEach(card => {
        const cardData = allCardsData[card.cardId];
        const pointsPerCard = CONVERSION_POINTS[cardData.rarity] || 0;
        totalPoints += pointsPerCard * card.count;
    });

    for (const pack of PACK_THRESHOLDS) {
        if (totalPoints >= pack.points) {
            finalReward = pack.name; // Just the name, e.g., "basic"
            break;
        }
    }

    // 2. Safety check: If no reward, stop.
    if (!finalReward) {
        console.warn("Conversion confirmed with no reward. Aborting.");
        return;
    }

    // 3. Remove the selected cards from inventory
    conversionSelection.forEach(selectedCard => {
        const playerCard = gameState.inventory.cards.find(c =>
            c.cardId === selectedCard.cardId && c.variant === selectedCard.variant
        );
        if (playerCard) {
            playerCard.count -= selectedCard.count;
            // Note: We don't remove the card if count hits 0,
            // because this logic only selects from cards where count > 1,
            // so the count will always be at least 1 after subtraction.
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
    updateUI(); // This will refresh the converter grid *and* pack counts
}


// --- 5. START THE GAME ---
// This is the last line. It tells the browser to run our 'initGame'
// function once the page and this script have finished loading.
document.addEventListener('DOMContentLoaded', initGame);

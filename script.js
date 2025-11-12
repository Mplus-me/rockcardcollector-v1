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

/** @type {GameState} */
let gameState = {}; // Holds the player's save data (packs, cards, etc.)

let allCardsData = {}; // Holds all card definitions from cards.json
let allPacksData = {}; // Holds all pack drop rates from packs.json


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

    // Step 3: Set up our navigation buttons.
    setupNavButtons();

    // Step 4: Set up our test button (we'll remove this later).
    setupTestButtons();

    // Step 5: Update UI
    updateUI(); // Draw the UI (like the archive) with the loaded data
    
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
 */
function loadState() {
    const savedState = localStorage.getItem('rockGameState');

    if (savedState) {
        // If we found a save, convert the string back into an object.
        gameState = JSON.parse(savedState);
        console.log("Loaded saved state:", gameState);
    } else {
        // If no save, create the default 'new game' object.
        gameState = {
            player: {
                packsOpened: 0,
                uniquesOwned: 0,
                packsInventory: { basic: 5, standard: 1, premium: 0, curated: 0 }
            },
            inventory: {
                cards: [] // Starts with an empty card inventory
            },
            expeditions: [] // No expeditions running

            // Load museum
            museum: {
                background: 'bg-forest', // Placeholder name
                frame: 'frame-1',        // Placeholder name
                // An array to hold our 6 slots. 'null' means empty.
                slots: [null, null, null, null, null, null] 
            }
        };
        console.log("No save found. Created new game state.");
        // We save immediately so it's stored for next time.
        saveState();
    }
}


// --- 3. NAVIGATION & UI FUNCTIONS ---

/**
 * Finds all navigation buttons and makes them clickable.
 */
function setupNavButtons() {
    // Get all elements with the class 'nav-button'
    const buttons = document.querySelectorAll('.nav-button');

    // Loop over each button and add a 'click' event listener
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            // 'dataset.panel' gets the 'data-panel' attribute from the HTML
            // e.g., <img ... data-panel="archive-panel">
            const panelId = button.dataset.panel;
            showPanel(panelId);
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
        if (panel.id === panelId) {
            // If it's the one we want, add 'active-panel' to show it
            panel.classList.add('active-panel');
        } else {
            // Otherwise, remove 'active-panel' to hide it
            panel.classList.remove('active-panel');
        }
    });
}

/**
 * This function is our main "refresh" function. It updates all parts
 * of the UI to reflect the current gameState.
 */
function updateUI() {
    console.log("Updating UI...");
    
    // Update the card grid in the Archive
    updateArchiveUI();
    
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
        
        // Add the new card element to the grid
        grid.appendChild(cardElement);
    });
}


// --- 4. PACK OPENING LOGIC ---

/**
 * Attaches a click listener to our test button.
 */
function setupTestButtons() {
    const testButton = document.getElementById('test-open-pack-btn');
    if (testButton) {
        testButton.addEventListener('click', () => {
            console.log("Test button clicked!");
            openPack('basic');
        });
    }
}

/**
 * Opens a pack, generates cards, and adds them to the player's inventory.
 * @param {string} packType - The key for the pack (e.g., "basic", "standard")
 */
function openPack(packType) {
    console.log(`Opening pack: ${packType}`);

    // Get the rules for this pack type from our loaded data
    const packRules = allPacksData[packType];
    if (!packRules) {
        console.error(`No rules found for pack type: ${packType}`);
        return;
    }

    const newCards = []; // An array to hold the cards we get
    const cardsPerPack = 3; // All packs have 3 cards

    for (let i = 0; i < cardsPerPack; i++) {
        // Step 1: Determine the rarity for this card
        const rarity = getRandomRarity(packRules);

        // Step 2: Get a random card of that rarity
        const cardId = getRandomCardOfRarity(rarity);

        // Step 3: For now, all new cards are "normal" variant
        const variant = "normal";

        // Step 4: Add this new card to our list
        newCards.push({ cardId: cardId, variant: variant });
    }

    // Now that we have our 3 new cards, add them to the player's inventory
    addCardsToInventory(newCards);

    // Update player progress
    gameState.player.packsOpened += 1;
    // We'll update uniquesOwned later when we build the Archive
    
    // Save the game
    saveState();

    // Update the UI
    updateUI();

    // Log the results for testing
    console.log("Opened pack and received:", newCards);
    alert(`You got 3 new cards! (Check the console to see them)`);
}

/**
 * Helper function: Chooses a rarity based on pack drop rates.
 * @param {Object} packRules - The drop rate object (e.g., { common: 80, uncommon: 15, rare: 5 })
 * @returns {string} - The chosen rarity ("common", "uncommon", or "rare")
 */
function getRandomRarity(packRules) {
    const roll = Math.random() * 100; // Get a random number 0-99.99...

    // We check from rarest to most common
    if (roll < packRules.rare) {
        return "rare"; // e.g., if roll is 4.5, and rare is 5, you get a rare
    } else if (roll < packRules.rare + packRules.uncommon) {
        return "uncommon"; // e.g., if rare is 5, uncommon is 15. Roll 12. 12 < (5+15).
    } else {
        return "common"; // The rest is common
    }
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

// --- 5. START THE GAME ---
// This is the last line. It tells the browser to run our 'initGame'
// function once the page and this script have finished loading.
document.addEventListener('DOMContentLoaded', initGame);

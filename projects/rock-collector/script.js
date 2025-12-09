/*
================================================================================
GAME SCRIPT (script.js)
Refactored Phase 2: The Core Loop (Cleaned & Optimized)
================================================================================
*/

// --- 1. GLOBAL VARIABLES & CONSTANTS ---

/**
 * CONSTANTS
 * Centralized strings to prevent typos and allow easy changes.
 */
const CONSTANTS = {
    RARITY: {
        COMMON: "common",
        UNCOMMON: "uncommon",
        RARE: "rare",
        MYTHIC: "mythic",
        LEGENDARY: "legendary",
        SPECIAL: "special"
    },
    PACKS: {
        BASIC: "basic",
        EXPLORER: "explorer",
        ADVANCED: "advanced",
        DELUXE: "deluxe",
        COLLECTOR: "collector"
    },
    REGIONS: {
        RIVERBED: "riverbed",
        GRASSLAND: "grassland",
        FOREST: "forest",
        DESERT: "desert",
        COAST: "coast",
        MOUNTAIN: "mountain",
        CAVE: "cave",
        VOLCANIC: "volcanic",
        URBAN: "urban",
        GLACIAL: "glacial",
        ABYSS: "abyss",
        ETHEREAL: "ethereal",
        COSMIC: "cosmic"
    }
};

// Ordered from RAREST to MOST COMMON for logic checks
const RARITY_ORDER = [
    CONSTANTS.RARITY.SPECIAL,
    CONSTANTS.RARITY.LEGENDARY,
    CONSTANTS.RARITY.MYTHIC,
    CONSTANTS.RARITY.RARE,
    CONSTANTS.RARITY.UNCOMMON,
    CONSTANTS.RARITY.COMMON
];

// Conversion point values
const CONVERSION_POINTS = {
    [CONSTANTS.RARITY.COMMON]: 1,
    [CONSTANTS.RARITY.UNCOMMON]: 3,
    [CONSTANTS.RARITY.RARE]: 10,
    [CONSTANTS.RARITY.MYTHIC]: 30,
    [CONSTANTS.RARITY.LEGENDARY]: 100,
    [CONSTANTS.RARITY.SPECIAL]: 0
};

// Point thresholds for pack conversion
const PACK_THRESHOLDS = [
    { name: CONSTANTS.PACKS.COLLECTOR, points: 1000 },
    { name: CONSTANTS.PACKS.DELUXE, points: 250 },
    { name: CONSTANTS.PACKS.ADVANCED, points: 100 },
    { name: CONSTANTS.PACKS.EXPLORER, points: 30 },
    { name: CONSTANTS.PACKS.BASIC, points: 10 }
];

// Expedition Data
const EXPEDITION_DATA = [
    {
        name: "Short Expedition",
        durationMs: 5 * 60 * 1000, // 5 minutes
        durationText: "5m",
        basePack: CONSTANTS.PACKS.BASIC,
        bonusPack: CONSTANTS.PACKS.EXPLORER,
        bonusChance: 5,
        image: "images/expeditions/exp-short.png"
    },
    {
        name: "Medium Expedition",
        durationMs: 60 * 60 * 1000, // 60 minutes
        durationText: "1h",
        basePack: CONSTANTS.PACKS.EXPLORER,
        bonusPack: CONSTANTS.PACKS.ADVANCED,
        bonusChance: 5,
        image: "images/expeditions/exp-medium.png"
    },
    {
        name: "Long Expedition",
        durationMs: 8 * 60 * 60 * 1000, // 8 hours
        durationText: "8h",
        basePack: CONSTANTS.PACKS.ADVANCED,
        bonusPack: CONSTANTS.PACKS.DELUXE,
        bonusChance: 5,
        image: "images/expeditions/exp-long.png"
    }
];

// Loot Tables
const FISHING_REWARDS = [
    { type: "pack", packType: CONSTANTS.PACKS.ADVANCED, chance: 1 },
    { type: "pack", packType: CONSTANTS.PACKS.EXPLORER, chance: 4 },
    { type: "pack", packType: CONSTANTS.PACKS.BASIC, chance: 35 },
    { type: "card", region: CONSTANTS.REGIONS.RIVERBED, chance: 30 },
    { type: "none", message: "An old boot...", chance: 30 }
];

const WILD_RARITY_CHANCE = [
    { rarity: CONSTANTS.RARITY.LEGENDARY, chance: 0.2 },
    { rarity: CONSTANTS.RARITY.MYTHIC, chance: 0.5 },
    { rarity: CONSTANTS.RARITY.RARE, chance: 9.3 },
    { rarity: CONSTANTS.RARITY.UNCOMMON, chance: 20 },
    { rarity: CONSTANTS.RARITY.COMMON, chance: 70 }
];

const SIFTING_REWARDS = [
    { type: "pack", packType: CONSTANTS.PACKS.ADVANCED, chance: 1 },
    { type: "pack", packType: CONSTANTS.PACKS.EXPLORER, chance: 4 },
    { type: "pack", packType: CONSTANTS.PACKS.BASIC, chance: 35 },
    { type: "card", region: CONSTANTS.REGIONS.DESERT, chance: 30 },
    { type: "none", message: "Just sand...", chance: 30 }
];

// Progression Goals
const UNLOCK_GOALS = {
    FOIL: { type: "packs", value: 50 },
    ALT_ART_1: { type: "unique", value: 100 },
    ALT_ART_2: { type: "unique", value: 200 }
};

const VARIANT_RATES = {
    FOIL_CHANCE: 1,
    ART_CHANCES: {
        LOCKED: [100, 0, 0],
        ALT_1_UNLOCKED: [99, 1, 0],
        ALT_2_UNLOCKED: [98, 1, 1]
    }
};

const MINIGAME_ROCK_LIST = [
    'rock-001', 'rock-002', 'rock-021', 'rock-022', 
    'rock-009', 'rock-010', 'rock-041', 'rock-026', 
    'rock-020', 'rock-161', 'rock-179', 'rock-025'
];

/** * GAME STATE 
 */
let gameState = {}; 

// Master Data Holders
let allCardsData = {};
let allPacksData = {};
let allRegionsData = {};

// UI State
let isCardDragActive = false;
let gameTickInterval = null;
let currentArchiveSort = 'name-asc';
let conversionSelection = [];
let leavingPacksPanel = false;

// Minigame State Grouping
const minigameState = {
    fishing: {
        state: "idle", // idle, waiting, bite, reeling
        timeout: null
    },
    sifting: {
        timer: null,
        secondsLeft: 0,
        findList: [],
        rocksInSieve: []
    }
};

// --- 2. CORE UTILITIES ---

/**
 * Generic weighted random selector.
 * Replaces repetitive loops for packs, fishing, and sifting.
 * @param {Array|Object} items - Array of objects with 'chance' OR Pack Rules object
 * @param {boolean} isPackRules - Set to true if passing a pack rules object
 */
function getWeightedRandom(items, isPackRules = false) {
    let pool = [];
    
    // Normalize input
    if (isPackRules) {
        // Convert {common: 80, rare: 5} to standard format
        // Iterate RARITY_ORDER to maintain priority if needed
        RARITY_ORDER.forEach(rarity => {
            if (items[rarity]) {
                pool.push({ value: rarity, weight: items[rarity] });
            }
        });
    } else {
        // Handle array like FISHING_REWARDS [{type:..., chance: 30}, ...]
        pool = items.map(item => ({ value: item, weight: item.chance }));
    }

    const roll = Math.random() * 100;
    let cumulative = 0;

    for (const entry of pool) {
        cumulative += entry.weight;
        if (roll < cumulative) {
            return entry.value;
        }
    }
    
    // Fallback
    return pool[pool.length - 1].value;
}

/**
 * Initialization
 */
async function initGame() {
    console.log("Initializing game...");
    try {
        await loadMasterData();
    } catch (error) {
        console.error("CRITICAL: Failed to load game data.", error);
        return;
    }

    loadState();
    checkAllExpeditions();
    setupNavButtons();

    // Initialize Sub-systems
    initMuseum();
    initExpeditions();
    initMinigameHub();
    initConverter();
    initArchiveSorter();
    initPackModal();
    initDeleteButton();
    initDevTools();
    
    updateUI(); 

    gameTickInterval = setInterval(onGameTick, 1000);
    console.log("Game initialized.");
}

async function loadMasterData() {
    const [cards, packs, regions] = await Promise.all([
        fetch('cards.json'),
        fetch('packs.json'),
        fetch('regions.json')
    ]);

    if (!cards.ok || !packs.ok || !regions.ok) throw new Error("Network response error.");

    allCardsData = await cards.json();
    allPacksData = await packs.json();
    allRegionsData = await regions.json();
}

function saveState() {
    localStorage.setItem('rockGameState', JSON.stringify(gameState));
}

function loadState() {
    const savedState = localStorage.getItem('rockGameState');
    
    // Defaults
    const defaultExpeditions = [ { status: "empty" }, { status: "empty" }, { status: "empty" } ];
    const defaultMuseum = { background: 'bg-forest', frame: 'frame-1', slots: new Array(6).fill(null) };
    const defaultPacks = { [CONSTANTS.PACKS.BASIC]: 5, [CONSTANTS.PACKS.EXPLORER]: 0, [CONSTANTS.PACKS.ADVANCED]: 0, [CONSTANTS.PACKS.DELUXE]: 0, [CONSTANTS.PACKS.COLLECTOR]: 0 };

    if (savedState) {
        gameState = JSON.parse(savedState);
        
        // Patching old saves
        let needsSave = false;
        if (!gameState.museum) { gameState.museum = defaultMuseum; needsSave = true; }
        if (!gameState.expeditions) { gameState.expeditions = defaultExpeditions; needsSave = true; }
        if (!gameState.player.packsInventory) { gameState.player.packsInventory = defaultPacks; needsSave = true; }
        
        // Patch missing pack keys
        Object.keys(defaultPacks).forEach(key => {
            if (!gameState.player.packsInventory.hasOwnProperty(key)) {
                gameState.player.packsInventory[key] = 0;
                needsSave = true;
            }
        });

        if (needsSave) saveState();
    } else {
        gameState = {
            player: { packsOpened: 0, uniquesOwned: 0, packsInventory: defaultPacks },
            inventory: { cards: [] },
            expeditions: defaultExpeditions,
            museum: defaultMuseum
        };
        saveState();
    }
}

// --- 3. HELPER FUNCTIONS ---

function getUniqueCardCount() {
    const uniqueIds = new Set(gameState.inventory.cards.map(c => c.cardId));
    return uniqueIds.size;
}

function getUnlockedRegions() {
    const unlocked = [];
    const packs = gameState.player.packsOpened;
    const uniques = getUniqueCardCount();

    for (const regionId in allRegionsData) {
        const unlock = allRegionsData[regionId].unlock;
        if (unlock.type === 'packs' && packs >= unlock.value) unlocked.push(regionId);
        else if (unlock.type === 'unique' && uniques >= unlock.value) unlocked.push(regionId);
    }
    return unlocked;
}

function isCardIdNew(cardId) {
    return !gameState.inventory.cards.some(card => card.cardId === cardId);
}

function getCardImagePath(cardId, artVariant) {
    if (!artVariant || artVariant === 0 || artVariant === '0' || artVariant === 'normal') {
        return `images/cards/${cardId}.png`;
    }
    return `images/cards/${cardId}-alt${artVariant}.png`;
}

// --- 4. UI & NAVIGATION ---

function setupNavButtons() {
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', () => showPanel(button.dataset.panel));
        button.addEventListener('dragover', (event) => {
            if (isCardDragActive) {
                event.preventDefault(); 
                showPanel(button.dataset.panel);
            }
        });
    });
}

function showPanel(panelId) {
    const panels = document.querySelectorAll('.panel');
    panels.forEach(panel => {
        if (panel.id === 'packs-panel' && panel.classList.contains('active-panel')) {
            leavingPacksPanel = true;
        }
        if (panel.id === panelId) panel.classList.add('active-panel');
        else panel.classList.remove('active-panel');
    });

    if (leavingPacksPanel && panelId !== 'packs-panel') {
        clearConverterSelection();
        leavingPacksPanel = false;
    }
}

function updateUI() {
    updateArchiveUI();
    updateMuseumUI();
    updateExpeditionsUI();
    updatePackInventoryUI();
    updateConverterUI();
    updateProgressionUI();
}

function updateProgressionUI() {
    const uniqueEl = document.getElementById('unique-count-display');
    if (uniqueEl) uniqueEl.textContent = `Unique Rocks Found: ${getUniqueCardCount()}`;
    
    const packsEl = document.getElementById('packs-opened-display');
    if (packsEl) packsEl.textContent = `Total Packs Opened: ${gameState.player.packsOpened || 0}`;
}

// --- 5. ARCHIVE & SORTING ---

function updateArchiveUI() {
    const grid = document.getElementById('archive-grid');
    if (!grid) return; 
    grid.innerHTML = ''; 

    let sortedCards = [...gameState.inventory.cards];

    sortedCards.sort((a, b) => {
        const d1 = allCardsData[a.cardId];
        const d2 = allCardsData[b.cardId];
        if (!d1 || !d2) return 0;

        const aFoil = a.foil || "normal";
        const bFoil = b.foil || "normal";
        const aArt = a.art || 0;
        const bArt = b.art || 0;

        switch (currentArchiveSort) {
            case 'name-asc': return d1.name.localeCompare(d2.name);
            case 'name-desc': return d2.name.localeCompare(d1.name);
            case 'rarity-asc': return RARITY_ORDER.indexOf(d1.rarity) - RARITY_ORDER.indexOf(d2.rarity);
            case 'rarity-desc': return RARITY_ORDER.indexOf(d2.rarity) - RARITY_ORDER.indexOf(d1.rarity); // Fix: Correct logic
            case 'foil-first':
                if (aFoil !== bFoil) return bFoil.localeCompare(aFoil);
                return d1.name.localeCompare(d2.name);
            case 'art-first':
                if (aArt !== bArt) return bArt - aArt;
                return d1.name.localeCompare(d2.name);
            default: return 0;
        }
    });

    sortedCards.forEach(card => {
        const cardData = allCardsData[card.cardId];
        if (!cardData) return;
        const el = createCardElement(card, cardData, true); // true = draggable
        grid.appendChild(el);
    });
}

function createCardElement(card, cardData, draggable = false) {
    const div = document.createElement('div');
    div.classList.add('card-in-grid', `rarity-${cardData.rarity}`);
    if (draggable) {
        div.draggable = true;
        div.dataset.cardId = card.cardId;
        div.dataset.art = card.art || 0;
        div.dataset.foil = card.foil || "normal";
        div.addEventListener('dragstart', handleCardDragStart);
    }

    const imgPath = getCardImagePath(card.cardId, card.art);
    const foilHTML = card.foil === 'foil' ? '<div class="foil-overlay"></div>' : '';
    let variantText = '';
    if (card.foil === 'foil') variantText += "Foil ";
    if (card.art > 0) variantText += `(Alt ${card.art})`;

    div.innerHTML = `
        <div class="card-image-placeholder">
            <img src="${imgPath}" alt="${cardData.name}">
            ${foilHTML}
        </div>
        <div class="card-info">
            <span class="card-name">${cardData.name}</span>
            <span class="card-count">x${card.count}</span>
        </div>
        <div class="card-variant-label">${variantText}</div>
    `;
    return div;
}

function handleCardDragStart(event) {
    const cardId = this.dataset.cardId;
    const art = parseInt(this.dataset.art, 10);
    const foil = this.dataset.foil;

    event.dataTransfer.setData('text/plain', JSON.stringify({ cardId, art, foil }));
    event.dataTransfer.effectAllowed = 'copy';
    isCardDragActive = true;
    this.classList.add('dragging');

    this.addEventListener('dragend', () => {
        this.classList.remove('dragging');
        isCardDragActive = false;
    }, { once: true });
}

function initArchiveSorter() {
    const sortSelect = document.getElementById('archive-sort');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentArchiveSort = e.target.value;
            updateArchiveUI();
        });
    }
}

// --- 6. MUSEUM ---

function initMuseum() {
    const grid = document.getElementById('museum-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 0; i < 6; i++) {
        const slot = document.createElement('div');
        slot.classList.add('museum-slot');
        slot.dataset.slotIndex = i;
        slot.innerHTML = `Slot ${i + 1}`;
        slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drag-over'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', handleMuseumDrop);
        grid.appendChild(slot);
    }
}

function handleMuseumDrop(event) {
    event.preventDefault();
    this.classList.remove('drag-over');
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    const slotIndex = parseInt(this.dataset.slotIndex);
    gameState.museum.slots[slotIndex] = data;
    saveState();
    updateMuseumUI();
}

function updateMuseumUI() {
    document.querySelectorAll('.museum-slot').forEach(slot => {
        const idx = parseInt(slot.dataset.slotIndex);
        const cardInSlot = gameState.museum.slots[idx];

        if (cardInSlot) {
            const cardData = allCardsData[cardInSlot.cardId];
            slot.innerHTML = '';
            slot.classList.add('filled');
            
            // Re-use logic for display, but customize slightly
            const displayCard = { ...cardInSlot, count: 1 }; // Fake count for display
            // We strip count from visual manually below
            const imgPath = getCardImagePath(cardInSlot.cardId, cardInSlot.art);
            const foilHTML = cardInSlot.foil === 'foil' ? '<div class="foil-overlay"></div>' : '';
            
            slot.innerHTML = `
                <div class="card-in-grid rarity-${cardData.rarity}">
                    <div class="card-image-placeholder">
                        <img src="${imgPath}" alt="${cardData.name}">
                        ${foilHTML}
                    </div>
                    <div class="card-info"><span class="card-name">${cardData.name}</span></div>
                </div>`;
            
            slot.onclick = () => {
                gameState.museum.slots[idx] = null;
                saveState();
                updateMuseumUI();
            };
        } else {
            slot.innerHTML = `Slot ${idx + 1}`;
            slot.classList.remove('filled');
            slot.onclick = null;
        }
    });
}

// --- 7. PACKS & INVENTORY ---

function updatePackInventoryUI() {
    const areas = [document.getElementById('header-pack-inventory'), document.getElementById('pack-opening-area')];
    
    // Build HTML string once
    let html = '';
    for (const [type, count] of Object.entries(gameState.player.packsInventory)) {
        const name = type.charAt(0).toUpperCase() + type.slice(1);
        html += `
            <div class="pack-display ${count === 0 ? 'disabled' : ''}" data-pack-type="${type}">
                <img src="images/ui/pack-${type}.png" alt="${name}" class="pack-icon">
                <div class="pack-count">${count}</div>
                <div class="pack-name">${name}</div>
            </div>`;
    }

    areas.forEach(area => {
        if (!area) return;
        area.innerHTML = html;
        // Re-attach listeners specifically for opening area
        if (area.id === 'pack-opening-area') {
            area.querySelectorAll('.pack-display').forEach(btn => {
                btn.addEventListener('click', () => openPack(btn.dataset.packType));
            });
        }
    });
}

// --- 8. OPENING PACKS ---

function openPack(packType) {
    if (gameState.player.packsInventory[packType] <= 0) return;
    gameState.player.packsInventory[packType]--;

    const packRules = allPacksData[packType];
    const newCards = [];
    
    // Unlock Checks
    const packsOpened = gameState.player.packsOpened;
    const uniques = gameState.player.uniquesOwned;
    const foilUnlocked = packsOpened >= UNLOCK_GOALS.FOIL.value;
    const alt1Unlocked = uniques >= UNLOCK_GOALS.ALT_ART_1.value;
    const alt2Unlocked = uniques >= UNLOCK_GOALS.ALT_ART_2.value;

    // Determine variant rates
    let artChances = VARIANT_RATES.ART_CHANCES.LOCKED;
    if (alt2Unlocked) artChances = VARIANT_RATES.ART_CHANCES.ALT_2_UNLOCKED;
    else if (alt1Unlocked) artChances = VARIANT_RATES.ART_CHANCES.ALT_1_UNLOCKED;

    for (let i = 0; i < 3; i++) {
        // 1. Rarity & ID
        const rarity = getWeightedRandom(packRules, true);
        const cardId = getRandomCardOfRarity(rarity);
        const isNew = isCardIdNew(cardId);

        // 2. Foil
        const foil = (foilUnlocked && Math.random() * 100 < VARIANT_RATES.FOIL_CHANCE) ? "foil" : "normal";

        // 3. Art
        const artRoll = Math.random() * 100;
        let art = 0;
        if (artRoll < artChances[2]) art = 2;
        else if (artRoll < (artChances[1] + artChances[2])) art = 1;

        newCards.push({ cardId, art, foil, isNew });
    }

    addCardsToInventory(newCards);
    gameState.player.packsOpened++;
    saveState();
    updateUI();
    showPackModal(newCards);
}

/**
 * Gets a random card of specific rarity from UNLOCKED regions.
 */
function getRandomCardOfRarity(rarity) {
    const unlockedRegions = getUnlockedRegions();
    const allIds = Object.keys(allCardsData);

    const validIds = allIds.filter(id => {
        const c = allCardsData[id];
        return c.rarity === rarity && unlockedRegions.includes(c.region);
    });

    if (validIds.length === 0) {
        console.warn(`No ${rarity} found in unlocked regions. Fallback to common.`);
        const fallback = allIds.filter(id => allCardsData[id].rarity === CONSTANTS.RARITY.COMMON && unlockedRegions.includes(allCardsData[id].region));
        return fallback[Math.floor(Math.random() * fallback.length)];
    }

    return validIds[Math.floor(Math.random() * validIds.length)];
}

function isCardIdNew(cardId) {
    return !gameState.inventory.cards.some(c => c.cardId === cardId);
}

function addCardsToInventory(newCards) {
    const inv = gameState.inventory.cards;
    newCards.forEach(newCard => {
        const existing = inv.find(c => c.cardId === newCard.cardId && c.art === newCard.art && c.foil === newCard.foil);
        if (existing) existing.count++;
        else inv.push({ cardId: newCard.cardId, art: newCard.art, foil: newCard.foil, count: 1 });
    });
    gameState.player.uniquesOwned = getUniqueCardCount();
}

function initPackModal() {
    const modal = document.getElementById('pack-reveal-modal');
    const closeBtn = document.getElementById('modal-close-btn');
    if (modal && closeBtn) {
        closeBtn.addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }
}

function showPackModal(newCards) {
    const modal = document.getElementById('pack-reveal-modal');
    const grid = document.getElementById('pack-reveal-grid');
    grid.innerHTML = '';

    newCards.forEach(card => {
        const d = allCardsData[card.cardId];
        const div = document.createElement('div');
        div.classList.add('card-in-grid', `rarity-${d.rarity}`);
        
        const img = getCardImagePath(card.cardId, card.art);
        const newLabel = card.isNew ? '<div class="new-label">NEW!</div>' : '';
        const foilOver = card.foil === 'foil' ? '<div class="foil-overlay"></div>' : '';
        
        div.innerHTML = `
            ${newLabel}
            <div class="card-image-placeholder"><img src="${img}">${foilOver}</div>
            <div class="card-info"><span class="card-name">${d.name}</span></div>`;
        grid.appendChild(div);
    });
    modal.style.display = 'flex';
}

// --- 9. EXPEDITIONS ---

function initExpeditions() {
    const grid = document.getElementById('expedition-slots');
    if (!grid) return;
    grid.innerHTML = '';

    EXPEDITION_DATA.forEach((data, i) => {
        const slot = document.createElement('div');
        slot.classList.add('expedition-slot');
        slot.id = `exp-slot-${i}`;
        slot.innerHTML = `<img src="${data.image}" class="expedition-image"><h4>${data.name}</h4>`;
        grid.appendChild(slot);
    });
}

function updateExpeditionsUI() {
    gameState.expeditions.forEach((exp, i) => {
        const slot = document.getElementById(`exp-slot-${i}`);
        if (!slot) return;

        let dynamic = slot.querySelector('.exp-dynamic-area');
        if (!dynamic) {
            dynamic = document.createElement('div');
            dynamic.className = 'exp-dynamic-area';
            slot.appendChild(dynamic);
        }

        const data = EXPEDITION_DATA[i];
        if (exp.status === "empty") {
            dynamic.innerHTML = `<p class="status">Ready.</p><button class="game-button" onclick="startExpedition(${i})">Start (${data.durationText})</button>`;
        } else if (exp.status === "out") {
            const timeLeft = exp.endTs - Date.now();
            dynamic.innerHTML = `<p class="status">Exploring...</p><div class="timer">${formatTime(timeLeft)}</div><button class="game-button" disabled>Busy</button>`;
        } else if (exp.status === "complete") {
            dynamic.innerHTML = `<p class="status">Done!</p><button class="game-button claim-button" onclick="claimExpedition(${i})">Claim</button>`;
        }
    });
}

function checkAllExpeditions() {
    const now = Date.now();
    gameState.expeditions.forEach((exp, i) => {
        if (exp.status === "out" && now >= exp.endTs) {
            exp.status = "complete";
            exp.rewards = generateExpeditionRewards(i);
        }
    });
    saveState();
}

function onGameTick() {
    const now = Date.now();
    let redraw = false;
    gameState.expeditions.forEach((exp, i) => {
        if (exp.status === "out") {
            const left = exp.endTs - now;
            if (left <= 0) {
                exp.status = "complete";
                exp.rewards = generateExpeditionRewards(i);
                redraw = true;
                saveState();
            } else {
                const slot = document.getElementById(`exp-slot-${i}`);
                if (slot) {
                    const timer = slot.querySelector('.timer');
                    if (timer) timer.textContent = formatTime(left);
                }
            }
        }
    });
    if (redraw) updateExpeditionsUI();
}

function startExpedition(index) {
    const duration = EXPEDITION_DATA[index].durationMs;
    gameState.expeditions[index] = { status: "out", slotIndex: index, endTs: Date.now() + duration };
    saveState();
    updateExpeditionsUI();
}

function claimExpedition(index) {
    const exp = gameState.expeditions[index];
    if (exp.status !== "complete") return;

    if (exp.rewards.type === "pack") {
        addPackToInventory(exp.rewards.packType, exp.rewards.count);
        alert(`Expedition Result: 1 ${exp.rewards.packType} Pack!`);
    }

    gameState.expeditions[index] = { status: "empty" };
    saveState();
    updateUI();
}

function generateExpeditionRewards(index) {
    const data = EXPEDITION_DATA[index];
    const hitBonus = Math.random() * 100 < data.bonusChance;
    return {
        type: "pack",
        packType: hitBonus ? data.bonusPack : data.basePack,
        count: 1
    };
}

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const sec = Math.floor((ms / 1000) % 60);
    const min = Math.floor((ms / (1000 * 60)) % 60);
    const hr = Math.floor(ms / (1000 * 60 * 60));
    const s = String(sec).padStart(2, '0');
    const m = String(min).padStart(2, '0');
    return hr > 0 ? `${hr}:${m}:${s}` : `${m}:${s}`;
}

function addPackToInventory(type, count) {
    if (gameState.player.packsInventory[type] !== undefined) {
        gameState.player.packsInventory[type] += count;
        saveState();
        updateUI();
    }
}

// --- 10. MINIGAMES (HUB) ---

function initMinigameHub() {
    document.querySelectorAll('.minigame-button').forEach(btn => {
        btn.addEventListener('click', () => showMinigameStage(btn.dataset.game));
    });
    document.getElementById('minigame-back-btn').addEventListener('click', () => showMinigameStage('menu'));
    
    initFishingMinigame();
    initSiftingMinigame();
}

function showMinigameStage(gameId) {
    const selDiv = document.getElementById('minigame-selection');
    const stageDiv = document.getElementById('minigame-stages');
    const games = stageDiv.querySelectorAll('.minigame-container');

    if (gameId === 'menu') {
        selDiv.style.display = 'block';
        stageDiv.style.display = 'none';
        resetFishingGame();
    } else {
        selDiv.style.display = 'none';
        stageDiv.style.display = 'block';
        games.forEach(g => g.classList.remove('active-minigame'));
        const target = document.getElementById(`${gameId}-minigame`);
        if (target) target.classList.add('active-minigame');
    }
}

// --- 11. FISHING MINIGAME ---

function initFishingMinigame() {
    const btn = document.getElementById('fishing-button');
    if (btn) btn.addEventListener('click', handleFishingClick);
}

function handleFishingClick() {
    switch (minigameState.fishing.state) {
        case "idle": startFishing(); break;
        case "waiting": failFishing(); break;
        case "bite": reelInFish(); break;
    }
}

function startFishing() {
    minigameState.fishing.state = "waiting";
    updateFishingUI("Waiting...", "Shh... waiting...", false);
    if (minigameState.fishing.timeout) clearTimeout(minigameState.fishing.timeout);
    minigameState.fishing.timeout = setTimeout(showFishBite, Math.random() * 5000 + 3000);
}

function failFishing() {
    minigameState.fishing.state = "idle";
    if (minigameState.fishing.timeout) clearTimeout(minigameState.fishing.timeout);
    updateFishingUI("Oops!", "Scared it away!", false);
    setTimeout(resetFishingGame, 2000);
}

function showFishBite() {
    minigameState.fishing.state = "bite";
    updateFishingUI("Reel In!", "BITE!", true); // true = add claim class
    if (minigameState.fishing.timeout) clearTimeout(minigameState.fishing.timeout);
    minigameState.fishing.timeout = setTimeout(fishGotAway, 2000);
}

function reelInFish() {
    minigameState.fishing.state = "reeling";
    if (minigameState.fishing.timeout) clearTimeout(minigameState.fishing.timeout);
    document.getElementById('fishing-button').disabled = true;

    const reward = getWeightedRandom(FISHING_REWARDS);
    let msg = "";

    if (reward.type === "pack") {
        addPackToInventory(reward.packType, 1);
        msg = `Caught a ${reward.packType} Pack!`;
    } else if (reward.type === "card") {
        const cardId = getRandomCardOfRegion(reward.region);
        if (cardId) {
            addCardsToInventory([{ cardId, variant: "normal" }]);
            msg = `Caught a ${allCardsData[cardId].name}!`;
        } else {
            msg = "Caught nothing.";
        }
    } else {
        msg = reward.message;
    }

    document.getElementById('fishing-status').textContent = msg;
    if (reward.type !== "none") { saveState(); updateUI(); }
    setTimeout(resetFishingGame, 2500);
}

function fishGotAway() {
    resetFishingGame();
    document.getElementById('fishing-status').textContent = "Got away!";
}

function resetFishingGame() {
    minigameState.fishing.state = "idle";
    const btn = document.getElementById('fishing-button');
    btn.disabled = false;
    updateFishingUI("Cast", "", false);
}

function updateFishingUI(btnText, statusText, isClaim) {
    const btn = document.getElementById('fishing-button');
    const stat = document.getElementById('fishing-status');
    btn.textContent = btnText;
    stat.textContent = statusText;
    if (isClaim) btn.classList.add('claim-button');
    else btn.classList.remove('claim-button');
}

/**
 * Helper to find wild card based on Region and Weighted Rarity
 */
function getRandomCardOfRegion(region) {
    // Ensure region is unlocked
    const unlocked = getUnlockedRegions();
    if (!unlocked.includes(region)) region = unlocked[0] || CONSTANTS.REGIONS.RIVERBED;

    // Pick rarity
    const rarity = getWeightedRandom(WILD_RARITY_CHANCE);

    // Filter cards
    const allIds = Object.keys(allCardsData);
    const matches = allIds.filter(id => {
        const c = allCardsData[id];
        return c.region === region && c.rarity === rarity;
    });

    if (matches.length > 0) return matches[Math.floor(Math.random() * matches.length)];

    // Fallback if that specific rarity doesn't exist in region
    const anyInRegion = allIds.filter(id => allCardsData[id].region === region);
    return anyInRegion.length > 0 ? anyInRegion[Math.floor(Math.random() * anyInRegion.length)] : null;
}

// --- 12. SIFTING MINIGAME ---

function initSiftingMinigame() {
    // Start button placeholder logic is in HTML currently
}

function startSiftingGame() {
    // Logic: 3 Targets + 7 Decoys
    const targets = generateSiftingRocks(3);
    const decoys = generateSiftingRocks(7, targets);
    
    minigameState.sifting.findList = [...targets];
    minigameState.sifting.rocksInSieve = [...targets, ...decoys].sort(() => Math.random() - 0.5);
    minigameState.sifting.secondsLeft = 20;

    drawSiftingUI();
    
    if (minigameState.sifting.timer) clearInterval(minigameState.sifting.timer);
    minigameState.sifting.timer = setInterval(onSiftingTick, 1000);

    document.getElementById('sifting-start-area').style.display = 'none';
    document.getElementById('sifting-game-area').style.display = 'block';
}

function onSiftingTick() {
    minigameState.sifting.secondsLeft--;
    document.getElementById('sifting-timer').textContent = `Time: ${minigameState.sifting.secondsLeft}s`;
    
    if (minigameState.sifting.secondsLeft <= 0) {
        endSiftingGame(false);
    }
}

function drawSiftingUI() {
    // Draw List
    const listEl = document.getElementById('sifting-find-list');
    listEl.innerHTML = '';
    minigameState.sifting.findList.forEach(id => {
        const li = document.createElement('li');
        li.id = `find-${id}`;
        li.textContent = allCardsData[id].name;
        listEl.appendChild(li);
    });

    // Draw Sieve
    const sieveEl = document.getElementById('sifting-sieve');
    sieveEl.innerHTML = '';
    minigameState.sifting.rocksInSieve.forEach(id => {
        const img = document.createElement('img');
        img.src = getCardImagePath(id, 0);
        img.classList.add('sieve-rock');
        img.dataset.rockId = id;
        img.style.left = `${Math.random() * 90}%`;
        img.style.top = `${Math.random() * 90}%`;
        img.style.transform = `rotate(${Math.random() * 360}deg) scale(${0.8 + Math.random() * 0.4})`;
        
        img.addEventListener('click', (e) => onSieveRockClick(e, id));
        sieveEl.appendChild(img);
    });
}

function onSieveRockClick(e, id) {
    const idx = minigameState.sifting.findList.indexOf(id);
    const el = e.target;

    if (idx > -1) {
        // Found!
        minigameState.sifting.findList.splice(idx, 1);
        document.getElementById(`find-${id}`).classList.add('found');
        el.classList.add('found-rock');
        el.style.pointerEvents = 'none';

        if (minigameState.sifting.findList.length === 0) endSiftingGame(true);
    } else {
        // Wrong!
        el.classList.add('shake');
        setTimeout(() => el.classList.remove('shake'), 300);
    }
}

function endSiftingGame(win) {
    clearInterval(minigameState.sifting.timer);
    const stat = document.getElementById('sifting-status');

    if (win) {
        const reward = getWeightedRandom(SIFTING_REWARDS);
        if (reward.type === "pack") {
            addPackToInventory(reward.packType, 1);
            stat.textContent = `Found all! Got ${reward.packType} Pack!`;
        } else if (reward.type === "card") {
            const cardId = getRandomCardOfRegion(reward.region);
            if (cardId) {
                addCardsToInventory([{ cardId, variant: "normal" }]);
                stat.textContent = `Found all! Uncovered ${allCardsData[cardId].name}`;
            }
        } else {
            stat.textContent = `Found all! ${reward.message}`;
        }
        if (reward.type !== "none") { saveState(); updateUI(); }
    } else {
        stat.textContent = "Time's up!";
    }

    setTimeout(() => {
        document.getElementById('sifting-start-area').style.display = 'block';
        document.getElementById('sifting-game-area').style.display = 'none';
        stat.textContent = '';
    }, 3000);
}

function generateSiftingRocks(count, exclude = []) {
    let pool = MINIGAME_ROCK_LIST.filter(id => !exclude.includes(id));
    return pool.sort(() => Math.random() - 0.5).slice(0, count);
}

// --- 13. DUPLICATE CONVERTER ---

function initConverter() {
    const btn = document.getElementById('converter-confirm-btn');
    if (btn) btn.addEventListener('click', confirmConversion);
}

function clearConverterSelection() {
    conversionSelection = [];
    updateConverterUI();
}

function updateConverterUI() {
    const grid = document.getElementById('converter-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const dups = gameState.inventory.cards.filter(c => c.count > 1);
    
    dups.forEach(card => {
        const d = allCardsData[card.cardId];
        const sel = conversionSelection.find(c => c.cardId === card.cardId && c.art === card.art && c.foil === card.foil);
        const selCount = sel ? sel.count : 0;
        
        const el = createCardElement(card, d, false);
        el.querySelector('.card-count').textContent = `x(${selCount}/${card.count - 1})`;
        if (sel) el.classList.add('selected');
        
        el.addEventListener('click', () => toggleConvertSelect(card));
        grid.appendChild(el);
    });
    
    updateConversionSummary();
}

function toggleConvertSelect(card) {
    const max = card.count - 1;
    let entry = conversionSelection.find(c => c.cardId === card.cardId && c.art === card.art && c.foil === card.foil);

    if (!entry) {
        conversionSelection.push({ ...card, count: 1 });
    } else {
        if (entry.count < max) entry.count++;
        else {
            entry.count = 0; // Trigger removal
            conversionSelection = conversionSelection.filter(c => c.count > 0);
        }
    }
    updateConverterUI();
}

function updateConversionSummary() {
    let pts = 0;
    conversionSelection.forEach(c => {
        pts += (CONVERSION_POINTS[allCardsData[c.cardId].rarity] || 0) * c.count;
    });

    const reward = PACK_THRESHOLDS.find(p => pts >= p.points);
    const label = reward ? `${reward.name} Pack` : "(None)";
    
    document.getElementById('converter-points').textContent = `Points: ${pts}`;
    document.getElementById('converter-reward').textContent = `Reward: ${label}`;
    document.getElementById('converter-confirm-btn').disabled = !reward;
}

function confirmConversion() {
    let pts = 0;
    conversionSelection.forEach(c => {
        pts += (CONVERSION_POINTS[allCardsData[c.cardId].rarity] || 0) * c.count;
    });

    const reward = PACK_THRESHOLDS.find(p => pts >= p.points);
    if (!reward) return;

    // Remove cards
    const inv = gameState.inventory.cards;
    conversionSelection.forEach(sel => {
        const target = inv.find(c => c.cardId === sel.cardId && c.art === sel.art && c.foil === sel.foil);
        if (target) target.count -= sel.count;
    });

    addPackToInventory(reward.name, 1);
    alert(`Converted for 1 ${reward.name} Pack!`);
    clearConverterSelection();
    saveState();
    updateUI();
}

// --- 14. DEV TOOLS ---

function initDevTools() {
    const sel = document.getElementById('dev-pack-select');
    if (sel) {
        sel.innerHTML = '';
        Object.keys(allPacksData).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            sel.appendChild(opt);
        });
    }
}

function initDeleteButton() {
    const btn = document.getElementById('delete-save-button');
    if (btn) {
        btn.addEventListener('click', () => {
            if (confirm("Reset game?")) {
                localStorage.removeItem('rockGameState');
                location.reload();
            }
        });
    }
}

// --- GLOBAL EXPORTS FOR HTML ONCLICK COMPATIBILITY ---
// These wrappers ensure existing HTML buttons still work while keeping logic clean above.
window.startExpedition = startExpedition;
window.claimExpedition = claimExpedition;
window.startSiftingGame = startSiftingGame;
window.devAddPacks = (amt) => addPackToInventory(document.getElementById('dev-pack-select').value, amt);
window.devAddCard = () => {
    const id = document.getElementById('dev-card-input').value.trim();
    if (allCardsData[id]) {
        addCardsToInventory([{ cardId: id, art: 0, foil: "normal" }]);
        updateUI();
    }
};
window.devResetProgress = () => { gameState.player.packsOpened = 0; gameState.player.uniquesOwned = 0; saveState(); updateUI(); };
window.devMaxProgress = () => { gameState.player.packsOpened = 999; gameState.player.uniquesOwned = 999; saveState(); updateUI(); };

// Start
document.addEventListener('DOMContentLoaded', initGame);
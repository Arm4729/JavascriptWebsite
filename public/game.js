const balloon = document.getElementById('balloon');
const button = document.getElementById('button');
const dumpItButton = document.getElementById('dump-it-button');
const highScoreElement = document.getElementById('high-score');
const countdownElement = document.getElementById('countdown');
const fireworks = document.getElementById('fireworks');
const confetti = document.getElementById('confetti');
const creditsElement = document.getElementById('credits');
const amountInput = document.getElementById('amount');
const percentageButtons = document.querySelectorAll('.percentage-buttons button');
const lastPumpedByElement = document.getElementById('last-pumped-by');
const pumpCountElement = document.getElementById('pump-count');
const dumpCountElement = document.getElementById('dump-count');
const actionEntries = document.getElementById('action-entries');
const showMoreButton = document.getElementById('show-more-button');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=699ef9de-bf92-4146-942e-25233ae349ce`;
const RECEIVER_WALLET = '42NfCA3SkTdCLPk2mH7HpopZU9o7ktoEVwBcDQ2VbUxN';

let size = 0; // Balloon starts at size 0
let popped = false;
let pumpCount = 0;
let highScore = 0;
let credits = 0;
let lastPumpedBy = '-';
let totalPumps = 0;
let totalDumps = 0;
let gameId = 1; // Unique game identifier
let actions = [];
let actionsDisplayed = 0;
const actionsPerPage = 32;
let isRestarting = false; // Track if the game is in restarting state

const socket = io();

// Function to format timestamp to YYYY-MM-DD HH:MM:SS
const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toISOString().slice(0, 19).replace('T', ' ');
};

// Function to clear the action list
const clearActionList = () => {
    actionEntries.innerHTML = '';
    actionsDisplayed = 0;
};

// Function to add an action to the top of the list
const addActionToList = (timestamp, nickname, wallet, action) => {
    const listItem = document.createElement('li');
    listItem.innerHTML = `
        <span class="timestamp">${timestamp}</span>
        <span class="wallet">${wallet.slice(0, 7)}</span>
        <span class="nickname">${nickname}</span>
        <span class="action ${action.includes('Pumped') ? 'pump-action' : 'dump-action'}">${action}</span>
    `;
    // Insert new action at the top of the list
    actionEntries.insertBefore(listItem, actionEntries.firstChild);
};

// Function to load all actions (newest to oldest)
const loadAllActions = () => {
    clearActionList();
    actions.forEach(action => {
        const timestamp = formatTimestamp(action.timestamp);
        addActionToList(timestamp, action.nickname, action.wallet, action.action);
    });
    actionsDisplayed = actions.length;
    showMoreButton.style.display = 'none'; // Hide "Load More" since we're loading all actions
};

// Event listener for the "Load More" button
showMoreButton.addEventListener('click', loadAllActions);

// Load initial state from server
socket.on('load_initial_state', async ({ actions: loadedActions, balloonState }) => {
    // Sort actions by timestamp (newest first)
    actions = loadedActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    loadAllActions();
    
    size = balloonState.size;
    balloon.style.width = size * 10 + 'px';
    balloon.style.height = size * 15 + 'px';
    lastPumpedBy = balloonState.lastPumpedBy || '-';
    lastPumpedByElement.textContent = lastPumpedBy;

    const solBalance = await getBalance('42NfCA3SkTdCLPk2mH7HpopZU9o7ktoEVwBcDQ2VbUxN');
    if (solBalance !== null) {
        balloon.textContent = `${solBalance.toFixed(2)} SOL | Size: ${size}`;
    } else {
        balloon.textContent = `Error fetching balance | Size: ${size}`;
    }
    
    totalPumps = actions.filter(action => action.action.includes('Pumped')).length;
    totalDumps = actions.filter(action => action.action === 'Dumped').length;
    pumpCountElement.textContent = totalPumps;
    dumpCountElement.textContent = totalDumps;
    
    updateBalloonColor();

    // Check if the game is in restarting state
    if (balloonState.gameEnded) {
        isRestarting = true;
        disableButtons();
        countdownElement.textContent = 'Game ended! Restarting in 5 seconds...';
        countdownElement.style.display = 'block';
    }
});

// Function to fetch SOL balance
const getBalance = async (publicKey) => {
    try {
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getBalance',
                params: [publicKey.toString()]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const balanceData = await response.json();
        const balanceInLamports = balanceData.result.value;
        const LAMPORTS_PER_SOL = 1_000_000_000;
        const balanceInSol = balanceInLamports / LAMPORTS_PER_SOL;
        console.log('Fetched balance:', balanceInSol, 'SOL');
        return balanceInSol;
    } catch (err) {
        console.error('Failed to fetch balance:', err);
        return null;
    }
};

// Function to send SOL
const sendSol = async (sender, receiver, amount) => {
    try {
        const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('mainnet-beta'));
        const transaction = new solanaWeb3.Transaction().add(
            solanaWeb3.SystemProgram.transfer({
                fromPubkey: sender.publicKey,
                toPubkey: new solanaWeb3.PublicKey(receiver),
                lamports: amount * solanaWeb3.LAMPORTS_PER_SOL,
            })
        );

        const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [sender]);
        console.log('Transaction successful with signature:', signature);
        return true;
    } catch (err) {
        console.error('Failed to send SOL:', err);
        return false;
    }
};

// Function to disable pump and dump buttons
const disableButtons = () => {
    button.disabled = true;
    dumpItButton.disabled = true;
    button.style.opacity = '0.5';
    dumpItButton.style.opacity = '0.5';
    button.title = 'Game is restarting. Please wait...';
    dumpItButton.title = 'Game is restarting. Please wait...';
};

// Function to enable pump and dump buttons
const enableButtons = () => {
    button.disabled = false;
    dumpItButton.disabled = false;
    button.style.opacity = '1';
    dumpItButton.style.opacity = '1';
    button.title = '';
    dumpItButton.title = '';
};

// Event listener for the Pump button
button.addEventListener('click', async () => {
    const walletAddress = document.getElementById('wallet-address').dataset.walletAddress;
    const amount = parseFloat(amountInput.value);

    if (!walletAddress) {
        alert('Please connect your wallet first!');
        return;
    }

    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }

    // Check game state before proceeding
    socket.emit('check_game_state', {}, async (gameState) => {
        if (gameState.gameEnded) {
            alert('Game is restarting. Please wait...');
            return;
        }

        // Send SOL to the specified wallet before pumping
        const sender = connectedWallet; // Assuming you have the connected wallet object
        const success = await sendSol(sender, RECEIVER_WALLET, amount);

        if (success) {
            // If transaction is successful, proceed with the pump action
            socket.emit('pump', { wallet: walletAddress, gameId });
        } else {
            alert('Failed to send SOL. Please try again.');
        }
    });
});

// Event listener for the Dump button
dumpItButton.addEventListener('click', () => {
    const walletAddress = document.getElementById('wallet-address').dataset.walletAddress;

    if (!walletAddress) {
        alert('Please connect your wallet first!');
        return;
    }

    // Check game state before proceeding
    socket.emit('check_game_state', {}, (gameState) => {
        if (gameState.gameEnded) {
            alert('Game is restarting. Please wait...');
            return;
        }

        // If game is not restarting, proceed with the dump action
        socket.emit('dump', { wallet: walletAddress, gameId });
    });
});

// Handle pump event from server
socket.on('pump', (data) => {
    if (popped || isRestarting) return;

    pumpCount++;
    size += 1;

    updateBalloonDisplay();

    lastPumpedBy = data.nickname || 'Anonymous';
    lastPumpedByElement.textContent = lastPumpedBy;
});

// Handle dump event from server
socket.on('dump', (data) => {
    if (popped || size === 0 || isRestarting) return;

    size = Math.max(0, size - 1);

    updateBalloonDisplay();

    lastPumpedBy = data.nickname || 'Anonymous';
    lastPumpedByElement.textContent = lastPumpedBy;
});

// Handle action logged event from server
socket.on('action_logged', (action) => {
    // Add new action to the beginning of the actions array
    actions.unshift(action);
    
    // Clear the list and reload all actions
    loadAllActions();
    
    // Update counters
    totalPumps = actions.filter(action => action.action.includes('Pumped')).length;
    totalDumps = actions.filter(action => action.action === 'Dumped').length;
    pumpCountElement.textContent = totalPumps;
    dumpCountElement.textContent = totalDumps;
});

// Handle update_balloon event from server
socket.on('update_balloon', async (balloonState) => {
    size = balloonState.size;

    updateBalloonDisplay();

    lastPumpedBy = balloonState.lastPumpedBy || '-';
    lastPumpedByElement.textContent = lastPumpedBy;

    updateBalloonColor();
});

// Function to update the balloon display with size and balance
const updateBalloonDisplay = async () => {
    const solBalance = await getBalance('42NfCA3SkTdCLPk2mH7HpopZU9o7ktoEVwBcDQ2VbUxN');
    if (solBalance !== null) {
        balloon.textContent = `${solBalance.toFixed(2)} SOL | Size: ${size}`;
    } else {
        balloon.textContent = `Error fetching balance | Size: ${size}`;
    }
    balloon.style.width = size * 10 + 'px';
    balloon.style.height = size * 15 + 'px';
};

// Handle balloon popped event from server
socket.on('balloon_popped', (data) => {
    popBalloon();

    // Add "+ popped" to the action list
    const action = {
        gameId,
        wallet: data.wallet,
        nickname: data.nickname || 'Anonymous',
        action: 'Pumped + popped',
        timestamp: new Date().toISOString()
    };
    socket.emit('action_logged', action);
});

// Handle game restarting event from server
socket.on('game_restarting', (data) => {
    isRestarting = true;
    disableButtons();
    countdownElement.textContent = data.message;
    countdownElement.style.display = 'block';

    setTimeout(() => {
        isRestarting = false;
        enableButtons();
        countdownElement.style.display = 'none';
    }, 5000);
});

function updateBalloonColor() {
    if (size > 40) {
        balloon.style.background = 'radial-gradient(circle at 50% 50%, #ffcc00, #ff4444)';
    } else if (size > 30) {
        balloon.style.background = 'radial-gradient(circle at 50% 50%, #ff6f61, #6e44ff)';
    } else if (size > 20) {
        balloon.style.background = 'radial-gradient(circle at 50% 50%, #00ffcc, #00a8ff)';
    } else {
        balloon.style.background = 'radial-gradient(circle at 50% 50%, #3498db, #2c3e50)';
    }
}

function popBalloon() {
    popped = true;
    balloon.classList.add('burst');
    showFireworks();
    showConfetti();
    shakeScreen();

    // Reset pumpCount to 0
    pumpCount = 0;

    if (pumpCount > highScore) {
        highScore = pumpCount;
        highScoreElement.textContent = highScore;
    }
}

function showFireworks() {
    fireworks.style.display = 'block';
    const fireworkScript = document.createElement('script');
    fireworkScript.src = 'https://cdn.jsdelivr.net/npm/fireworks-js@2.9.1/dist/fireworks.js';
    fireworkScript.onload = () => {
        const container = document.getElementById('fireworks');
        const options = {
            speed: 2,
            acceleration: 1.05,
            friction: 0.97,
            gravity: 1.5,
            particles: 150,
            trace: 3,
            explosion: 5,
            autoresize: true,
            brightness: { min: 50, max: 80, decay: { min: 0.015, max: 0.03 } },
            boundaries: { x: 50, y: 50, width: container.clientWidth - 100, height: container.clientHeight - 100 },
        };
        const fireworksInstance = new Fireworks(container, options);
        fireworksInstance.start();
        setTimeout(() => fireworksInstance.stop(), 7000);
    };
    document.body.appendChild(fireworkScript);
}

function showConfetti() {
    confetti.style.display = 'block';
    const confettiScript = document.createElement('script');
    confettiScript.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.5.1/dist/confetti.browser.min.js';
    confettiScript.onload = () => {
        const confettiInstance = confetti.create(confetti, { resize: true });
        confettiInstance({
            particleCount: 200,
            spread: 160,
            colors: ['#00ffcc', '#00a8ff', '#ff6f61', '#6e44ff', '#ffcc00', '#ff4444']
        });
        setTimeout(() => confetti.clear(), 7000);
    };
    document.body.appendChild(confettiScript);
}

function shakeScreen() {
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 500);
}
import { connectWallet, disconnectWallet, detectWallet } from './wallet.js';
import { getBalance, displayTokens, getAllTokens, getTokenDetails } from './walletBalance.js';
import { setupNicknameEdit, displayConnectedWallet, displayWalletBalance } from './nickname.js';

document.addEventListener('DOMContentLoaded', function () {
  const connectWalletButton = document.getElementById('connect-wallet-button');
  const walletButtons = document.getElementById('wallet-buttons');
  const phantomButton = document.getElementById('phantom-button');
  const backpackButton = document.getElementById('backpack-button');
  const solflareButton = document.getElementById('solflare-button');
  const magicedenButton = document.getElementById('magiceden-button');
  const coinbaseButton = document.getElementById('coinbase-button');
  const fetchTokensButton = document.getElementById('fetch-tokens-button'); // Button to fetch tokens
  const editNicknameButton = document.getElementById('edit-nickname-button'); // Button to edit nickname
  const disconnectWalletButton = document.getElementById('disconnect-wallet-button'); // Disconnect Wallet button
  const nicknameForm = document.getElementById('nickname-form'); // Nickname form
  let connectedWallet;
  let tokensDisplayed = false; // Track whether tokens are currently displayed

  // WebSocket connection setup
  const socket = io();

  // Hide the buttons initially
  fetchTokensButton.style.display = 'none';
  editNicknameButton.style.display = 'none';
  disconnectWalletButton.style.display = 'none';
  nicknameForm.style.display = 'none';

  // Function to toggle visibility of the 3 buttons and nickname form
  const toggleOptionsButtons = () => {
    const isVisible = fetchTokensButton.style.display === 'flex';
    fetchTokensButton.style.display = isVisible ? 'none' : 'flex';
    editNicknameButton.style.display = isVisible ? 'none' : 'flex';
    disconnectWalletButton.style.display = isVisible ? 'none' : 'flex';
    nicknameForm.style.display = 'none'; // Always hide the nickname form when options are toggled
  };

  // Show wallet options when Connect Wallet button is clicked
  connectWalletButton.addEventListener('click', async () => {
    if (connectWalletButton.textContent === 'Connect Wallet') {
      walletButtons.style.display = 'block'; // Show wallet options
    } else if (connectWalletButton.textContent === 'Options') {
      toggleOptionsButtons(); // Toggle visibility of the 3 buttons
    }
  });

  // Handler for wallet button clicks
  const walletButtonHandler = async (walletName) => {
    const walletProvider = detectWallet(walletName);
    if (!walletProvider) {
      alert(`${walletName} wallet not detected. Please install it.`);
      return;
    }

    // Clear local storage and DOM data cache
    localStorage.clear();
    console.log('Local storage cleared before connecting wallet.');

    connectedWallet = await connectWallet(walletProvider, socket);
    if (connectedWallet) {
      connectWalletButton.textContent = 'Options'; // Change button text to "Options"
      walletButtons.style.display = 'none'; // Hide wallet options

      const walletAddress = connectedWallet.publicKey.toString();
      socket.emit('wallet_connected', { wallet: walletAddress });

      // Fetch the latest user data from users.json
      const response = await fetch('/api/users', { cache: 'no-store' }); // Ensure no caching
      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }
      const users = await response.json();
      const user = users[walletAddress];

      // Display the connected wallet with nickname
      if (user) {
        displayConnectedWallet({ wallet: walletAddress, nickname: user.nickname });
      } else {
        displayConnectedWallet({ wallet: walletAddress, nickname: 'Not set' });
      }

      // Automatically display balance
      const balance = await getBalance(walletAddress);
      displayWalletBalance(balance);

      // Hide the 3 buttons by default after connection
      fetchTokensButton.style.display = 'none';
      editNicknameButton.style.display = 'none';
      disconnectWalletButton.style.display = 'none';
    }
  };

  // Add event listeners to wallet buttons
  phantomButton.addEventListener('click', () => walletButtonHandler('phantom'));
  backpackButton.addEventListener('click', () => walletButtonHandler('backpack'));
  solflareButton.addEventListener('click', () => walletButtonHandler('solflare'));
  magicedenButton.addEventListener('click', () => walletButtonHandler('magiceden'));
  coinbaseButton.addEventListener('click', () => walletButtonHandler('coinbase'));

  // Disconnect Wallet button click handler
  disconnectWalletButton.addEventListener('click', async () => {
    await disconnectWallet(connectedWallet, socket);

    // Refresh the page to reset the UI
    location.reload();
  });

  // Add event listener to the fetch tokens button
  fetchTokensButton.addEventListener('click', async () => {
    if (tokensDisplayed) {
      // Hide the balance
      const allTokensDisplayElement = document.getElementById('all-tokens-display');
      if (allTokensDisplayElement) allTokensDisplayElement.textContent = '';
      tokensDisplayed = false;
    } else {
      // Show the balance
      const walletAddress = connectedWallet.publicKey.toString();
      const tokens = await getAllTokens(walletAddress);
      const tokenDetails = await getTokenDetails(tokens);
      displayTokens(walletAddress, tokenDetails);
      tokensDisplayed = true;
    }

    // Toggle the visibility of the options buttons
    toggleOptionsButtons();
  });

  // WebSocket event listener for wallet_connected_ack
  socket.on('wallet_connected_ack', (data) => {
    displayConnectedWallet(data);
  });

  // WebSocket event listener for wallet_error
  socket.on('wallet_error', (data) => {
    alert(data.message);
    console.error('Wallet error:', data.message);
  });

  // WebSocket event listener for nickname_changed
  socket.on('nickname_changed', (data) => {
    const { wallet, newNickname } = data;
    if (connectedWallet && connectedWallet.publicKey.toString() === wallet) {
      // Fetch the latest user data from users.json
      fetch('/api/users', { cache: 'no-store' }) // Ensure no caching
        .then(response => response.json())
        .then(users => {
          const user = users[wallet];
          if (user) {
            displayConnectedWallet({ wallet, nickname: user.nickname });
          }
        })
        .catch(error => console.error('Failed to fetch users:', error));
    }
  });

  // Set up nickname editing functionality
  setupNicknameEdit(socket);
});
export function setupNicknameEdit(socket) {
  const editNicknameButton = document.getElementById('edit-nickname-button');
  const nicknameForm = document.getElementById('nickname-form');
  const nicknameInput = document.getElementById('nickname-input');
  const nicknameSubmitButton = document.getElementById('nickname-submit-button');
  const nicknameError = document.getElementById('nickname-error');

  // Toggle form visibility when the "Edit Nickname" button is clicked
  editNicknameButton.addEventListener('click', () => {
    if (nicknameForm.style.display === 'none' || nicknameForm.style.display === '') {
      nicknameForm.style.display = 'block'; // Show the form
    } else {
      nicknameForm.style.display = 'none'; // Hide the form
    }
  });

  // Handle form submission
  nicknameSubmitButton.addEventListener('click', async (event) => {
    event.preventDefault(); // Prevent the form from submitting the traditional way

    const newNickname = nicknameInput.value.trim();
    const walletAddressElement = document.getElementById('wallet-address');
    const walletAddress = walletAddressElement.dataset.walletAddress; // Retrieve wallet address from data attribute

    // Validate the new nickname
    if (!newNickname) {
      nicknameError.textContent = 'Nickname cannot be blank.';
      return;
    }

    if (newNickname.length > 12) {
      nicknameError.textContent = 'Nickname cannot be longer than 12 characters.';
      return;
    }

    try {
      // Fetch the current users.json data to check for duplicate nicknames and last nickname change time
      const response = await fetch('/api/users');
      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }
      const users = await response.json();

      // Check if the nickname is already used by another user
      const isNicknameTaken = Object.values(users).some(user => user.nickname === newNickname);
      if (isNicknameTaken) {
        nicknameError.textContent = 'This nickname is already taken.';
        return;
      }


const user = users[walletAddress];
if (user) {
  const lastNicknameChange = new Date(user.lastNicknameChange);
  const now = new Date();
  const timeSinceLastChange = (now - lastNicknameChange) / 1000; // Time in seconds

  if (timeSinceLastChange < 604800) {
    const timeLeft = 604800 - Math.floor(timeSinceLastChange);

    // Convert timeLeft to days, hours, and minutes
    const days = Math.floor(timeLeft / (24 * 60 * 60));
    const hours = Math.floor((timeLeft % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((timeLeft % (60 * 60)) / 60);

    alert(`You can change your nickname in ${days} days, ${hours} hours, and ${minutes} minutes.`);
    return;
  }
}

      // Update the nickname and lastNicknameChange in users.json
      const updateResponse = await fetch('/api/users/update-nickname', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet: walletAddress,
          newNickname,
          lastNicknameChange: new Date().toISOString() // Update lastNicknameChange to current time
        }),
      });

      if (!updateResponse.ok) {
        throw new Error(`Failed to update nickname: ${updateResponse.status}`);
      }

      const result = await updateResponse.json();

      // Update the user object in memory (if applicable)
      if (users[walletAddress]) {
        users[walletAddress].nickname = newNickname; // Update the nickname in memory
        users[walletAddress].lastNicknameChange = new Date().toISOString(); // Update the lastNicknameChange in memory
      }

      // Notify the user of success
      alert(result.message);

      // Hide the form
      nicknameForm.style.display = 'none';

      // Clear the input field
      nicknameInput.value = '';

      // Update the displayed nickname in the UI
      walletAddressElement.textContent = `Wallet connected (Nickname: ${newNickname})`;

      // Emit a WebSocket event to notify all clients about the nickname change
      socket.emit('change_nickname', { wallet: walletAddress, newNickname });
    } catch (err) {
      console.error('Error updating nickname:', err);
      nicknameError.textContent = '';
    }
  });

  // Listen for WebSocket events to update the nickname dynamically
  socket.on('nickname_updated', (data) => {
    const { wallet, newNickname } = data;
    const walletAddressElement = document.getElementById('wallet-address');
    const currentWalletAddress = walletAddressElement.dataset.walletAddress;

    // If the updated nickname belongs to the current user, update the UI
    if (currentWalletAddress === wallet) {
      const walletText = document.querySelector('.wallet-container div');
      if (walletText) {
        const truncatedWallet = `${wallet.slice(0, 7)}`;
        walletText.textContent = `${truncatedWallet} (Nickname: ${newNickname})`;
      }
    }
  });
}

// Simulate wallet disconnection
function disconnectWallet() {
  // Clear wallet address and other related data
  const walletAddressElement = document.getElementById('wallet-address');
  walletAddressElement.dataset.walletAddress = ''; // Clear wallet address
  walletAddressElement.innerHTML = ''; // Clear displayed content

  // Hide the edit nickname button
  document.getElementById('edit-nickname-button');

  // Reload the page or redirect to disconnect
  window.location.reload(); // Or redirect to a disconnect page
}

export function displayConnectedWallet(data) {
    const truncatedWallet = `${data.wallet.slice(0, 7)}`; // Truncate wallet address
    const walletAddressDisplay = document.getElementById('wallet-address');

    // Clear previous content
    walletAddressDisplay.innerHTML = '';

    // Create a container for the connected wallet information
    const walletContainer = document.createElement('div');
    walletContainer.classList.add('wallet-info'); // Add class for styling

    // Wallet address and nickname text
    const walletText = document.createElement('div');
    walletText.innerHTML = `
        <span class="wallet-address">${truncatedWallet}</span>
        <span class="wallet-nickname">      [${data.nickname}]</span>
    `;

    // Append the wallet text to the container
    walletContainer.appendChild(walletText);

    // Append the container to the wallet address display element
    walletAddressDisplay.appendChild(walletContainer);

    // Show the edit nickname button
    document.getElementById('edit-nickname-button').style.display = 'inline-block';
}
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

// Fetch SOL price in USD from CoinGecko API
async function getSolPriceInUsd() {
  try {
    const response = await fetch(COINGECKO_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    return data.solana.usd;
  } catch (err) {
    console.error('Failed to fetch SOL price in USD:', err);
    return NaN;
  }
}

export async function displayWalletBalance(balance) {
  try {
    const solPriceInUsd = await getSolPriceInUsd();
    if (isNaN(solPriceInUsd)) {
      throw new Error('Failed to fetch SOL price in USD');
    }

    // Calculate balance in USD
    const balanceInUsd = (balance * solPriceInUsd).toFixed(2);

    const walletBalanceElement = document.getElementById('wallet-balance');
    walletBalanceElement.innerHTML = ''; // Clear previous content

    // Create a container for the wallet balance
    const balanceContainer = document.createElement('div');
    balanceContainer.classList.add('balance-container'); // Add class for styling

    // Balance text
    const balanceText = document.createElement('div');
    balanceText.textContent = `(${balance.toFixed(5)} SOL) ~ (${balanceInUsd} USD)`;
    balanceText.style.fontSize = '16px';
    balanceText.style.color = '#ffffff';

    // Append the balance text to the container
    balanceContainer.appendChild(balanceText);

    // Append the balanceContainer to the wallet balance display element
    walletBalanceElement.appendChild(balanceContainer);
  } catch (err) {
    console.error('Failed to display wallet balance:', err);
    document.getElementById('wallet-balance').textContent = 'Failed to display wallet balance. Please try again.';
  }
}
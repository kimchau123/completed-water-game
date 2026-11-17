// Game configuration and state variables
const GOAL_CANS = 25;        // Total items needed to collect
const GAME_DURATION = 50;    // Time limit for each game, in seconds
let currentCans = 0;         // Current number of items collected
let gameActive = false;      // Tracks if game is currently running
let spawnInterval;          // Holds the interval for spawning items
let timerInterval;           // Holds the interval for the countdown
let timeLeft = GAME_DURATION;

// Creates the 3x3 game grid where items will appear
function createGrid() {
  const grid = document.querySelector('.game-grid');
  grid.innerHTML = ''; // Clear any existing grid cells
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell'; // Each cell represents a grid square
    grid.appendChild(cell);
  }
}

function updateGameButtons() {
  document.getElementById('start-game').hidden = gameActive;
  document.getElementById('end-game').hidden = !gameActive;
  document.getElementById('reset-game').hidden = !gameActive;
}

function showMessage(message) {
  document.getElementById('message-text').textContent = message;
  document.getElementById('achievements').hidden = false;
  document.getElementById('dismiss-message').focus();
}

function hideMessage() {
  document.getElementById('achievements').hidden = true;
}

// Ensure the grid is created when the page loads
createGrid();

// Spawns a new item in a random grid cell
function spawnWaterCan() {
  if (!gameActive) return; // Stop if the game is not active
  const cells = document.querySelectorAll('.grid-cell');
  
  // Clear all cells before spawning a new water can
  cells.forEach(cell => {
    cell.innerHTML = '';
    cell.classList.remove('clicked');
  });

  // Select a random cell from the grid to place the water can
  const randomCell = cells[Math.floor(Math.random() * cells.length)];

  // Use a template literal to create the wrapper and water-can element
  randomCell.innerHTML = `
    <div class="water-can-wrapper">
      <div class="water-can"></div>
    </div>
  `;
}

// Initializes and starts a new game
function startGame() {
  if (gameActive) return; // Prevent starting a new game if one is already active

  currentCans = 0;
  timeLeft = GAME_DURATION;
  hideMessage();
  document.getElementById('current-cans').textContent = currentCans;
  document.getElementById('timer').textContent = timeLeft;
  gameActive = true;
  updateGameButtons();
  createGrid(); // Set up the game grid
  spawnWaterCan(); // Show the first water can immediately
  spawnInterval = setInterval(spawnWaterCan, 1000); // Spawn water cans every second
  timerInterval = setInterval(updateTimer, 1000); // Count down once per second
}

function updateTimer() {
  timeLeft--;
  document.getElementById('timer').textContent = timeLeft;

  if (timeLeft <= 0) {
    endGame('Time is up! Better luck next time.');
  }
}

function endGame(message) {
  gameActive = false; // Mark the game as inactive
  updateGameButtons();
  clearInterval(spawnInterval); // Stop spawning water cans
  clearInterval(timerInterval); // Stop the countdown
  document.querySelectorAll('.grid-cell').forEach(cell => {
    cell.innerHTML = '';
    cell.classList.remove('clicked');
  });

  if (message) {
    showMessage(message);
  }
}

function resetGame() {
  currentCans = 0;
  timeLeft = GAME_DURATION;
  hideMessage();
  document.getElementById('current-cans').textContent = currentCans;
  document.getElementById('timer').textContent = timeLeft;
  gameActive = false;
  updateGameButtons();
  clearInterval(spawnInterval);
  clearInterval(timerInterval);
  createGrid();
}

function handleCanClick(event) {
  if (!gameActive) return; // Ignore clicks if the game is not active
  if (event.target.classList.contains('water-can')) {
    event.target.closest('.grid-cell').classList.add('clicked');
    currentCans++; // Increment the count of collected items
    document.getElementById('current-cans').textContent = currentCans; // Update the displayed score

    event.target.remove(); // Prevent the same water can from being counted twice

    if (currentCans >= GOAL_CANS) {
      endGame('Congratulations! You collected all the items!');
    }
  }
}

// Set up click handler for the start button
document.getElementById('start-game').addEventListener('click', startGame);
document.getElementById('end-game').addEventListener('click', () => {
  endGame(`Game ended. You collected ${currentCans} items.`);
});
document.getElementById('reset-game').addEventListener('click', resetGame);
document.getElementById('dismiss-message').addEventListener('click', hideMessage);
document.querySelector('.game-grid').addEventListener('click', handleCanClick);
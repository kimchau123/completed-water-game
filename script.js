// Game configuration and state variables
const GAME_MODES = {
  easy: {
    goal: 25,
    duration: 90,
    spawnInterval: 1000,
    fastSpawnInterval: 800,
    milestone: 15,
    obstacleChance: 0.2
  },
  normal: {
    goal: 50,
    duration: 70,
    spawnInterval: 800,
    fastSpawnInterval: 600,
    milestone: 25,
    obstacleChance: 0.3
  },
  hard: {
    goal: 50,
    duration: 60,
    spawnInterval: 750,
    fastSpawnInterval: 550,
    milestone: 25,
    obstacleChance: 0.4
  }
};
const CLICK_FEEDBACK_DURATION = 700;
let currentCans = 0;         // Current number of items collected
let gameActive = false;      // Tracks if game is currently running
let gameStarting = false;    // Tracks if the start countdown is running
let gamePaused = false;      // Tracks if the game is paused
let fastMode = false;        // Tracks if the game has sped up
let spawnInterval;          // Holds the interval for spawning items
let timerInterval;           // Holds the interval for the countdown
let countdownInterval;       // Holds the interval for the start countdown
let milestoneTimeout;        // Holds the timer for hiding the milestone message
let gameSettings = GAME_MODES.normal;
let timeLeft = gameSettings.duration;
const feedbackTimeouts = new WeakMap();
let audioContext;
let clickSoundVolume = 0.7;

function prepareAudio() {
  if (!window.AudioContext) {
    console.error('Web Audio is not supported by this browser.');
    return;
  }

  if (!audioContext) {
    audioContext = new window.AudioContext();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(error => {
      console.error('Could not start game audio:', error);
    });
  }
}

function playTone(frequency, duration, volume, waveform) {
  const adjustedVolume = volume * clickSoundVolume;
  if (!audioContext || audioContext.state !== 'running' || adjustedVolume <= 0) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const startTime = audioContext.currentTime;

  oscillator.type = waveform;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(adjustedVolume, startTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

function playControlSound() {
  if (!window.AudioContext) return;
  if (!audioContext) {
    audioContext = new window.AudioContext();
  }

  if (audioContext.state === 'running') {
    playTone(440, 0.08, 0.04, 'sine');
  } else {
    audioContext.resume().then(() => {
      playTone(440, 0.08, 0.04, 'sine');
    }).catch(error => {
      console.error('Could not play the control click sound:', error);
    });
  }
}

function playCountdownSound(count) {
  const frequencies = {
    3: 440,
    2: 554,
    1: 659
  };
  const frequency = frequencies[count];
  if (!audioContext || !frequency) return;

  const playSound = () => {
    if (gameStarting) {
      playTone(frequency, 0.12, 0.07, 'sine');
    }
  };

  if (audioContext.state === 'running') {
    playSound();
  } else {
    audioContext.resume().then(playSound).catch(error => {
      console.error('Could not play countdown sound:', error);
    });
  }
}

function playWinSound() {
  const winNotes = [523, 659, 784, 1047];
  winNotes.forEach((frequency, index) => {
    setTimeout(() => {
      playTone(frequency, 0.18, 0.12, 'triangle');
    }, index * 120);
  });
}

function playLoseSound() {
  const loseNotes = [523, 392, 440, 330];
  const music = document.getElementById('background-music');
  const musicVolume = document.getElementById('music-volume');
  music.volume = Math.min(Number(musicVolume.value), 0.12);
  setTimeout(() => {
    music.volume = Number(musicVolume.value);
  }, 1200);

  const playNotes = () => {
    loseNotes.forEach((frequency, index) => {
      setTimeout(() => {
        playTone(frequency, 0.18, 0.22, 'triangle');
      }, index * 180);
    });
  };

  if (!audioContext) {
    prepareAudio();
  }

  if (audioContext && audioContext.state === 'running') {
    playNotes();
  } else if (audioContext) {
    audioContext.resume().then(playNotes).catch(error => {
      console.error('Could not play the losing sound:', error);
    });
  }
}

function startBackgroundMusic() {
  stopBackgroundMusic();
  if (document.getElementById('music-choice').value === 'off') return;

  const uploadedMusic = document.getElementById('background-music');
  uploadedMusic.play().catch(error => {
    console.error('Could not play the uploaded background music:', error);
  });
}

function stopBackgroundMusic(resetAudio = false) {
  const uploadedMusic = document.getElementById('background-music');
  uploadedMusic.pause();
  if (resetAudio) {
    uploadedMusic.currentTime = 0;
  }
}

function updateMusicVolume() {
  const volumeControl = document.getElementById('music-volume');
  const volume = Number(volumeControl.value);
  document.getElementById('background-music').volume = volume;
  document.getElementById('music-volume-value').textContent = `${Math.round(volume * 100)}%`;
}

function updateClickSoundVolume() {
  const volumeControl = document.getElementById('effects-volume');
  clickSoundVolume = Number(volumeControl.value);
  document.getElementById('effects-volume-value').textContent = `${Math.round(clickSoundVolume * 100)}%`;
}

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
  document.getElementById('start-game').hidden = gameActive || gameStarting;
  document.getElementById('end-game').hidden = !gameActive;
  document.getElementById('reset-game').hidden = !gameActive;
  document.getElementById('difficulty-mode').disabled = gameActive || gameStarting;
  const pauseButton = document.getElementById('pause-game');
  pauseButton.hidden = !gameActive;
  pauseButton.textContent = gamePaused ? 'Resume Game' : 'Pause Game';
  pauseButton.setAttribute('aria-pressed', gamePaused);
}

function showMessage(message) {
  document.getElementById('message-text').textContent = message;
  document.getElementById('charity-end-message').hidden = false;
  document.getElementById('achievements').hidden = false;
  document.getElementById('dismiss-message').focus();
}

function hideMessage() {
  document.getElementById('achievements').hidden = true;
  document.getElementById('charity-end-message').hidden = true;
}

function updateDifficultyInfo() {
  const selectedMode = document.getElementById('difficulty-mode').value;
  const settings = GAME_MODES[selectedMode];
  document.getElementById('game-instructions').textContent =
    `Collect ${settings.goal} cans in ${settings.duration} seconds. Avoid dirty water drops. The game speeds up at ${settings.milestone} cans.`;
  document.getElementById('timer').textContent = settings.duration;
}

function changeDifficulty() {
  updateDifficultyInfo();
}

function showMilestone(message) {
  const milestoneMessage = document.getElementById('milestone-message');
  milestoneMessage.textContent = message;
  milestoneMessage.hidden = false;
  clearTimeout(milestoneTimeout);
  milestoneTimeout = setTimeout(() => {
    milestoneMessage.hidden = true;
  }, 3000);
}

function hideMilestone() {
  clearTimeout(milestoneTimeout);
  document.getElementById('milestone-message').hidden = true;
}

function showConfetti() {
  const colors = ['#FFC907', '#2E9DF7', '#4FCB53', '#FF902A', '#F16061'];
  const confetti = document.createElement('div');
  confetti.className = 'confetti-container';
  confetti.setAttribute('aria-hidden', 'true');

  // Create colorful pieces that fall across the screen
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random()}s`;
    piece.style.animationDuration = `${2 + Math.random()}s`;
    piece.style.backgroundColor = colors[i % colors.length];
    confetti.appendChild(piece);
  }

  document.body.appendChild(confetti);
  setTimeout(() => confetti.remove(), 4000);
}

// Ensure the grid is created when the page loads
createGrid();

// Spawns a new item in a random grid cell
function spawnWaterCan() {
  if (!gameActive) return; // Stop if the game is not active
  const cells = document.querySelectorAll('.grid-cell');
  
  // Clear all cells before spawning a new item
  cells.forEach(cell => {
    cell.innerHTML = '';
    cell.classList.remove('dirty-clicked');
  });

  // Select a random cell from the grid to place the item
  const randomCell = cells[Math.floor(Math.random() * cells.length)];
  const randomObstacle = Math.random() < gameSettings.obstacleChance;

  // Use a template literal to create either a water can or a dirty water drop
  if (randomObstacle) {
    randomCell.innerHTML = `
      <div class="water-can-wrapper">
        <div class="drop-dirty-water"></div>
      </div>
    `;
  } else {
    randomCell.innerHTML = `
      <div class="water-can-wrapper">
        <div class="water-can"></div>
      </div>
    `;
  }
}

// Initializes and starts a new game
function startGame() {
  if (gameActive || gameStarting) return; // Prevent starting multiple games

  prepareAudio(); // Browsers allow audio to start after the player clicks a button
  stopBackgroundMusic(true);
  gameSettings = GAME_MODES[document.getElementById('difficulty-mode').value];
  currentCans = 0;
  timeLeft = gameSettings.duration;
  gamePaused = false;
  fastMode = false;
  hideMessage();
  hideMilestone();
  document.getElementById('current-cans').textContent = currentCans;
  document.getElementById('timer').textContent = timeLeft;
  gameStarting = true;
  updateGameButtons();
  createGrid(); // Set up the game grid

  const countdown = document.querySelector('.count-down');
  let count = 3;
  countdown.textContent = count;
  countdown.hidden = false;
  playCountdownSound(count);

  countdownInterval = setInterval(() => {
    count--;

    if (count > 0) {
      countdown.textContent = count;
      playCountdownSound(count);
    } else {
      clearInterval(countdownInterval);
      countdown.hidden = true;
      gameStarting = false;
      gameActive = true;
      updateGameButtons();
      spawnWaterCan(); // Show the first water can when the game begins
      startBackgroundMusic();
      spawnInterval = setInterval(spawnWaterCan, gameSettings.spawnInterval);
      timerInterval = setInterval(updateTimer, 1000);
    }
  }, 500);
}

function updateTimer() {
  timeLeft--;
  document.getElementById('timer').textContent = timeLeft;

  if (timeLeft <= 0) {
    endGame('Time is up! Better luck next time.', false, true);
  }
}

function endGame(message, isWin = false, isLoss = false) {
  gameActive = false; // Mark the game as inactive
  gamePaused = false;
  updateGameButtons();
  clearInterval(spawnInterval); // Stop spawning water cans
  clearInterval(timerInterval); // Stop the countdown
  clearInterval(countdownInterval);
  gameStarting = false;
  document.querySelector('.count-down').hidden = true;
  hideMilestone();
  document.querySelectorAll('.grid-cell').forEach(cell => {
    cell.innerHTML = '';
    cell.classList.remove('clicked');
    cell.classList.remove('dirty-clicked');
  });

  if (message) {
    showMessage(message);
  }

  if (isWin) {
    showConfetti();
    playWinSound();
  } else if (isLoss) {
    playLoseSound();
  }
}

function togglePauseGame() {
  if (!gameActive) return;

  gamePaused = !gamePaused;

  if (gamePaused) {
    clearInterval(spawnInterval);
    clearInterval(timerInterval);
  } else {
    const spawnSpeed = fastMode ? gameSettings.fastSpawnInterval : gameSettings.spawnInterval;
    spawnInterval = setInterval(spawnWaterCan, spawnSpeed);
    timerInterval = setInterval(updateTimer, 1000);
  }

  updateGameButtons();
}

function changeBackgroundMusic() {
  if (gameStarting) return;

  if (document.getElementById('music-choice').value === 'uploaded') {
    document.getElementById('background-music').currentTime = 0;
  }
  startBackgroundMusic();
}

function resetGame() {
  // Stop the current game's intervals before starting a fresh game
  clearInterval(spawnInterval);
  clearInterval(timerInterval);
  clearInterval(countdownInterval);
  stopBackgroundMusic(true);
  gameActive = false;
  gamePaused = false;
  gameStarting = false;
  document.querySelector('.count-down').hidden = true;
  startGame(); // Restart the game by calling startGame
}

function handleCanClick(event) {
  if (!gameActive || gamePaused) return; // Ignore clicks when the game is stopped or paused

  // Check which item is in the clicked cell so the whole cell is clickable
  const cell = event.target.closest('.grid-cell');
  if (!cell) return;

  const waterCan = cell.querySelector('.water-can');
  const dirtyDrop = cell.querySelector('.drop-dirty-water');

  if (waterCan) {
    playTone(880, 0.12, 0.08, 'triangle');
    cell.classList.add('clicked');
    clearTimeout(feedbackTimeouts.get(cell));
    const feedbackTimeout = setTimeout(() => {
      cell.classList.remove('clicked');
      feedbackTimeouts.delete(cell);
    }, CLICK_FEEDBACK_DURATION);
    feedbackTimeouts.set(cell, feedbackTimeout);
    currentCans++; // Increment the count of collected items
    document.getElementById('current-cans').textContent = currentCans; // Update the displayed score

    waterCan.remove(); // Prevent the same water can from being counted twice

    if (currentCans >= gameSettings.goal) {
      endGame(`You win! You collected ${gameSettings.goal} cans!`, true);
    } else if (currentCans === gameSettings.milestone && !fastMode) {
      fastMode = true;
      clearInterval(spawnInterval);
      spawnInterval = setInterval(spawnWaterCan, gameSettings.fastSpawnInterval);
      showMilestone(`Good job! You have collected ${gameSettings.milestone} cans. The game is getting faster!`);
      playWinSound();
    }
  } else if (dirtyDrop) {
    playTone(220, 0.18, 0.07, 'sawtooth');
    cell.classList.add('dirty-clicked');

    // Dirty water reduces the score, but the score cannot go below zero
    if (currentCans > 0) {
      currentCans--;
    }
    document.getElementById('current-cans').textContent = currentCans;

    dirtyDrop.remove(); // Prevent the same dirty drop from reducing the score twice
  }
}

// Set up click handler for the start button
document.getElementById('start-game').addEventListener('click', startGame);
document.getElementById('end-game').addEventListener('click', () => {
  endGame(`Game ended. You collected ${currentCans} items.`);
});
document.getElementById('reset-game').addEventListener('click', resetGame);
document.getElementById('pause-game').addEventListener('click', togglePauseGame);
document.getElementById('difficulty-mode').addEventListener('change', changeDifficulty);
document.getElementById('music-choice').addEventListener('change', changeBackgroundMusic);
document.getElementById('music-volume').addEventListener('input', updateMusicVolume);
document.getElementById('effects-volume').addEventListener('input', updateClickSoundVolume);
document.getElementById('dismiss-message').addEventListener('click', hideMessage);
document.querySelector('.game-grid').addEventListener('click', handleCanClick);
updateMusicVolume();
updateClickSoundVolume();
updateDifficultyInfo();
document.addEventListener('click', event => {
  const control = event.target.closest('button, .audio-control select, .difficulty-control select');
  if (control) {
    playControlSound();
  }

  const clickedStartButton = event.target.closest('#start-game');
  const clickedMusicChoice = event.target.closest('#music-choice');
  const musicChoice = document.getElementById('music-choice').value;
  const uploadedMusic = document.getElementById('background-music');

  // Browsers need a user interaction before allowing background music to play
  if (!gameStarting && !clickedStartButton && !clickedMusicChoice && musicChoice !== 'off' && uploadedMusic.paused) {
    startBackgroundMusic();
  }
}, true);
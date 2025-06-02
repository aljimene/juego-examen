// --- Variables Globales ---
const GAME_STATE_KEY = 'quizGameSaveState';
let teams = [];
let questions = [];
let scores = [];
let currentPlayerIndex = 0;
let questionsAnsweredCount = 0;
let totalQuestions = 0;

let currentQuestion = null;
let currentQuestionState = null;
let currentAttemptPlayerIndex = null;
let stealAttemptQueue = [];

let timerInterval = null;
const initialTimerDuration = 45;
const stealTimerDuration = 15;
let remainingTime = 0;

// Referencias a elementos del DOM
const scoreBoardEl = document.getElementById('score-board');
const turnIndicatorEl = document.getElementById('turn-indicator');
const gameBoardEl = document.getElementById('game-board');
const overlayEl = document.getElementById('overlay');
const questionTextEl = document.getElementById('question-text');
const optionsContainerEl = document.getElementById('options-container');
const timerDisplayEl = document.getElementById('timer-display');
const stealButtonEl = document.getElementById('steal-button'); // Mantendremos el ID, pero cambiaremos el texto en JS
const finalResultsEl = document.getElementById('final-results');
const finalRankingsEl = document.getElementById('final-rankings');

const correctSound = document.getElementById('correct-sound');
const incorrectSound = document.getElementById('incorrect-sound');

// const stealingPlayerNameEl = document.getElementById('stealing-player-name'); // <-- ¡ELIMINADA ESTA REFERENCIA!
const currentAttemptTeamNameEl = document.getElementById('current-attempt-team-name');


// --- Funciones de Guardado y Carga de Estado ---

function saveGameState() {
    console.log("Guardando estado del juego...");
    const gameState = {
        teams: teams,
        scores: scores,
        currentPlayerIndex: currentPlayerIndex,
        questions: questions,
        questionsAnsweredCount: questionsAnsweredCount
    };
    try {
        localStorage.setItem(GAME_STATE_KEY, JSON.stringify(gameState));
        console.log("Estado guardado con éxito.");
    } catch (e) {
        console.error("Error al guardar en localStorage:", e);
        alert("Hubo un problema al guardar el progreso. Es posible que el almacenamiento esté lleno o que estés usando un modo de navegación privada.");
    }
}

function loadGameState() {
    console.log("Intentando cargar estado del juego...");
    try {
        const savedState = localStorage.getItem(GAME_STATE_KEY);
        if (savedState) {
            const gameState = JSON.parse(savedState);

            teams = gameState.teams || [];
            scores = gameState.scores || [];
            currentPlayerIndex = gameState.currentPlayerIndex || 0;
            questions = gameState.questions || [];
            questionsAnsweredCount = gameState.questionsAnsweredCount || 0;

            totalQuestions = questions.reduce((count, category) => count + category.length, 0);

            console.log("Estado cargado con éxito.");
            return true;
        }
    } catch (e) {
        console.error("Error al cargar o parsear el estado guardado:", e);
        alert("Hubo un problema al cargar el progreso guardado. Se iniciará un juego nuevo. (Detalles en la consola del navegador)");
        localStorage.removeItem(GAME_STATE_KEY);
    }
    console.log("No se encontró estado guardado o hubo un error al cargar.");
    return false;
}

// --- Funciones de Carga de Datos ---

async function loadTeams(file) {
    try {
        const response = await fetch(file);
        const text = await response.text();
        teams = text.split('\n').map(name => name.trim()).filter(name => name.length > 0);
        if (teams.length === 0) throw new Error('No se encontraron equipos en el archivo.');
        scores = new Array(teams.length).fill(0);
        console.log('Equipos cargados:', teams);
    } catch (error) {
        console.error('Error cargando equipos:', error);
        alert('Error cargando los equipos: ' + error.message);
    }
}

async function loadQuestions(file) {
    try {
        const response = await fetch(file);
        const text = await response.text();
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        questions = [];
        const categories = new Set();

        lines.forEach(line => {
            const parts = line.split('|').map(part => part.trim());
            if (parts.length === 8) {
                const [category, pointsStr, questionText, opt1, opt2, opt3, opt4, correctIndexStr] = parts;
                const points = parseInt(pointsStr, 10);
                const correctAnswerIndex = parseInt(correctIndexStr, 10);

                if (!categories.has(category)) {
                    categories.add(category);
                    questions.push([]);
                }

                const categoryIndex = Array.from(categories).indexOf(category);

                questions[categoryIndex].push({
                    category: category,
                    points: points,
                    text: questionText,
                    options: [opt1, opt2, opt3, opt4],
                    correctAnswerIndex: correctAnswerIndex,
                    answered: false
                });
            } else {
                console.warn('Línea de pregunta con formato incorrecto:', line);
            }
        });

        if (questions.length !== 5 || !questions.every(cat => cat.length === 6)) {
             console.warn(`Se esperaban 5 categorías con 6 preguntas cada una. Se encontraron ${questions.length} categorías con preguntas: ${questions.map(cat => cat.length + ' preguntas').join(', ')}.`);
        }

        totalQuestions = questions.reduce((count, category) => count + category.length, 0);
        console.log('Preguntas cargadas. Total:', totalQuestions);

    } catch (error) {
        console.error('Error cargando preguntas:', error);
        alert('Error cargando las preguntas: ' + error.message);
    }
}

// --- Funciones de Inicialización y Renderizado ---

async function initializeGame() {
    let gameLoadedSuccessfully = false;

    const savedStateExists = localStorage.getItem(GAME_STATE_KEY);

    if (savedStateExists) {
        const confirmLoad = confirm("¡Hay un juego guardado! ¿Quieres continuar desde donde lo dejaste?");

        if (confirmLoad) {
            gameLoadedSuccessfully = loadGameState();
            if (!gameLoadedSuccessfully) {
                alert("No se pudo cargar el juego guardado. Se iniciará un juego nuevo.");
                localStorage.removeItem(GAME_STATE_KEY);
            }
        } else {
            localStorage.removeItem(GAME_STATE_KEY);
            console.log("Juego guardado eliminado por petición del usuario.");
        }
    }

    if (!gameLoadedSuccessfully) {
        await loadTeams('teams.txt');
        await loadQuestions('questions.txt');
    } else {
        console.log("Estado guardado encontrado y cargado. Reconstruyendo UI...");
    }

    if (teams.length === 0 || questions.length === 0) {
        console.error("No se pudo iniciar el juego debido a errores de carga inicial o de archivos.");
        alert("No se pudo iniciar el juego. Asegúrate de que 'teams.txt' y 'questions.txt' existan y contengan datos válidos.");
        return;
    }

    renderScoreboard();
    renderGameBoard();
    updateTurnIndicator();

    if (questionsAnsweredCount >= totalQuestions && totalQuestions > 0) {
        console.log("El juego ya estaba terminado al cargar. Mostrando resultados finales.");
        displayFinalResults();
    } else {
        console.log('Juego inicializado. Turno de:', teams[currentPlayerIndex]);
    }
}

function renderScoreboard() {
    scoreBoardEl.innerHTML = '';
    teams.forEach((team, index) => {
        const teamScoreEl = document.createElement('div');
        teamScoreEl.id = `score-team-${index}`;
        teamScoreEl.textContent = `${team}: ${scores[index]} pts`;
        teamScoreEl.classList.add('team-score-item');
        scoreBoardEl.appendChild(teamScoreEl);
    });
}

function updateScoreboard() {
     teams.forEach((team, index) => {
        const teamScoreEl = document.getElementById(`score-team-${index}`);
        if(teamScoreEl) {
             teamScoreEl.textContent = `${team}: ${scores[index]} pts`;
        }
    });
}


function renderGameBoard() {
    gameBoardEl.innerHTML = '';

    questions.forEach((category, categoryIndex) => {
        const categoryTitleEl = document.createElement('div');
        categoryTitleEl.classList.add('category-title');
        categoryTitleEl.textContent = category[0].category;
        gameBoardEl.appendChild(categoryTitleEl);
    });

    for (let qIndex = 0; qIndex < 6; qIndex++) {
        questions.forEach((category, categoryIndex) => {
            const question = category[qIndex];
            const questionCellEl = document.createElement('div');
            questionCellEl.classList.add('question-cell');
            questionCellEl.textContent = question.points;
            questionCellEl.dataset.categoryIndex = categoryIndex;
            questionCellEl.dataset.questionIndex = qIndex;

            if (question.answered) {
                questionCellEl.classList.add('answered');
            } else {
                questionCellEl.addEventListener('click', () => handleQuestionClick(categoryIndex, qIndex));
            }

            gameBoardEl.appendChild(questionCellEl);
        });
    }

     gameBoardEl.style.gridTemplateColumns = `repeat(${questions.length}, 1fr)`;
}

function updateTurnIndicator() {
    if (teams.length > 0) {
        turnIndicatorEl.textContent = `Turno de: ${teams[currentPlayerIndex]}`;
    } else {
        turnIndicatorEl.textContent = '';
    }
}

// --- Lógica del Juego ---

function handleQuestionClick(categoryIndex, questionIndex) {
    const question = questions[categoryIndex][questionIndex];
    console.log('Pregunta clickeada:', question.text, 'Categoría:', question.category, 'Puntos:', question.points);

    if (question.answered || overlayEl.classList.contains('visible')) {
        console.log('Pregunta ya respondida o overlay visible. No se puede seleccionar.');
        return;
    }

    currentQuestion = { categoryIndex, questionIndex, points: question.points, correctAnswerIndex: question.correctAnswerIndex };
    currentQuestionState = 'initial_attempt';
    currentAttemptPlayerIndex = currentPlayerIndex;
    stealAttemptQueue = [];

    // --- CAMBIO RECIENTE: Ocultar stealButtonEl, usar 'Turbo de paso' y mostrar equipo activo ---
    stealButtonEl.classList.add('hidden'); // Siempre oculto al inicio de una pregunta
    stealButtonEl.textContent = 'Turbo de paso'; // Asegurarse que el texto sea el correcto
    currentAttemptTeamNameEl.textContent = `Grupo actual: ${teams[currentAttemptPlayerIndex]}`;
    currentAttemptTeamNameEl.classList.remove('hidden');
    // --- FIN CAMBIO RECIENTE ---

    displayQuestion(question);
    startTimer(initialTimerDuration, handleInitialTimeout);
    console.log('Estado actual de la pregunta:', currentQuestionState, 'Intento de:', teams[currentAttemptPlayerIndex]);
}

function displayQuestion(question) {
    questionTextEl.textContent = question.text;
    optionsContainerEl.innerHTML = '';

    question.options.forEach((option, index) => {
        const optionButtonEl = document.createElement('button');
        optionButtonEl.classList.add('option-button');
        optionButtonEl.textContent = option;
        optionButtonEl.addEventListener('click', () => handleAnswerClick(index));
        optionsContainerEl.appendChild(optionButtonEl);
    });

    timerDisplayEl.textContent = formatTime(initialTimerDuration);
    // stealButtonEl.classList.add('hidden'); // Ya se oculta en handleQuestionClick
    overlayEl.classList.add('visible');
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

function startTimer(duration, onTimeout) {
    stopTimer();
    remainingTime = duration;
    timerDisplayEl.textContent = formatTime(remainingTime);

    timerInterval = setInterval(() => {
        remainingTime--;
        timerDisplayEl.textContent = formatTime(remainingTime);

        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            onTimeout();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

function handleAnswerClick(selectedOptionIndex) {
    if (!currentQuestion) return;

    stopTimer();

    const questionData = questions[currentQuestion.categoryIndex][currentQuestion.questionIndex];
    const isCorrect = selectedOptionIndex === questionData.correctAnswerIndex;
    console.log('Respuesta seleccionada. ¿Correcta?:', isCorrect, 'Estado:', currentQuestionState);

    if (isCorrect) {
        playCorrectSound();
        scores[currentAttemptPlayerIndex] += currentQuestion.points;
        updateScoreboard();
        timerDisplayEl.textContent = '¡CORRECTO!';
        optionsContainerEl.innerHTML = '';
        resolveQuestion(true);
    } else {
        playIncorrectSound();
        optionsContainerEl.innerHTML = '';
        if (currentQuestionState === 'initial_attempt') {
            currentQuestionState = 'steal_available';
            timerDisplayEl.textContent = '¡INCORRECTO!';
            prepareStealAttemptQueue();
            console.log('Intento inicial fallido. Cola de paso:', stealAttemptQueue.map(idx => teams[idx])); // CAMBIO DE LENGUAJE
            if (stealAttemptQueue.length > 0) {
                 stealButtonEl.classList.remove('hidden');
            } else {
                console.log('No hay más equipos para conseguir puntos.'); // CAMBIO DE LENGUAJE
                 resolveQuestion(false);
            }

        } else if (currentQuestionState === 'stealing') { // Este estado ahora significa 'Consiguiendo'
             timerDisplayEl.textContent = '¡INCORRECTO al conseguir!'; // CAMBIO DE LENGUAJE
             console.log('Intento de conseguir fallido por:', teams[currentAttemptPlayerIndex], 'Cola restante:', stealAttemptQueue.map(idx => teams[idx])); // CAMBIO DE LENGUAJE
             handleStealTimeout();
        }
    }
}

function handleInitialTimeout() {
    if (currentQuestionState === 'initial_attempt') {
        timerDisplayEl.textContent = '¡Tiempo agotado!';
        optionsContainerEl.innerHTML = '';
        currentQuestionState = 'steal_available';
        prepareStealAttemptQueue();
        console.log('Tiempo inicial agotado. Cola de paso:', stealAttemptQueue.map(idx => teams[idx])); // CAMBIO DE LENGUAJE

        if (stealAttemptQueue.length > 0) {
            stealButtonEl.classList.remove('hidden');
        } else {
            console.log('Tiempo agotado y no hay equipos para conseguir puntos.'); // CAMBIO DE LENGUAJE
            resolveQuestion(false);
        }
    }
}


function prepareStealAttemptQueue() {
    stealAttemptQueue = [];
    let nextPlayer = (currentPlayerIndex + 1) % teams.length;

    for (let i = 0; i < teams.length - 1; i++) {
        if (nextPlayer !== currentPlayerIndex) {
            stealAttemptQueue.push(nextPlayer);
        }
        nextPlayer = (nextPlayer + 1) % teams.length;
    }
    console.log("Cola de paso preparada:", stealAttemptQueue.map(index => teams[index])); // CAMBIO DE LENGUAJE
}

function handleStealButtonClick() {
    console.log('Botón "Contesta otro grupo" clickeado.');
    console.log('Estado al clickear:', currentQuestionState, 'Cola de paso:', stealAttemptQueue.map(idx => teams[idx])); // CAMBIO DE LENGUAJE

    if (currentQuestionState === 'steal_available' && stealAttemptQueue.length > 0) {
        stealButtonEl.classList.add('hidden');
        currentAttemptPlayerIndex = stealAttemptQueue.shift();
        currentQuestionState = 'stealing'; // El estado sigue siendo 'stealing' internamente para la lógica, pero lo interpretamos como 'consiguiendo'

        // --- CAMBIO RECIENTE: Mostrar "Consiguiendo" en lugar de "Robando" ---
        currentAttemptTeamNameEl.textContent = `¡Consiguiendo: ${teams[currentAttemptPlayerIndex]}!`;
        currentAttemptTeamNameEl.classList.remove('hidden');
        // --- FIN CAMBIO RECIENTE ---

        displayStealOptions();
        startTimer(stealTimerDuration, handleStealTimeout);
        console.log(`Iniciando intento de conseguir para: ${teams[currentAttemptPlayerIndex]}`); // CAMBIO DE LENGUAJE
    } else {
        console.log('No se pudo iniciar el paso. Estado:', currentQuestionState, 'Cola vacía:', stealAttemptQueue.length === 0); // CAMBIO DE LENGUAJE
    }
}

function displayStealOptions() {
     if (!currentQuestion) return;
     const questionData = questions[currentQuestion.categoryIndex][currentQuestion.questionIndex];
     optionsContainerEl.innerHTML = '';
     questionData.options.forEach((option, index) => {
        const optionButtonEl = document.createElement('button');
        optionButtonEl.classList.add('option-button');
        optionButtonEl.textContent = option;
        optionButtonEl.addEventListener('click', () => handleAnswerClick(index));
        optionsContainerEl.appendChild(optionButtonEl);
    });
    console.log('Opciones de paso mostradas.'); // CAMBIO DE LENGUAJE
}


function handleStealTimeout() {
     if (currentQuestionState === 'stealing') {
         timerDisplayEl.textContent = `¡Tiempo agotado para ${teams[currentAttemptPlayerIndex]}!`;
         optionsContainerEl.innerHTML = '';
         console.log('Tiempo de conseguir agotado para:', teams[currentAttemptPlayerIndex], 'Cola restante:', stealAttemptQueue.map(idx => teams[idx])); // CAMBIO DE LENGUAJE

        if (stealAttemptQueue.length > 0) {
            currentQuestionState = 'steal_available';
            stealButtonEl.classList.remove('hidden');
            // --- CAMBIO RECIENTE: Actualizar nombre para el siguiente "Turbo de paso" ---
            currentAttemptTeamNameEl.textContent = `Turbo de paso para: ${teams[stealAttemptQueue[0]] || 'Siguiente Equipo'}`;
            // --- FIN CAMBIO RECIENTE ---
            console.log("Pasando la oportunidad de paso al siguiente..."); // CAMBIO DE LENGUAJE
        } else {
            // --- CAMBIO RECIENTE: Ocultar nombre cuando no hay más opciones de paso ---
            currentAttemptTeamNameEl.classList.add('hidden');
            // --- FIN CAMBIO RECIENTE ---
            resolveQuestion(false);
            console.log("Todos los intentos de conseguir agotados."); // CAMBIO DE LENGUAJE
        }
     }
}


function resolveQuestion(wasCorrect) {
    if (!currentQuestion) return;

    const { categoryIndex, questionIndex } = currentQuestion;
    questions[categoryIndex][questionIndex].answered = true;
    questionsAnsweredCount++;
    console.log('Pregunta resuelta. Respondida correctamente:', wasCorrect, 'Preguntas respondidas:', questionsAnsweredCount);


    currentQuestion = null;
    currentQuestionState = null;
    currentAttemptPlayerIndex = null;
    stealAttemptQueue = [];
    stopTimer();

    saveGameState();

    // --- CAMBIO RECIENTE: Asegurarse de ocultar el nombre del equipo actual al resolver la pregunta ---
    currentAttemptTeamNameEl.classList.add('hidden');
    // --- FIN CAMBIO RECIENTE ---

    setTimeout(() => {
        overlayEl.classList.remove('visible');
        renderGameBoard();
    }, 1500);

    currentPlayerIndex = (currentPlayerIndex + 1) % teams.length;
    updateTurnIndicator();
    console.log('Turno pasado a:', teams[currentPlayerIndex]);

    checkGameEnd();
}

function checkGameEnd() {
     if (questions.length === 0) return;

     const dynamicTotalQuestions = questions.reduce((count, category) => count + category.length, 0);

     if (questionsAnsweredCount >= dynamicTotalQuestions) {
        console.log("¡Juego Terminado!");
        displayFinalResults();
    }
}


function displayFinalResults() {
    gameBoardEl.classList.add('hidden');
    scoreBoardEl.classList.add('hidden');
    turnIndicatorEl.classList.add('hidden');

    finalResultsEl.classList.remove('hidden');

    const rankedTeams = teams.map((team, index) => ({ team: team, score: scores[index] }));
    rankedTeams.sort((a, b) => b.score - a.score);

    finalRankingsEl.innerHTML = '';

    rankedTeams.forEach((team, index) => {
        const listItem = document.createElement('li');
        listItem.textContent = `${index + 1}. ${team.team}: ${team.score} pts`;
        finalRankingsEl.appendChild(listItem);
    });
}


// --- Funciones de Audio ---
function playCorrectSound() {
     if (correctSound) {
        correctSound.currentTime = 0;
        correctSound.play();
     }
}

function playIncorrectSound() {
    if (incorrectSound) {
        incorrectSound.currentTime = 0;
        incorrectSound.play();
    }
}


// --- Inicio del Juego ---
document.addEventListener('DOMContentLoaded', () => {
    initializeGame();
    stealButtonEl.addEventListener('click', handleStealButtonClick);
});
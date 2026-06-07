/* ============================================================
   Tennis RTC — Main Entry Point
   Lobby UI, WebRTC connection flow, game initialization
   ============================================================ */

(function () {
  'use strict';

  var peer = null;
  var game = null;
  var isHost = false;
  var connected = false;
  var canvas = null;

  // ============================================================
  // DOM REFS
  // ============================================================

  var lobbyEl = document.getElementById('lobby');
  var gameScreenEl = document.getElementById('game-screen');
  var connectionStatusEl = document.getElementById('connection-status');

  // Create Room
  var btnCreate = document.getElementById('btn-create');
  var offerSection = document.getElementById('offer-section');
  var offerText = document.getElementById('offer-text');
  var btnCopyOffer = document.getElementById('btn-copy-offer');
  var answerInput = document.getElementById('answer-input');
  var btnApplyAnswer = document.getElementById('btn-apply-answer');
  var offerStatus = document.getElementById('offer-status');

  // Join Room
  var offerInput = document.getElementById('offer-input');
  var btnJoin = document.getElementById('btn-join');
  var answerSection = document.getElementById('answer-section');
  var answerText = document.getElementById('answer-text');
  var btnCopyAnswer = document.getElementById('btn-copy-answer');
  var joinStatus = document.getElementById('join-status');

  canvas = document.getElementById('game-canvas');

  // ============================================================
  // CREATE ROOM (Host / Player 1)
  // ============================================================

  btnCreate.addEventListener('click', function () {
    isHost = true;
    btnCreate.disabled = true;
    btnCreate.textContent = 'Gerando...';
    offerStatus.textContent = 'Conectando aos servidores STUN...';
    offerStatus.className = '';

    peer = new WebRTCPeer();

    peer.onStateChange(function (state) {
      if (state === 'connected') {
        onConnected();
      } else if (state === 'failed') {
        showError(offerStatus, 'Falha na conexao. Verifique sua rede.');
      }
      updateConnectionStatus(state);
    });

    peer.onError(function (err) {
      showError(offerStatus, err.message);
    });

    peer.generateOffer().then(function (offerB64) {
      offerText.value = offerB64;
      offerSection.classList.remove('hidden');
      btnCreate.textContent = 'Criar Sala';
      offerStatus.textContent = 'Codigo gerado! Envie para o oponente.';
      offerStatus.className = 'success';
    }).catch(function (err) {
      showError(offerStatus, 'Erro: ' + err.message);
      btnCreate.disabled = false;
      btnCreate.textContent = 'Criar Sala';
    });
  });

  btnCopyOffer.addEventListener('click', function () {
    offerText.select();
    document.execCommand('copy');
    btnCopyOffer.textContent = 'Copiado!';
    setTimeout(function () { btnCopyOffer.textContent = 'Copiar'; }, 2000);
  });

  btnApplyAnswer.addEventListener('click', function () {
    var answerB64 = answerInput.value.trim();
    if (!answerB64) {
      showError(offerStatus, 'Cole a resposta do oponente.');
      return;
    }

    btnApplyAnswer.disabled = true;
    btnApplyAnswer.textContent = 'Conectando...';
    offerStatus.textContent = 'Estabelecendo conexao...';
    offerStatus.className = '';

    peer.applyAnswer(answerB64).then(function () {
      offerStatus.textContent = 'Resposta aplicada. Aguardando conexao...';
    }).catch(function (err) {
      showError(offerStatus, 'Erro: ' + err.message);
      btnApplyAnswer.disabled = false;
      btnApplyAnswer.textContent = 'Conectar';
    });
  });

  // ============================================================
  // JOIN ROOM (Guest / Player 2)
  // ============================================================

  btnJoin.addEventListener('click', function () {
    var offerB64 = offerInput.value.trim();
    if (!offerB64) {
      showError(joinStatus, 'Cole o codigo da sala.');
      return;
    }

    isHost = false;
    btnJoin.disabled = true;
    btnJoin.textContent = 'Entrando...';
    joinStatus.textContent = 'Conectando aos servidores STUN...';
    joinStatus.className = '';

    peer = new WebRTCPeer();

    peer.onStateChange(function (state) {
      if (state === 'connected') {
        onConnected();
      } else if (state === 'failed') {
        showError(joinStatus, 'Falha na conexao. Verifique sua rede.');
      }
      updateConnectionStatus(state);
    });

    peer.onError(function (err) {
      showError(joinStatus, err.message);
    });

    peer.generateAnswer(offerB64).then(function (answerB64) {
      answerText.value = answerB64;
      answerSection.classList.remove('hidden');
      btnJoin.textContent = 'Entrar';
      joinStatus.textContent = 'Conectado! Copie a resposta e envie de volta.';
      joinStatus.className = 'success';
    }).catch(function (err) {
      showError(joinStatus, 'Erro: ' + err.message);
      btnJoin.disabled = false;
      btnJoin.textContent = 'Entrar';
    });
  });

  btnCopyAnswer.addEventListener('click', function () {
    answerText.select();
    document.execCommand('copy');
    btnCopyAnswer.textContent = 'Copiado!';
    setTimeout(function () { btnCopyAnswer.textContent = 'Copiar'; }, 2000);
  });

  // ============================================================
  // CONNECTION CALLBACKS
  // ============================================================

  function onConnected() {
    if (connected) return;

    // Wait for DataChannel to actually be open, not just the ICE connection
    if (!peer.isConnected()) return;

    connected = true;

    // Hide lobby, show game
    lobbyEl.classList.add('hidden');
    gameScreenEl.classList.remove('hidden');

    // Start game
    var playerNum = isHost ? 1 : 2;
    game = new Game(canvas, isHost, peer, playerNum);
    game.start();

    if (isHost) {
      game.state = 'READY';
      game.stateTimer = 0.6;
    }
  }

  function updateConnectionStatus(state) {
    var statusText = '';
    switch (state) {
      case 'new': statusText = 'Preparando...'; break;
      case 'connecting': statusText = 'Conectando...'; break;
      case 'connected': statusText = 'Conectado!'; break;
      case 'disconnected': statusText = 'Desconectado. Tentando reconectar...'; break;
      case 'failed': statusText = 'Conexao falhou.'; break;
      case 'closed': statusText = 'Conexao encerrada.'; break;
      default: statusText = state;
    }
    connectionStatusEl.textContent = statusText;
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.className = 'error';
  }

  // ============================================================
  // GLOBAL ERROR HANDLER
  // ============================================================

  window.addEventListener('error', function (e) {
    console.error('Uncaught error:', e.error);
  });

  window.addEventListener('unhandledrejection', function (e) {
    console.error('Unhandled rejection:', e.reason);
  });

})();

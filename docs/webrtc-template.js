/* ============================================================
   WebRTC Template — Sinalização Manual (Copy-Paste)
   ============================================================

   Classe autocontida, sem dependências, para comunicação P2P entre
   navegadores usando WebRTC com troca de sinalização via copia-e-cola.

   Compatível com Chrome, Firefox, Safari, Edge, Opera, Brave.

   USO BÁSICO:

     // --- Ofertante (Usuário A) ---
     const peerA = new WebRTCPeer();
     const offerB64 = await peerA.generateOffer();
     // Enviar offerB64 para B (WhatsApp, Telegram, e-mail...)
     // Receber answerB64 de B
     await peerA.applyAnswer(answerB64);
     // Pronto! peerA.send('olá') já funciona.

     // --- Convidado (Usuário B) ---
     const peerB = new WebRTCPeer();
     // Receber offerB64 de A
     const answerB64 = await peerB.generateAnswer(offerB64);
     // Enviar answerB64 de volta para A
     // Pronto! peerB.send('olá de volta') já funciona.

   EVENTOS:

     peer.onMessage((data, dataType) => { ... });
     peer.onStateChange((state) => { ... });
     peer.onError((error) => { ... });

   ============================================================ */

class WebRTCPeer {
  /**
   * @param {Object} [options]
   * @param {RTCConfiguration} [options.iceServers] — configuração STUN/TURN
   * @param {string} [options.channelLabel='data'] — nome do DataChannel
   * @param {Object} [options.channelOptions] — opções extras (ordered, maxRetransmits...)
   * @param {number} [options.iceTimeoutMs=8000] — timeout do ICE gathering
   */
  constructor(options = {}) {
    this._iceServers = options.iceServers || {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this._channelLabel = options.channelLabel || 'data';
    this._channelOptions = options.channelOptions || {};
    this._iceTimeoutMs = options.iceTimeoutMs || 8000;

    this._pc = null;
    this._channel = null;
    this._isOfferer = false;

    // Callbacks do usuário
    this._onMessageCb = null;
    this._onStateChangeCb = null;
    this._onErrorCb = null;
  }

  /* ----------------------------------------------------------
     API PÚBLICA — OFERTANTE (Usuário A)
     ---------------------------------------------------------- */

  /**
   * Gera a oferta SDP completa (com todos os candidatos ICE) e retorna
   * como string Base64 para ser enviada ao convidado.
   *
   * @returns {Promise<string>} String Base64 com a oferta completa
   */
  async generateOffer() {
    this._ensureClean();
    this._isOfferer = true;

    this._pc = new RTCPeerConnection(this._iceServers);

    // Ofertante CRIA o DataChannel
    this._channel = this._pc.createDataChannel(this._channelLabel, this._channelOptions);
    this._setupChannelEvents(this._channel);

    // Gerar oferta e definir como local description
    const offer = await this._pc.createOffer();
    await this._pc.setLocalDescription(offer);

    // Aguardar ICE gathering completar (CRÍTICO para copy-paste)
    await this._waitForIceComplete();

    // Monitorar estado da conexão
    this._pc.onconnectionstatechange = () => {
      if (this._onStateChangeCb) {
        this._onStateChangeCb(this._pc.connectionState);
      }
    };

    return this._encodeSDP(this._pc.localDescription);
  }

  /**
   * Aplica a resposta SDP (Base64) recebida do convidado.
   * Após esta chamada a conexão P2P será estabelecida automaticamente.
   *
   * @param {string} answerB64 — String Base64 da resposta gerada por B
   * @returns {Promise<void>}
   */
  async applyAnswer(answerB64) {
    if (!this._pc || !this._isOfferer) {
      throw new Error('Nenhuma oferta pendente. Chame generateOffer() primeiro.');
    }

    const answerDesc = this._decodeSDP(answerB64);
    await this._pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
    // Conexão será estabelecida automaticamente — o callback onStateChange
    // será disparado quando o estado mudar para 'connected'.
  }

  /* ----------------------------------------------------------
     API PÚBLICA — CONVIDADO (Usuário B)
     ---------------------------------------------------------- */

  /**
   * Processa uma oferta SDP (Base64) recebida do ofertante, gera a resposta
   * SDP completa e a retorna como Base64 para ser enviada de volta a A.
   *
   * @param {string} offerB64 — String Base64 da oferta gerada por A
   * @returns {Promise<string>} String Base64 com a resposta completa
   */
  async generateAnswer(offerB64) {
    this._ensureClean();
    this._isOfferer = false;

    const offerDesc = this._decodeSDP(offerB64);

    this._pc = new RTCPeerConnection(this._iceServers);

    // Convidado RECEBE o DataChannel — registrar handler ANTES de setRemoteDescription
    this._pc.ondatachannel = (event) => {
      this._channel = event.channel;
      this._setupChannelEvents(this._channel);
    };

    // Monitorar estado da conexão
    this._pc.onconnectionstatechange = () => {
      if (this._onStateChangeCb) {
        this._onStateChangeCb(this._pc.connectionState);
      }
    };

    // Aplicar oferta como remote description
    await this._pc.setRemoteDescription(new RTCSessionDescription(offerDesc));

    // Gerar resposta e definir como local description
    const answer = await this._pc.createAnswer();
    await this._pc.setLocalDescription(answer);

    // Aguardar ICE gathering completar
    await this._waitForIceComplete();

    return this._encodeSDP(this._pc.localDescription);
  }

  /* ----------------------------------------------------------
     API PÚBLICA — ENVIO DE DADOS (AMBOS OS LADOS)
     ---------------------------------------------------------- */

  /**
   * Envia dados para o peer conectado.
   *
   * @param {string|ArrayBuffer|Blob|Uint8Array} data — Dado a enviar
   * @throws {Error} Se o canal não estiver pronto
   */
  send(data) {
    if (!this._channel || this._channel.readyState !== 'open') {
      throw new Error('DataChannel não está pronto. Aguarde a conexão ser estabelecida.');
    }
    this._channel.send(data);
  }

  /* ----------------------------------------------------------
     API PÚBLICA — CALLBACKS
     ---------------------------------------------------------- */

  /**
   * Registra callback para mensagens recebidas.
   *
   * @param {function} cb — function(data: string|ArrayBuffer, dataType: string)
   *   dataType: 'string' | 'binary' | 'blob'
   */
  onMessage(cb) {
    this._onMessageCb = cb;
  }

  /**
   * Registra callback para mudanças no estado da conexão.
   *
   * @param {function} cb — function(state: string)
   *   Estados: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'
   */
  onStateChange(cb) {
    this._onStateChangeCb = cb;
  }

  /**
   * Registra callback para erros.
   *
   * @param {function} cb — function(error: Error)
   */
  onError(cb) {
    this._onErrorCb = cb;
  }

  /* ----------------------------------------------------------
     API PÚBLICA — ESTADO E LIMPEZA
     ---------------------------------------------------------- */

  /** @returns {boolean} true se o DataChannel estiver aberto */
  isConnected() {
    return this._channel && this._channel.readyState === 'open';
  }

  /** @returns {string} Estado da conexão: 'open' | 'connecting' | 'closing' | 'closed' | null */
  channelState() {
    return this._channel ? this._channel.readyState : null;
  }

  /** @returns {string} Estado do RTCPeerConnection: 'new' | 'connecting' | 'connected' | ... */
  connectionState() {
    return this._pc ? this._pc.connectionState : null;
  }

  /**
   * Encerra o DataChannel e a RTCPeerConnection, liberando recursos.
   */
  close() {
    if (this._channel) {
      this._channel.close();
      this._channel = null;
    }
    if (this._pc) {
      this._pc.close();
      this._pc = null;
    }
    this._isOfferer = false;
  }

  /* ----------------------------------------------------------
     MÉTODOS PRIVADOS
     ---------------------------------------------------------- */

  /** Garante que não há conexão anterior ativa */
  _ensureClean() {
    this.close();
  }

  /** Configura os handlers do DataChannel */
  _setupChannelEvents(dc) {
    dc.onopen = () => {
      if (this._onStateChangeCb) {
        this._onStateChangeCb(this._pc.connectionState);
      }
    };

    dc.onmessage = (event) => {
      if (!this._onMessageCb) return;

      // Suporte a string, ArrayBuffer e Blob
      if (typeof event.data === 'string') {
        this._onMessageCb(event.data, 'string');
      } else if (event.data instanceof ArrayBuffer) {
        this._onMessageCb(event.data, 'binary');
      } else if (event.data instanceof Blob) {
        // Blobs são lidos como texto por padrão
        const reader = new FileReader();
        reader.onload = () => this._onMessageCb(reader.result, 'blob');
        reader.readAsText(event.data);
      } else {
        this._onMessageCb(String(event.data), 'string');
      }
    };

    dc.onclose = () => {
      if (this._onStateChangeCb) {
        this._onStateChangeCb(this._pc ? this._pc.connectionState : 'closed');
      }
    };

    dc.onerror = (e) => {
      if (this._onErrorCb) {
        this._onErrorCb(new Error('Erro no DataChannel: ' + (e.message || 'desconhecido')));
      }
    };
  }

  /**
   * Aguarda o ICE gathering completar (todos os candidatos descobertos).
   * Com timeout de segurança para evitar travamento eterno.
   */
  _waitForIceComplete() {
    return new Promise((resolve, reject) => {
      if (!this._pc) return reject(new Error('RTCPeerConnection não inicializada'));

      if (this._pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      let resolved = false;

      const timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this._pc.removeEventListener('icegatheringstatechange', handler);
        console.warn('[WebRTCPeer] ICE gathering timeout — prosseguindo com candidatos parciais');
        resolve();
      }, this._iceTimeoutMs);

      const handler = () => {
        if (resolved) return;
        if (this._pc.iceGatheringState === 'complete') {
          resolved = true;
          clearTimeout(timer);
          this._pc.removeEventListener('icegatheringstatechange', handler);
          resolve();
        }
      };

      this._pc.addEventListener('icegatheringstatechange', handler);
    });
  }

  /**
   * Codifica um RTCSessionDescription em Base64.
   * Usa JSON.stringify para preservar type + sdp.
   */
  _encodeSDP(description) {
    try {
      return btoa(JSON.stringify(description));
    } catch (e) {
      throw new Error('Falha ao codificar SDP: ' + e.message);
    }
  }

  /**
   * Decodifica uma string Base64 de volta para objeto SDP.
   * @throws {Error} Se o Base64 for inválido ou o objeto não tiver { type, sdp }
   */
  _decodeSDP(base64) {
    try {
      const cleaned = String(base64).trim();
      if (!cleaned) throw new Error('String Base64 vazia');

      const obj = JSON.parse(atob(cleaned));

      if (!obj.type || !obj.sdp) {
        throw new Error('Objeto SDP inválido — esperado { type: "offer"|"answer", sdp: "..." }');
      }

      if (obj.type !== 'offer' && obj.type !== 'answer') {
        throw new Error(`Tipo SDP desconhecido: "${obj.type}" — esperado "offer" ou "answer"`);
      }

      return obj;
    } catch (e) {
      if (e instanceof DOMException) {
        throw new Error('String Base64 inválida. Verifique se copiou corretamente.');
      }
      throw e;
    }
  }
}

/* ============================================================
   EXPORTAÇÃO — Compatível com módulos e script tag
   ============================================================ */

// ES Modules (import/export)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebRTCPeer;
}

// Script tag direto — disponível como window.WebRTCPeer
if (typeof window !== 'undefined') {
  window.WebRTCPeer = WebRTCPeer;
}
